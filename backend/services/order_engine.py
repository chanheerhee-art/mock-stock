"""
미체결 지정가 주문 자동 체결 엔진
- 30초마다 실행
- 매수: 현재가 <= 지정가 → 체결
- 매도: 현재가 >= 지정가 → 체결
"""
import asyncio
from datetime import datetime
from sqlalchemy import select
from models.database import (
    AsyncSessionLocal, User, Portfolio, TradeHistory,
    PendingOrder, OrderStatus, TradeType,
)
from services.stock import get_stock_price
from services.exchange_rate import get_usd_krw


async def _fill_order(order: PendingOrder, price_krw: float, db):
    """주문 하나를 체결 처리"""
    result = await db.execute(select(User).where(User.id == order.user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    if order.trade_type == TradeType.BUY:
        total_cost = price_krw * order.quantity

        # 예약금과 실제 체결금액 차이 조정
        diff = order.reserved_cash - total_cost
        user.cash += diff  # 저렴하게 체결되면 차액 환급, 비싸면 추가 차감(단 예약 시 이미 검증됨)

        # 포트폴리오 업데이트
        res = await db.execute(
            select(Portfolio).where(Portfolio.user_id == user.id, Portfolio.ticker == order.ticker)
        )
        portfolio = res.scalar_one_or_none()
        if portfolio:
            total_qty = portfolio.quantity + order.quantity
            portfolio.avg_price = (portfolio.avg_price * portfolio.quantity + price_krw * order.quantity) / total_qty
            portfolio.quantity = total_qty
        else:
            portfolio = Portfolio(
                user_id=user.id,
                ticker=order.ticker,
                name=order.name,
                market=order.market,
                exchange=order.exchange or "",
                quantity=order.quantity,
                avg_price=price_krw,
            )
            db.add(portfolio)

        history = TradeHistory(
            user_id=user.id,
            ticker=order.ticker,
            name=order.name,
            market=order.market,
            trade_type=TradeType.BUY,
            quantity=order.quantity,
            price=price_krw,
            total=total_cost,
        )

    else:  # SELL
        res = await db.execute(
            select(Portfolio).where(Portfolio.user_id == user.id, Portfolio.ticker == order.ticker)
        )
        portfolio = res.scalar_one_or_none()
        if not portfolio or portfolio.quantity < order.quantity:
            # 보유 수량 부족 → 주문 취소
            order.status = OrderStatus.CANCELLED
            await db.commit()
            print(f"[OrderEngine] 매도 주문 #{order.id} 취소: 보유 수량 부족")
            return

        total_revenue = price_krw * order.quantity
        portfolio.quantity -= order.quantity
        if portfolio.quantity == 0:
            await db.delete(portfolio)

        user.cash += total_revenue

        history = TradeHistory(
            user_id=user.id,
            ticker=order.ticker,
            name=order.name,
            market=order.market,
            trade_type=TradeType.SELL,
            quantity=order.quantity,
            price=price_krw,
            total=total_revenue,
        )

    db.add(history)
    order.status = OrderStatus.FILLED
    order.filled_at = datetime.utcnow()
    await db.commit()
    print(f"[OrderEngine] 주문 #{order.id} 체결 ({order.trade_type} {order.ticker} {order.quantity}주 @ {price_krw:,.0f}원)")

    # 카카오톡 체결 알림
    try:
        from services.kakao_notify import send_order_filled_notify
        total = price_krw * order.quantity
        await send_order_filled_notify(order.user_id, {
            "name": order.name,
            "ticker": order.ticker,
            "trade_type": order.trade_type,
            "quantity": order.quantity,
            "price": price_krw,
            "total": total,
        })
    except Exception as e:
        print(f"[OrderEngine] 카카오 알림 오류: {e}")


async def check_and_fill_orders():
    """미체결 주문 체크 및 체결"""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PendingOrder).where(PendingOrder.status == OrderStatus.PENDING)
        )
        orders = result.scalars().all()

        if not orders:
            return

        # 유니크 ticker 목록으로 가격 한 번씩만 조회
        tickers = list({o.ticker for o in orders})
        prices: dict[str, float] = {}

        usd_krw = await get_usd_krw()

        for ticker in tickers:
            try:
                info = await get_stock_price(ticker)
                if not info:
                    continue
                if info["market"] == "US" and usd_krw:
                    prices[ticker] = info["price"] * usd_krw
                else:
                    prices[ticker] = info["price"]
            except Exception as e:
                print(f"[OrderEngine] 가격 조회 실패 ({ticker}): {e}")

        for order in orders:
            current_price = prices.get(order.ticker)
            if current_price is None:
                continue

            should_fill = (
                (order.trade_type == TradeType.BUY and current_price <= order.limit_price) or
                (order.trade_type == TradeType.SELL and current_price >= order.limit_price)
            )

            if should_fill:
                try:
                    await _fill_order(order, order.limit_price, db)
                except Exception as e:
                    print(f"[OrderEngine] 체결 오류 #{order.id}: {e}")
                    await db.rollback()


async def order_engine_loop():
    """30초마다 주문 체결 엔진 + 마진콜 체크 실행"""
    print("[OrderEngine] 시작 — 30초마다 미체결 주문 + 마진콜 체크")
    from services.margin_call import check_margin_calls
    while True:
        try:
            await check_and_fill_orders()
        except Exception as e:
            print(f"[OrderEngine] 주문 체결 오류: {e}")
        try:
            liquidated = await check_margin_calls()
            if liquidated:
                print(f"[MarginCall] 강제청산 {len(liquidated)}건: {liquidated}")
        except Exception as e:
            print(f"[MarginCall] 마진콜 체크 오류: {e}")
        await asyncio.sleep(30)
