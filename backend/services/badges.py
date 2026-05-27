"""업적/배지 정의 및 체크 로직"""
from typing import Optional

# ── 업적 정의 ──────────────────────────────────────────────────
BADGES: list[dict] = [
    # 거래 관련
    {
        "id": "first_trade",
        "icon": "🎯",
        "name": "첫 거래",
        "desc": "생애 첫 주식을 매수했어요",
        "category": "거래",
    },
    {
        "id": "trade_10",
        "icon": "📊",
        "name": "트레이더",
        "desc": "거래 10회 달성",
        "category": "거래",
    },
    {
        "id": "trade_50",
        "icon": "💹",
        "name": "프로 트레이더",
        "desc": "거래 50회 달성",
        "category": "거래",
    },
    {
        "id": "trade_100",
        "icon": "🏅",
        "name": "레전드 트레이더",
        "desc": "거래 100회 달성",
        "category": "거래",
    },
    # 수익률
    {
        "id": "profit_5",
        "icon": "📈",
        "name": "수익왕",
        "desc": "수익률 +5% 달성",
        "category": "수익",
    },
    {
        "id": "profit_10",
        "icon": "🚀",
        "name": "로켓 투자자",
        "desc": "수익률 +10% 달성",
        "category": "수익",
    },
    {
        "id": "profit_30",
        "icon": "🌙",
        "name": "문샷",
        "desc": "수익률 +30% 달성",
        "category": "수익",
    },
    {
        "id": "profit_50",
        "icon": "💎",
        "name": "다이아 핸즈",
        "desc": "수익률 +50% 달성",
        "category": "수익",
    },
    # 손실 (역업적)
    {
        "id": "loss_10",
        "icon": "😭",
        "name": "존버의 시작",
        "desc": "-10% 손실... 버텨요",
        "category": "수익",
    },
    # 다양성
    {
        "id": "multi_market",
        "icon": "🌍",
        "name": "글로벌 투자자",
        "desc": "국내+미국 주식 동시 보유",
        "category": "포트폴리오",
    },
    {
        "id": "hold_5",
        "icon": "🎨",
        "name": "분산투자",
        "desc": "5개 이상 종목 동시 보유",
        "category": "포트폴리오",
    },
    {
        "id": "etf_holder",
        "icon": "📦",
        "name": "ETF 마니아",
        "desc": "ETF 종목 보유",
        "category": "포트폴리오",
    },
    # 랭킹
    {
        "id": "rank_1",
        "icon": "👑",
        "name": "1등",
        "desc": "랭킹 1위 달성",
        "category": "랭킹",
    },
    {
        "id": "rank_top3",
        "icon": "🥉",
        "name": "TOP 3",
        "desc": "랭킹 3위 이내 달성",
        "category": "랭킹",
    },
    # 공매도/선물
    {
        "id": "first_short",
        "icon": "📉",
        "name": "공매도 입문",
        "desc": "첫 공매도 포지션 진입",
        "category": "고급",
    },
    {
        "id": "first_futures",
        "icon": "⚡",
        "name": "선물 트레이더",
        "desc": "첫 선물 포지션 진입",
        "category": "고급",
    },
    {
        "id": "big_trade",
        "icon": "🐳",
        "name": "고래",
        "desc": "단일 거래 1,000만원 이상",
        "category": "고급",
    },
]

BADGE_MAP = {b["id"]: b for b in BADGES}


async def check_and_award_badges(
    user_id: int,
    db,
    *,
    trade_count: Optional[int] = None,
    profit_pct: Optional[float] = None,
    holdings: Optional[list] = None,
    rank: Optional[int] = None,
    total_users: Optional[int] = None,
    trade_amount: Optional[float] = None,
    has_short: bool = False,
    has_futures: bool = False,
) -> list[str]:
    """조건 확인 후 새로 획득한 배지 ID 목록 반환"""
    from sqlalchemy import select
    from models.database import UserBadge

    # 이미 획득한 배지 조회
    result = await db.execute(select(UserBadge).where(UserBadge.user_id == user_id))
    earned_ids = {b.badge_id for b in result.scalars().all()}

    new_badges = []

    def award(badge_id: str):
        if badge_id not in earned_ids:
            new_badges.append(badge_id)
            earned_ids.add(badge_id)

    # 거래 횟수
    if trade_count is not None:
        if trade_count >= 1:   award("first_trade")
        if trade_count >= 10:  award("trade_10")
        if trade_count >= 50:  award("trade_50")
        if trade_count >= 100: award("trade_100")

    # 수익률
    if profit_pct is not None:
        if profit_pct >= 5:  award("profit_5")
        if profit_pct >= 10: award("profit_10")
        if profit_pct >= 30: award("profit_30")
        if profit_pct >= 50: award("profit_50")
        if profit_pct <= -10: award("loss_10")

    # 보유 종목 다양성
    if holdings is not None:
        markets = {h.market for h in holdings}
        if "KR" in markets and "US" in markets:
            award("multi_market")
        if len(holdings) >= 5:
            award("hold_5")
        # ETF 여부 (exchange가 ETF이거나 ticker가 6자리 숫자)
        for h in holdings:
            if getattr(h, "exchange", "") == "ETF" or (h.ticker.isdigit() and len(h.ticker) == 6):
                award("etf_holder")
                break

    # 랭킹
    if rank is not None:
        if rank == 1: award("rank_1")
        if rank <= 3: award("rank_top3")

    # 단일 거래 금액
    if trade_amount is not None and trade_amount >= 10_000_000:
        award("big_trade")

    # 공매도/선물
    if has_short:    award("first_short")
    if has_futures:  award("first_futures")

    # DB 저장
    if new_badges:
        from datetime import datetime
        for bid in new_badges:
            db.add(UserBadge(user_id=user_id, badge_id=bid, earned_at=datetime.utcnow()))
        await db.commit()

    return new_badges
