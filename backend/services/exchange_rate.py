import httpx
import asyncio
from datetime import datetime
import pytz

KST = pytz.timezone("Asia/Seoul")

# 캐시 (5분 유효)
_cache: dict = {"rate": 1300.0, "updated_at": None}
_CACHE_TTL = 300  # 5분


async def get_usd_krw() -> float:
    """USD/KRW 환율 조회 (5분 캐시)"""
    now = datetime.now(KST)
    if _cache["updated_at"] and (now - _cache["updated_at"]).total_seconds() < _CACHE_TTL:
        return _cache["rate"]

    try:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/USDKRW=X?interval=1d&range=1d"
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()
            rate = data["chart"]["result"][0]["meta"]["regularMarketPrice"]
            _cache["rate"] = rate
            _cache["updated_at"] = now
            return rate
    except Exception as e:
        print(f"환율 조회 오류: {e}")
        return _cache["rate"]  # 실패 시 캐시값 반환
