from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db, User, Portfolio, AssetSnapshot
from services.stock import get_stock_price
from services.exchange_rate import get_usd_krw
from services.auth import decode_jwt

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

SEED_MONEY = 10_000_000


async def get_current_user(authorization: str = Header(...), db: AsyncSession = Depends(get_db)) -> User:
    try:
        token = authorization.replace("Bearer ", "")
        payload = decode_jwt(token)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="인증이 필요합니다")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="유저를 찾을 수 없습니다")
    return user


@router.get("/me")
async def get_my_portfolio(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """내 포트폴리오 조회 (미국주식 환율 환산 포함)"""
    result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
    portfolios = result.scalars().all()

    usd_krw = await get_usd_krw()

    holdings = []
    total_eval_krw = 0.0

    for p in portfolios:
        price_info = await get_stock_price(p.ticker)
        if not price_info:
            continue

        is_us = price_info["market"] == "US"
        current_price_raw = price_info["price"]  # USD or KRW

        # 원화 환산 평가금액
        if is_us:
            current_price_krw = current_price_raw * usd_krw
            avg_price_krw = p.avg_price  # 매수 시 이미 원화로 저장됨
        else:
            current_price_krw = current_price_raw
            avg_price_krw = p.avg_price

        eval_amount_krw = current_price_krw * p.quantity
        profit_krw = eval_amount_krw - avg_price_krw * p.quantity
        profit_pct = (profit_krw / (avg_price_krw * p.quantity)) * 100 if avg_price_krw else 0

        total_eval_krw += eval_amount_krw

        holdings.append({
            "ticker": p.ticker,
            "name": p.name,
            "market": p.market,
            "exchange": price_info.get("exchange", ""),
            "quantity": p.quantity,
            "avg_price": round(p.avg_price, 2),           # 원화 기준 매수가
            "current_price": round(current_price_raw, 4),  # 원래 통화 (표시용)
            "current_price_krw": round(current_price_krw, 0),
            "eval_amount": round(eval_amount_krw, 0),
            "profit": round(profit_krw, 0),
            "profit_pct": round(profit_pct, 2),
            "change_pct": price_info["change_pct"],
            "is_us": is_us,
            "usd_krw": round(usd_krw, 2) if is_us else None,
        })

    total_assets = user.cash + total_eval_krw
    total_profit = total_assets - SEED_MONEY
    total_profit_pct = (total_profit / SEED_MONEY) * 100

    return {
        "nickname": user.nickname,
        "profile_image": user.profile_image,
        "cash": round(user.cash, 0),
        "total_eval": round(total_eval_krw, 0),
        "total_assets": round(total_assets, 0),
        "total_profit": round(total_profit, 0),
        "total_profit_pct": round(total_profit_pct, 2),
        "holdings": holdings,
        "usd_krw": round(usd_krw, 2),
    }


@router.get("/history-chart")
async def get_history_chart(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """자산 히스토리 차트 데이터"""
    result = await db.execute(
        select(AssetSnapshot)
        .where(AssetSnapshot.user_id == user.id)
        .order_by(AssetSnapshot.recorded_at.asc())
        .limit(90)
    )
    snapshots = result.scalars().all()

    return [
        {
            "date": s.recorded_at.strftime("%m/%d"),
            "total_assets": round(s.total_assets, 0),
            "profit_pct": round(s.profit_pct, 2),
        }
        for s in snapshots
    ]
