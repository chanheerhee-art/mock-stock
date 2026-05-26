from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db, User, Portfolio
from services.stock import get_stock_price
from services.auth import decode_jwt

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


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
    """내 포트폴리오 조회"""
    result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
    portfolios = result.scalars().all()

    holdings = []
    total_eval = 0.0

    for p in portfolios:
        price_info = await get_stock_price(p.ticker)
        if not price_info:
            continue

        current_price = price_info["price"]
        eval_amount = current_price * p.quantity
        profit = eval_amount - p.avg_price * p.quantity
        profit_pct = (profit / (p.avg_price * p.quantity)) * 100 if p.avg_price else 0

        total_eval += eval_amount
        holdings.append({
            "ticker": p.ticker,
            "name": p.name,
            "market": p.market,
            "quantity": p.quantity,
            "avg_price": p.avg_price,
            "current_price": current_price,
            "eval_amount": round(eval_amount, 2),
            "profit": round(profit, 2),
            "profit_pct": round(profit_pct, 2),
            "change_pct": price_info["change_pct"],
        })

    seed = float(10_000_000)
    total_assets = user.cash + total_eval
    total_profit_pct = ((total_assets - seed) / seed) * 100

    return {
        "nickname": user.nickname,
        "profile_image": user.profile_image,
        "cash": round(user.cash, 2),
        "total_eval": round(total_eval, 2),
        "total_assets": round(total_assets, 2),
        "total_profit": round(total_assets - seed, 2),
        "total_profit_pct": round(total_profit_pct, 2),
        "holdings": holdings,
    }
