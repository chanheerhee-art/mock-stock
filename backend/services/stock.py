import yfinance as yf
import httpx
from typing import Optional

# 인기 한국 종목 목록
KR_POPULAR = [
    {"ticker": "005930.KS", "name": "삼성전자"},
    {"ticker": "000660.KS", "name": "SK하이닉스"},
    {"ticker": "035420.KS", "name": "NAVER"},
    {"ticker": "035720.KS", "name": "카카오"},
    {"ticker": "005380.KS", "name": "현대차"},
    {"ticker": "051910.KS", "name": "LG화학"},
    {"ticker": "006400.KS", "name": "삼성SDI"},
    {"ticker": "028260.KS", "name": "삼성물산"},
    {"ticker": "096770.KS", "name": "SK이노베이션"},
    {"ticker": "003550.KS", "name": "LG"},
]

# 인기 미국 종목 목록
US_POPULAR = [
    {"ticker": "AAPL", "name": "애플"},
    {"ticker": "MSFT", "name": "마이크로소프트"},
    {"ticker": "NVDA", "name": "엔비디아"},
    {"ticker": "GOOGL", "name": "알파벳"},
    {"ticker": "AMZN", "name": "아마존"},
    {"ticker": "META", "name": "메타"},
    {"ticker": "TSLA", "name": "테슬라"},
    {"ticker": "AVGO", "name": "브로드컴"},
    {"ticker": "JPM", "name": "JP모건"},
    {"ticker": "V", "name": "비자"},
]


def get_stock_price(ticker: str) -> Optional[dict]:
    """yfinance로 현재가 조회"""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="2d")
        if hist.empty:
            return None

        current_price = float(hist["Close"].iloc[-1])
        prev_price = float(hist["Close"].iloc[-2]) if len(hist) > 1 else current_price
        change = current_price - prev_price
        change_pct = (change / prev_price) * 100 if prev_price else 0

        info = stock.info
        name = info.get("longName") or info.get("shortName") or ticker

        return {
            "ticker": ticker,
            "name": name,
            "price": round(current_price, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "market": "KR" if ".KS" in ticker or ".KQ" in ticker else "US",
        }
    except Exception as e:
        print(f"주가 조회 오류 ({ticker}): {e}")
        return None


def search_stock(query: str, market: str = "ALL") -> list:
    """종목 검색"""
    results = []
    pool = []

    if market in ("ALL", "KR"):
        pool.extend(KR_POPULAR)
    if market in ("ALL", "US"):
        pool.extend(US_POPULAR)

    query_lower = query.lower()
    for item in pool:
        if query_lower in item["name"].lower() or query_lower in item["ticker"].lower():
            price_info = get_stock_price(item["ticker"])
            if price_info:
                results.append(price_info)

    return results


def get_popular_stocks(market: str = "ALL") -> list:
    """인기 종목 리스트"""
    pool = []
    if market in ("ALL", "KR"):
        pool.extend(KR_POPULAR[:5])
    if market in ("ALL", "US"):
        pool.extend(US_POPULAR[:5])

    results = []
    for item in pool:
        price_info = get_stock_price(item["ticker"])
        if price_info:
            price_info["name"] = item["name"]  # 한글 이름 우선
            results.append(price_info)
    return results
