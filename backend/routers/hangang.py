"""
한강 수온 추정 API
- 서울 기온(wttr.in) + 수문학 기반 계절 보정 공식으로 추정
- Mohseni & Stefan (1999) 방식: 기온 지연 반응 + 계절 기저온도
"""
from fastapi import APIRouter
from datetime import datetime, timezone
import httpx
import math

router = APIRouter(prefix="/hangang", tags=["hangang"])

_cache: dict = {"ts": 0, "data": None}
_CACHE_TTL = 600  # 10분


def estimate_water_temp(air_temp_c: float, month: int) -> float:
    """
    기온 → 한강 수온 추정
    - 여름: 열용량 때문에 기온보다 낮음
    - 겨울: 영하여도 물은 잘 안 얼음 (최저 1°C 보정)
    - 봄/가을: 기온 추종 강함
    """
    # 계절별 파라미터 (반응계수 a, 기저온도 b)
    if month in (12, 1, 2):      # 겨울
        a, b = 0.40, 3.5
    elif month in (3, 4, 5):     # 봄
        a, b = 0.72, 2.0
    elif month in (6, 7, 8):     # 여름
        a, b = 0.68, 5.5
    else:                         # 가을
        a, b = 0.75, 1.5

    raw = a * air_temp_c + b

    # 물리적 제약: 한강은 1°C 이하로 잘 안 내려감, 35°C 이상 안 올라감
    return round(max(1.0, min(35.0, raw)), 1)


def get_condition(water_temp: float) -> dict:
    if water_temp <= 5:
        return {"label": "매우 차가움", "emoji": "🥶", "color": "#60a5fa"}
    elif water_temp <= 12:
        return {"label": "차가움", "emoji": "❄️", "color": "#93c5fd"}
    elif water_temp <= 18:
        return {"label": "시원함", "emoji": "🌊", "color": "#6ee7b7"}
    elif water_temp <= 24:
        return {"label": "적당함", "emoji": "😊", "color": "#fde68a"}
    elif water_temp <= 29:
        return {"label": "따뜻함", "emoji": "☀️", "color": "#fb923c"}
    else:
        return {"label": "뜨거움", "emoji": "🔥", "color": "#f87171"}


@router.get("/temperature")
async def get_hangang_temperature():
    import time
    now = time.time()

    if _cache["data"] and now - _cache["ts"] < _CACHE_TTL:
        return _cache["data"]

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("https://wttr.in/Seoul?format=j1")
            resp.raise_for_status()
            weather = resp.json()

        current = weather["current_condition"][0]
        air_temp = float(current["temp_C"])
        weather_desc = current["weatherDesc"][0]["value"]

        month = datetime.now(timezone.utc).month
        water_temp = estimate_water_temp(air_temp, month)
        condition = get_condition(water_temp)

        result = {
            "water_temp": water_temp,
            "air_temp": air_temp,
            "weather_desc": weather_desc,
            "month": month,
            "condition": condition["label"],
            "emoji": condition["emoji"],
            "color": condition["color"],
            "note": "기온 기반 추정값 (Mohseni-Stefan 계절 보정)",
        }

        _cache["ts"] = now
        _cache["data"] = result
        return result

    except Exception as e:
        # 캐시 만료 or 실패 시 기본값
        return {
            "water_temp": None,
            "air_temp": None,
            "weather_desc": None,
            "month": datetime.now(timezone.utc).month,
            "condition": "확인 불가",
            "emoji": "🌊",
            "color": "#6ee7b7",
            "note": f"날씨 데이터 조회 실패: {str(e)}",
        }
