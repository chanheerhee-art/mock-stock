from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db, User, Portfolio, AssetSnapshot, ShortPosition, TradeHistory, TradeType, SEED_MONEY, FuturesPosition
from services.stock import get_stock_price
from services.exchange_rate import get_usd_krw
from services.auth import decode_jwt
from services.futures import get_kospi200_index, unrealized_pnl as futures_pnl

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


async def get_current_user(authorization: str = Header(None), db: AsyncSession = Depends(get_db)) -> User:
    try:
        token = authorization.replace("Bearer ", "")
        payload = decode_jwt(token)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="인증이 필요합니다")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="유저를 찾을 수 없습니다")
    return user


@router.get("/me")
async def get_my_portfolio(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """내 포트폴리오 조회 (미국주식 환율 환산 포함)"""
    result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
    portfolios = result.scalars().all()

    usd_krw = await get_usd_krw()

    holdings = []
    total_eval_krw = 0.0

    for p in portfolios:
        price_info = await get_stock_price(p.ticker)
        if not price_info:
            continue

        is_us = price_info["market"] == "US"
        current_price_raw = price_info["price"]  # USD or KRW

        # 원화 환산 평가금액
        if is_us:
            current_price_krw = current_price_raw * usd_krw
            avg_price_krw = p.avg_price  # 매수 시 이미 원화로 저장됨
        else:
            current_price_krw = current_price_raw
            avg_price_krw = p.avg_price

        eval_amount_krw = current_price_krw * p.quantity
        profit_krw = eval_amount_krw - avg_price_krw * p.quantity
        profit_pct = (profit_krw / (avg_price_krw * p.quantity)) * 100 if avg_price_krw else 0

        total_eval_krw += eval_amount_krw

        holdings.append({
            "ticker": p.ticker,
            "name": p.name,
            "market": p.market,
            "exchange": price_info.get("exchange", ""),
            "quantity": p.quantity,
            "avg_price": round(p.avg_price, 2),           # 원화 기준 매수가
            "current_price": round(current_price_raw, 4),  # 원래 통화 (표시용)
            "current_price_krw": round(current_price_krw, 0),
            "eval_amount": round(eval_amount_krw, 0),
            "profit": round(profit_krw, 0),
            "profit_pct": round(profit_pct, 2),
            "change_pct": price_info["change_pct"],
            "is_us": is_us,
            "usd_krw": round(usd_krw, 2) if is_us else None,
        })

    # 숏 포지션 평가손익 반영 (담보금은 이미 cash에서 차감됨)
    short_result = await db.execute(
        select(ShortPosition).where(ShortPosition.user_id == user.id, ShortPosition.is_open == True)
    )
    short_positions = short_result.scalars().all()
    short_unrealized = 0.0
    for sp in short_positions:
        price_info = await get_stock_price(sp.ticker)
        if not price_info:
            continue
        is_us = price_info["market"] == "US"
        cur_price_krw = price_info["price"] * usd_krw if is_us else price_info["price"]
        short_unrealized += (sp.entry_price - cur_price_krw) * sp.quantity

    # 선물 포지션 평가손익
    fut_result = await db.execute(
        select(FuturesPosition).where(FuturesPosition.user_id == user.id, FuturesPosition.is_open == True)
    )
    fut_positions = fut_result.scalars().all()
    futures_unrealized = 0.0
    futures_margin = 0.0
    if fut_positions:
        idx = await get_kospi200_index()
        cur_idx = idx["price"] if idx else 0
        for fp in fut_positions:
            futures_unrealized += futures_pnl(fp.side.value, fp.entry_price, cur_idx, fp.contracts)
            futures_margin += fp.margin

    total_assets = user.cash + total_eval_krw + short_unrealized + futures_margin + futures_unrealized
    total_profit = total_assets - SEED_MONEY
    total_profit_pct = (total_profit / SEED_MONEY) * 100

    return {
        "nickname": user.nickname,
        "profile_image": user.profile_image,
        "cash": round(user.cash, 0),
        "total_eval": round(total_eval_krw, 0),
        "total_assets": round(total_assets, 0),
        "total_profit": round(total_profit, 0),
        "total_profit_pct": round(total_profit_pct, 2),
        "holdings": holdings,
        "usd_krw": round(usd_krw, 2),
        "short_unrealized": round(short_unrealized, 0),
        "futures_unrealized": round(futures_unrealized, 0),
        "futures_margin": round(futures_margin, 0),
    }


@router.get("/history-chart")
async def get_history_chart(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """자산 히스토리 차트 데이터"""
    result = await db.execute(
        select(AssetSnapshot)
        .where(AssetSnapshot.user_id == user.id)
        .order_by(AssetSnapshot.recorded_at.asc())
        .limit(90)
    )
    snapshots = result.scalars().all()

    return [
        {
            "date": s.recorded_at.strftime("%m/%d"),
            "total_assets": round(s.total_assets, 0),
            "profit_pct": round(s.profit_pct, 2),
        }
        for s in snapshots
    ]


@router.get("/report")
async def get_performance_report(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """성과 리포트 — 거래 통계, 종목별 손익, 최고/최저 거래"""
    usd_krw = await get_usd_krw()

    # 전체 거래 내역
    trade_result = await db.execute(
        select(TradeHistory)
        .where(TradeHistory.user_id == user.id)
        .order_by(TradeHistory.traded_at.desc())
    )
    trades = trade_result.scalars().all()

    buy_trades = [t for t in trades if t.trade_type == TradeType.BUY]
    sell_trades = [t for t in trades if t.trade_type == TradeType.SELL]

    total_buy_amount = sum(t.total for t in buy_trades)
    total_sell_amount = sum(t.total for t in sell_trades)
    total_trades = len(trades)
    total_buy_count = len(buy_trades)
    total_sell_count = len(sell_trades)

    # 종목별 매수/매도 집계 → 실현손익 계산
    ticker_stats: dict = {}
    for t in trades:
        tk = t.ticker
        if tk not in ticker_stats:
            ticker_stats[tk] = {
                "name": t.name,
                "ticker": tk,
                "market": t.market,
                "buy_qty": 0, "buy_total": 0.0,
                "sell_qty": 0, "sell_total": 0.0,
                "trade_count": 0,
            }
        s = ticker_stats[tk]
        s["trade_count"] += 1
        if t.trade_type == TradeType.BUY:
            s["buy_qty"] += t.quantity
            s["buy_total"] += t.total
        elif t.trade_type == TradeType.SELL:
            s["sell_qty"] += t.quantity
            s["sell_total"] += t.total

    # 실현 손익 계산 (매도한 수량만큼 비례 매수비용 차감)
    realized_pnl_list = []
    for tk, s in ticker_stats.items():
        if s["sell_qty"] > 0 and s["buy_qty"] > 0:
            avg_buy = s["buy_total"] / s["buy_qty"]
            realized = s["sell_total"] - avg_buy * s["sell_qty"]
            realized_pct = (realized / (avg_buy * s["sell_qty"])) * 100 if avg_buy * s["sell_qty"] > 0 else 0
            realized_pnl_list.append({
                "ticker": tk,
                "name": s["name"],
                "market": s["market"],
                "realized_profit": round(realized, 0),
                "realized_pct": round(realized_pct, 2),
                "sell_total": round(s["sell_total"], 0),
                "trade_count": s["trade_count"],
            })

    realized_pnl_list.sort(key=lambda x: x["realized_profit"], reverse=True)

    # 총 실현 손익
    total_realized = sum(x["realized_profit"] for x in realized_pnl_list)

    # 현재 포트폴리오 미실현 손익
    port_result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
    portfolios = port_result.scalars().all()

    total_unrealized = 0.0
    holding_profits = []
    for p in portfolios:
        price_info = await get_stock_price(p.ticker)
        if not price_info:
            continue
        is_us = price_info["market"] == "US"
        cur_price_krw = price_info["price"] * usd_krw if is_us else price_info["price"]
        unrealized = (cur_price_krw - p.avg_price) * p.quantity
        unrealized_pct = ((cur_price_krw - p.avg_price) / p.avg_price) * 100 if p.avg_price else 0
        total_unrealized += unrealized
        holding_profits.append({
            "ticker": p.ticker,
            "name": p.name,
            "market": p.market,
            "unrealized_profit": round(unrealized, 0),
            "unrealized_pct": round(unrealized_pct, 2),
            "quantity": p.quantity,
            "avg_price": round(p.avg_price, 0),
            "current_price_krw": round(cur_price_krw, 0),
        })
    holding_profits.sort(key=lambda x: x["unrealized_profit"], reverse=True)

    # 가장 많이 거래한 종목 TOP5
    most_traded = sorted(ticker_stats.values(), key=lambda x: x["trade_count"], reverse=True)[:5]

    # 자산 스냅샷 — 최고점/최저점
    snap_result = await db.execute(
        select(AssetSnapshot).where(AssetSnapshot.user_id == user.id)
        .order_by(AssetSnapshot.recorded_at.asc())
    )
    snapshots = snap_result.scalars().all()
    peak_assets = max((s.total_assets for s in snapshots), default=SEED_MONEY)
    trough_assets = min((s.total_assets for s in snapshots), default=SEED_MONEY)
    peak_pct = ((peak_assets - SEED_MONEY) / SEED_MONEY) * 100
    trough_pct = ((trough_assets - SEED_MONEY) / SEED_MONEY) * 100

    # 현재 자산
    total_eval_krw = sum(
        h["current_price_krw"] * h["quantity"] for h in holding_profits
    )
    total_assets = user.cash + total_eval_krw
    total_profit_pct = ((total_assets - SEED_MONEY) / SEED_MONEY) * 100

    return {
        # 요약
        "summary": {
            "total_assets": round(total_assets, 0),
            "total_profit_pct": round(total_profit_pct, 2),
            "total_realized": round(total_realized, 0),
            "total_unrealized": round(total_unrealized, 0),
            "peak_assets": round(peak_assets, 0),
            "peak_pct": round(peak_pct, 2),
            "trough_pct": round(trough_pct, 2),
        },
        # 거래 통계
        "trade_stats": {
            "total_trades": total_trades,
            "buy_count": total_buy_count,
            "sell_count": total_sell_count,
            "total_buy_amount": round(total_buy_amount, 0),
            "total_sell_amount": round(total_sell_amount, 0),
            "most_traded": [
                {"ticker": s["ticker"], "name": s["name"], "count": s["trade_count"]}
                for s in most_traded
            ],
        },
        # 종목별 실현 손익
        "realized_pnl": realized_pnl_list[:10],
        # 현재 보유 미실현 손익
        "unrealized_pnl": holding_profits[:10],
    }
