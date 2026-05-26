# 📈 모의주식 - 카카오 공유형 모바일 웹앱

친구들과 카카오톡으로 랭킹을 공유하며 즐기는 모의 주식 게임!

## 🎯 주요 기능
- 💰 시드머니 1,000만원으로 시작
- 🇰🇷 한국 주식 (삼성전자, 카카오, NAVER 등)
- 🇺🇸 미국 주식 (애플, 테슬라, 엔비디아 등)
- 🏆 실시간 수익률 랭킹
- 💬 카카오톡으로 랭킹 공유
- 🔐 카카오 로그인

## 📁 프로젝트 구조
```
mock-stock/
├── backend/        # FastAPI 서버
│   ├── main.py
│   ├── models/     # DB 모델 (SQLite)
│   ├── routers/    # API 라우터
│   └── services/   # 주가 조회, 인증
└── frontend/       # Next.js 모바일 웹앱
    └── src/app/
        ├── page.tsx           # 로그인
        ├── dashboard/         # 메인 대시보드
        ├── trade/             # 매수/매도
        ├── ranking/           # 랭킹 & 공유
        ├── portfolio/         # 거래 내역
        └── auth/callback/     # 카카오 콜백
```

## 🚀 실행 방법

### 1. 카카오 앱 설정 (필수!)
1. [카카오 개발자 콘솔](https://developers.kakao.com) 접속
2. 애플리케이션 추가
3. **REST API 키** 복사
4. 플랫폼 → 웹 → 사이트 도메인 추가: `http://localhost:3000`
5. 카카오 로그인 → 활성화
6. 카카오 로그인 → Redirect URI: `http://localhost:3000/auth/callback`
7. 동의항목 → 닉네임, 프로필 사진 체크

### 2. 백엔드 실행
```bash
cd backend
cp .env.example .env
# .env 파일에서 KAKAO_CLIENT_ID, JWT_SECRET 설정

pip install -r requirements.txt
uvicorn main:app --reload
# http://localhost:8000 에서 실행
```

### 3. 프론트엔드 실행
```bash
cd frontend
cp .env.local.example .env.local
# .env.local 파일에서 NEXT_PUBLIC_KAKAO_CLIENT_ID 설정

npm install
npm run dev
# http://localhost:3000 에서 실행
```

## ☁️ 배포 방법

### 백엔드 → Railway
1. [railway.app](https://railway.app) 가입
2. GitHub 저장소 연결 → `backend` 폴더 선택
3. 환경변수 설정 (KAKAO_CLIENT_ID, JWT_SECRET 등)
4. 배포 후 URL 복사 (예: `https://mock-stock-api.railway.app`)

### 프론트엔드 → Vercel
1. [vercel.com](https://vercel.com) 가입
2. GitHub 저장소 연결 → `frontend` 폴더 선택
3. 환경변수 설정:
   - `NEXT_PUBLIC_API_URL` = Railway URL
   - `NEXT_PUBLIC_KAKAO_CLIENT_ID` = 카카오 REST API 키
   - `NEXT_PUBLIC_KAKAO_REDIRECT_URI` = `https://your-app.vercel.app/auth/callback`
4. 카카오 개발자 콘솔에서 Redirect URI도 Vercel URL로 추가

## 💬 카카오톡 공유
랭킹 페이지에서 **"카카오톡으로 랭킹 공유하기"** 버튼 클릭!
- 모바일: 카카오톡 직접 공유
- PC: 링크 클립보드 복사
