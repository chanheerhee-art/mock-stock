"""코스피200 선물 시뮬레이션"""
from __future__ import annotations
from typing import Optional
import httpx
import time

# 코스피200 선물 거래 승수 (실제 25만원이나, 시뮬레이션 부담 줄이려 5만원으로)
CONTRACT_MULTIPLIER = 50_000
MARGIN_RATE = 0.10  # 10% 증거금 (10배 레버리지)

_index_cache: dict = {"value": None, "expire": 0.0}
_CACHE_TTL = 15  # 15초


async def get_kospi200_index() -> Optional[dict]:
    """KOSPI200 지수 현재가 (15초 캐시)"""
    now = time.monotonic()
    if _index_cache["value"] and _index_cache["expire"] > now:
        return _index_cache["value"]

    try:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EKS200?interval=1d&range=1d"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()
        meta = data["chart"]["result"][0]["meta"]
        current = meta.get("regularMarketPrice", 0)
        prev = meta.get("chartPreviousClose") or meta.get("previousClose") or current
        change = current - prev
        change_pct = (change / prev * 100) if prev else 0
        result = {
            "price": round(current, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "prev_close": round(prev, 2),
            "day_high": round(meta.get("regularMarketDayHigh", current), 2),
            "day_low": round(meta.get("regularMarketDayLow", current), 2),
        }
        _index_cache["value"] = result
        _index_cache["expire"] = now + _CACHE_TTL
        return result
    except Exception as e:
        print(f"KOSPI200 조회 오류: {e}")
        return None


def contract_value(index_price: float, contracts: int) -> float:
    """계약 명목가치 = 지수 × 승수 × 계약수"""
    return index_price * CONTRACT_MULTIPLIER * contracts


def required_margin(index_price: float, contracts: int) -> float:
    """필요 증거금"""
    return contract_value(index_price, contracts) * MARGIN_RATE


def unrealized_pnl(side: str, entry: float, current: float, contracts: int) -> float:
    """미실현 손익 = (현재가-진입가) × 승수 × 계약수 × 방향"""
    direction = 1 if side == "LONG" else -1
    return (current - entry) * CONTRACT_MULTIPLIER * contracts * direction
