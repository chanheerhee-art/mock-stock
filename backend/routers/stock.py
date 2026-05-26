from fastapi import APIRouter, Query
from services.stock import get_stock_price, search_stock, get_popular_stocks
from services.market_hours import get_market_status

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
