"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import api from "@/lib/api";

interface Holding {
  ticker: string;
  name: string;
  market: string;
  exchange: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  current_price_krw: number;
  eval_amount: number;
  profit: number;
  profit_pct: number;
  change_pct: number;
  is_us: boolean;
  usd_krw: number | null;
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
  usd_krw: number;
}

interface ChartPoint { date: string; total_assets: number; profit_pct: number; }

const EXCHANGE_BADGE: Record<string, string> = {
  KOSPI: "bg-blue-500/20 text-blue-400",
  KOSDAQ: "bg-green-500/20 text-green-400",
  NasdaqGS: "bg-purple-500/20 text-purple-400",
  NasdaqGM: "bg-purple-500/20 text-purple-400",
  NYSE: "bg-orange-500/20 text-orange-400",
  ETF: "bg-yellow-500/20 text-yellow-400",
};

export default function Dashboard() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [portfolioRes, chartRes] = await Promise.all([
        api.get("/portfolio/me"),
        api.get("/portfolio/history-chart").catch(() => ({ data: [] })),
      ]);
      setPortfolio(portfolioRes.data);
      setChartData(chartRes.data);
    } catch {
      localStorage.clear();
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }
    fetchData();
  }, [router, fetchData]);

  if (loading) return (
    <main className="flex items-center justify-center min-h-screen" style={{ background: "#0f0f0f" }}>
      <div className="text-center space-y-3">
        <div className="text-5xl animate-bounce">📈</div>
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      </div>
    </main>
  );

  if (!portfolio) return null;

  const isProfitable = portfolio.total_profit >= 0;
  const hasChart = chartData.length >= 2;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{ background: "#0f0f0f", minHeight: "100vh" }}>
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
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">💱 {portfolio.usd_krw.toLocaleString()}원</span>
          <button
            onClick={() => { localStorage.clear(); router.replace("/"); }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >로그아웃</button>
        </div>
      </div>

      {/* 총 자산 카드 + 미니 차트 */}
      <div className={`rounded-2xl p-5 ${isProfitable ? "bg-gradient-to-br from-red-950 to-gray-900" : "bg-gradient-to-br from-blue-950 to-gray-900"} border border-gray-800`}>
        <p className="text-xs text-gray-400 mb-1">총 평가자산</p>
        <p className="text-3xl font-bold text-white">{portfolio.total_assets.toLocaleString()}원</p>
        <div className={`flex items-center gap-1 mt-1 ${isProfitable ? "text-red-400" : "text-blue-400"}`}>
          <span className="text-sm font-semibold">
            {isProfitable ? "▲" : "▼"} {Math.abs(portfolio.total_profit).toLocaleString()}원
          </span>
          <span className="text-xs">({isProfitable ? "+" : ""}{portfolio.total_profit_pct.toFixed(2)}%)</span>
        </div>

        {/* 자산 변화 미니 차트 */}
        {hasChart && (
          <div className="mt-3 h-14">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <YAxis domain={["auto", "auto"]} hide />
                <Tooltip
                  contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`${v.toLocaleString()}원`, "자산"]}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Line
                  type="monotone"
                  dataKey="total_assets"
                  stroke={isProfitable ? "#f87171" : "#60a5fa"}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

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
              <Link key={h.ticker} href={`/stock/${h.ticker}`}>
                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 flex justify-between items-center hover:border-gray-500 transition-all">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{h.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[h.exchange] ?? "bg-gray-600 text-gray-300"}`}>
                        {h.exchange}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {h.quantity}주 · 평단 {h.avg_price.toLocaleString()}원
                      {h.is_us && h.usd_krw && (
                        <span className="text-gray-600 ml-1">(환율 {h.usd_krw.toLocaleString()})</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">{h.eval_amount.toLocaleString()}원</div>
                    {h.is_us && (
                      <div className="text-xs text-gray-500">${h.current_price.toFixed(2)}</div>
                    )}
                    <div className={`text-xs font-semibold mt-0.5 ${h.profit >= 0 ? "text-red-400" : "text-blue-400"}`}>
                      {h.profit >= 0 ? "+" : ""}{h.profit_pct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
