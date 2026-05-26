"""매일 자산 스냅샷 저장 (백그라운드 태스크)"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from models.database import AsyncSessionLocal, User, Portfolio, AssetSnapshot, Season, SEED_MONEY
from services.stock import get_stock_price


async def save_daily_snapshots():
    """모든 유저의 오늘 자산 스냅샷 저장"""
    async with AsyncSessionLocal() as db:
        # 현재 시즌
        season_result = await db.execute(select(Season).where(Season.is_active == True))
        season = season_result.scalar_one_or_none()
        season_num = season.season_number if season else 1

        users_result = await db.execute(select(User))
        users = users_result.scalars().all()

        for user in users:
            port_result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
            portfolios = port_result.scalars().all()

            total_eval = 0.0
            for p in portfolios:
                price_info = await get_stock_price(p.ticker)
                if price_info:
                    total_eval += price_info["price"] * p.quantity

            total_assets = user.cash + total_eval
            profit_pct = ((total_assets - SEED_MONEY) / SEED_MONEY) * 100

            db.add(AssetSnapshot(
                user_id=user.id,
                total_assets=total_assets,
                cash=user.cash,
                stock_value=total_eval,
                profit_pct=round(profit_pct, 2),
                season=season_num,
                recorded_at=datetime.utcnow(),
            ))

        await db.commit()
