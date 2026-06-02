from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from models.database import get_db, User, FuturesPosition, FuturesSide
from services.futures import (
    get_futures_price, FUTURES_SPECS,
    contract_value, required_margin, unrealized_pnl,
)
from services.auth import decode_jwt

router = APIRouter(prefix="/futures", tags=["futures"])


async def get_current_user(authorization: str = Header(None), db: AsyncSession = Depends(get_db)) -> User:
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
    symbol: str = "KOSPI200"
    side: str       # LONG / SHORT
    contracts: int  # 계약 수 (1 이상)


@router.get("/symbols")
async def list_symbols():
    """거래 가능한 선물 종목 목록"""
    return [
        {
            "symbol": sym,
            "name_kr": spec["name_kr"],
            "flag": spec["flag"],
            "multiplier": spec["multiplier"],
            "margin_rate": spec["margin_rate"],
            "unit": spec["unit"],
            "currency": spec["currency"],
        }
        for sym, spec in FUTURES_SPECS.items()
    ]


@router.get("/index")
async def futures_index(symbol: str = "KOSPI200"):
    """선물 종목 현재가 + 거래 사양"""
    data = await get_futures_price(symbol)
    if not data:
        raise HTTPException(status_code=503, detail="가격 조회 실패")
    spec = FUTURES_SPECS[symbol]
    return {
        **data,
        "contract_value": round(data["price"] * spec["multiplier"], 0),
        "required_margin_per_contract": round(data["price"] * spec["multiplier"] * spec["margin_rate"], 0),
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

    out = []
    for p in positions:
        symbol = p.symbol or "KOSPI200"
        price_data = await get_futures_price(symbol)
        cur_price = price_data["price"] if price_data else p.entry_price
        pnl = unrealized_pnl(p.side.value, p.entry_price, cur_price, p.contracts, symbol)
        pnl_pct = (pnl / p.margin * 100) if p.margin else 0
        spec = FUTURES_SPECS.get(symbol, FUTURES_SPECS["KOSPI200"])
        out.append({
            "id": p.id,
            "symbol": symbol,
            "name_kr": spec["name_kr"],
            "flag": spec["flag"],
            "currency": spec["currency"],
            "side": p.side.value,
            "contracts": p.contracts,
            "entry_price": p.entry_price,
            "current_price": cur_price,
            "margin": round(p.margin, 0),
            "profit": round(pnl, 0),
            "profit_pct": round(pnl_pct, 2),
            "opened_at": p.opened_at.isoformat() + "Z",
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
    if req.symbol not in FUTURES_SPECS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 종목: {req.symbol}")

    price_data = await get_futures_price(req.symbol)
    if not price_data:
        raise HTTPException(status_code=503, detail="가격 조회 실패")

    entry = price_data["price"]
    margin = required_margin(entry, req.contracts, req.symbol)

    if user.cash < margin:
        raise HTTPException(status_code=400, detail=f"증거금 부족 (필요: {int(margin):,}원, 보유: {int(user.cash):,}원)")

    user.cash -= margin
    position = FuturesPosition(
        user_id=user.id,
        symbol=req.symbol,
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

    spec = FUTURES_SPECS[req.symbol]
    return {
        "id": position.id,
        "symbol": req.symbol,
        "name_kr": spec["name_kr"],
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

    symbol = pos.symbol or "KOSPI200"
    price_data = await get_futures_price(symbol)
    if not price_data:
        raise HTTPException(status_code=503, detail="가격 조회 실패")
    cur = price_data["price"]

    pnl = unrealized_pnl(pos.side.value, pos.entry_price, cur, pos.contracts, symbol)
    pnl_pct = (pnl / pos.margin * 100) if pos.margin else 0
    payout = max(0.0, pos.margin + pnl)
    user.cash += payout

    pos.is_open = False
    pos.closed_at = datetime.utcnow()
    await db.commit()

    spec = FUTURES_SPECS.get(symbol, FUTURES_SPECS["KOSPI200"])
    return {
        "position_id": position_id,
        "symbol": symbol,
        "name_kr": spec["name_kr"],
        "side": pos.side.value,
        "contracts": pos.contracts,
        "entry_price": pos.entry_price,
        "exit_price": cur,
        "profit": round(pnl, 0),
        "profit_pct": round(pnl_pct, 2),
        "payout": round(payout, 0),
        "remaining_cash": round(user.cash, 0),
    }
