from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from models.database import get_db, User, Portfolio, Season, SeasonResult, AssetSnapshot, TradeHistory, SEED_MONEY
from services.stock import get_stock_price

router = APIRouter(prefix="/season", tags=["season"])


async def calc_user_assets(user: User, db: AsyncSession) -> float:
    result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
    portfolios = result.scalars().all()
    total_eval = 0.0
    for p in portfolios:
        price_info = await get_stock_price(p.ticker)
        if price_info:
            total_eval += price_info["price"] * p.quantity
    return user.cash + total_eval


@router.get("/current")
async def get_current_season(db: AsyncSession = Depends(get_db)):
    """현재 시즌 정보"""
    result = await db.execute(
        select(Season).where(Season.is_active == True).order_by(Season.season_number.desc()).limit(1)
    )
    season = result.scalars().first()
    if not season:
        return {"season": None}
    now = datetime.utcnow()
    # 남은 날수
    import calendar
    last_day = calendar.monthrange(now.year, now.month)[1]
    days_left = last_day - now.day
    return {
        "season_number": season.season_number,
        "year": season.year,
        "month": season.month,
        "days_left": days_left,
        "started_at": season.started_at.isoformat(),
    }


@router.get("/history")
async def get_season_history(db: AsyncSession = Depends(get_db)):
    """지난 시즌 기록"""
    result = await db.execute(
        select(Season).where(Season.is_active == False).order_by(Season.season_number.desc())
    )
    seasons = result.scalars().all()

    history = []
    for s in seasons:
        results_q = await db.execute(
            select(SeasonResult)
            .where(SeasonResult.season_id == s.id)
            .order_by(SeasonResult.rank)
        )
        results = results_q.scalars().all()
        history.append({
            "season_number": s.season_number,
            "year": s.year,
            "month": s.month,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "results": [
                {
                    "rank": r.rank,
                    "nickname": r.nickname,
                    "profile_image": r.profile_image,
                    "final_assets": r.final_assets,
                    "profit": r.profit,
                    "profit_pct": r.profit_pct,
                }
                for r in results
            ],
        })
    return history


@router.get("/snapshot/{user_id}")
async def get_asset_snapshot(user_id: int, db: AsyncSession = Depends(get_db)):
    """유저 자산 히스토리 (그래프용)"""
    result = await db.execute(
        select(AssetSnapshot)
        .where(AssetSnapshot.user_id == user_id)
        .order_by(AssetSnapshot.recorded_at.asc())
        .limit(90)
    )
    snapshots = result.scalars().all()
    return [
        {
            "date": s.recorded_at.strftime("%m/%d"),
            "total_assets": s.total_assets,
            "profit_pct": s.profit_pct,
            "season": s.season,
        }
        for s in snapshots
    ]


@router.post("/reset")
async def reset_season(db: AsyncSession = Depends(get_db)):
    """시즌 초기화 (매월 1일 자동 호출 or 수동)"""
    # 현재 시즌 종료 (활성 시즌이 여러 개면 가장 최근 것)
    result = await db.execute(
        select(Season).where(Season.is_active == True).order_by(Season.season_number.desc()).limit(1)
    )
    current_season = result.scalars().first()
    if not current_season:
        return {"message": "활성 시즌 없음"}

    # 모든 유저 최종 자산 스냅샷 저장
    users_result = await db.execute(select(User))
    users = users_result.scalars().all()

    ranking = []
    for user in users:
        total_assets = await calc_user_assets(user, db)
        profit = total_assets - SEED_MONEY
        profit_pct = (profit / SEED_MONEY) * 100
        ranking.append((user, total_assets, profit, profit_pct))

    ranking.sort(key=lambda x: x[3], reverse=True)

    for rank, (user, total_assets, profit, profit_pct) in enumerate(ranking, 1):
        db.add(SeasonResult(
            season_id=current_season.id,
            user_id=user.id,
            nickname=user.nickname,
            profile_image=user.profile_image,
            final_assets=total_assets,
            profit=profit,
            profit_pct=profit_pct,
            rank=rank,
        ))

    current_season.is_active = False
    current_season.ended_at = datetime.utcnow()

    # 새 시즌 생성
    now = datetime.utcnow()
    next_month = now.month % 12 + 1
    next_year = now.year + (1 if next_month == 1 else 0)
    new_season = Season(
        season_number=current_season.season_number + 1,
        year=next_year,
        month=next_month,
        is_active=True,
    )
    db.add(new_season)

    # 모든 유저 자산 초기화
    for user in users:
        user.cash = SEED_MONEY

    # 모든 포트폴리오 초기화
    from models.database import Portfolio, ShortPosition, FuturesPosition
    from sqlalchemy import delete
    await db.execute(delete(Portfolio))
    await db.execute(delete(ShortPosition))
    await db.execute(delete(FuturesPosition))

    await db.commit()
    return {"message": f"시즌 {current_season.season_number} 종료! 시즌 {current_season.season_number + 1} 시작!"}
