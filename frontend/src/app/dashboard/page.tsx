"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface Holding {
  ticker: string;
  name: string;
  market: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  eval_amount: number;
  profit: number;
  profit_pct: number;
  change_pct: number;
}

interface Portfolio {
  cash: number;
  total_eval: number;
  total_assets: number;
  total_profit: number;
  total_profit_pct: number;
  nickname: string;
  profile_image?: string;
  holdings: Holding[];
}

export default function Dashboard() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    api.get("/portfolio/me").then((res) => {
      setPortfolio(res.data);
    }).catch(() => {
      localStorage.clear();
      router.replace("/");
    }).finally(() => setLoading(false));
  }, [router]);

  if (loading) return (
    <main className="flex items-center justify-center min-h-screen" style={{background: "#0f0f0f"}}>
      <div className="text-center space-y-3">
        <div className="text-5xl animate-bounce">📈</div>
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      </div>
    </main>
  );

  if (!portfolio) return null;

  const isProfitable = portfolio.total_profit >= 0;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{background: "#0f0f0f", minHeight: "100vh"}}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {portfolio.profile_image ? (
            <img src={portfolio.profile_image} className="w-9 h-9 rounded-full border-2 border-gray-700" alt="" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-sm">👤</div>
          )}
          <div>
            <div className="font-semibold text-white text-sm">{portfolio.nickname}</div>
            <div className="text-xs text-gray-500">모의투자 계좌</div>
          </div>
        </div>
        <button
          onClick={() => { localStorage.clear(); router.replace("/"); }}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          로그아웃
        </button>
      </div>

      {/* 총 자산 카드 */}
      <div className={`rounded-2xl p-5 ${isProfitable ? "bg-gradient-to-br from-red-950 to-gray-900" : "bg-gradient-to-br from-blue-950 to-gray-900"} border border-gray-800`}>
        <p className="text-xs text-gray-400 mb-1">총 평가자산</p>
        <p className="text-3xl font-bold text-white">{portfolio.total_assets.toLocaleString()}원</p>
        <div className={`flex items-center gap-1 mt-1 ${isProfitable ? "text-red-400" : "text-blue-400"}`}>
          <span className="text-sm font-semibold">
            {isProfitable ? "▲" : "▼"} {Math.abs(portfolio.total_profit).toLocaleString()}원
          </span>
          <span className="text-xs">({isProfitable ? "+" : ""}{portfolio.total_profit_pct.toFixed(2)}%)</span>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-700/50 flex gap-4 text-xs text-gray-400">
          <span>💵 현금 {portfolio.cash.toLocaleString()}원</span>
          <span>📊 주식 {portfolio.total_eval.toLocaleString()}원</span>
        </div>
      </div>

      {/* 빠른 메뉴 */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { href: "/trade", icon: "💹", label: "거래하기" },
          { href: "/ranking", icon: "🏆", label: "랭킹" },
          { href: "/history", icon: "📅", label: "시즌기록" },
          { href: "/portfolio", icon: "📋", label: "거래내역" },
        ].map((menu) => (
          <Link
            key={menu.href}
            href={menu.href}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-2xl p-4 text-center space-y-2 transition-all active:scale-95"
          >
            <div className="text-2xl">{menu.icon}</div>
            <div className="text-xs text-gray-300 font-medium">{menu.label}</div>
          </Link>
        ))}
      </div>

      {/* 보유 종목 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">보유 종목</h2>
          <span className="text-xs text-gray-500">{portfolio.holdings.length}개</span>
        </div>
        {portfolio.holdings.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center space-y-3">
            <div className="text-3xl">📭</div>
            <p className="text-gray-500 text-sm">보유 종목이 없어요</p>
            <Link href="/trade" className="inline-block text-yellow-400 text-sm font-medium hover:text-yellow-300">
              지금 투자 시작하기 →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {portfolio.holdings.map((h) => (
              <div key={h.ticker} className="bg-gray-800 border border-gray-700 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-sm text-white">{h.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {h.quantity}주 · 평단 {h.avg_price.toLocaleString()}원
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">{h.eval_amount.toLocaleString()}원</div>
                  <div className={`text-xs font-semibold mt-0.5 ${h.profit >= 0 ? "text-red-400" : "text-blue-400"}`}>
                    {h.profit >= 0 ? "+" : ""}{h.profit_pct.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
