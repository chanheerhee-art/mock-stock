from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
import pytz

from models.database import init_db
from routers import auth, trade, portfolio, ranking, stock, season
from routers.snapshot import save_daily_snapshots

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
    await init_db()

    # 매월 1일 00:00 KST 시즌 리셋
    scheduler.add_job(monthly_reset, CronTrigger(day=1, hour=0, minute=0))
    # 매일 18:05 KST 스냅샷 저장
    scheduler.add_job(daily_snapshot, CronTrigger(hour=18, minute=5))

    scheduler.start()
    print("스케줄러 시작됨!")
    yield
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


@app.get("/")
def root():
    return {"message": "모의주식 API 서버 🚀"}
