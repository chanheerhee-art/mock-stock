from datetime import datetime, time
import pytz

KST = pytz.timezone("Asia/Seoul")
ET = pytz.timezone("America/New_York")


def get_market_status(market: str) -> dict:
    """
    장 상태 반환
    - is_open: 현재 거래 가능 여부
    - status: "open" | "closed" | "pre" | "after"
    - message: 사용자에게 보여줄 메시지
    - open_time / close_time: KST 기준 장 시작/종료 시각 문자열
    """
    now_kst = datetime.now(KST)
    weekday = now_kst.weekday()  # 0=월 ~ 4=금, 5=토, 6=일
    is_weekday = weekday < 5

    if market == "KR":
        return _kr_status(now_kst, is_weekday)
    elif market == "US":
        return _us_status(now_kst, is_weekday)
    else:
        return {"is_open": False, "status": "closed", "message": "알 수 없는 시장"}


def _kr_status(now_kst: datetime, is_weekday: bool) -> dict:
    """한국 주식: 평일 09:00~15:30 KST"""
    OPEN = time(9, 0)
    CLOSE = time(15, 30)
    PRE = time(8, 0)   # 장전 시간외

    t = now_kst.time()

    if not is_weekday:
        return {
            "is_open": False,
            "status": "closed",
            "message": "🇰🇷 한국 주식시장 휴장 (주말)",
            "open_time": "월요일 09:00",
            "close_time": "15:30",
        }

    if OPEN <= t < CLOSE:
        close_dt = now_kst.replace(hour=15, minute=30, second=0, microsecond=0)
        remaining = int((close_dt - now_kst).total_seconds() / 60)
        return {
            "is_open": True,
            "status": "open",
            "message": f"🇰🇷 한국 주식시장 거래 중 · {remaining}분 후 마감",
            "open_time": "09:00",
            "close_time": "15:30",
        }
    elif PRE <= t < OPEN:
        open_dt = now_kst.replace(hour=9, minute=0, second=0, microsecond=0)
        remaining = int((open_dt - now_kst).total_seconds() / 60)
        return {
            "is_open": False,
            "status": "pre",
            "message": f"🇰🇷 장전 · {remaining}분 후 개장 (09:00)",
            "open_time": "09:00",
            "close_time": "15:30",
        }
    else:
        return {
            "is_open": False,
            "status": "after",
            "message": "🇰🇷 한국 주식시장 마감 (내일 09:00 개장)",
            "open_time": "09:00",
            "close_time": "15:30",
        }


def _us_status(now_kst: datetime, is_weekday: bool) -> dict:
    """미국 주식: 평일 09:30~16:00 ET = 서머타임 22:30~05:00 KST / 겨울 23:30~06:00 KST"""
    now_et = now_kst.astimezone(ET)
    weekday_et = now_et.weekday()
    is_weekday_et = weekday_et < 5

    OPEN_ET = time(9, 30)
    CLOSE_ET = time(16, 0)
    PRE_ET = time(4, 0)   # 프리마켓

    t_et = now_et.time()

    if not is_weekday_et:
        return {
            "is_open": False,
            "status": "closed",
            "message": "🇺🇸 미국 주식시장 휴장 (주말)",
            "open_time": "월요일 22:30 (KST)",
            "close_time": "05:00 (KST)",
        }

    # KST로 변환해서 표시용 시간 계산
    open_et_dt = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    close_et_dt = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
    open_kst_str = open_et_dt.astimezone(KST).strftime("%H:%M")
    close_kst_str = close_et_dt.astimezone(KST).strftime("%H:%M")

    if OPEN_ET <= t_et < CLOSE_ET:
        remaining = int((close_et_dt - now_et).total_seconds() / 60)
        return {
            "is_open": True,
            "status": "open",
            "message": f"🇺🇸 미국 주식시장 거래 중 · {remaining}분 후 마감",
            "open_time": f"{open_kst_str} (KST)",
            "close_time": f"{close_kst_str} (KST)",
        }
    elif PRE_ET <= t_et < OPEN_ET:
        remaining = int((open_et_dt - now_et).total_seconds() / 60)
        return {
            "is_open": False,
            "status": "pre",
            "message": f"🇺🇸 프리마켓 · {remaining}분 후 개장 ({open_kst_str} KST)",
            "open_time": f"{open_kst_str} (KST)",
            "close_time": f"{close_kst_str} (KST)",
        }
    else:
        return {
            "is_open": False,
            "status": "after",
            "message": f"🇺🇸 미국 주식시장 마감 (내일 {open_kst_str} KST 개장)",
            "open_time": f"{open_kst_str} (KST)",
            "close_time": f"{close_kst_str} (KST)",
        }
