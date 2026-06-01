#!/usr/bin/env bash
# 프로덕션 배포 + alias 자동 연결
# 사용법: npm run deploy
set -e

ALIAS_DOMAIN="mock-stock-app.vercel.app"

echo "🚀 프로덕션 배포 중..."
# --yes: 프롬프트 스킵. 출력 전체에서 배포 URL을 추출
OUTPUT=$(npx vercel deploy --prod --yes 2>&1)
DEPLOY_URL=$(echo "$OUTPUT" | grep -oE 'https://mock-stock-[a-z0-9]+-chanheerhee-arts-projects\.vercel\.app' | head -1)

if [[ -z "$DEPLOY_URL" ]]; then
  echo "❌ 배포 URL을 가져오지 못했습니다."
  echo "$OUTPUT" | tail -5
  exit 1
fi

echo "✅ 배포 완료: $DEPLOY_URL"
echo "🔗 alias 연결 중: $ALIAS_DOMAIN"
npx vercel alias set "$DEPLOY_URL" "$ALIAS_DOMAIN"

echo ""
echo "🎉 완료! https://$ALIAS_DOMAIN 가 최신 배포를 가리킵니다."
