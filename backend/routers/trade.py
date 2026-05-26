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


@router.post("/buy")
async def buy_stock(req: TradeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """주식 매수 (미국주식은 원화 환산)"""
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
        price_krw = price_info["price"] * usd_krw
    else:
        price_krw = price_info["price"]
        usd_krw = None

    total_cost = price_krw * req.quantity

    if user.cash < total_cost:
        raise HTTPException(status_code=400, detail=f"잔액이 부족합니다 (필요: {total_cost:,.0f}원, 보유: {user.cash:,.0f}원)")

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

    msg = f"{price_info['name']} {req.quantity}주 매수 완료!"
    if is_us:
        msg += f" (${price_info['price']:.2f} × {usd_krw:,.0f}원)"

    return {
        "message": msg,
        "price": price_krw,
        "price_usd": price_info["price"] if is_us else None,
        "usd_krw": usd_krw,
        "total": total_cost,
        "remaining_cash": user.cash,
    }


@router.post("/sell")
async def sell_stock(req: TradeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """주식 매도 (미국주식은 원화 환산)"""
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

    if not portfolio or portfolio.quantity < req.quantity:
        raise HTTPException(status_code=400, detail="보유 수량이 부족합니다")

    price_info = await get_stock_price(req.ticker)
    if not price_info:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")

    is_us = price_info["market"] == "US"

    if is_us:
        usd_krw = await get_usd_krw()
        price_krw = price_info["price"] * usd_krw
    else:
        price_krw = price_info["price"]
        usd_krw = None

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

    msg = f"{price_info['name']} {req.quantity}주 매도 완료!"
    if is_us:
        msg += f" (${price_info['price']:.2f} × {usd_krw:,.0f}원)"

    return {
        "message": msg,
        "price": price_krw,
        "price_usd": price_info["price"] if is_us else None,
        "usd_krw": usd_krw,
        "total": total_revenue,
        "remaining_cash": user.cash,
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
