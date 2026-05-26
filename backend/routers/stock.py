from fastapi import APIRouter, Query
from services.stock import get_stock_price, search_stock, get_popular_stocks
from services.market_hours import get_market_status
from services.exchange_rate import get_usd_krw
import httpx

router = APIRouter(prefix="/stock", tags=["stock"])


@router.get("/price/{ticker}")
async def stock_price(ticker: str):
    """종목 현재가 조회"""
    info = await get_stock_price(ticker)
    if not info:
        return {"error": "종목을 찾을 수 없습니다"}
    return info


@router.get("/search")
async def stock_search(q: str = Query(...), market: str = Query("ALL")):
    """종목 검색"""
    return await search_stock(q, market)


@router.get("/popular")
async def popular_stocks(market: str = Query("ALL")):
    """인기 종목 리스트"""
    return await get_popular_stocks(market)


@router.get("/market-status")
async def market_status(market: str = Query("ALL")):
    """장 운영 상태 조회"""
    if market == "ALL":
        return {
            "KR": get_market_status("KR"),
            "US": get_market_status("US"),
        }
    return get_market_status(market)


@router.get("/chart/{ticker}")
async def stock_chart(ticker: str, period: str = Query("1mo")):
    """종목 차트 데이터 - Yahoo Finance 통합 (KR: {ticker}.KS, US: {ticker})"""
    from datetime import datetime, timezone

    is_kr = ticker.isdigit()
    yahoo_ticker = f"{ticker}.KS" if is_kr else ticker

    range_map = {"1wk": "5d", "1mo": "1mo", "3mo": "3mo", "6mo": "6mo", "1y": "1y"}
    yrange = range_map.get(period, "1mo")

    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}?interval=1d&range={yrange}"
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()

        result_data = data["chart"]["result"][0]
        timestamps = result_data["timestamp"]
        quotes = result_data["indicators"]["quote"][0]
        closes = quotes.get("close", [])
        opens = quotes.get("open", [])
        highs = quotes.get("high", [])
        lows = quotes.get("low", [])

        result = []
        for i, ts in enumerate(timestamps):
            if i >= len(closes) or closes[i] is None:
                continue
            dt = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
            result.append({
                "date": dt,
                "close": round(closes[i], 2),
                "open": round(opens[i], 2) if opens and i < len(opens) and opens[i] else None,
                "high": round(highs[i], 2) if highs and i < len(highs) and highs[i] else None,
                "low": round(lows[i], 2) if lows and i < len(lows) and lows[i] else None,
            })
        return result
    except Exception as e:
        print(f"차트 오류 ({ticker}): {e}")
        return []


@router.get("/exchange-rate")
async def exchange_rate():
    """USD/KRW 환율 조회"""
    rate = await get_usd_krw()
    return {"usd_krw": rate}
