from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from models.database import (
    get_db, User, FuturesPosition, FuturesSide,
)
from services.futures import (
    get_kospi200_index, CONTRACT_MULTIPLIER, MARGIN_RATE,
    contract_value, required_margin, unrealized_pnl,
)
from services.auth import decode_jwt

router = APIRouter(prefix="/futures", tags=["futures"])


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


class FuturesOpenRequest(BaseModel):
    side: str       # LONG / SHORT
    contracts: int  # 계약 수 (1 이상)


@router.get("/index")
async def futures_index():
    """KOSPI200 지수 + 거래 사양"""
    idx = await get_kospi200_index()
    if not idx:
        raise HTTPException(status_code=503, detail="지수 조회 실패")
    return {
        **idx,
        "multiplier": CONTRACT_MULTIPLIER,
        "margin_rate": MARGIN_RATE,
        "contract_value": round(idx["price"] * CONTRACT_MULTIPLIER, 0),
        "required_margin_per_contract": round(idx["price"] * CONTRACT_MULTIPLIER * MARGIN_RATE, 0),
    }


@router.get("/positions")
async def list_positions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """내 오픈 선물 포지션"""
    res = await db.execute(
        select(FuturesPosition).where(
            FuturesPosition.user_id == user.id,
            FuturesPosition.is_open == True,
        )
    )
    positions = res.scalars().all()
    idx = await get_kospi200_index()
    cur_price = idx["price"] if idx else 0

    out = []
    for p in positions:
        pnl = unrealized_pnl(p.side.value, p.entry_price, cur_price, p.contracts)
        pnl_pct = (pnl / p.margin * 100) if p.margin else 0
        out.append({
            "id": p.id,
            "side": p.side.value,
            "contracts": p.contracts,
            "entry_price": p.entry_price,
            "current_price": cur_price,
            "margin": round(p.margin, 0),
            "profit": round(pnl, 0),
            "profit_pct": round(pnl_pct, 2),
            "opened_at": p.opened_at.isoformat(),
        })
    return out


@router.post("/open")
async def open_position(
    req: FuturesOpenRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """선물 진입 (LONG/SHORT)"""
    if req.contracts < 1:
        raise HTTPException(status_code=400, detail="1계약 이상 필요")
    if req.side not in ("LONG", "SHORT"):
        raise HTTPException(status_code=400, detail="side는 LONG 또는 SHORT")

    idx = await get_kospi200_index()
    if not idx:
        raise HTTPException(status_code=503, detail="지수 조회 실패")
    entry = idx["price"]
    margin = required_margin(entry, req.contracts)

    if user.cash < margin:
        raise HTTPException(status_code=400, detail=f"증거금 부족 (필요: {int(margin):,}원, 보유: {int(user.cash):,}원)")

    user.cash -= margin
    position = FuturesPosition(
        user_id=user.id,
        side=FuturesSide(req.side),
        contracts=req.contracts,
        entry_price=entry,
        margin=margin,
        is_open=True,
        opened_at=datetime.utcnow(),
    )
    db.add(position)
    await db.commit()
    await db.refresh(position)

    return {
        "id": position.id,
        "side": req.side,
        "contracts": req.contracts,
        "entry_price": entry,
        "margin": round(margin, 0),
        "remaining_cash": round(user.cash, 0),
    }


@router.post("/close/{position_id}")
async def close_position(
    position_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """선물 청산"""
    res = await db.execute(
        select(FuturesPosition).where(
            FuturesPosition.id == position_id,
            FuturesPosition.user_id == user.id,
            FuturesPosition.is_open == True,
        )
    )
    pos = res.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=404, detail="포지션을 찾을 수 없습니다")

    idx = await get_kospi200_index()
    if not idx:
        raise HTTPException(status_code=503, detail="지수 조회 실패")
    cur = idx["price"]

    pnl = unrealized_pnl(pos.side.value, pos.entry_price, cur, pos.contracts)
    pnl_pct = (pnl / pos.margin * 100) if pos.margin else 0

    # 증거금 + 손익 환급 (증거금 손실 막기: 손실이 증거금 초과 시 증거금만 잃음)
    payout = max(0.0, pos.margin + pnl)
    user.cash += payout

    pos.is_open = False
    pos.closed_at = datetime.utcnow()

    await db.commit()

    return {
        "position_id": position_id,
        "side": pos.side.value,
        "contracts": pos.contracts,
        "entry_price": pos.entry_price,
        "exit_price": cur,
        "profit": round(pnl, 0),
        "profit_pct": round(pnl_pct, 2),
        "payout": round(payout, 0),
        "remaining_cash": round(user.cash, 0),
    }
