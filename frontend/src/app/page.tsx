"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.replace("/dashboard");
    } else {
      setLoading(false);
    }
  }, [router]);

  const handleKakaoLogin = () => {
    // 직접 카카오 로그인 URL로 이동 (API 호출 없이)
    const kakaoClientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
    const url = `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoClientId}&redirect_uri=${redirectUri}&response_type=code`;
    window.location.href = url;
  };

  if (loading) return null;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="text-center space-y-6 max-w-sm w-full">
        <div className="text-6xl">📈</div>
        <h1 className="text-3xl font-bold">모의주식</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          1,000만원으로 시작하는 모의 주식 투자<br />
          친구들과 수익률을 겨뤄보세요!
        </p>

        <div className="space-y-3 pt-4">
          <div className="bg-gray-800 rounded-2xl p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <span>💰</span><span>시드머니 1,000만원 지급</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <span>🇰🇷</span><span>한국 + 미국 주식 거래</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <span>🏆</span><span>실시간 랭킹 & 카톡 공유</span>
            </div>
          </div>

          <button
            onClick={handleKakaoLogin}
            className="w-full bg-yellow-400 text-gray-900 font-bold py-4 rounded-2xl text-base flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <span className="text-lg">💬</span>
            카카오 로그인
          </button>
        </div>
      </div>
    </main>
  );
}
