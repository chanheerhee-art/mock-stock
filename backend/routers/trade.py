from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from models.database import get_db, User, Portfolio, TradeHistory, TradeType, PendingOrder, OrderStatus
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


# ── 내부 헬퍼: 즉시 매수 체결 ────────────────────────────────

async def _execute_buy(
    user: User,
    db: AsyncSession,
    ticker: str,
    quantity: int,
    price_krw: float,
    price_info: dict,
    usd_krw: Optional[float],
    raw_price_usd: Optional[float],
    order_note: str,
    session_label: str,
) -> dict:
    total_cost = price_krw * quantity

    if user.cash < total_cost:
        short = total_cost - user.cash
        raise HTTPException(status_code=400, detail=f"잔액 부족 (필요 {total_cost:,.0f}원 / 보유 {user.cash:,.0f}원 / {short:,.0f}원 부족)")

    result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == user.id, Portfolio.ticker == ticker)
    )
    portfolio = result.scalar_one_or_none()

    if portfolio:
        total_qty = portfolio.quantity + quantity
        portfolio.avg_price = (portfolio.avg_price * portfolio.quantity + price_krw * quantity) / total_qty
        portfolio.quantity = total_qty
    else:
        portfolio = Portfolio(
            user_id=user.id,
            ticker=ticker,
            name=price_info["name"],
            market=price_info["market"],
            exchange=price_info.get("exchange", ""),
            quantity=quantity,
            avg_price=price_krw,
        )
        db.add(portfolio)

    user.cash -= total_cost

    history = TradeHistory(
        user_id=user.id,
        ticker=ticker,
        name=price_info["name"],
        market=price_info["market"],
        trade_type=TradeType.BUY,
        quantity=quantity,
        price=price_krw,
        total=total_cost,
    )
    db.add(history)
    await db.commit()

    msg = f"{price_info['name']} {quantity}주 매수 완료! ({order_note})"
    if raw_price_usd and usd_krw:
        msg += f" (${raw_price_usd:.2f} × {usd_krw:,.0f}원, {session_label})"

    return {
        "message": msg,
        "price": price_krw,
        "price_usd": raw_price_usd,
        "usd_krw": usd_krw,
        "total": total_cost,
        "remaining_cash": user.cash,
        "session": session_label,
        "order_type": "filled",
    }


# ── 내부 헬퍼: 즉시 매도 체결 ────────────────────────────────

async def _execute_sell(
    user: User,
    db: AsyncSession,
    ticker: str,
    quantity: int,
    price_krw: float,
    price_info: dict,
    usd_krw: Optional[float],
    raw_price_usd: Optional[float],
    order_note: str,
    session_label: str,
) -> dict:
    result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == user.id, Portfolio.ticker == ticker)
    )
    portfolio = result.scalar_one_or_none()

    if not portfolio:
        raise HTTPException(status_code=400, detail=f"{ticker} 종목을 보유하고 있지 않습니다")
    if portfolio.quantity < quantity:
        raise HTTPException(status_code=400, detail=f"보유 수량 부족 (보유 {portfolio.quantity}주 / 매도 요청 {quantity}주)")

    total_revenue = price_krw * quantity
    portfolio.quantity -= quantity
    if portfolio.quantity == 0:
        await db.delete(portfolio)

    user.cash += total_revenue

    history = TradeHistory(
        user_id=user.id,
        ticker=ticker,
        name=price_info["name"],
        market=price_info["market"],
        trade_type=TradeType.SELL,
        quantity=quantity,
        price=price_krw,
        total=total_revenue,
    )
    db.add(history)
    await db.commit()

    msg = f"{price_info['name']} {quantity}주 매도 완료! ({order_note})"
    if raw_price_usd and usd_krw:
        msg += f" (${raw_price_usd:.2f} × {usd_krw:,.0f}원, {session_label})"

    return {
        "message": msg,
        "price": price_krw,
        "price_usd": raw_price_usd,
        "usd_krw": usd_krw,
        "total": total_revenue,
        "remaining_cash": user.cash,
        "session": session_label,
        "order_type": "filled",
    }


# ── 시장가/지정가 공통 가격 계산 ─────────────────────────────

async def _resolve_price(req: TradeRequest, price_info: dict, status: dict):
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

    return market_price_krw, raw_price_usd, usd_krw, session_label


# ── POST /trade/buy ───────────────────────────────────────────

@router.post("/buy")
async def buy_stock(req: TradeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """주식 매수 - 시장가: 즉시 체결 / 지정가: 미체결 주문 등록"""
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="수량은 1 이상이어야 합니다")

    market = req.market or "KR"
    status = get_market_status(market)
    if not status["is_open"]:
        raise HTTPException(status_code=403, detail=f"장이 열려있지 않습니다. {status['message']}")

    price_info = await get_stock_price(req.ticker)
    if not price_info:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")

    market_price_krw, raw_price_usd, usd_krw, session_label = await _resolve_price(req, price_info, status)

    # ── 지정가 주문: 즉시 체결 안 하고 대기열에 등록 ──
    if req.limit_price is not None:
        if req.limit_price <= 0:
            raise HTTPException(status_code=400, detail="지정가는 0보다 커야 합니다")

        limit_price = req.limit_price
        total_cost = limit_price * req.quantity

        # 현금 미리 예약 (주문 등록 시 차감)
        if user.cash < total_cost:
            short = total_cost - user.cash
            raise HTTPException(status_code=400, detail=f"잔액 부족 (필요 {total_cost:,.0f}원 / 보유 {user.cash:,.0f}원 / {short:,.0f}원 부족)")

        user.cash -= total_cost  # 예약 차감

        order = PendingOrder(
            user_id=user.id,
            ticker=req.ticker,
            name=price_info["name"],
            market=price_info["market"],
            exchange=price_info.get("exchange", ""),
            trade_type=TradeType.BUY,
            quantity=req.quantity,
            limit_price=limit_price,
            reserved_cash=total_cost,
            status=OrderStatus.PENDING,
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        return {
            "message": f"{price_info['name']} {req.quantity}주 매수 지정가 주문 등록 ({limit_price:,.0f}원) — 현재가 {market_price_krw:,.0f}원 이하로 내려오면 자동 체결",
            "order_id": order.id,
            "limit_price": limit_price,
            "current_price": market_price_krw,
            "reserved_cash": total_cost,
            "remaining_cash": user.cash,
            "order_type": "pending",
        }

    # ── 시장가: 즉시 체결 ──
    return await _execute_buy(
        user, db, req.ticker, req.quantity,
        market_price_krw, price_info, usd_krw, raw_price_usd,
        "시장가", session_label,
    )


# ── POST /trade/sell ──────────────────────────────────────────

@router.post("/sell")
async def sell_stock(req: TradeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """주식 매도 - 시장가: 즉시 체결 / 지정가: 미체결 주문 등록"""
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="수량은 1 이상이어야 합니다")

    market = req.market or "KR"
    status = get_market_status(market)
    if not status["is_open"]:
        raise HTTPException(status_code=403, detail=f"장이 열려있지 않습니다. {status['message']}")

    # 보유 수량 먼저 확인
    result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == user.id, Portfolio.ticker == req.ticker)
    )
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=400, detail=f"{req.ticker} 종목을 보유하고 있지 않습니다")

    # 이미 지정가 매도 대기 중인 수량 합산
    pending_sell_result = await db.execute(
        select(PendingOrder).where(
            PendingOrder.user_id == user.id,
            PendingOrder.ticker == req.ticker,
            PendingOrder.trade_type == TradeType.SELL,
            PendingOrder.status == OrderStatus.PENDING,
        )
    )
    pending_sell_qty = sum(o.quantity for o in pending_sell_result.scalars().all())
    available_qty = portfolio.quantity - pending_sell_qty

    if available_qty < req.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"매도 가능 수량 부족 (보유 {portfolio.quantity}주 / 대기 중 {pending_sell_qty}주 / 가능 {available_qty}주 / 요청 {req.quantity}주)"
        )

    price_info = await get_stock_price(req.ticker)
    if not price_info:
        raise HTTPException(status_code=404, detail="종목 시세를 불러올 수 없습니다")

    market_price_krw, raw_price_usd, usd_krw, session_label = await _resolve_price(req, price_info, status)

    # ── 지정가 주문 ──
    if req.limit_price is not None:
        if req.limit_price <= 0:
            raise HTTPException(status_code=400, detail="지정가는 0보다 커야 합니다")

        limit_price = req.limit_price

        order = PendingOrder(
            user_id=user.id,
            ticker=req.ticker,
            name=price_info["name"],
            market=price_info["market"],
            exchange=price_info.get("exchange", ""),
            trade_type=TradeType.SELL,
            quantity=req.quantity,
            limit_price=limit_price,
            reserved_cash=0,
            status=OrderStatus.PENDING,
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        return {
            "message": f"{price_info['name']} {req.quantity}주 매도 지정가 주문 등록 ({limit_price:,.0f}원) — 현재가 {market_price_krw:,.0f}원 이상으로 오르면 자동 체결",
            "order_id": order.id,
            "limit_price": limit_price,
            "current_price": market_price_krw,
            "order_type": "pending",
        }

    # ── 시장가: 즉시 체결 ──
    return await _execute_sell(
        user, db, req.ticker, req.quantity,
        market_price_krw, price_info, usd_krw, raw_price_usd,
        "시장가", session_label,
    )


# ── GET /trade/orders ─────────────────────────────────────────

@router.get("/orders")
async def get_pending_orders(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """미체결 주문 목록"""
    result = await db.execute(
        select(PendingOrder).where(
            PendingOrder.user_id == user.id,
            PendingOrder.status == OrderStatus.PENDING,
        ).order_by(PendingOrder.created_at.desc())
    )
    orders = result.scalars().all()
    return [
        {
            "id": o.id,
            "ticker": o.ticker,
            "name": o.name,
            "market": o.market,
            "exchange": o.exchange,
            "trade_type": o.trade_type,
            "quantity": o.quantity,
            "limit_price": o.limit_price,
            "reserved_cash": o.reserved_cash,
            "created_at": o.created_at.isoformat(),
        }
        for o in orders
    ]


# ── DELETE /trade/orders/{id} ─────────────────────────────────

@router.delete("/orders/{order_id}")
async def cancel_order(order_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """미체결 주문 취소"""
    result = await db.execute(
        select(PendingOrder).where(PendingOrder.id == order_id, PendingOrder.user_id == user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다")
    if order.status != OrderStatus.PENDING:
        raise HTTPException(status_code=400, detail="이미 체결되었거나 취소된 주문입니다")

    order.status = OrderStatus.CANCELLED

    # 매수 주문이면 예약된 현금 환불
    if order.trade_type == TradeType.BUY and order.reserved_cash > 0:
        result2 = await db.execute(select(User).where(User.id == user.id))
        u = result2.scalar_one()
        u.cash += order.reserved_cash

    await db.commit()
    return {"message": f"주문 취소 완료 (주문 #{order_id})"}


# ── GET /trade/history ────────────────────────────────────────

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
