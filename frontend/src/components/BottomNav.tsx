"use client";
import { usePathname, useRouter } from "next/navigation";
import { usePWA } from "@/hooks/usePWA";
import { useState, useEffect } from "react";

const TABS = [
  { href: "/dashboard", icon: "🏠", label: "홈" },
  { href: "/trade",     icon: "📈", label: "거래" },
  { href: "/ranking",   icon: "🏆", label: "랭킹" },
  { href: "/portfolio", icon: "💼", label: "포트폴리오" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isInstallable, isInstalled, triggerInstall } = usePWA();
  const [showBanner, setShowBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 로그인 여부 확인
  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("token"));
    const dismissed = sessionStorage.getItem("pwa-banner-dismissed");
    setBannerDismissed(!!dismissed);
  }, []);

  // 설치 가능하고 아직 설치 안됐고 배너 안 닫았을 때 표시
  useEffect(() => {
    if (isInstallable && !isInstalled && !bannerDismissed) {
      const timer = setTimeout(() => setShowBanner(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [isInstallable, isInstalled, bannerDismissed]);

  // 로그인 안됐거나 루트 페이지면 탭바 숨김
  if (!isLoggedIn || pathname === "/") return null;

  const handleDismiss = () => {
    setShowBanner(false);
    setBannerDismissed(true);
    sessionStorage.setItem("pwa-banner-dismissed", "1");
  };

  const handleInstall = async () => {
    await triggerInstall();
    setShowBanner(false);
  };

  // iOS Safari: 설치 안내 배너 (beforeinstallprompt 없음)
  const isIOS = /iphone|ipad|ipod/i.test(
    typeof navigator !== "undefined" ? navigator.userAgent : ""
  );
  const isSafari = /^((?!chrome|android).)*safari/i.test(
    typeof navigator !== "undefined" ? navigator.userAgent : ""
  );
  const showIOSBanner = isIOS && isSafari && !isInstalled && !bannerDismissed;

  return (
    <>
      {/* PWA 설치 배너 (Android) */}
      {showBanner && !isIOS && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex justify-center"
          style={{ animation: "slideDown 0.3s ease-out" }}
        >
          <div
            className="w-full max-w-md mx-4 mt-3 rounded-2xl p-4 flex items-center gap-3 shadow-2xl border border-gray-700"
            style={{ background: "#1a1a1a" }}
          >
            <img src="/icon-192.png" className="w-10 h-10 rounded-xl shrink-0" alt="" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">홈 화면에 추가</div>
              <div className="text-xs text-gray-400 mt-0.5">앱처럼 빠르게 실행하세요</div>
            </div>
            <button
              onClick={handleInstall}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-yellow-400 text-gray-900 shrink-0"
            >
              추가
            </button>
            <button onClick={handleDismiss} className="text-gray-500 text-lg shrink-0">✕</button>
          </div>
        </div>
      )}

      {/* iOS 설치 안내 배너 */}
      {showIOSBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center">
          <div
            className="w-full max-w-md mx-4 mt-3 rounded-2xl p-4 shadow-2xl border border-gray-700"
            style={{ background: "#1a1a1a" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-white">📲 홈 화면에 추가하기</div>
              <button onClick={handleDismiss} className="text-gray-500 text-lg">✕</button>
            </div>
            <div className="text-xs text-gray-400 leading-relaxed">
              하단 공유 버튼(
              <span className="inline-block align-middle text-blue-400">⬆</span>
              ) 탭 → <span className="text-white font-semibold">홈 화면에 추가</span> 선택
            </div>
          </div>
        </div>
      )}

      {/* 하단 탭바 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex justify-center"
        style={{ background: "transparent" }}
      >
        <div
          className="w-full max-w-md border-t flex"
          style={{ background: "#111", borderColor: "#222", paddingBottom: "env(safe-area-inset-bottom, 8px)" }}
        >
          {TABS.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <button
                key={tab.href}
                onClick={() => router.push(tab.href)}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all active:scale-90"
              >
                <span
                  className="text-xl leading-none transition-all"
                  style={{ filter: isActive ? "none" : "grayscale(1) opacity(0.4)" }}
                >
                  {tab.icon}
                </span>
                <span
                  className="text-xs transition-colors"
                  style={{ color: isActive ? "#facc15" : "#555" }}
                >
                  {tab.label}
                </span>
                {isActive && (
                  <span
                    className="absolute bottom-0 w-8 h-0.5 rounded-full bg-yellow-400"
                    style={{ marginBottom: "env(safe-area-inset-bottom, 8px)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 탭바 높이만큼 하단 여백 */}
      <div style={{ height: "calc(56px + env(safe-area-inset-bottom, 0px))" }} />

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
