from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db, User, Portfolio
from services.stock import get_stock_price

router = APIRouter(prefix="/ranking", tags=["ranking"])

SEED_MONEY = 10_000_000


@router.get("/")
async def get_ranking(db: AsyncSession = Depends(get_db)):
    """전체 유저 수익률 랭킹"""
    result = await db.execute(select(User))
    users = result.scalars().all()

    ranking = []
    for user in users:
        port_result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
        portfolios = port_result.scalars().all()

        total_eval = 0.0
        for p in portfolios:
            price_info = get_stock_price(p.ticker)
            if price_info:
                total_eval += price_info["price"] * p.quantity

        total_assets = user.cash + total_eval
        profit = total_assets - SEED_MONEY
        profit_pct = (profit / SEED_MONEY) * 100

        ranking.append({
            "user_id": user.id,
            "nickname": user.nickname,
            "profile_image": user.profile_image,
            "total_assets": round(total_assets, 2),
            "profit": round(profit, 2),
            "profit_pct": round(profit_pct, 2),
        })

    # 수익률 순 정렬
    ranking.sort(key=lambda x: x["profit_pct"], reverse=True)
    for i, r in enumerate(ranking):
        r["rank"] = i + 1

    return ranking
