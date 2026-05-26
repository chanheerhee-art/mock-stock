from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from models.database import init_db
from routers import auth, trade, portfolio, ranking, stock


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="모의주식 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 배포 시 실제 도메인으로 변경
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(trade.router)
app.include_router(portfolio.router)
app.include_router(ranking.router)
app.include_router(stock.router)


@app.get("/")
def root():
    return {"message": "모의주식 API 서버 🚀"}
