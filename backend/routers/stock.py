from fastapi import APIRouter, Query
from services.stock import get_stock_price, search_stock, get_popular_stocks
from services.market_hours import get_market_status
from services.exchange_rate import get_usd_krw
from datetime import datetime
import httpx

router = APIRouter(prefix="/stock", tags=["stock"])


@router.get("/price/{ticker}")
async def stock_price(ticker: str):
    """종목 현재가 조회"""
    from fastapi import HTTPException
    info = await get_stock_price(ticker)
    if not info:
        raise HTTPException(status_code=404, detail=f"'{ticker}' 종목을 찾을 수 없습니다")
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

        volumes = quotes.get("volume", [])

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
                "volume": int(volumes[i]) if volumes and i < len(volumes) and volumes[i] else 0,
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


@router.get("/orderbook/{ticker}")
async def orderbook(ticker: str):
    """
    호가창 시뮬레이션 — 현재가 기준 ±5호가
    실제 호가 API는 유료라 현재가 + 랜덤 스프레드로 시뮬레이션
    """
    import random
    from services.stock import get_stock_price

    info = await get_stock_price(ticker)
    if not info:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="종목 없음")

    price = info["price"]
    is_kr = ticker.replace("-", "").isdigit()

    # 호가 단위
    if is_kr:
        if price >= 500000: tick = 1000
        elif price >= 100000: tick = 500
        elif price >= 50000: tick = 100
        elif price >= 10000: tick = 50
        elif price >= 5000: tick = 10
        elif price >= 1000: tick = 5
        else: tick = 1
    else:
        tick = round(price * 0.001, 2)  # 미국: 0.1% 단위

    asks = []  # 매도 호가 (현재가 위, 낮은 것부터)
    bids = []  # 매수 호가 (현재가 아래, 높은 것부터)

    base = round(price / tick) * tick  # tick 단위로 정렬

    for i in range(1, 6):
        ask_price = round(base + tick * i, 2)
        bid_price = round(base - tick * i, 2)
        # 거래량 시뮬레이션: 현재가 가까울수록 많음
        ask_qty = random.randint(100, 2000) // i
        bid_qty = random.randint(100, 2000) // i
        asks.append({"price": ask_price, "quantity": ask_qty})
        bids.append({"price": bid_price, "quantity": bid_qty})

    return {
        "ticker": ticker,
        "current_price": price,
        "asks": asks,   # 매도 (위에서 아래로 표시용 → 역순)
        "bids": bids,   # 매수 (위에서 아래로)
    }


@router.get("/dividends/{ticker}")
async def dividends(ticker: str):
    """배당 정보 — Yahoo Finance dividends 데이터"""
    is_kr = ticker.replace("-", "").isdigit()
    yahoo_ticker = f"{ticker}.KS" if is_kr else ticker

    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_ticker}?interval=3mo&range=2y&events=div%2Csplit"
        headers = {"User-Agent": "Mozilla/5.0"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()

        result_data = data["chart"]["result"][0]
        meta = result_data["meta"]
        events = result_data.get("events", {})

        # 배당 이벤트
        raw_divs = events.get("dividends", {})
        dividends_list = sorted([
            {"date": datetime.fromtimestamp(v["date"]).strftime("%Y-%m-%d"), "amount": round(v["amount"], 4)}
            for v in raw_divs.values()
        ], key=lambda x: x["date"], reverse=True)[:8]

        # 스플릿 이벤트
        raw_splits = events.get("splits", {})
        splits_list = sorted([
            {
                "date": datetime.fromtimestamp(v["date"]).strftime("%Y-%m-%d"),
                "ratio": f"{v['numerator']}:{v['denominator']}"
            }
            for v in raw_splits.values()
        ], key=lambda x: x["date"], reverse=True)[:4]

        # 연간 배당률
        trailing_yield = meta.get("trailingAnnualDividendYield")
        dividend_rate = meta.get("trailingAnnualDividendRate")

        return {
            "ticker": ticker,
            "dividend_yield": round(trailing_yield * 100, 2) if trailing_yield else None,
            "annual_dividend": round(dividend_rate, 4) if dividend_rate else None,
            "currency": meta.get("currency", "USD"),
            "dividends": dividends_list,
            "splits": splits_list,
        }
    except Exception as e:
        print(f"배당 조회 오류 ({ticker}): {e}")
        return {"ticker": ticker, "dividend_yield": None, "annual_dividend": None, "dividends": [], "splits": []}
