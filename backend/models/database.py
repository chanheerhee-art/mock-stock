from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Boolean
from datetime import datetime
import enum
import os
from dotenv import load_dotenv

load_dotenv()

_raw_db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./mock_stock.db")
# Railway PostgreSQL URL을 async 드라이버로 변환
if _raw_db_url.startswith("postgresql://"):
    DATABASE_URL = _raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _raw_db_url.startswith("postgres://"):
    DATABASE_URL = _raw_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL = _raw_db_url
SEED_MONEY = float(os.getenv("SEED_MONEY", 10000000))

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class TradeType(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"
    SHORT_OPEN = "SHORT_OPEN"    # 공매도 진입
    SHORT_CLOSE = "SHORT_CLOSE"  # 공매도 청산


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    kakao_id = Column(String, unique=True, index=True)
    nickname = Column(String)
    profile_image = Column(String, nullable=True)
    cash = Column(Float, default=SEED_MONEY)
    created_at = Column(DateTime, default=datetime.utcnow)
    # 카카오 메시지 전송용 토큰
    kakao_access_token = Column(String, nullable=True)
    kakao_refresh_token = Column(String, nullable=True)
    kakao_token_expires = Column(DateTime, nullable=True)


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    ticker = Column(String)
    name = Column(String)
    market = Column(String)
    exchange = Column(String, nullable=True)
    quantity = Column(Integer, default=0)
    avg_price = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TradeHistory(Base):
    __tablename__ = "trade_histories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    ticker = Column(String)
    name = Column(String)
    market = Column(String)
    trade_type = Column(Enum(TradeType))
    quantity = Column(Integer)
    price = Column(Float)
    total = Column(Float)
    season = Column(Integer, default=1)   # 시즌 번호
    traded_at = Column(DateTime, default=datetime.utcnow)


class Season(Base):
    """월별 시즌 관리"""
    __tablename__ = "seasons"

    id = Column(Integer, primary_key=True, index=True)
    season_number = Column(Integer, unique=True)
    year = Column(Integer)
    month = Column(Integer)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)


class SeasonResult(Base):
    """시즌 종료 시 최종 순위 스냅샷"""
    __tablename__ = "season_results"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    nickname = Column(String)
    profile_image = Column(String, nullable=True)
    final_assets = Column(Float)
    profit = Column(Float)
    profit_pct = Column(Float)
    rank = Column(Integer)
    recorded_at = Column(DateTime, default=datetime.utcnow)


class ShortPosition(Base):
    """공매도 포지션"""
    __tablename__ = "short_positions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    ticker = Column(String)
    name = Column(String)
    market = Column(String)
    exchange = Column(String, nullable=True)
    quantity = Column(Integer, default=0)
    entry_price = Column(Float)        # 진입가 (원화 기준)
    margin = Column(Float)             # 담보 예치금 (진입가 * 수량 * 30%)
    is_open = Column(Boolean, default=True)
    opened_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)


class FuturesSide(str, enum.Enum):
    LONG = "LONG"   # 매수 포지션
    SHORT = "SHORT" # 매도 포지션


class FuturesPosition(Base):
    """코스피200 선물 포지션 (10배 레버리지)"""
    __tablename__ = "futures_positions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    side = Column(Enum(FuturesSide))   # LONG / SHORT
    contracts = Column(Integer)         # 계약 수
    entry_price = Column(Float)         # 진입 지수 (KOSPI200)
    margin = Column(Float)              # 증거금 (계약가치 × 10%)
    is_open = Column(Boolean, default=True)
    opened_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)


class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"


class PendingOrder(Base):
    """미체결 지정가 주문"""
    __tablename__ = "pending_orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    ticker = Column(String)
    name = Column(String)
    market = Column(String)
    exchange = Column(String, nullable=True)
    trade_type = Column(Enum(TradeType))      # BUY / SELL
    quantity = Column(Integer)
    limit_price = Column(Float)               # 지정가 (원화 기준)
    reserved_cash = Column(Float, default=0)  # 매수 주문 시 예약된 현금
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    filled_at = Column(DateTime, nullable=True)


class AssetSnapshot(Base):
    """일별 자산 스냅샷 (자산 히스토리 그래프용)"""
    __tablename__ = "asset_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    total_assets = Column(Float)
    cash = Column(Float)
    stock_value = Column(Float)
    profit_pct = Column(Float)
    season = Column(Integer, default=1)
    recorded_at = Column(DateTime, default=datetime.utcnow)


class UserBadge(Base):
    """유저가 획득한 업적/배지"""
    __tablename__ = "user_badges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    badge_id = Column(String)           # 업적 고유 ID (e.g. "first_trade")
    earned_at = Column(DateTime, default=datetime.utcnow)


async def init_db():
    from sqlalchemy import text

    is_postgres = "postgresql" in DATABASE_URL

    if is_postgres:
        # ALTER TYPE ADD VALUE는 autocommit 모드에서만 실행 가능
        # 실패해도 서버 기동은 막지 않도록 전체를 try로 감쌈
        try:
            autocommit_engine = engine.execution_options(isolation_level="AUTOCOMMIT")
            async with autocommit_engine.connect() as conn:
                for sql in [
                    "ALTER TYPE tradetype ADD VALUE IF NOT EXISTS 'SHORT_OPEN'",
                    "ALTER TYPE tradetype ADD VALUE IF NOT EXISTS 'SHORT_CLOSE'",
                ]:
                    try:
                        await conn.execute(text(sql))
                    except Exception as e:
                        print(f"[Migration] enum 스킵: {e}")
        except Exception as e:
            print(f"[Migration] enum 블록 전체 스킵: {e}")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # 컬럼 마이그레이션 (없으면 추가, 있으면 무시)
        for sql in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_access_token VARCHAR",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_refresh_token VARCHAR",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_token_expires TIMESTAMP",
        ]:
            try:
                await conn.execute(text(sql))
            except Exception as e:
                print(f"[Migration] 스킵: {e}")

    # 첫 시즌 자동 생성 (시즌이 하나도 없을 때만)
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        result = await session.execute(select(Season).limit(1))
        if result.first() is None:
            now = datetime.utcnow()
            session.add(Season(season_number=1, year=now.year, month=now.month, is_active=True))
            await session.commit()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
