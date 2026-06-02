"""선물 시뮬레이션 — 멀티 종목 지원"""
from __future__ import annotations
from typing import Optional
import httpx
import time

# 종목별 사양 정의
# yahoo_symbol: Yahoo Finance 티커
# multiplier: 계약 승수 (1계약당 명목가치 = 가격 × 승수)
# margin_rate: 증거금률 (10배 레버리지 = 10%)
# unit: 가격 단위 표시
# name_kr: 한국어 이름
FUTURES_SPECS: dict[str, dict] = {
    "KOSPI200": {
        "yahoo_symbol": "%5EKS200",
        "name_kr": "코스피200",
        "multiplier": 50_000,
        "margin_rate": 0.10,
        "unit": "pt",
        "currency": "KRW",
        "flag": "🇰🇷",
    },
    "KOSDAQ150": {
        "yahoo_symbol": "%5EKQ11",
        "name_kr": "코스닥",
        "multiplier": 10_000,
        "margin_rate": 0.10,
        "unit": "pt",
        "currency": "KRW",
        "flag": "🇰🇷",
    },
    "SP500": {
        "yahoo_symbol": "%5EGSPC",
        "name_kr": "S&P500",
        "multiplier": 500,
        "margin_rate": 0.10,
        "unit": "pt",
        "currency": "USD",
        "flag": "🇺🇸",
    },
    "NASDAQ100": {
        "yahoo_symbol": "%5ENDX",
        "name_kr": "나스닥100",
        "multiplier": 200,
        "margin_rate": 0.10,
        "unit": "pt",
        "currency": "USD",
        "flag": "🇺🇸",
    },
    "DOW": {
        "yahoo_symbol": "%5EDJI",
        "name_kr": "다우존스",
        "multiplier": 100,
        "margin_rate": 0.10,
        "unit": "pt",
        "currency": "USD",
        "flag": "🇺🇸",
    },
    "GOLD": {
        "yahoo_symbol": "GC%3DF",
        "name_kr": "금",
        "multiplier": 100,
        "margin_rate": 0.10,
        "unit": "oz",
        "currency": "USD",
        "flag": "🥇",
    },
    "OIL": {
        "yahoo_symbol": "CL%3DF",
        "name_kr": "WTI 원유",
        "multiplier": 1000,
        "margin_rate": 0.10,
        "unit": "배럴",
        "currency": "USD",
        "flag": "🛢️",
    },
    "SILVER": {
        "yahoo_symbol": "SI%3DF",
        "name_kr": "은",
        "multiplier": 5000,
        "margin_rate": 0.10,
        "unit": "oz",
        "currency": "USD",
        "flag": "🥈",
    },
    "BITCOIN": {
        "yahoo_symbol": "BTC-USD",
        "name_kr": "비트코인",
        "multiplier": 1,
        "margin_rate": 0.10,
        "unit": "BTC",
        "currency": "USD",
        "flag": "₿",
    },
    "NIKKEI": {
        "yahoo_symbol": "%5EN225",
        "name_kr": "닛케이225",
        "multiplier": 1000,
        "margin_rate": 0.10,
        "unit": "pt",
        "currency": "JPY",
        "flag": "🇯🇵",
    },
}

# 종목별 캐시
_cache: dict[str, dict] = {}
_CACHE_TTL = 15  # 15초

# 하위 호환용 상수 (기존 코드가 참조할 수 있으니 유지)
CONTRACT_MULTIPLIER = FUTURES_SPECS["KOSPI200"]["multiplier"]
MARGIN_RATE = FUTURES_SPECS["KOSPI200"]["margin_rate"]


async def get_futures_price(symbol: str) -> Optional[dict]:
    """선물 종목 현재가 조회 (15초 캐시)"""
    now = time.monotonic()
    cached = _cache.get(symbol)
    if cached and cached.get("expire", 0) > now:
        return cached["value"]

    spec = FUTURES_SPECS.get(symbol)
    if not spec:
        return None

    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{spec['yahoo_symbol']}?interval=1d&range=1d"
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
            "symbol": symbol,
            "name_kr": spec["name_kr"],
            "flag": spec["flag"],
            "price": round(current, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "prev_close": round(prev, 2),
            "day_high": round(meta.get("regularMarketDayHigh", current), 2),
            "day_low": round(meta.get("regularMarketDayLow", current), 2),
            "currency": spec["currency"],
            "unit": spec["unit"],
            "multiplier": spec["multiplier"],
            "margin_rate": spec["margin_rate"],
        }
        _cache[symbol] = {"value": result, "expire": now + _CACHE_TTL}
        return result
    except Exception as e:
        print(f"[Futures] {symbol} 조회 오류: {e}")
        return None


async def get_kospi200_index() -> Optional[dict]:
    """하위 호환용"""
    return await get_futures_price("KOSPI200")


def contract_value(price: float, contracts: int, symbol: str = "KOSPI200") -> float:
    spec = FUTURES_SPECS.get(symbol, FUTURES_SPECS["KOSPI200"])
    return price * spec["multiplier"] * contracts


def required_margin(price: float, contracts: int, symbol: str = "KOSPI200") -> float:
    spec = FUTURES_SPECS.get(symbol, FUTURES_SPECS["KOSPI200"])
    return contract_value(price, contracts, symbol) * spec["margin_rate"]


def unrealized_pnl(side: str, entry: float, current: float, contracts: int, symbol: str = "KOSPI200") -> float:
    spec = FUTURES_SPECS.get(symbol, FUTURES_SPECS["KOSPI200"])
    direction = 1 if side == "LONG" else -1
    return (current - entry) * spec["multiplier"] * contracts * direction
