"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

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
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-4xl animate-bounce">📈</div>
    </main>
  );

  if (!portfolio) return null;

  const isProfitable = portfolio.total_profit >= 0;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {portfolio.profile_image && (
            <img src={portfolio.profile_image} className="w-8 h-8 rounded-full" alt="" />
          )}
          <span className="font-semibold">{portfolio.nickname}</span>
        </div>
        <button
          onClick={() => { localStorage.clear(); router.replace("/"); }}
          className="text-xs text-gray-500"
        >
          로그아웃
        </button>
      </div>

      {/* 총 자산 */}
      <div className={`rounded-2xl p-5 ${isProfitable ? "bg-red-950" : "bg-blue-950"}`}>
        <p className="text-xs text-gray-400 mb-1">총 평가자산</p>
        <p className="text-3xl font-bold">{portfolio.total_assets.toLocaleString()}원</p>
        <p className={`text-sm mt-1 font-medium ${isProfitable ? "text-red-400" : "text-blue-400"}`}>
          {isProfitable ? "▲" : "▼"} {Math.abs(portfolio.total_profit).toLocaleString()}원
          ({isProfitable ? "+" : ""}{portfolio.total_profit_pct.toFixed(2)}%)
        </p>
        <div className="mt-3 flex gap-4 text-xs text-gray-400">
          <span>현금 {portfolio.cash.toLocaleString()}원</span>
          <span>주식 {portfolio.total_eval.toLocaleString()}원</span>
        </div>
      </div>

      {/* 빠른 메뉴 */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/trade" className="bg-gray-800 rounded-2xl p-4 text-center space-y-1 active:scale-95 transition-transform">
          <div className="text-2xl">💹</div>
          <div className="text-xs text-gray-300">거래하기</div>
        </Link>
        <Link href="/ranking" className="bg-gray-800 rounded-2xl p-4 text-center space-y-1 active:scale-95 transition-transform">
          <div className="text-2xl">🏆</div>
          <div className="text-xs text-gray-300">랭킹</div>
        </Link>
        <Link href="/portfolio" className="bg-gray-800 rounded-2xl p-4 text-center space-y-1 active:scale-95 transition-transform">
          <div className="text-2xl">📊</div>
          <div className="text-xs text-gray-300">포트폴리오</div>
        </Link>
      </div>

      {/* 보유 종목 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-2">보유 종목</h2>
        {portfolio.holdings.length === 0 ? (
          <div className="bg-gray-800 rounded-2xl p-6 text-center text-gray-500 text-sm">
            보유 종목이 없습니다.<br />
            <Link href="/trade" className="text-yellow-400 mt-1 block">종목 거래하러 가기 →</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {portfolio.holdings.map((h) => (
              <div key={h.ticker} className="bg-gray-800 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{h.name}</div>
                  <div className="text-xs text-gray-400">{h.quantity}주 · 평단 {h.avg_price.toLocaleString()}원</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{h.eval_amount.toLocaleString()}원</div>
                  <div className={`text-xs font-medium ${h.profit >= 0 ? "text-red-400" : "text-blue-400"}`}>
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
