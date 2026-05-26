import httpx
from typing import Optional

# 한국 종목 (코스피/코스닥 구분 + 검색 키워드 추가)
KR_STOCKS = [
    # 코스피
    {"ticker": "005930", "name": "삼성전자", "market": "KR", "exchange": "KOSPI", "keywords": ["삼성", "samsung"]},
    {"ticker": "000660", "name": "SK하이닉스", "market": "KR", "exchange": "KOSPI", "keywords": ["하이닉스", "skhynix", "sk"]},
    {"ticker": "005380", "name": "현대자동차", "market": "KR", "exchange": "KOSPI", "keywords": ["현대차", "현대", "hyundai"]},
    {"ticker": "005490", "name": "POSCO홀딩스", "market": "KR", "exchange": "KOSPI", "keywords": ["포스코", "posco"]},
    {"ticker": "051910", "name": "LG화학", "market": "KR", "exchange": "KOSPI", "keywords": ["lg화학", "lg"]},
    {"ticker": "006400", "name": "삼성SDI", "market": "KR", "exchange": "KOSPI", "keywords": ["삼성sdi", "sdi"]},
    {"ticker": "003550", "name": "LG", "market": "KR", "exchange": "KOSPI", "keywords": ["엘지"]},
    {"ticker": "035420", "name": "NAVER", "market": "KR", "exchange": "KOSPI", "keywords": ["네이버", "naver"]},
    {"ticker": "035720", "name": "카카오", "market": "KR", "exchange": "KOSPI", "keywords": ["kakao"]},
    {"ticker": "000270", "name": "기아", "market": "KR", "exchange": "KOSPI", "keywords": ["기아차", "kia"]},
    {"ticker": "096770", "name": "SK이노베이션", "market": "KR", "exchange": "KOSPI", "keywords": ["sk이노", "sk"]},
    {"ticker": "028260", "name": "삼성물산", "market": "KR", "exchange": "KOSPI", "keywords": ["삼성물산"]},
    {"ticker": "066570", "name": "LG전자", "market": "KR", "exchange": "KOSPI", "keywords": ["lg전자"]},
    {"ticker": "009540", "name": "HD한국조선해양", "market": "KR", "exchange": "KOSPI", "keywords": ["조선", "현대중공업", "hd"]},
    {"ticker": "105560", "name": "KB금융", "market": "KR", "exchange": "KOSPI", "keywords": ["kb", "국민은행"]},
    {"ticker": "055550", "name": "신한지주", "market": "KR", "exchange": "KOSPI", "keywords": ["신한", "신한은행"]},
    {"ticker": "086790", "name": "하나금융지주", "market": "KR", "exchange": "KOSPI", "keywords": ["하나", "하나은행"]},
    {"ticker": "018260", "name": "삼성에스디에스", "market": "KR", "exchange": "KOSPI", "keywords": ["삼성sds", "sds"]},
    {"ticker": "000810", "name": "삼성화재", "market": "KR", "exchange": "KOSPI", "keywords": ["삼성화재"]},
    {"ticker": "011200", "name": "HMM", "market": "KR", "exchange": "KOSPI", "keywords": ["hmm", "현대상선"]},
    # 코스닥
    {"ticker": "068270", "name": "셀트리온", "market": "KR", "exchange": "KOSDAQ", "keywords": ["셀트리온", "celltrion"]},
    {"ticker": "091990", "name": "셀트리온헬스케어", "market": "KR", "exchange": "KOSDAQ", "keywords": ["셀트리온헬스케어"]},
    {"ticker": "196170", "name": "알테오젠", "market": "KR", "exchange": "KOSDAQ", "keywords": ["알테오젠"]},
    {"ticker": "247540", "name": "에코프로비엠", "market": "KR", "exchange": "KOSDAQ", "keywords": ["에코프로비엠", "에코프로"]},
    {"ticker": "086520", "name": "에코프로", "market": "KR", "exchange": "KOSDAQ", "keywords": ["에코프로"]},
    {"ticker": "373220", "name": "LG에너지솔루션", "market": "KR", "exchange": "KOSPI", "keywords": ["lg에너지", "에너지솔루션"]},
    {"ticker": "012330", "name": "현대모비스", "market": "KR", "exchange": "KOSPI", "keywords": ["모비스", "현대모비스"]},
    {"ticker": "207940", "name": "삼성바이오로직스", "market": "KR", "exchange": "KOSPI", "keywords": ["삼성바이오", "바이오로직스"]},
    {"ticker": "006800", "name": "미래에셋증권", "market": "KR", "exchange": "KOSPI", "keywords": ["미래에셋"]},
    {"ticker": "041510", "name": "에스엠", "market": "KR", "exchange": "KOSDAQ", "keywords": ["sm", "에스엠엔터"]},
    {"ticker": "035900", "name": "JYP Ent.", "market": "KR", "exchange": "KOSDAQ", "keywords": ["jyp", "제이와이피"]},
    {"ticker": "122870", "name": "와이지엔터테인먼트", "market": "KR", "exchange": "KOSDAQ", "keywords": ["yg", "와이지"]},
    {"ticker": "263750", "name": "펄어비스", "market": "KR", "exchange": "KOSDAQ", "keywords": ["펄어비스", "검은사막"]},
    {"ticker": "251270", "name": "넷마블", "market": "KR", "exchange": "KOSPI", "keywords": ["넷마블"]},
    {"ticker": "036570", "name": "엔씨소프트", "market": "KR", "exchange": "KOSPI", "keywords": ["엔씨", "nc"]},
]

# 미국 종목
US_STOCKS = [
    {"ticker": "AAPL", "name": "애플", "market": "US", "exchange": "NASDAQ", "keywords": ["apple", "아이폰"]},
    {"ticker": "MSFT", "name": "마이크로소프트", "market": "US", "exchange": "NASDAQ", "keywords": ["microsoft", "ms", "마소"]},
    {"ticker": "NVDA", "name": "엔비디아", "market": "US", "exchange": "NASDAQ", "keywords": ["nvidia"]},
    {"ticker": "GOOGL", "name": "알파벳(구글)", "market": "US", "exchange": "NASDAQ", "keywords": ["google", "구글", "alphabet", "googl"]},
    {"ticker": "AMZN", "name": "아마존", "market": "US", "exchange": "NASDAQ", "keywords": ["amazon"]},
    {"ticker": "META", "name": "메타", "market": "US", "exchange": "NASDAQ", "keywords": ["facebook", "페이스북", "meta"]},
    {"ticker": "TSLA", "name": "테슬라", "market": "US", "exchange": "NASDAQ", "keywords": ["tesla"]},
    {"ticker": "AVGO", "name": "브로드컴", "market": "US", "exchange": "NASDAQ", "keywords": ["broadcom"]},
    {"ticker": "JPM", "name": "JP모건", "market": "US", "exchange": "NYSE", "keywords": ["jpmorgan"]},
    {"ticker": "V", "name": "비자", "market": "US", "exchange": "NYSE", "keywords": ["visa"]},
    {"ticker": "MA", "name": "마스터카드", "market": "US", "exchange": "NYSE", "keywords": ["mastercard"]},
    {"ticker": "NFLX", "name": "넷플릭스", "market": "US", "exchange": "NASDAQ", "keywords": ["netflix"]},
    {"ticker": "AMD", "name": "AMD", "market": "US", "exchange": "NASDAQ", "keywords": ["어드밴스드마이크로"]},
    {"ticker": "INTC", "name": "인텔", "market": "US", "exchange": "NASDAQ", "keywords": ["intel"]},
    {"ticker": "DIS", "name": "디즈니", "market": "US", "exchange": "NYSE", "keywords": ["disney"]},
    {"ticker": "UBER", "name": "우버", "market": "US", "exchange": "NYSE", "keywords": ["uber"]},
    {"ticker": "BABA", "name": "알리바바", "market": "US", "exchange": "NYSE", "keywords": ["alibaba", "알리"]},
    {"ticker": "TSM", "name": "TSMC", "market": "US", "exchange": "NYSE", "keywords": ["대만반도체"]},
    {"ticker": "PLTR", "name": "팔란티어", "market": "US", "exchange": "NYSE", "keywords": ["palantir"]},
    {"ticker": "COIN", "name": "코인베이스", "market": "US", "exchange": "NASDAQ", "keywords": ["coinbase"]},
]

ALL_STOCKS = KR_STOCKS + US_STOCKS

# ticker → 종목 정보 빠른 조회용 딕셔너리
TICKER_MAP = {s["ticker"]: s for s in ALL_STOCKS}


async def get_naver_price(ticker: str, market: str, exchange: str, name: str) -> Optional[dict]:
    """네이버 금융에서 주가 조회 (한국 주식 전용)"""
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
        stock_name = data.get("stockName", name)

        return {
            "ticker": ticker,
            "name": name or stock_name,
            "price": current_price,
            "change": change,
            "change_pct": change_pct,
            "market": market,
            "exchange": exchange,
        }
    except Exception as e:
        print(f"주가 조회 오류 ({ticker}): {e}")
        return None


async def get_yahoo_price(ticker: str, market: str, exchange: str, name: str) -> Optional[dict]:
    """Yahoo Finance API로 미국 주식 주가 조회"""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        result = data["chart"]["result"][0]
        meta = result["meta"]
        current_price = meta.get("regularMarketPrice", 0)
        prev_close = meta.get("previousClose", current_price)
        change = current_price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0

        return {
            "ticker": ticker,
            "name": name,
            "price": current_price,
            "change": change,
            "change_pct": change_pct,
            "market": market,
            "exchange": exchange,
        }
    except Exception as e:
        print(f"미국 주가 조회 오류 ({ticker}): {e}")
        return None


async def get_stock_price(ticker: str) -> Optional[dict]:
    """종목 현재가 조회"""
    info = TICKER_MAP.get(ticker)
    if info:
        if info["market"] == "US":
            return await get_yahoo_price(ticker, info["market"], info["exchange"], info["name"])
        return await get_naver_price(ticker, info["market"], info["exchange"], info["name"])
    # 직접 입력된 ticker 처리
    is_kr = ticker.isdigit()
    if is_kr:
        return await get_naver_price(ticker, "KR", "KOSPI", ticker)
    return await get_yahoo_price(ticker, "US", "US", ticker)


async def search_stock(query: str, market: str = "ALL") -> list:
    """종목 검색 - 이름, ticker, 키워드 모두 검색"""
    pool = []
    if market in ("ALL", "KR"):
        pool.extend(KR_STOCKS)
    if market in ("ALL", "US"):
        pool.extend(US_STOCKS)

    query_lower = query.lower().strip()
    matched = []
    for s in pool:
        if (query_lower in s["name"].lower()
                or query_lower in s["ticker"].lower()
                or any(query_lower in kw or kw in query_lower for kw in s["keywords"])):
            matched.append(s)

    results = []
    for item in matched[:6]:
        if item["market"] == "US":
            price_info = await get_yahoo_price(item["ticker"], item["market"], item["exchange"], item["name"])
        else:
            price_info = await get_naver_price(item["ticker"], item["market"], item["exchange"], item["name"])
        if price_info:
            results.append(price_info)
    return results


async def get_popular_stocks(market: str = "ALL") -> list:
    """인기 종목 리스트"""
    pool = []
    if market in ("ALL", "KR"):
        pool.extend(KR_STOCKS[:6])
    if market in ("ALL", "US"):
        pool.extend(US_STOCKS[:6])

    results = []
    for item in pool:
        if item["market"] == "US":
            price_info = await get_yahoo_price(item["ticker"], item["market"], item["exchange"], item["name"])
        else:
            price_info = await get_naver_price(item["ticker"], item["market"], item["exchange"], item["name"])
        if price_info:
            results.append(price_info)
    return results
