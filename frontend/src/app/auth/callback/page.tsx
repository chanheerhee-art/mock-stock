"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Suspense } from "react";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error || !code) {
      setError("카카오 로그인이 취소되었습니다.");
      return;
    }

    api.get(`/auth/kakao/callback?code=${code}`).then((res) => {
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("nickname", res.data.nickname);
      if (res.data.profile_image) {
        localStorage.setItem("profile_image", res.data.profile_image);
      }
      router.replace("/dashboard");
    }).catch((e) => {
      const msg = e?.response?.data?.detail || "로그인 실패. 다시 시도해주세요.";
      setError(msg);
    });
  }, [searchParams, router]);

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen px-6">
        <div className="text-center space-y-4">
          <div className="text-4xl">😢</div>
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => router.replace("/")}
            className="bg-yellow-400 text-gray-900 font-bold px-6 py-3 rounded-2xl text-sm"
          >
            다시 로그인하기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <div className="text-4xl animate-bounce">📈</div>
        <p className="text-gray-400">로그인 중...</p>
      </div>
    </main>
  );
}

export default function CallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
