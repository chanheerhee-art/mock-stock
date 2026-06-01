from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from models.database import get_db, User, TradeHistory, Portfolio, TradeType

router = APIRouter(prefix="/feed", tags=["feed"])

# 거래 종류별 표시 정보 (라벨, 이모지)
_TRADE_META = {
    TradeType.BUY: ("매수", "🔴"),
    TradeType.SELL: ("매도", "🔵"),
    TradeType.SHORT_OPEN: ("공매도", "📉"),
    TradeType.SHORT_CLOSE: ("공매도 청산", "📈"),
}


@router.get("/")
async def get_trade_feed(limit: int = 30, db: AsyncSession = Depends(get_db)):
    """전체 유저의 최근 거래 피드 (시간순)"""
    result = await db.execute(
        select(TradeHistory, User)
        .join(User, TradeHistory.user_id == User.id)
        .order_by(desc(TradeHistory.traded_at))
        .limit(min(limit, 100))
    )
    rows = result.all()

    feed = []
    for trade, user in rows:
        label, emoji = _TRADE_META.get(trade.trade_type, ("거래", "•"))
        feed.append({
            "id": trade.id,
            "user_id": user.id,
            "nickname": user.nickname,
            "profile_image": user.profile_image,
            "ticker": trade.ticker,
            "name": trade.name,
            "market": trade.market,
            "trade_type": trade.trade_type.value,
            "trade_label": label,
            "emoji": emoji,
            "quantity": trade.quantity,
            "price": round(trade.price, 2),
            "total": round(trade.total, 0),
            "traded_at": trade.traded_at.isoformat(),
        })

    return feed


@router.get("/popular")
async def get_popular_stocks(db: AsyncSession = Depends(get_db)):
    """친구들이 현재 가장 많이 보유한 종목 순위 (보유자 수 기준)"""
    result = await db.execute(
        select(
            Portfolio.ticker,
            Portfolio.name,
            Portfolio.market,
            func.count(func.distinct(Portfolio.user_id)).label("holder_count"),
            func.sum(Portfolio.quantity).label("total_qty"),
        )
        .group_by(Portfolio.ticker, Portfolio.name, Portfolio.market)
        .order_by(desc("holder_count"))
        .limit(10)
    )
    rows = result.all()

    return [
        {
            "ticker": r.ticker,
            "name": r.name,
            "market": r.market,
            "holder_count": r.holder_count,
            "total_qty": int(r.total_qty or 0),
        }
        for r in rows
    ]
