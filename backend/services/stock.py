import httpx
from typing import Optional

# 홈화면 인기 종목용 (하드코딩 최소화 - ticker만 유지)
POPULAR_KR = ["005930", "000660", "035420", "035720", "005380", "373220", "068270", "247540"]
POPULAR_US = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "META", "AMZN", "PLTR"]


# ── 가격 조회 ──────────────────────────────────────────────

async def get_naver_price(ticker: str) -> Optional[dict]:
    """네이버 금융 API로 한국 주식 가격 조회"""
    try:
        url = f"https://m.stock.naver.com/api/stock/{ticker}/basic"
        headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        exchange_code = data.get("stockExchangeType", {}).get("code", "KOSPI")
        exchange = "KOSDAQ" if exchange_code == "KOSDAQ" else "KOSPI"

        return {
            "ticker": ticker,
            "name": data.get("stockName", ticker),
            "price": float(data.get("closePrice", "0").replace(",", "")),
            "change": float(data.get("compareToPreviousClosePrice", "0").replace(",", "")),
            "change_pct": float(data.get("fluctuationsRatio", "0")),
            "market": "KR",
            "exchange": exchange,
        }
    except Exception as e:
        print(f"KR 주가 조회 오류 ({ticker}): {e}")
        return None


async def get_yahoo_price(ticker: str) -> Optional[dict]:
    """Yahoo Finance API로 미국 주식 가격 조회"""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        meta = data["chart"]["result"][0]["meta"]
        current_price = meta.get("regularMarketPrice", 0)
        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose") or current_price
        change = current_price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0

        exchange = meta.get("fullExchangeName", "NYSE")
        # ETF 거래소 통일
        if meta.get("quoteType") == "ETF":
            exchange = "ETF"

        return {
            "ticker": ticker,
            "name": meta.get("longName") or meta.get("shortName", ticker),
            "price": current_price,
            "change": change,
            "change_pct": change_pct,
            "market": "US",
            "exchange": exchange,
        }
    except Exception as e:
        print(f"US 주가 조회 오류 ({ticker}): {e}")
        return None


async def get_stock_price(ticker: str) -> Optional[dict]:
    """ticker로 현재가 조회 - 숫자면 KR, 아니면 US"""
    if ticker.replace("-", "").isdigit() or (len(ticker) == 6 and ticker.isdigit()):
        return await get_naver_price(ticker)
    return await get_yahoo_price(ticker)


# ── 검색 ──────────────────────────────────────────────────

async def search_naver(query: str) -> list:
    """네이버 자동완성 API로 한국 종목 검색"""
    try:
        url = f"https://ac.stock.naver.com/ac?q={query}&target=index,stock,marketindicator"
        headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()

        # stock 타입만 필터 (index 제외)
        items = [i for i in data.get("items", []) if i.get("typeCode") in ("KOSPI", "KOSDAQ")]
        return items[:6]
    except Exception as e:
        print(f"네이버 검색 오류: {e}")
        return []


async def search_yahoo(query: str) -> list:
    """Yahoo Finance 검색 API로 미국 종목 검색"""
    try:
        url = f"https://query1.finance.yahoo.com/v1/finance/search?q={query}&lang=en-US&region=US&quotesCount=6&newsCount=0"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()

        # 미국 거래소 종목만 (한국/독일 등 제외), EQUITY/ETF만
        valid_exchanges = {"NMS", "NYQ", "NGM", "NCM", "NYSEArca", "NasdaqGS", "NasdaqGM", "NasdaqCM", "NYSE", "NASDAQ"}
        quotes = [
            q for q in data.get("quotes", [])
            if q.get("quoteType") in ("EQUITY", "ETF")
            and q.get("exchange") in valid_exchanges
        ]
        return quotes[:6]
    except Exception as e:
        print(f"Yahoo 검색 오류: {e}")
        return []


async def search_stock(query: str, market: str = "ALL") -> list:
    """종목 검색 - 네이버/Yahoo API 직접 호출"""
    import asyncio

    query = query.strip()
    if not query:
        return []

    tasks = []
    if market in ("ALL", "KR"):
        tasks.append(search_naver(query))
    if market in ("ALL", "US"):
        tasks.append(search_yahoo(query))

    search_results = await asyncio.gather(*tasks)

    # 가격 조회 병렬 실행
    price_tasks = []

    if market in ("ALL", "KR") and search_results:
        kr_results = search_results[0] if market == "ALL" else search_results[0]
        for item in (kr_results if market in ("ALL", "KR") else []):
            price_tasks.append(get_naver_price(item["code"]))

    if market in ("ALL", "US"):
        us_results = search_results[-1]
        for item in us_results:
            price_tasks.append(get_yahoo_price(item["symbol"]))

    prices = await asyncio.gather(*price_tasks)
    return [p for p in prices if p is not None]


# ── 인기 종목 ──────────────────────────────────────────────

async def get_popular_stocks(market: str = "ALL") -> list:
    """홈화면 인기 종목 - 최소 하드코딩 ticker 기반"""
    import asyncio

    tasks = []
    if market in ("ALL", "KR"):
        for ticker in POPULAR_KR:
            tasks.append(get_naver_price(ticker))
    if market in ("ALL", "US"):
        for ticker in POPULAR_US:
            tasks.append(get_yahoo_price(ticker))

    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]
