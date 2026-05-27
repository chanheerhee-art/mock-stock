from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from models.database import get_db, User, UserBadge, TradeHistory, Portfolio, ShortPosition, FuturesPosition, SEED_MONEY
from services.badges import BADGES, BADGE_MAP, check_and_award_badges
from services.auth import decode_jwt
from services.exchange_rate import get_usd_krw
from services.stock import get_stock_price

router = APIRouter(prefix="/badges", tags=["badges"])


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


@router.get("/all")
async def get_all_badges():
    """모든 업적 목록"""
    return BADGES


@router.get("/my")
async def get_my_badges(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """내 업적 목록 (획득한 것 + 미획득 포함)"""
    result = await db.execute(
        select(UserBadge)
        .where(UserBadge.user_id == user.id)
        .order_by(UserBadge.earned_at.desc())
    )
    earned = {b.badge_id: b.earned_at for b in result.scalars().all()}

    badges_out = []
    for b in BADGES:
        badges_out.append({
            **b,
            "earned": b["id"] in earned,
            "earned_at": earned[b["id"]].isoformat() if b["id"] in earned else None,
        })

    return {
        "total": len(BADGES),
        "earned_count": len(earned),
        "badges": badges_out,
    }


@router.post("/check")
async def check_badges(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """업적 조건 수동 체크 (전체 재검사)"""
    usd_krw = await get_usd_krw()

    # 거래 횟수
    cnt_result = await db.execute(
        select(func.count()).select_from(TradeHistory).where(TradeHistory.user_id == user.id)
    )
    trade_count = cnt_result.scalar() or 0

    # 보유 종목
    port_result = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
    holdings = port_result.scalars().all()

    # 수익률 계산
    total_eval = 0.0
    for p in holdings:
        price_info = await get_stock_price(p.ticker)
        if price_info:
            price_krw = price_info["price"] * usd_krw if price_info["market"] == "US" else price_info["price"]
            total_eval += price_krw * p.quantity
    total_assets = user.cash + total_eval
    profit_pct = ((total_assets - SEED_MONEY) / SEED_MONEY) * 100

    # 공매도/선물 여부
    short_res = await db.execute(select(ShortPosition).where(ShortPosition.user_id == user.id))
    has_short = short_res.scalars().first() is not None
    fut_res = await db.execute(select(FuturesPosition).where(FuturesPosition.user_id == user.id))
    has_futures = fut_res.scalars().first() is not None

    new_badges = await check_and_award_badges(
        user.id, db,
        trade_count=trade_count,
        profit_pct=profit_pct,
        holdings=holdings,
        has_short=has_short,
        has_futures=has_futures,
    )

    return {
        "new_badges": [BADGE_MAP[bid] for bid in new_badges if bid in BADGE_MAP],
        "new_count": len(new_badges),
    }
