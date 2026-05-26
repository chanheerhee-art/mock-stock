import httpx
import asyncio
import time
from typing import Optional

# ── 인메모리 캐시 ──────────────────────────────────────────
# { cache_key: (data_dict, expires_at) }
_price_cache: dict[str, tuple[dict, float]] = {}
_PRICE_TTL = 90  # 초 (장중 1.5분 캐시)
# ticker별 개별 락: 같은 ticker 중복 요청만 직렬화, 다른 ticker는 병렬
_ticker_locks: dict[str, asyncio.Lock] = {}


def _get_lock(key: str) -> asyncio.Lock:
    if key not in _ticker_locks:
        _ticker_locks[key] = asyncio.Lock()
    return _ticker_locks[key]


def _cache_get(key: str) -> Optional[dict]:
    entry = _price_cache.get(key)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    return None


def _cache_set(key: str, data: dict):
    _price_cache[key] = (data, time.monotonic() + _PRICE_TTL)

# 홈화면 인기 종목용 (하드코딩 최소화 - ticker만 유지)
POPULAR_KR = ["005930", "000660", "035420", "035720", "005380", "373220", "068270", "247540"]
POPULAR_US = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "META", "AMZN", "PLTR"]

# 미국 주식 한글 이름 매핑 (~300개)
US_NAME_KO: dict[str, str] = {
    # ── 빅테크 ──
    "AAPL": "애플",
    "MSFT": "마이크로소프트",
    "GOOGL": "알파벳(구글)",
    "GOOG": "알파벳(구글)",
    "META": "메타",
    "AMZN": "아마존",
    "NVDA": "엔비디아",
    "TSLA": "테슬라",
    "NFLX": "넷플릭스",
    "ORCL": "오라클",
    "INTC": "인텔",
    "AMD": "AMD",
    "QCOM": "퀄컴",
    "AVGO": "브로드컴",
    "TXN": "텍사스인스트루먼트",
    "MU": "마이크론",
    "AMAT": "어플라이드머티리얼즈",
    "ASML": "ASML",
    "ARM": "ARM홀딩스",
    "LRCX": "램리서치",
    "KLAC": "KLA코퍼레이션",
    "ADI": "아날로그디바이시스",
    "MRVL": "마벨테크놀로지",
    "MCHP": "마이크로칩테크놀로지",
    "MPWR": "모노리식파워시스템즈",
    "ON": "온세미컨덕터",
    "STX": "시게이트",
    "WDC": "웨스턴디지털",
    "DELL": "델테크놀로지스",
    "HPQ": "HP",
    "HPE": "휴렛팩커드엔터프라이즈",
    "IBM": "IBM",
    "CSCO": "시스코",
    "ANET": "아리스타네트웍스",
    "PALO": "팔로알토네트웍스",
    "PANW": "팔로알토네트웍스",
    "CRWD": "크라우드스트라이크",
    "ZS": "지스케일러",
    "FTNT": "포티넷",
    "OKTA": "옥타",
    "CYBR": "사이버아크",
    "S": "센티넬원",
    # ── 소프트웨어/SaaS ──
    "CRM": "세일즈포스",
    "ADBE": "어도비",
    "NOW": "서비스나우",
    "INTU": "인튜이트",
    "WDAY": "워크데이",
    "TEAM": "아틀라시안",
    "MDB": "몽고DB",
    "DDOG": "데이터독",
    "SNOW": "스노우플레이크",
    "ZM": "줌",
    "DOCU": "도큐사인",
    "TWLO": "트윌리오",
    "HUBS": "허브스팟",
    "SMAR": "스마트시트",
    "PATH": "유아이패스",
    "GTLB": "깃랩",
    "NET": "클라우드플레어",
    "CFLT": "컨플루언트",
    "BILL": "빌닷컴",
    "PAYC": "페이콤",
    "PCOR": "프로코어",
    "ASAN": "아사나",
    "BOX": "박스",
    "ESTC": "엘라스틱",
    "FROG": "JFrog",
    "APPF": "앱폴리오",
    "VCRA": "보칼리아",
    # ── 인터넷/플랫폼 ──
    "UBER": "우버",
    "LYFT": "리프트",
    "ABNB": "에어비앤비",
    "DASH": "도어대시",
    "SNAP": "스냅",
    "PINS": "핀터레스트",
    "SPOT": "스포티파이",
    "RBLX": "로블록스",
    "MTCH": "매치그룹",
    "BMBL": "범블",
    "TWTR": "트위터(X)",
    "RDDT": "레딧",
    "IAC": "IAC",
    "ANGI": "앤지",
    "YELP": "옐프",
    "TRIP": "트립어드바이저",
    "EXPE": "익스피디아",
    "BKNG": "부킹홀딩스",
    "PCLN": "프라이스라인",
    # ── 핀테크/결제 ──
    "V": "비자",
    "MA": "마스터카드",
    "AXP": "아메리칸익스프레스",
    "PYPL": "페이팔",
    "COF": "캐피탈원",
    "SQ": "블록(스퀘어)",
    "AFRM": "어펌",
    "SOFI": "소파이",
    "HOOD": "로빈후드",
    "COIN": "코인베이스",
    "MSTR": "마이크로스트래티지",
    "NU": "누홀딩스",
    "DLO": "디로컬",
    "FLYW": "플라이와이어",
    "PAYO": "페이오니어",
    "OPEN": "오픈도어",
    "OPFI": "OppFi",
    # ── 금융/은행/보험 ──
    "JPM": "JP모건",
    "BAC": "뱅크오브아메리카",
    "WFC": "웰스파고",
    "GS": "골드만삭스",
    "MS": "모건스탠리",
    "C": "씨티그룹",
    "BRK-B": "버크셔해서웨이",
    "BRK-A": "버크셔해서웨이A",
    "USB": "US뱅코프",
    "PNC": "PNC파이낸셜",
    "TFC": "트루이스트파이낸셜",
    "SCHW": "찰스슈왑",
    "BLK": "블랙록",
    "SPGI": "S&P글로벌",
    "MCO": "무디스",
    "ICE": "인터컨티넨털익스체인지",
    "CME": "CME그룹",
    "CBOE": "시카고옵션거래소",
    "FIS": "피델리티내셔널인포메이션",
    "FISV": "피서브",
    "AIG": "AIG",
    "MET": "메트라이프",
    "PRU": "프루덴셜파이낸셜",
    "AFL": "어플랙",
    "ALL": "올스테이트",
    "PGR": "프로그레시브",
    "CB": "처브",
    "HIG": "하트퍼드파이낸셜",
    # ── 소비재/유통/식품 ──
    "WMT": "월마트",
    "COST": "코스트코",
    "HD": "홈디포",
    "LOW": "로우스",
    "TGT": "타겟",
    "NKE": "나이키",
    "MCD": "맥도날드",
    "SBUX": "스타벅스",
    "KO": "코카콜라",
    "PEP": "펩시코",
    "PM": "필립모리스",
    "MO": "알트리아",
    "MDLZ": "몬델리즈",
    "GIS": "제너럴밀스",
    "K": "켈로그",
    "CPB": "캠벨수프",
    "HSY": "허쉬",
    "SJM": "JM스머커",
    "CLX": "클로록스",
    "PG": "P&G",
    "KMB": "킴벌리클라크",
    "CL": "콜게이트팜올리브",
    "CHD": "처치앤드와이트",
    "COTY": "코티",
    "EL": "에스티로더",
    "ULTA": "울타뷰티",
    "LULU": "룰루레몬",
    "PVH": "PVH",
    "RL": "랄프로렌",
    "TPR": "태피스트리",
    "VFC": "VF코퍼레이션",
    "HBI": "헤인즈브랜즈",
    "GPS": "갭",
    "URBN": "어반아웃피터스",
    "ANF": "아버크롬비앤피치",
    "AEO": "아메리칸이글",
    "AMZN": "아마존",
    "EBAY": "이베이",
    "ETSY": "엣시",
    "W": "웨이페어",
    "CHWY": "추이",
    "CVNA": "카바나",
    "KR": "크로거",
    "SFM": "스프라우츠파머스마켓",
    "CASY": "케이시스제너럴스토어",
    # ── 헬스케어/제약/바이오 ──
    "JNJ": "존슨앤존슨",
    "UNH": "유나이티드헬스",
    "PFE": "화이자",
    "ABBV": "애브비",
    "MRK": "머크",
    "LLY": "일라이릴리",
    "BMY": "브리스톨마이어스스퀴브",
    "AMGN": "암젠",
    "GILD": "길리어드사이언스",
    "BIIB": "바이오젠",
    "REGN": "리제네론",
    "VRTX": "버텍스파마슈티컬스",
    "MRNA": "모더나",
    "BNTX": "바이오엔테크",
    "NVAX": "노바백스",
    "ILMN": "일루미나",
    "IQV": "IQVIA",
    "A": "에질런트테크놀로지스",
    "TMO": "써모피셔사이언티픽",
    "DHR": "다나허",
    "SYK": "스트라이커",
    "BSX": "보스턴사이언티픽",
    "MDT": "메드트로닉",
    "ABT": "애보트래버러토리스",
    "EW": "에드워즈라이프사이언시스",
    "ZBH": "짐머바이오멧",
    "BAX": "박스터",
    "BDX": "벡턴디킨슨",
    "CVS": "CVS헬스",
    "CI": "시그나",
    "HUM": "휴마나",
    "CNC": "센틴",
    "MOH": "몰리나헬스케어",
    "TDOC": "텔라닥",
    "ACCD": "액코이드헬스",
    # ── 에너지 ──
    "XOM": "엑슨모빌",
    "CVX": "셰브런",
    "COP": "코노코필립스",
    "EOG": "EOG리소시스",
    "SLB": "슐럼버거",
    "HAL": "핼리버튼",
    "BKR": "베이커휴즈",
    "OXY": "옥시덴탈페트롤리엄",
    "DVN": "데본에너지",
    "FANG": "다이아몬드백에너지",
    "MPC": "마라톤페트롤리엄",
    "PSX": "필립스66",
    "VLO": "발레로에너지",
    "KMI": "킨더모건",
    "WMB": "윌리엄스컴퍼니스",
    "ET": "에너지트랜스퍼",
    "LNG": "셰니어에너지",
    # ── 통신/미디어 ──
    "DIS": "디즈니",
    "CMCSA": "컴캐스트",
    "T": "AT&T",
    "VZ": "버라이즌",
    "TMUS": "T모바일",
    "CHTR": "차터커뮤니케이션스",
    "PARA": "파라마운트글로벌",
    "WBD": "워너브라더스디스커버리",
    "FOXA": "폭스",
    "NWSA": "뉴스코프",
    "NYT": "뉴욕타임스",
    "LYV": "라이브네이션",
    "SIRI": "시리우스XM",
    # ── 산업재/항공/방산 ──
    "BA": "보잉",
    "LMT": "록히드마틴",
    "RTX": "RTX(레이시온)",
    "NOC": "노스롭그루먼",
    "GD": "제너럴다이나믹스",
    "HII": "헌팅턴잉걸스",
    "TDG": "트랜스다임",
    "GE": "GE에어로스페이스",
    "HON": "하니웰",
    "MMM": "3M",
    "EMR": "에머슨일렉트릭",
    "ETN": "이튼",
    "PH": "파커해니핀",
    "ROK": "로크웰오토메이션",
    "IR": "잉거솔랜드",
    "CMI": "커민스",
    "CAT": "캐터필러",
    "DE": "존디어",
    "AGCO": "AGCO",
    "UPS": "UPS",
    "FDX": "페덱스",
    "DAL": "델타항공",
    "UAL": "유나이티드항공",
    "AAL": "아메리칸항공",
    "LUV": "사우스웨스트항공",
    "ALK": "알래스카항공",
    "JBLU": "젯블루",
    "CCL": "카니발",
    "RCL": "로열캐리비언",
    "NCLH": "노르웨지언크루즈",
    "MAR": "매리어트",
    "HLT": "힐튼",
    "H": "하얏트",
    "WH": "윈덤호텔",
    "HGV": "힐튼그랜드베케이션스",
    # ── 부동산(REIT) ──
    "AMT": "아메리칸타워",
    "PLD": "프로로지스",
    "CCI": "크라운캐슬",
    "EQIX": "에퀴닉스",
    "SPG": "사이먼프로퍼티그룹",
    "O": "리얼티인컴",
    "VICI": "VICI프로퍼티스",
    "WELL": "웰타워",
    "DLR": "디지털리얼티",
    "PSA": "퍼블릭스토리지",
    "EXR": "엑스트라스페이스스토리지",
    "AVB": "에벌론베이커뮤니티스",
    "EQR": "에퀴티레지덴셜",
    "ARE": "알렉산드리아리얼에스테이트",
    "VTR": "벤타스",
    "PEAK": "헬스피크프로퍼티스",
    # ── 전기차/미래모빌리티 ──
    "TSLA": "테슬라",
    "RIVN": "리비안",
    "LCID": "루시드모터스",
    "NIO": "니오",
    "XPEV": "샤오펑",
    "LI": "리오토모",
    "FFIE": "패러데이퓨처",
    "GOEV": "카누",
    "FSR": "피스커",
    "WKHS": "워크호스",
    "RIDE": "로즈타운모터스",
    "SOLO": "일렉트라메카니카",
    "PTRA": "프로테라",
    # ── 중국 ADR ──
    "BABA": "알리바바",
    "JD": "징둥닷컴",
    "BIDU": "바이두",
    "PDD": "핀둬둬(테무)",
    "TCEHY": "텐센트",
    "NTES": "넷이즈",
    "BEKE": "KE홀딩스",
    "TAL": "TAL에듀케이션",
    "EDU": "뉴오리엔탈",
    "IQ": "아이치이",
    "BILI": "빌리빌리",
    "VIPS": "유핀",
    "WB": "웨이보",
    "MOMO": "하이피",
    "ZH": "지후",
    "TIGR": "업스탁스",
    "FUTU": "푸투홀딩스",
    # ── 우주/방산 신흥 ──
    "SPCE": "버진갤럭틱",
    "RKT": "로켓컴퍼니스",
    "ASTS": "AST스페이스모바일",
    "LUNR": "인튜이티브머신스",
    "RKLB": "로켓랩",
    "MNTS": "모멘투스",
    "ASTR": "아스트라",
    # ── AI/반도체 신흥 ──
    "AI": "C3.ai",
    "BBAI": "빅베어AI",
    "SOUN": "사운드하운드AI",
    "VNET": "21비아넷",
    "SMCI": "슈퍼마이크로컴퓨터",
    "IONQ": "아이온큐",
    "RGTI": "리게티컴퓨팅",
    "QUBT": "퀀텀컴퓨팅",
    "QBTS": "D-Wave퀀텀",
    "ARQQ": "아쿼안텀",
    # ── ETF ──
    "SPY": "S&P500 ETF",
    "QQQ": "나스닥100 ETF",
    "DIA": "다우존스 ETF",
    "IWM": "러셀2000 ETF",
    "VTI": "미국 전체주식 ETF",
    "VOO": "뱅가드 S&P500 ETF",
    "VGT": "뱅가드 IT섹터 ETF",
    "XLK": "테크섹터 ETF",
    "XLF": "금융섹터 ETF",
    "XLE": "에너지섹터 ETF",
    "XLV": "헬스케어섹터 ETF",
    "XLY": "임의소비재섹터 ETF",
    "XLP": "필수소비재섹터 ETF",
    "XLI": "산업재섹터 ETF",
    "XLB": "소재섹터 ETF",
    "XLRE": "부동산섹터 ETF",
    "XLC": "통신섹터 ETF",
    "XLU": "유틸리티섹터 ETF",
    "ARKK": "ARK 이노베이션 ETF",
    "ARKQ": "ARK 자율기술&로봇 ETF",
    "ARKW": "ARK 차세대인터넷 ETF",
    "ARKG": "ARK 유전체혁명 ETF",
    "SOXX": "반도체 ETF",
    "SOXL": "반도체 3배 레버리지 ETF",
    "SOXS": "반도체 3배 인버스 ETF",
    "TQQQ": "나스닥100 3배 레버리지 ETF",
    "SQQQ": "나스닥100 3배 인버스 ETF",
    "UPRO": "S&P500 3배 레버리지 ETF",
    "SPXS": "S&P500 3배 인버스 ETF",
    "TLT": "미국 장기국채 ETF",
    "SHY": "미국 단기국채 ETF",
    "HYG": "하이일드채권 ETF",
    "LQD": "투자등급회사채 ETF",
    "GLD": "금 ETF",
    "SLV": "은 ETF",
    "USO": "원유 ETF",
    "UNG": "천연가스 ETF",
    "IBIT": "블랙록 비트코인 ETF",
    "FBTC": "피델리티 비트코인 ETF",
    "BITO": "비트코인 선물 ETF",
    "EEM": "신흥시장 ETF",
    "EFA": "선진국(미국제외) ETF",
    "EWJ": "일본 ETF",
    "MCHI": "중국 ETF",
    "EWY": "한국 ETF",
    "KWEB": "중국 인터넷 ETF",
    "FXI": "중국 대형주 ETF",
    "CQQQ": "중국 테크 ETF",
}


# ── 가격 조회 ──────────────────────────────────────────────

async def get_naver_price(ticker: str) -> Optional[dict]:
    """네이버 금융 API로 한국 주식 가격 조회 (캐시 90초)"""
    cached = _cache_get(ticker)
    if cached:
        return cached

    async with _get_lock(ticker):
        # lock 획득 후 재확인 (다른 코루틴이 이미 채웠을 수 있음)
        cached = _cache_get(ticker)
        if cached:
            return cached

        try:
            url = f"https://m.stock.naver.com/api/stock/{ticker}/basic"
            headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()

            exchange_type = data.get("stockExchangeType", {})
            exchange_code = exchange_type.get("code", "KS")
            exchange = "KOSDAQ" if exchange_code == "KQ" else "KOSPI"

            result = {
                "ticker": ticker,
                "name": data.get("stockName", ticker),
                "price": float(data.get("closePrice", "0").replace(",", "")),
                "change": float(data.get("compareToPreviousClosePrice", "0").replace(",", "")),
                "change_pct": float(data.get("fluctuationsRatio", "0")),
                "market": "KR",
                "exchange": exchange,
            }
            _cache_set(ticker, result)
            return result
        except Exception as e:
            print(f"KR 주가 조회 오류 ({ticker}): {e}")
            return None


async def get_yahoo_price(ticker: str) -> Optional[dict]:
    """Yahoo Finance API로 미국 주식 가격 조회 (캐시 90초)"""
    cache_key = f"us:{ticker}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    async with _get_lock(cache_key):
        cached = _cache_get(cache_key)
        if cached:
            return cached

        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()

            meta = data["chart"]["result"][0]["meta"]
            current_price = meta.get("regularMarketPrice", 0)
            prev_close = meta.get("chartPreviousClose") or meta.get("previousClose") or current_price
            change = current_price - prev_close
            change_pct = (change / prev_close * 100) if prev_close else 0

            exchange = meta.get("fullExchangeName", "NYSE")
            if meta.get("quoteType") == "ETF":
                exchange = "ETF"

            eng_name = meta.get("longName") or meta.get("shortName", ticker)
            name = US_NAME_KO.get(ticker.upper(), eng_name)

            # 프리/애프터 마켓 가격
            pre_price = meta.get("preMarketPrice")
            after_price = meta.get("postMarketPrice")

            result = {
                "ticker": ticker,
                "name": name,
                "price": current_price,
                "change": change,
                "change_pct": change_pct,
                "market": "US",
                "exchange": exchange,
                "pre_price": pre_price,
                "after_price": after_price,
            }
            _cache_set(cache_key, result)
            return result
        except Exception as e:
            print(f"US 주가 조회 오류 ({ticker}): {e}")
            return None


async def get_stock_price(ticker: str) -> Optional[dict]:
    """ticker로 현재가 조회 - 숫자면 KR, 아니면 US"""
    if ticker.replace("-", "").isdigit() or (len(ticker) == 6 and ticker.isdigit()):
        return await get_naver_price(ticker)
    return await get_yahoo_price(ticker)


# ── 검색 ──────────────────────────────────────────────────

async def search_naver(query: str) -> list:
    """네이버 자동완성 API로 한국 종목 검색"""
    try:
        url = f"https://ac.stock.naver.com/ac?q={query}&target=index,stock,marketindicator"
        headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()

        # stock 타입만 필터 (index 제외)
        items = [i for i in data.get("items", []) if i.get("typeCode") in ("KOSPI", "KOSDAQ")]
        return items[:6]
    except Exception as e:
        print(f"네이버 검색 오류: {e}")
        return []


async def search_yahoo(query: str) -> list:
    """Yahoo Finance 검색 API로 미국 종목 검색"""
    try:
        url = f"https://query1.finance.yahoo.com/v1/finance/search?q={query}&lang=en-US&region=US&quotesCount=6&newsCount=0"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url, headers=headers)
            data = resp.json()

        # 미국 거래소 종목만 (한국/독일 등 제외), EQUITY/ETF만
        valid_exchanges = {"NMS", "NYQ", "NGM", "NCM", "NYSEArca", "NasdaqGS", "NasdaqGM", "NasdaqCM", "NYSE", "NASDAQ"}
        quotes = [
            q for q in data.get("quotes", [])
            if q.get("quoteType") in ("EQUITY", "ETF")
            and q.get("exchange") in valid_exchanges
        ]
        return quotes[:6]
    except Exception as e:
        print(f"Yahoo 검색 오류: {e}")
        return []


def search_ko_name(query: str) -> list[str]:
    """한글 쿼리로 US_NAME_KO 역방향 검색 → 매칭 ticker 목록 반환 (최대 6개)
    우선순위: 이름 시작 일치 > 단어 경계 일치 > 포함
    """
    q = query.strip().lower()
    if not q:
        return []

    exact_start, word_match, contains = [], [], []
    for ticker, name in US_NAME_KO.items():
        n = name.lower()
        if n.startswith(q):
            exact_start.append(ticker)
        elif any(part.startswith(q) for part in n.replace("(", " ").replace(")", " ").split()):
            word_match.append(ticker)
        elif q in n:
            contains.append(ticker)

    result = exact_start + word_match + contains
    return result[:6]


async def search_stock(query: str, market: str = "ALL") -> list:
    """종목 검색 - 네이버/Yahoo API 직접 호출 + 한글 이름 역방향 매핑"""
    import asyncio

    query = query.strip()
    if not query:
        return []

    # 한글 포함 여부 체크
    has_korean = any("가" <= c <= "힣" for c in query)

    tasks = []
    if market in ("ALL", "KR"):
        tasks.append(search_naver(query))
    # 영어이거나 ALL/US 모드면 Yahoo 검색
    if market in ("ALL", "US") and not has_korean:
        tasks.append(search_yahoo(query))

    search_results = await asyncio.gather(*tasks)

    price_tasks = []

    # KR 결과
    if market in ("ALL", "KR") and search_results:
        kr_results = search_results[0]
        for item in kr_results:
            price_tasks.append(get_naver_price(item["code"]))

    # US 결과 (영어 검색)
    if market in ("ALL", "US") and not has_korean:
        us_results = search_results[-1] if search_results else []
        for item in us_results:
            price_tasks.append(get_yahoo_price(item["symbol"]))

    # 한글 검색 → US_NAME_KO 역방향 매핑으로 미국 주식도 검색
    if has_korean and market in ("ALL", "US"):
        ko_tickers = search_ko_name(query)
        for ticker in ko_tickers:
            price_tasks.append(get_yahoo_price(ticker))

    prices = await asyncio.gather(*price_tasks)
    return [p for p in prices if p is not None]


# ── 인기 종목 ──────────────────────────────────────────────

async def get_popular_stocks(market: str = "ALL") -> list:
    """홈화면 인기 종목 - 최소 하드코딩 ticker 기반"""
    import asyncio

    tasks = []
    if market in ("ALL", "KR"):
        for ticker in POPULAR_KR:
            tasks.append(get_naver_price(ticker))
    if market in ("ALL", "US"):
        for ticker in POPULAR_US:
            tasks.append(get_yahoo_price(ticker))

    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]
