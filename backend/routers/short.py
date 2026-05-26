from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from models.database import get_db, User, ShortPosition, TradeHistory, TradeType
from services.stock import get_stock_price
from services.exchange_rate import get_usd_krw
from services.market_hours import get_market_status
from services.auth import decode_jwt

router = APIRouter(prefix="/short", tags=["short"])

# 증거금률: 공매도 금액의 30% 담보 예치
MARGIN_RATE = 0.30


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


class ShortRequest(BaseModel):
    ticker: str
    quantity: int
    market: Optional[str] = "KR"


@router.post("/open")
async def open_short(req: ShortRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """공매도 진입 - 주식을 빌려서 팔고 나중에 되사서 갚음"""
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
    if is_us:
        usd_krw = await get_usd_krw()
        price_krw = price_info["price"] * usd_krw
    else:
        price_krw = price_info["price"]
        usd_krw = None

    total_value = price_krw * req.quantity          # 매도 대금
    margin = total_value * MARGIN_RATE              # 담보 예치금 (30%)

    # 담보금이 있어야 진입 가능
    if user.cash < margin:
        raise HTTPException(
            status_code=400,
            detail=f"증거금 부족 (필요: {margin:,.0f}원 = 공매도금액의 30%, 보유: {user.cash:,.0f}원)"
        )

    # 담보금 차감 + 매도 대금 입금
    user.cash -= margin
    user.cash += total_value

    # 숏 포지션 생성
    position = ShortPosition(
        user_id=user.id,
        ticker=req.ticker,
        name=price_info["name"],
        market=price_info["market"],
        exchange=price_info.get("exchange", ""),
        quantity=req.quantity,
        entry_price=price_krw,
        margin=margin,
        is_open=True,
    )
    db.add(position)

    history = TradeHistory(
        user_id=user.id,
        ticker=req.ticker,
        name=price_info["name"],
        market=price_info["market"],
        trade_type=TradeType.SHORT_OPEN,
        quantity=req.quantity,
        price=price_krw,
        total=total_value,
    )
    db.add(history)
    await db.commit()

    msg = f"{price_info['name']} {req.quantity}주 공매도 진입!"
    if is_us:
        msg += f" (${price_info['price']:.2f} × {usd_krw:,.0f}원)"

    return {
        "message": msg,
        "entry_price": price_krw,
        "total_value": total_value,
        "margin": margin,
        "remaining_cash": user.cash,
        "position_id": position.id,
    }


@router.post("/close/{position_id}")
async def close_short(position_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """공매도 청산 - 주식 되사서 갚음, 차익 or 손실 실현"""
    result = await db.execute(
        select(ShortPosition).where(
            ShortPosition.id == position_id,
            ShortPosition.user_id == user.id,
            ShortPosition.is_open == True,
        )
    )
    position = result.scalar_one_or_none()
    if not position:
        raise HTTPException(status_code=404, detail="포지션을 찾을 수 없습니다")

    market = position.market
    status = get_market_status(market)
    if not status["is_open"]:
        raise HTTPException(status_code=403, detail=f"장이 열려있지 않습니다. {status['message']}")

    price_info = await get_stock_price(position.ticker)
    if not price_info:
        raise HTTPException(status_code=404, detail="현재가 조회 실패")

    is_us = price_info["market"] == "US"
    if is_us:
        usd_krw = await get_usd_krw()
        current_price_krw = price_info["price"] * usd_krw
    else:
        current_price_krw = price_info["price"]
        usd_krw = None

    buy_back_cost = current_price_krw * position.quantity   # 되사는 비용
    profit = (position.entry_price - current_price_krw) * position.quantity  # 진입가 - 현재가 = 수익

    # 청산: 매도 대금으로 되사고 + 담보금 반환 + 수익/손실
    # cash 변화 = -buy_back_cost (되사기) + margin (담보 반환)
    # 이미 진입 시 total_value가 입금됐으므로: 순수익 = total_value - buy_back_cost
    user.cash -= buy_back_cost
    user.cash += position.margin  # 담보금 반환

    from datetime import datetime
    position.is_open = False
    position.closed_at = datetime.utcnow()

    history = TradeHistory(
        user_id=user.id,
        ticker=position.ticker,
        name=position.name,
        market=position.market,
        trade_type=TradeType.SHORT_CLOSE,
        quantity=position.quantity,
        price=current_price_krw,
        total=buy_back_cost,
    )
    db.add(history)
    await db.commit()

    profit_pct = (profit / (position.entry_price * position.quantity)) * 100

    return {
        "message": f"{position.name} 공매도 청산 완료!",
        "entry_price": position.entry_price,
        "close_price": current_price_krw,
        "profit": round(profit, 0),
        "profit_pct": round(profit_pct, 2),
        "remaining_cash": user.cash,
    }


@router.get("/positions")
async def get_short_positions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """현재 오픈된 공매도 포지션 목록"""
    result = await db.execute(
        select(ShortPosition).where(
            ShortPosition.user_id == user.id,
            ShortPosition.is_open == True,
        )
    )
    positions = result.scalars().all()

    result_list = []
    for p in positions:
        price_info = await get_stock_price(p.ticker)
        if not price_info:
            continue

        is_us = price_info["market"] == "US"
        if is_us:
            usd_krw = await get_usd_krw()
            current_price_krw = price_info["price"] * usd_krw
        else:
            current_price_krw = price_info["price"]

        profit = (p.entry_price - current_price_krw) * p.quantity
        profit_pct = (profit / (p.entry_price * p.quantity)) * 100 if p.entry_price else 0

        result_list.append({
            "id": p.id,
            "ticker": p.ticker,
            "name": p.name,
            "market": p.market,
            "exchange": p.exchange,
            "quantity": p.quantity,
            "entry_price": p.entry_price,
            "current_price": current_price_krw,
            "margin": p.margin,
            "profit": round(profit, 0),
            "profit_pct": round(profit_pct, 2),
            "current_price_raw": price_info["price"],
            "is_us": is_us,
        })

    return result_list
