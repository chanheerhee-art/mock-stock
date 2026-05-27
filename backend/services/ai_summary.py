"""Claude API를 이용한 뉴스 요약 서비스"""
import os
import asyncio
from functools import lru_cache
from typing import Optional
import httpx

# 캐시: ticker -> (summary, timestamp)
_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 60 * 30  # 30분


async def fetch_news_titles(ticker: str, is_kr: bool) -> list[str]:
    """Yahoo Finance에서 뉴스 제목 5개 가져오기"""
    yahoo_ticker = f"{ticker}.KS" if is_kr else ticker
    try:
        url = f"https://query1.finance.yahoo.com/v1/finance/search?q={yahoo_ticker}&newsCount=5&quotesCount=0"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()
        return [item.get("title", "") for item in data.get("news", []) if item.get("title")]
    except Exception:
        return []


async def summarize_news(ticker: str, name: str, is_kr: bool) -> Optional[str]:
    """Claude Haiku로 뉴스 요약 (캐싱 포함)"""
    import time

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    # 캐시 확인
    cache_key = ticker
    if cache_key in _cache:
        summary, ts = _cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            return summary

    # 뉴스 제목 가져오기
    titles = await fetch_news_titles(ticker, is_kr)
    if not titles:
        return None

    # Claude 호출 (비동기)
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)

        titles_text = "\n".join(f"- {t}" for t in titles[:5])
        prompt = f"""다음은 '{name}({ticker})' 종목의 최신 뉴스 헤드라인입니다:

{titles_text}

이 뉴스들을 바탕으로 현재 이 종목의 상황을 한국어로 2~3문장으로 간결하게 요약해주세요.
투자자 관점에서 핵심만, 자연스러운 한국어로 작성해주세요."""

        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        summary = message.content[0].text.strip()

        # 캐시 저장
        _cache[cache_key] = (summary, time.time())
        return summary

    except Exception as e:
        print(f"AI 요약 오류 ({ticker}): {e}")
        return None
