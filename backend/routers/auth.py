from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os

from models.database import get_db, User
from services.auth import kakao_get_token, kakao_get_user, create_jwt

router = APIRouter(prefix="/auth", tags=["auth"])

SEED_MONEY = float(os.getenv("SEED_MONEY", 10000000))
KAKAO_CLIENT_ID = os.getenv("KAKAO_CLIENT_ID")
KAKAO_REDIRECT_URI = os.getenv("KAKAO_REDIRECT_URI")


@router.get("/kakao/url")
def kakao_login_url():
    """카카오 로그인 URL 반환 (talk_message 스코프 포함)"""
    url = (
        f"https://kauth.kakao.com/oauth/authorize"
        f"?client_id={KAKAO_CLIENT_ID}"
        f"&redirect_uri={KAKAO_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=talk_message"
    )
    return {"url": url}


@router.get("/kakao/callback")
async def kakao_callback(code: str, db: AsyncSession = Depends(get_db)):
    """카카오 OAuth 콜백 처리 — access/refresh 토큰 DB 저장"""
    from datetime import datetime, timedelta
    try:
        token_data = await kakao_get_token(code)
        kakao_user = await kakao_get_user(token_data["access_token"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"카카오 인증 실패: {str(e)}")

    result = await db.execute(select(User).where(User.kakao_id == kakao_user["kakao_id"]))
    user = result.scalar_one_or_none()

    expires_at = datetime.utcnow() + timedelta(seconds=token_data.get("expires_in", 21600))

    if not user:
        user = User(
            kakao_id=kakao_user["kakao_id"],
            nickname=kakao_user["nickname"],
            profile_image=kakao_user["profile_image"],
            cash=SEED_MONEY,
            kakao_access_token=token_data["access_token"],
            kakao_refresh_token=token_data.get("refresh_token"),
            kakao_token_expires=expires_at,
        )
        db.add(user)
    else:
        # 기존 유저 — 토큰 업데이트
        user.kakao_access_token = token_data["access_token"]
        if "refresh_token" in token_data:
            user.kakao_refresh_token = token_data["refresh_token"]
        user.kakao_token_expires = expires_at

    await db.commit()
    await db.refresh(user)

    token = create_jwt(user.id, user.kakao_id)
    return {"token": token, "nickname": user.nickname, "profile_image": user.profile_image}
