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
    """카카오 로그인 URL 반환"""
    url = (
        f"https://kauth.kakao.com/oauth/authorize"
        f"?client_id={KAKAO_CLIENT_ID}"
        f"&redirect_uri={KAKAO_REDIRECT_URI}"
        f"&response_type=code"
    )
    return {"url": url}


@router.get("/kakao/callback")
async def kakao_callback(code: str, db: AsyncSession = Depends(get_db)):
    """카카오 OAuth 콜백 처리"""
    try:
        access_token = await kakao_get_token(code)
        kakao_user = await kakao_get_user(access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"카카오 인증 실패: {str(e)}")

    # 유저 조회 또는 생성
    result = await db.execute(select(User).where(User.kakao_id == kakao_user["kakao_id"]))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            kakao_id=kakao_user["kakao_id"],
            nickname=kakao_user["nickname"],
            profile_image=kakao_user["profile_image"],
            cash=SEED_MONEY,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_jwt(user.id, user.kakao_id)
    return {"token": token, "nickname": user.nickname, "profile_image": user.profile_image}
