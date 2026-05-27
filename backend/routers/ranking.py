from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db, User, Portfolio, ShortPosition, SEED_MONEY
from services.stock import get_stock_price
from services.exchange_rate import get_usd_krw

router = APIRouter(prefix="/ranking", tags=["ranking"])


@router.get("/")
async def get_ranking(db: AsyncSession = Depends(get_db)):
    """전체 유저 수익률 랭킹 — 평가자산(현금 + 주식 평가액 + 공매도 손익) 기준"""
    result = await db.execute(select(User))
    users = result.scalars().all()

    usd_krw = await get_usd_krw()

    ranking = []
    for user in users:
        # 보유 주식 평가액
        port_result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
        portfolios = port_result.scalars().all()

        total_eval_krw = 0.0
        for p in portfolios:
            price_info = await get_stock_price(p.ticker)
            if not price_info:
                continue
            if price_info["market"] == "US":
                # 미국 주식: 달러 → 원화 환산
                total_eval_krw += price_info["price"] * usd_krw * p.quantity
            else:
                total_eval_krw += price_info["price"] * p.quantity

        # 공매도 미실현 손익
        short_result = await db.execute(
            select(ShortPosition).where(ShortPosition.user_id == user.id, ShortPosition.is_open == True)
        )
        short_positions = short_result.scalars().all()
        short_unrealized = 0.0
        for sp in short_positions:
            price_info = await get_stock_price(sp.ticker)
            if not price_info:
                continue
            cur_price_krw = price_info["price"] * usd_krw if price_info["market"] == "US" else price_info["price"]
            short_unrealized += (sp.entry_price - cur_price_krw) * sp.quantity

        total_assets = user.cash + total_eval_krw + short_unrealized
        profit = total_assets - SEED_MONEY
        profit_pct = (profit / SEED_MONEY) * 100

        ranking.append({
            "user_id": user.id,
            "nickname": user.nickname,
            "profile_image": user.profile_image,
            "total_assets": round(total_assets, 0),
            "cash": round(user.cash, 0),
            "stock_eval": round(total_eval_krw, 0),
            "profit": round(profit, 0),
            "profit_pct": round(profit_pct, 2),
        })

    ranking.sort(key=lambda x: x["profit_pct"], reverse=True)
    for i, r in enumerate(ranking):
        r["rank"] = i + 1

    return ranking


@router.get("/user/{user_id}")
async def get_user_portfolio(user_id: int, db: AsyncSession = Depends(get_db)):
    """특정 유저의 포트폴리오 공개 조회"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없습니다")

    usd_krw = await get_usd_krw()

    port_result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
    portfolios = port_result.scalars().all()

    holdings = []
    total_eval_krw = 0.0

    for p in portfolios:
        price_info = await get_stock_price(p.ticker)
        if not price_info:
            continue
        is_us = price_info["market"] == "US"
        cur_price_krw = price_info["price"] * usd_krw if is_us else price_info["price"]
        eval_amount = cur_price_krw * p.quantity
        profit_krw = eval_amount - p.avg_price * p.quantity
        profit_pct = (profit_krw / (p.avg_price * p.quantity)) * 100 if p.avg_price else 0
        total_eval_krw += eval_amount

        holdings.append({
            "ticker": p.ticker,
            "name": p.name,
            "market": p.market,
            "quantity": p.quantity,
            "avg_price": round(p.avg_price, 0),
            "current_price_krw": round(cur_price_krw, 0),
            "eval_amount": round(eval_amount, 0),
            "profit": round(profit_krw, 0),
            "profit_pct": round(profit_pct, 2),
            "change_pct": price_info.get("change_pct", 0),
        })

    holdings.sort(key=lambda x: x["eval_amount"], reverse=True)

    # 공매도 미실현손익
    short_result = await db.execute(
        select(ShortPosition).where(ShortPosition.user_id == user.id, ShortPosition.is_open == True)
    )
    short_positions = short_result.scalars().all()
    short_unrealized = 0.0
    for sp in short_positions:
        price_info = await get_stock_price(sp.ticker)
        if not price_info:
            continue
        cur_price_krw = price_info["price"] * usd_krw if price_info["market"] == "US" else price_info["price"]
        short_unrealized += (sp.entry_price - cur_price_krw) * sp.quantity

    total_assets = user.cash + total_eval_krw + short_unrealized
    profit = total_assets - SEED_MONEY
    profit_pct = (profit / SEED_MONEY) * 100

    return {
        "user_id": user.id,
        "nickname": user.nickname,
        "profile_image": user.profile_image,
        "cash": round(user.cash, 0),
        "total_eval": round(total_eval_krw, 0),
        "total_assets": round(total_assets, 0),
        "profit": round(profit, 0),
        "profit_pct": round(profit_pct, 2),
        "holdings": holdings,
        "usd_krw": round(usd_krw, 2),
    }
