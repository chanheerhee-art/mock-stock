"""
카카오톡 나에게 보내기 알림 서비스
- 지정가 주문 체결 시 본인 카카오톡으로 알림 전송
- access_token 만료 시 refresh_token으로 자동 갱신
"""
import httpx
from datetime import datetime, timedelta
from sqlalchemy import select
from models.database import AsyncSessionLocal, User
from services.auth import kakao_refresh_access_token


async def _get_valid_token(user: User, db) -> str | None:
    """유효한 카카오 액세스 토큰 반환 (만료 시 자동 갱신)"""
    if not user.kakao_access_token:
        return None

    # 만료 10분 전이면 갱신
    if user.kakao_token_expires and datetime.utcnow() >= user.kakao_token_expires - timedelta(minutes=10):
        if not user.kakao_refresh_token:
            return None
        try:
            data = await kakao_refresh_access_token(user.kakao_refresh_token)
            user.kakao_access_token = data["access_token"]
            user.kakao_token_expires = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 21600))
            if "refresh_token" in data:
                user.kakao_refresh_token = data["refresh_token"]
            await db.commit()
        except Exception as e:
            print(f"[KakaoNotify] 토큰 갱신 실패 (user {user.id}): {e}")
            return None

    return user.kakao_access_token


async def send_order_filled_notify(user_id: int, order_info: dict):
    """
    지정가 주문 체결 알림 전송
    order_info: { name, ticker, trade_type, quantity, price, total }
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return

        token = await _get_valid_token(user, db)
        if not token:
            return

    trade_type = order_info["trade_type"]
    is_buy = trade_type == "BUY"
    emoji = "📈" if is_buy else "📉"
    action = "매수" if is_buy else "매도"
    price_str = f"{order_info['price']:,.0f}원"
    total_str = f"{order_info['total']:,.0f}원"

    text = (
        f"{emoji} 지정가 {action} 체결 완료!\n\n"
        f"종목: {order_info['name']} ({order_info['ticker']})\n"
        f"수량: {order_info['quantity']}주\n"
        f"체결가: {price_str}\n"
        f"총액: {total_str}"
    )

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                "https://kapi.kakao.com/v2/api/talk/memo/default/send",
                headers={"Authorization": f"Bearer {token}"},
                data={
                    "template_object": f'{{"object_type":"text","text":"{text}","link":{{"web_url":"","mobile_web_url":""}}}}'
                },
            )
            if resp.status_code == 200:
                print(f"[KakaoNotify] 알림 전송 성공 (user {user_id})")
            else:
                print(f"[KakaoNotify] 알림 전송 실패: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[KakaoNotify] 전송 오류: {e}")
