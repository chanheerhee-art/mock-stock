"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Suspense } from "react";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      router.replace("/");
      return;
    }

    api.get(`/auth/kakao/callback?code=${code}`).then((res) => {
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("nickname", res.data.nickname);
      if (res.data.profile_image) {
        localStorage.setItem("profile_image", res.data.profile_image);
      }
      router.replace("/dashboard");
    }).catch(() => {
      router.replace("/");
    });
  }, [searchParams, router]);

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
