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
    {"ticker": "100790", "name": "미래에셋벤처투자", "market": "KR", "exchange": "KOSDAQ", "keywords": ["미래에셋", "미래에셋벤처", "벤처투자"]},
    {"ticker": "041510", "name": "에스엠", "market": "KR", "exchange": "KOSDAQ", "keywords": ["sm", "에스엠엔터"]},
    {"ticker": "035900", "name": "JYP Ent.", "market": "KR", "exchange": "KOSDAQ", "keywords": ["jyp", "제이와이피"]},
    {"ticker": "122870", "name": "와이지엔터테인먼트", "market": "KR", "exchange": "KOSDAQ", "keywords": ["yg", "와이지"]},
    {"ticker": "263750", "name": "펄어비스", "market": "KR", "exchange": "KOSDAQ", "keywords": ["펄어비스", "검은사막"]},
    {"ticker": "251270", "name": "넷마블", "market": "KR", "exchange": "KOSPI", "keywords": ["넷마블"]},
    {"ticker": "036570", "name": "엔씨소프트", "market": "KR", "exchange": "KOSPI", "keywords": ["엔씨", "nc"]},
]

# 미국 종목
US_STOCKS = [
    # NASDAQ 빅테크
    {"ticker": "AAPL", "name": "애플", "market": "US", "exchange": "NASDAQ", "keywords": ["apple", "아이폰"]},
    {"ticker": "MSFT", "name": "마이크로소프트", "market": "US", "exchange": "NASDAQ", "keywords": ["microsoft", "ms", "마소"]},
    {"ticker": "NVDA", "name": "엔비디아", "market": "US", "exchange": "NASDAQ", "keywords": ["nvidia"]},
    {"ticker": "GOOGL", "name": "알파벳(구글)", "market": "US", "exchange": "NASDAQ", "keywords": ["google", "구글", "alphabet"]},
    {"ticker": "AMZN", "name": "아마존", "market": "US", "exchange": "NASDAQ", "keywords": ["amazon"]},
    {"ticker": "META", "name": "메타", "market": "US", "exchange": "NASDAQ", "keywords": ["facebook", "페이스북", "meta"]},
    {"ticker": "TSLA", "name": "테슬라", "market": "US", "exchange": "NASDAQ", "keywords": ["tesla"]},
    {"ticker": "AVGO", "name": "브로드컴", "market": "US", "exchange": "NASDAQ", "keywords": ["broadcom"]},
    {"ticker": "NFLX", "name": "넷플릭스", "market": "US", "exchange": "NASDAQ", "keywords": ["netflix"]},
    {"ticker": "AMD", "name": "AMD", "market": "US", "exchange": "NASDAQ", "keywords": ["어드밴스드마이크로"]},
    {"ticker": "INTC", "name": "인텔", "market": "US", "exchange": "NASDAQ", "keywords": ["intel"]},
    {"ticker": "COIN", "name": "코인베이스", "market": "US", "exchange": "NASDAQ", "keywords": ["coinbase"]},
    {"ticker": "ARM", "name": "ARM홀딩스", "market": "US", "exchange": "NASDAQ", "keywords": ["arm", "소프트뱅크"]},
    {"ticker": "SMCI", "name": "슈퍼마이크로", "market": "US", "exchange": "NASDAQ", "keywords": ["supermicro", "슈퍼마이크로컴퓨터"]},
    {"ticker": "MSTR", "name": "스트래티지(마이크로스트래티지)", "market": "US", "exchange": "NASDAQ", "keywords": ["microstrategy", "마이크로스트래티지", "비트코인"]},
    {"ticker": "HOOD", "name": "로빈후드", "market": "US", "exchange": "NASDAQ", "keywords": ["robinhood"]},
    {"ticker": "PLTR", "name": "팔란티어", "market": "US", "exchange": "NASDAQ", "keywords": ["palantir"]},
    {"ticker": "RIVN", "name": "리비안", "market": "US", "exchange": "NASDAQ", "keywords": ["rivian"]},
    {"ticker": "LCID", "name": "루시드", "market": "US", "exchange": "NASDAQ", "keywords": ["lucid"]},
    {"ticker": "SOFI", "name": "소파이", "market": "US", "exchange": "NASDAQ", "keywords": ["sofi"]},
    {"ticker": "UPST", "name": "업스타트", "market": "US", "exchange": "NASDAQ", "keywords": ["upstart"]},
    {"ticker": "AFRM", "name": "어펌", "market": "US", "exchange": "NASDAQ", "keywords": ["affirm"]},
    {"ticker": "DDOG", "name": "데이터독", "market": "US", "exchange": "NASDAQ", "keywords": ["datadog"]},
    {"ticker": "CRWD", "name": "크라우드스트라이크", "market": "US", "exchange": "NASDAQ", "keywords": ["crowdstrike"]},
    {"ticker": "ZS", "name": "지스케일러", "market": "US", "exchange": "NASDAQ", "keywords": ["zscaler"]},
    {"ticker": "MDB", "name": "몽고DB", "market": "US", "exchange": "NASDAQ", "keywords": ["mongodb"]},
    {"ticker": "ABNB", "name": "에어비앤비", "market": "US", "exchange": "NASDAQ", "keywords": ["airbnb"]},
    {"ticker": "LYFT", "name": "리프트", "market": "US", "exchange": "NASDAQ", "keywords": ["lyft"]},
    {"ticker": "HON", "name": "하니웰", "market": "US", "exchange": "NASDAQ", "keywords": ["honeywell"]},
    {"ticker": "WMT", "name": "월마트", "market": "US", "exchange": "NASDAQ", "keywords": ["walmart"]},
    # NYSE 대형주
    {"ticker": "JPM", "name": "JP모건", "market": "US", "exchange": "NYSE", "keywords": ["jpmorgan"]},
    {"ticker": "V", "name": "비자", "market": "US", "exchange": "NYSE", "keywords": ["visa"]},
    {"ticker": "MA", "name": "마스터카드", "market": "US", "exchange": "NYSE", "keywords": ["mastercard"]},
    {"ticker": "DIS", "name": "디즈니", "market": "US", "exchange": "NYSE", "keywords": ["disney"]},
    {"ticker": "UBER", "name": "우버", "market": "US", "exchange": "NYSE", "keywords": ["uber"]},
    {"ticker": "BABA", "name": "알리바바", "market": "US", "exchange": "NYSE", "keywords": ["alibaba", "알리"]},
    {"ticker": "TSM", "name": "TSMC", "market": "US", "exchange": "NYSE", "keywords": ["대만반도체", "tsmc"]},
    # 다우존스 대표주
    {"ticker": "BA", "name": "보잉", "market": "US", "exchange": "NYSE", "keywords": ["boeing"]},
    {"ticker": "MCD", "name": "맥도날드", "market": "US", "exchange": "NYSE", "keywords": ["mcdonald", "맥도"]},
    {"ticker": "NKE", "name": "나이키", "market": "US", "exchange": "NYSE", "keywords": ["nike"]},
    {"ticker": "KO", "name": "코카콜라", "market": "US", "exchange": "NYSE", "keywords": ["cocacola", "coca"]},
    {"ticker": "GS", "name": "골드만삭스", "market": "US", "exchange": "NYSE", "keywords": ["goldman", "sachs"]},
    {"ticker": "HD", "name": "홈디포", "market": "US", "exchange": "NYSE", "keywords": ["homedepot", "home depot"]},
    {"ticker": "IBM", "name": "IBM", "market": "US", "exchange": "NYSE", "keywords": ["ibm"]},
    {"ticker": "MMM", "name": "3M", "market": "US", "exchange": "NYSE", "keywords": ["3m"]},
    {"ticker": "CAT", "name": "캐터필러", "market": "US", "exchange": "NYSE", "keywords": ["caterpillar"]},
    {"ticker": "CVX", "name": "쉐브론", "market": "US", "exchange": "NYSE", "keywords": ["chevron"]},
    {"ticker": "AXP", "name": "아메리칸익스프레스", "market": "US", "exchange": "NYSE", "keywords": ["amex", "american express"]},
    {"ticker": "DOW", "name": "다우", "market": "US", "exchange": "NYSE", "keywords": ["dow"]},
    {"ticker": "CRM", "name": "세일즈포스", "market": "US", "exchange": "NYSE", "keywords": ["salesforce"]},
    # S&P500 인기주
    {"ticker": "BRK-B", "name": "버크셔해서웨이", "market": "US", "exchange": "NYSE", "keywords": ["berkshire", "버핏", "warren buffett"]},
    {"ticker": "JNJ", "name": "존슨앤존슨", "market": "US", "exchange": "NYSE", "keywords": ["johnson"]},
    {"ticker": "XOM", "name": "엑슨모빌", "market": "US", "exchange": "NYSE", "keywords": ["exxon", "mobil"]},
    {"ticker": "PG", "name": "P&G", "market": "US", "exchange": "NYSE", "keywords": ["procter", "gamble", "pg"]},
    {"ticker": "UNH", "name": "유나이티드헬스", "market": "US", "exchange": "NYSE", "keywords": ["unitedhealth"]},
    {"ticker": "LLY", "name": "일라이릴리", "market": "US", "exchange": "NYSE", "keywords": ["eli lilly", "릴리"]},
    {"ticker": "MRK", "name": "머크", "market": "US", "exchange": "NYSE", "keywords": ["merck"]},
    {"ticker": "ABBV", "name": "애브비", "market": "US", "exchange": "NYSE", "keywords": ["abbvie"]},
    {"ticker": "PFE", "name": "화이자", "market": "US", "exchange": "NYSE", "keywords": ["pfizer"]},
    {"ticker": "BAC", "name": "뱅크오브아메리카", "market": "US", "exchange": "NYSE", "keywords": ["bank of america", "bofa"]},
    {"ticker": "WFC", "name": "웰스파고", "market": "US", "exchange": "NYSE", "keywords": ["wells fargo"]},
    {"ticker": "C", "name": "씨티그룹", "market": "US", "exchange": "NYSE", "keywords": ["citigroup", "citi"]},
    {"ticker": "MS", "name": "모건스탠리", "market": "US", "exchange": "NYSE", "keywords": ["morgan stanley"]},
    {"ticker": "GE", "name": "GE에어로스페이스", "market": "US", "exchange": "NYSE", "keywords": ["ge", "general electric"]},
    {"ticker": "RTX", "name": "RTX(레이시온)", "market": "US", "exchange": "NYSE", "keywords": ["raytheon", "rtx"]},
    {"ticker": "T", "name": "AT&T", "market": "US", "exchange": "NYSE", "keywords": ["att", "at&t"]},
    {"ticker": "VZ", "name": "버라이즌", "market": "US", "exchange": "NYSE", "keywords": ["verizon"]},
    {"ticker": "RBLX", "name": "로블록스", "market": "US", "exchange": "NYSE", "keywords": ["roblox"]},
    {"ticker": "SNAP", "name": "스냅", "market": "US", "exchange": "NYSE", "keywords": ["snap", "snapchat"]},
    {"ticker": "SNOW", "name": "스노우플레이크", "market": "US", "exchange": "NYSE", "keywords": ["snowflake"]},
    {"ticker": "NET", "name": "클라우드플레어", "market": "US", "exchange": "NYSE", "keywords": ["cloudflare"]},
    # ETF
    {"ticker": "SPY", "name": "S&P500 ETF (SPY)", "market": "US", "exchange": "ETF", "keywords": ["spy", "s&p500", "sp500"]},
    {"ticker": "QQQ", "name": "나스닥100 ETF (QQQ)", "market": "US", "exchange": "ETF", "keywords": ["qqq", "nasdaq100", "나스닥100"]},
    {"ticker": "DIA", "name": "다우존스 ETF (DIA)", "market": "US", "exchange": "ETF", "keywords": ["dia", "다우존스", "dow jones"]},
    {"ticker": "IWM", "name": "러셀2000 ETF (IWM)", "market": "US", "exchange": "ETF", "keywords": ["iwm", "russell2000"]},
    {"ticker": "VTI", "name": "미국전체시장 ETF (VTI)", "market": "US", "exchange": "ETF", "keywords": ["vti", "vanguard"]},
    {"ticker": "ARKK", "name": "ARK Innovation ETF", "market": "US", "exchange": "ETF", "keywords": ["ark", "arkk", "캐시우드"]},
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
        # Yahoo Finance v8 API는 chartPreviousClose 필드 사용 (previousClose는 없음)
        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose") or current_price
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
