from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from models.database import get_db, User, Portfolio, TradeHistory, TradeType
from services.stock import get_stock_price
from services.exchange_rate import get_usd_krw
from services.market_hours import get_market_status
from services.auth import decode_jwt

router = APIRouter(prefix="/trade", tags=["trade"])


async def get_current_user(authorization: str = Header(...), db: AsyncSession = Depends(get_db)) -> User:
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


class TradeRequest(BaseModel):
    ticker: str
    quantity: int
    market: Optional[str] = "KR"
    limit_price: Optional[float] = None  # 지정가 (원화 기준), None이면 시장가


@router.post("/buy")
async def buy_stock(req: TradeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """주식 매수 (미국주식은 원화 환산, 지정가 지원)"""
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="수량은 1 이상이어야 합니다")

    market = req.market or "KR"
    status = get_market_status(market)
    if not status["is_open"]:
        raise HTTPException(status_code=403, detail=f"장이 열려있지 않습니다. {status['message']}")

    price_info = await get_stock_price(req.ticker)
    if not price_info:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")

    is_us = price_info["market"] == "US"

    # 미국주식은 원화로 환산해서 거래 (시드머니가 원화이므로)
    if is_us:
        usd_krw = await get_usd_krw()
        session = status.get("session", "regular")
        # 프리/애프터마켓 세션 전용 가격 사용
        if session == "pre" and price_info.get("pre_price"):
            raw_price_usd = price_info["pre_price"]
            session_label = "프리마켓"
        elif session == "after" and price_info.get("after_price"):
            raw_price_usd = price_info["after_price"]
            session_label = "애프터마켓"
        else:
            raw_price_usd = price_info["price"]
            session_label = "정규장"
        market_price_krw = raw_price_usd * usd_krw
    else:
        market_price_krw = price_info["price"]
        raw_price_usd = None
        usd_krw = None
        session_label = "정규장"

    # 지정가 vs 시장가
    if req.limit_price is not None:
        if req.limit_price <= 0:
            raise HTTPException(status_code=400, detail="지정가는 0보다 커야 합니다")
        # 지정가 매수: 지정가가 현재가보다 낮으면 체결 불가 (실제 거래소와 동일 로직 단순화)
        if req.limit_price < market_price_krw * 0.85:
            raise HTTPException(status_code=400, detail=f"지정가({req.limit_price:,.0f}원)가 현재가({market_price_krw:,.0f}원)보다 너무 낮아 체결되지 않습니다")
        price_krw = req.limit_price
        order_note = f"지정가 {price_krw:,.0f}원"
    else:
        price_krw = market_price_krw
        order_note = "시장가"

    total_cost = price_krw * req.quantity

    if user.cash < total_cost:
        short = total_cost - user.cash
        raise HTTPException(status_code=400, detail=f"잔액 부족 (필요 {total_cost:,.0f}원 / 보유 {user.cash:,.0f}원 / {short:,.0f}원 부족)")

    result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == user.id, Portfolio.ticker == req.ticker)
    )
    portfolio = result.scalar_one_or_none()

    if portfolio:
        total_qty = portfolio.quantity + req.quantity
        # avg_price는 항상 원화 기준으로 저장
        portfolio.avg_price = (portfolio.avg_price * portfolio.quantity + price_krw * req.quantity) / total_qty
        portfolio.quantity = total_qty
    else:
        portfolio = Portfolio(
            user_id=user.id,
            ticker=req.ticker,
            name=price_info["name"],
            market=price_info["market"],
            exchange=price_info.get("exchange", ""),
            quantity=req.quantity,
            avg_price=price_krw,  # 원화 기준
        )
        db.add(portfolio)

    user.cash -= total_cost

    history = TradeHistory(
        user_id=user.id,
        ticker=req.ticker,
        name=price_info["name"],
        market=price_info["market"],
        trade_type=TradeType.BUY,
        quantity=req.quantity,
        price=price_krw,   # 원화 기준 저장
        total=total_cost,
    )
    db.add(history)
    await db.commit()

    msg = f"{price_info['name']} {req.quantity}주 매수 완료! ({order_note})"
    if is_us:
        msg += f" (${raw_price_usd:.2f} × {usd_krw:,.0f}원, {session_label})"

    return {
        "message": msg,
        "price": price_krw,
        "price_usd": raw_price_usd if is_us else None,
        "usd_krw": usd_krw,
        "total": total_cost,
        "remaining_cash": user.cash,
        "session": session_label,
    }


@router.post("/sell")
async def sell_stock(req: TradeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """주식 매도 (미국주식은 원화 환산, 지정가 지원)"""
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="수량은 1 이상이어야 합니다")

    market = req.market or "KR"
    status = get_market_status(market)
    if not status["is_open"]:
        raise HTTPException(status_code=403, detail=f"장이 열려있지 않습니다. {status['message']}")

    result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == user.id, Portfolio.ticker == req.ticker)
    )
    portfolio = result.scalar_one_or_none()

    if not portfolio:
        raise HTTPException(status_code=400, detail=f"{req.ticker} 종목을 보유하고 있지 않습니다")
    if portfolio.quantity < req.quantity:
        raise HTTPException(status_code=400, detail=f"보유 수량 부족 (보유 {portfolio.quantity}주 / 매도 요청 {req.quantity}주)")

    price_info = await get_stock_price(req.ticker)
    if not price_info:
        raise HTTPException(status_code=404, detail="종목 시세를 불러올 수 없습니다")

    is_us = price_info["market"] == "US"

    if is_us:
        usd_krw = await get_usd_krw()
        session = status.get("session", "regular")
        if session == "pre" and price_info.get("pre_price"):
            raw_price_usd = price_info["pre_price"]
            session_label = "프리마켓"
        elif session == "after" and price_info.get("after_price"):
            raw_price_usd = price_info["after_price"]
            session_label = "애프터마켓"
        else:
            raw_price_usd = price_info["price"]
            session_label = "정규장"
        market_price_krw = raw_price_usd * usd_krw
    else:
        market_price_krw = price_info["price"]
        raw_price_usd = None
        usd_krw = None
        session_label = "정규장"

    # 지정가 vs 시장가
    if req.limit_price is not None:
        if req.limit_price <= 0:
            raise HTTPException(status_code=400, detail="지정가는 0보다 커야 합니다")
        # 지정가 매도: 지정가가 현재가보다 너무 높으면 체결 불가
        if req.limit_price > market_price_krw * 1.15:
            raise HTTPException(status_code=400, detail=f"지정가({req.limit_price:,.0f}원)가 현재가({market_price_krw:,.0f}원)보다 너무 높아 체결되지 않습니다")
        price_krw = req.limit_price
        order_note = f"지정가 {price_krw:,.0f}원"
    else:
        price_krw = market_price_krw
        order_note = "시장가"

    total_revenue = price_krw * req.quantity

    portfolio.quantity -= req.quantity
    if portfolio.quantity == 0:
        await db.delete(portfolio)

    user.cash += total_revenue

    history = TradeHistory(
        user_id=user.id,
        ticker=req.ticker,
        name=price_info["name"],
        market=price_info["market"],
        trade_type=TradeType.SELL,
        quantity=req.quantity,
        price=price_krw,
        total=total_revenue,
    )
    db.add(history)
    await db.commit()

    msg = f"{price_info['name']} {req.quantity}주 매도 완료! ({order_note})"
    if is_us:
        msg += f" (${raw_price_usd:.2f} × {usd_krw:,.0f}원, {session_label})"

    return {
        "message": msg,
        "price": price_krw,
        "price_usd": raw_price_usd if is_us else None,
        "usd_krw": usd_krw,
        "total": total_revenue,
        "remaining_cash": user.cash,
        "session": session_label,
    }


@router.get("/history")
async def get_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """거래 내역 조회"""
    result = await db.execute(
        select(TradeHistory).where(TradeHistory.user_id == user.id).order_by(TradeHistory.traded_at.desc()).limit(50)
    )
    histories = result.scalars().all()

    return [
        {
            "ticker": h.ticker,
            "name": h.name,
            "market": h.market,
            "trade_type": h.trade_type,
            "quantity": h.quantity,
            "price": h.price,
            "total": h.total,
            "traded_at": h.traded_at.isoformat(),
        }
        for h in histories
    ]
