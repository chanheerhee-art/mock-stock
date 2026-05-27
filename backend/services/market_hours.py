from datetime import datetime, time
import pytz

KST = pytz.timezone("Asia/Seoul")
ET = pytz.timezone("America/New_York")


def get_market_status(market: str) -> dict:
    """
    장 상태 반환
    - is_open: 거래 가능 여부 (정규장 + 프리/애프터 포함)
    - status: "open" | "pre" | "after" | "closed"
    - session: "regular" | "pre" | "after" | "closed"
    - message: 사용자에게 보여줄 메시지
    - open_time / close_time: 표시용 문자열
    """
    now_kst = datetime.now(KST)
    weekday = now_kst.weekday()
    is_weekday = weekday < 5

    if market == "KR":
        return _kr_status(now_kst, is_weekday)
    elif market == "US":
        return _us_status(now_kst, is_weekday)
    else:
        return {"is_open": False, "status": "closed", "session": "closed", "message": "알 수 없는 시장"}


def _kr_status(now_kst: datetime, is_weekday: bool) -> dict:
    """
    한국 주식 세션:
      장전 시간외:     08:00 ~ 09:00 KST
      정규장:          09:00 ~ 15:30 KST
      시간외 단일가:   15:40 ~ 16:00 KST
      장후 시간외:     16:00 ~ 18:00 KST
    """
    PRE_OPEN    = time(8, 0)
    OPEN        = time(9, 0)
    CLOSE       = time(15, 30)
    EXT_START   = time(15, 40)   # 시간외 단일가 시작
    AFTER_CLOSE = time(18, 0)    # 장후 시간외 종료

    t = now_kst.time()

    if not is_weekday:
        return {
            "is_open": False, "status": "closed", "session": "closed",
            "message": "🇰🇷 한국 주식시장 휴장 (주말)",
            "open_time": "월요일 08:00", "close_time": "18:00",
        }

    if OPEN <= t < CLOSE:
        # 정규장
        close_dt = now_kst.replace(hour=15, minute=30, second=0, microsecond=0)
        remaining = int((close_dt - now_kst).total_seconds() / 60)
        return {
            "is_open": True, "status": "open", "session": "regular",
            "message": f"🇰🇷 정규장 거래 중 · {remaining}분 후 마감",
            "open_time": "09:00", "close_time": "15:30",
        }
    elif PRE_OPEN <= t < OPEN:
        # 장전 시간외
        open_dt = now_kst.replace(hour=9, minute=0, second=0, microsecond=0)
        remaining = int((open_dt - now_kst).total_seconds() / 60)
        return {
            "is_open": True, "status": "pre", "session": "pre",
            "message": f"🇰🇷 장전 시간외 거래 중 · {remaining}분 후 정규장 개장",
            "open_time": "08:00", "close_time": "18:00",
        }
    elif EXT_START <= t < AFTER_CLOSE:
        # 시간외 단일가 / 장후 시간외
        after_dt = now_kst.replace(hour=18, minute=0, second=0, microsecond=0)
        remaining = int((after_dt - now_kst).total_seconds() / 60)
        session_name = "시간외 단일가" if t < time(16, 0) else "장후 시간외"
        return {
            "is_open": True, "status": "after", "session": "after",
            "message": f"🇰🇷 {session_name} 거래 중 · {remaining}분 후 마감",
            "open_time": "08:00", "close_time": "18:00",
        }
    else:
        # 완전 장외 (18:00 ~ 다음날 08:00)
        return {
            "is_open": False, "status": "closed", "session": "closed",
            "message": "🇰🇷 한국 주식시장 마감 (내일 08:00 장전 시간외)",
            "open_time": "08:00", "close_time": "18:00",
        }


def _us_status(now_kst: datetime, is_weekday: bool) -> dict:
    """
    미국 주식 세션:
      프리마켓:   04:00 ~ 09:30 ET
      정규장:     09:30 ~ 16:00 ET
      애프터마켓: 16:00 ~ 20:00 ET
    """
    now_et = now_kst.astimezone(ET)
    is_weekday_et = now_et.weekday() < 5

    PRE_OPEN_ET   = time(4, 0)
    OPEN_ET       = time(9, 30)
    CLOSE_ET      = time(16, 0)
    AFTER_CLOSE_ET = time(20, 0)

    t_et = now_et.time()

    # KST 표시용
    open_kst_str  = now_et.replace(hour=9, minute=30, second=0, microsecond=0).astimezone(KST).strftime("%H:%M")
    close_kst_str = now_et.replace(hour=16, minute=0,  second=0, microsecond=0).astimezone(KST).strftime("%H:%M")
    pre_kst_str   = now_et.replace(hour=4,  minute=0,  second=0, microsecond=0).astimezone(KST).strftime("%H:%M")
    after_kst_str = now_et.replace(hour=20, minute=0,  second=0, microsecond=0).astimezone(KST).strftime("%H:%M")

    if not is_weekday_et:
        return {
            "is_open": False, "status": "closed", "session": "closed",
            "message": "🇺🇸 미국 주식시장 휴장 (주말)",
            "open_time": f"월요일 {pre_kst_str} (KST)", "close_time": f"{after_kst_str} (KST)",
        }

    if OPEN_ET <= t_et < CLOSE_ET:
        # 정규장
        close_et_dt = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
        remaining = int((close_et_dt - now_et).total_seconds() / 60)
        return {
            "is_open": True, "status": "open", "session": "regular",
            "message": f"🇺🇸 정규장 거래 중 · {remaining}분 후 마감",
            "open_time": f"{open_kst_str} (KST)", "close_time": f"{close_kst_str} (KST)",
        }
    elif PRE_OPEN_ET <= t_et < OPEN_ET:
        # 프리마켓
        open_et_dt = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
        remaining = int((open_et_dt - now_et).total_seconds() / 60)
        return {
            "is_open": True, "status": "pre", "session": "pre",
            "message": f"🇺🇸 프리마켓 거래 중 · {remaining}분 후 정규장 ({open_kst_str} KST)",
            "open_time": f"{pre_kst_str} (KST)", "close_time": f"{after_kst_str} (KST)",
        }
    elif CLOSE_ET <= t_et < AFTER_CLOSE_ET:
        # 애프터마켓
        after_et_dt = now_et.replace(hour=20, minute=0, second=0, microsecond=0)
        remaining = int((after_et_dt - now_et).total_seconds() / 60)
        return {
            "is_open": True, "status": "after", "session": "after",
            "message": f"🇺🇸 애프터마켓 거래 중 · {remaining}분 후 마감",
            "open_time": f"{pre_kst_str} (KST)", "close_time": f"{after_kst_str} (KST)",
        }
    else:
        return {
            "is_open": False, "status": "closed", "session": "closed",
            "message": f"🇺🇸 미국 주식시장 마감 (내일 {pre_kst_str} KST 프리마켓)",
            "open_time": f"{pre_kst_str} (KST)", "close_time": f"{after_kst_str} (KST)",
        }
