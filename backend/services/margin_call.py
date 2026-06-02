"""
마진콜(강제청산) 엔진
- 손실이 증거금의 일정 비율을 넘으면 포지션을 강제로 청산해 손실 확대를 막는다.
- 선물: 미실현 손실 >= 증거금 × LIQUIDATION_RATIO → 청산
- 공매도: 미실현 손실 >= 증거금 × LIQUIDATION_RATIO → 청산
"""
from datetime import datetime
from sqlalchemy import select

from models.database import (
    AsyncSessionLocal, User, ShortPosition, FuturesPosition, TradeHistory, TradeType,
)
from services.stock import get_stock_price
from services.exchange_rate import get_usd_krw
from services.futures import get_futures_price, unrealized_pnl as futures_pnl

# 손실이 증거금의 이 비율에 도달하면 강제청산
LIQUIDATION_RATIO = 0.8


async def _liquidate_futures(db) -> list[dict]:
    """선물 강제청산 대상 처리"""
    result = await db.execute(select(FuturesPosition).where(FuturesPosition.is_open == True))
    positions = result.scalars().all()
    if not positions:
        return []

    liquidated = []
    for p in positions:
        symbol = p.symbol or "KOSPI200"
        idx = await get_futures_price(symbol)
        if not idx:
            continue
        cur_idx = idx["price"]
        pnl = futures_pnl(p.side.value, p.entry_price, cur_idx, p.contracts, symbol)
        # 손실이 증거금의 80% 이상이면 청산
        if pnl < 0 and abs(pnl) >= p.margin * LIQUIDATION_RATIO:
            user_res = await db.execute(select(User).where(User.id == p.user_id))
            user = user_res.scalar_one_or_none()
            if not user:
                continue
            # 증거금 반환 + 실현손익 정산
            user.cash += p.margin + pnl
            p.is_open = False
            p.closed_at = datetime.utcnow()
            liquidated.append({
                "user_id": user.id, "type": "futures",
                "side": p.side.value, "pnl": round(pnl, 0),
            })

    return liquidated


async def _liquidate_shorts(db) -> list[dict]:
    """공매도 강제청산 대상 처리"""
    result = await db.execute(select(ShortPosition).where(ShortPosition.is_open == True))
    positions = result.scalars().all()
    if not positions:
        return []

    usd_krw = await get_usd_krw()

    liquidated = []
    for p in positions:
        price_info = await get_stock_price(p.ticker)
        if not price_info:
            continue
        is_us = price_info["market"] == "US"
        cur_price_krw = price_info["price"] * usd_krw if is_us else price_info["price"]
        pnl = (p.entry_price - cur_price_krw) * p.quantity  # 진입가 - 현재가 = 수익

        if pnl < 0 and abs(pnl) >= p.margin * LIQUIDATION_RATIO:
            user_res = await db.execute(select(User).where(User.id == p.user_id))
            user = user_res.scalar_one_or_none()
            if not user:
                continue
            user.cash += p.margin + pnl
            p.is_open = False
            p.closed_at = datetime.utcnow()
            db.add(TradeHistory(
                user_id=user.id, ticker=p.ticker, name=p.name, market=p.market,
                trade_type=TradeType.SHORT_CLOSE, quantity=p.quantity,
                price=cur_price_krw, total=cur_price_krw * p.quantity,
            ))
            liquidated.append({
                "user_id": user.id, "type": "short",
                "ticker": p.ticker, "pnl": round(pnl, 0),
            })

    return liquidated


async def check_margin_calls() -> list[dict]:
    """모든 미청산 포지션을 점검해 강제청산 대상을 처리한다."""
    async with AsyncSessionLocal() as db:
        liquidated = []
        liquidated += await _liquidate_futures(db)
        liquidated += await _liquidate_shorts(db)
        if liquidated:
            await db.commit()
        return liquidated
