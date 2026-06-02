from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
import os
import pytz

from models.database import init_db
from routers import auth, trade, portfolio, ranking, stock, season, short, futures, badges, feed, hangang
from routers.snapshot import save_daily_snapshots
from services.order_engine import order_engine_loop

KST = pytz.timezone("Asia/Seoul")
scheduler = AsyncIOScheduler(timezone=KST)


async def monthly_reset():
    """매월 1일 00:00 KST 시즌 초기화"""
    from models.database import AsyncSessionLocal
    from routers.season import reset_season
    async with AsyncSessionLocal() as db:
        await reset_season(db)
    print(f"[{datetime.now(KST)}] 월간 시즌 초기화 완료!")


async def daily_snapshot():
    """매일 18:00 KST 자산 스냅샷 저장 (장 마감 후)"""
    await save_daily_snapshots()
    print(f"[{datetime.now(KST)}] 일별 자산 스냅샷 저장 완료!")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    await init_db()

    # 매월 1일 00:00 KST 시즌 리셋
    scheduler.add_job(monthly_reset, CronTrigger(day=1, hour=0, minute=0))
    # 매일 18:05 KST 스냅샷 저장
    scheduler.add_job(daily_snapshot, CronTrigger(hour=18, minute=5))

    scheduler.start()
    print("스케줄러 시작됨!")

    # 지정가 주문 체결 엔진 (백그라운드 태스크)
    engine_task = asyncio.create_task(order_engine_loop())

    yield

    engine_task.cancel()
    scheduler.shutdown()


app = FastAPI(title="모의주식 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(trade.router)
app.include_router(portfolio.router)
app.include_router(ranking.router)
app.include_router(stock.router)
app.include_router(season.router)
app.include_router(short.router)
app.include_router(futures.router)
app.include_router(badges.router)
app.include_router(feed.router)
app.include_router(hangang.router)


@app.get("/")
def root():
    return {"message": "모의주식 API 서버 🚀"}


ADMIN_KEY = os.getenv("ADMIN_KEY")


def verify_admin(x_admin_key: str = Header(None)):
    """admin 엔드포인트 보호. ADMIN_KEY 환경변수와 X-Admin-Key 헤더 일치 필요."""
    if not ADMIN_KEY:
        raise HTTPException(status_code=503, detail="ADMIN_KEY가 설정되지 않았습니다")
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="권한이 없습니다")


@app.post("/admin/fix-cash", dependencies=[Depends(verify_admin)])
async def fix_negative_cash():
    """현금 복구 + 미청산 포지션 정리 + 중복 활성 시즌 정리"""
    from models.database import AsyncSessionLocal, User, ShortPosition, FuturesPosition, Season, SEED_MONEY
    from sqlalchemy import select, delete

    async with AsyncSessionLocal() as db:
        # 마이너스 현금 유저 복구
        result = await db.execute(select(User).where(User.cash < 0))
        users = result.scalars().all()
        fixed = []
        for user in users:
            old_cash = user.cash
            user.cash = SEED_MONEY
            fixed.append({"user_id": user.id, "nickname": user.nickname, "old_cash": old_cash})

        # 미청산 공매도/선물 포지션 전체 삭제
        await db.execute(delete(ShortPosition).where(ShortPosition.is_open == True))
        await db.execute(delete(FuturesPosition).where(FuturesPosition.is_open == True))

        # 중복 활성 시즌 정리: 가장 최근 것만 남기고 나머지 비활성화
        active_result = await db.execute(
            select(Season).where(Season.is_active == True).order_by(Season.season_number.desc())
        )
        active_seasons = active_result.scalars().all()
        deactivated = 0
        for s in active_seasons[1:]:
            s.is_active = False
            deactivated += 1

        await db.commit()

    return {
        "fixed_users": fixed,
        "deactivated_duplicate_seasons": deactivated,
        "message": "완료",
    }


@app.post("/admin/reset-all", dependencies=[Depends(verify_admin)])
async def reset_all_accounts():
    """공매도 회계 버그로 꼬인 데이터 정리: 전 유저를 시드머니로 리셋하고
    모든 보유종목/공매도/선물 포지션을 초기화한다."""
    from models.database import (
        AsyncSessionLocal, User, Portfolio, ShortPosition, FuturesPosition, SEED_MONEY,
    )
    from sqlalchemy import select, delete

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        for user in users:
            user.cash = SEED_MONEY

        await db.execute(delete(Portfolio))
        await db.execute(delete(ShortPosition))
        await db.execute(delete(FuturesPosition))

        await db.commit()

    return {"reset_users": len(users), "message": "전 계정 시드머니로 리셋 완료"}
