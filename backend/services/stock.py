import httpx
from typing import Optional

# 인기 한국 종목
KR_POPULAR = [
    {"ticker": "005930", "name": "삼성전자", "market": "KR"},
    {"ticker": "000660", "name": "SK하이닉스", "market": "KR"},
    {"ticker": "035420", "name": "NAVER", "market": "KR"},
    {"ticker": "035720", "name": "카카오", "market": "KR"},
    {"ticker": "005380", "name": "현대차", "market": "KR"},
    {"ticker": "051910", "name": "LG화학", "market": "KR"},
    {"ticker": "006400", "name": "삼성SDI", "market": "KR"},
    {"ticker": "003550", "name": "LG", "market": "KR"},
    {"ticker": "096770", "name": "SK이노베이션", "market": "KR"},
    {"ticker": "068270", "name": "셀트리온", "market": "KR"},
]

# 인기 미국 종목
US_POPULAR = [
    {"ticker": "AAPL", "name": "애플", "market": "US"},
    {"ticker": "MSFT", "name": "마이크로소프트", "market": "US"},
    {"ticker": "NVDA", "name": "엔비디아", "market": "US"},
    {"ticker": "GOOGL", "name": "알파벳", "market": "US"},
    {"ticker": "AMZN", "name": "아마존", "market": "US"},
    {"ticker": "META", "name": "메타", "market": "US"},
    {"ticker": "TSLA", "name": "테슬라", "market": "US"},
    {"ticker": "AVGO", "name": "브로드컴", "market": "US"},
    {"ticker": "JPM", "name": "JP모건", "market": "US"},
    {"ticker": "V", "name": "비자", "market": "US"},
]

ALL_STOCKS = KR_POPULAR + US_POPULAR


async def get_kr_price(ticker: str) -> Optional[dict]:
    """네이버 금융에서 한국 주가 조회"""
    try:
        url = f"https://m.stock.naver.com/api/stock/{ticker}/basic"
        headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        current_price = float(data.get("closePrice", "0").replace(",", ""))
        change = float(data.get("compareToPreviousClosePrice", "0").replace(",", ""))
        change_pct = float(data.get("fluctuationsRatio", "0"))
        name = data.get("stockName", ticker)

        return {
            "ticker": ticker,
            "name": name,
            "price": current_price,
            "change": change,
            "change_pct": change_pct,
            "market": "KR",
        }
    except Exception as e:
        print(f"한국 주가 조회 오류 ({ticker}): {e}")
        return None


async def get_us_price(ticker: str) -> Optional[dict]:
    """네이버 금융에서 미국 주가 조회"""
    try:
        url = f"https://m.stock.naver.com/api/stock/{ticker}/basic"
        headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        current_price = float(data.get("closePrice", "0").replace(",", ""))
        change = float(data.get("compareToPreviousClosePrice", "0").replace(",", ""))
        change_pct = float(data.get("fluctuationsRatio", "0"))
        name = data.get("stockName", ticker)

        return {
            "ticker": ticker,
            "name": name,
            "price": current_price,
            "change": change,
            "change_pct": change_pct,
            "market": "US",
        }
    except Exception as e:
        print(f"미국 주가 조회 오류 ({ticker}): {e}")
        return None


async def get_stock_price(ticker: str) -> Optional[dict]:
    """종목 현재가 조회"""
    # 한국/미국 구분
    is_kr = any(s["ticker"] == ticker and s["market"] == "KR" for s in ALL_STOCKS) or ticker.isdigit()
    if is_kr:
        return await get_kr_price(ticker)
    else:
        return await get_us_price(ticker)


async def search_stock(query: str, market: str = "ALL") -> list:
    """종목 검색"""
    pool = []
    if market in ("ALL", "KR"):
        pool.extend(KR_POPULAR)
    if market in ("ALL", "US"):
        pool.extend(US_POPULAR)

    query_lower = query.lower()
    matched = [s for s in pool if query_lower in s["name"].lower() or query_lower in s["ticker"].lower()]

    results = []
    for item in matched[:5]:
        price_info = await get_stock_price(item["ticker"])
        if price_info:
            price_info["name"] = item["name"]
            results.append(price_info)
    return results


async def get_popular_stocks(market: str = "ALL") -> list:
    """인기 종목 리스트"""
    pool = []
    if market in ("ALL", "KR"):
        pool.extend(KR_POPULAR[:5])
    if market in ("ALL", "US"):
        pool.extend(US_POPULAR[:5])

    results = []
    for item in pool:
        price_info = await get_stock_price(item["ticker"])
        if price_info:
            price_info["name"] = item["name"]
            results.append(price_info)
    return results
