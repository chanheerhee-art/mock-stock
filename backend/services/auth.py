import httpx
import os
from jose import jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

KAKAO_CLIENT_ID = os.getenv("KAKAO_CLIENT_ID")
KAKAO_CLIENT_SECRET = os.getenv("KAKAO_CLIENT_SECRET")
KAKAO_REDIRECT_URI = os.getenv("KAKAO_REDIRECT_URI")
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30


async def kakao_get_token(code: str) -> dict:
    """카카오 인가코드 → 토큰 정보 (access + refresh)"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": KAKAO_CLIENT_ID,
                "client_secret": KAKAO_CLIENT_SECRET,
                "redirect_uri": KAKAO_REDIRECT_URI,
                "code": code,
            },
        )
        if not resp.is_success:
            raise Exception(f"카카오 토큰 오류 {resp.status_code}: {resp.text}")
        return resp.json()  # access_token, refresh_token, expires_in 포함


async def kakao_refresh_access_token(refresh_token: str) -> dict:
    """리프레시 토큰으로 액세스 토큰 갱신"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "refresh_token",
                "client_id": KAKAO_CLIENT_ID,
                "client_secret": KAKAO_CLIENT_SECRET,
                "refresh_token": refresh_token,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def kakao_get_user(access_token: str) -> dict:
    """카카오 액세스 토큰 → 유저 정보"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()

    kakao_account = data.get("kakao_account", {})
    profile = kakao_account.get("profile", {})

    return {
        "kakao_id": str(data["id"]),
        "nickname": profile.get("nickname", "익명"),
        "profile_image": profile.get("profile_image_url"),
    }


def create_jwt(user_id: int, kakao_id: str) -> str:
    payload = {
        "sub": str(user_id),
        "kakao_id": kakao_id,
        "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
