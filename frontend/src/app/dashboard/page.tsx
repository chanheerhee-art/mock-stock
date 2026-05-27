"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import api from "@/lib/api";

// ── 종목 상세 모달 ─────────────────────────────────────────

function HoldingDetailModal({ holding, totalAssets, onClose }: {
  holding: Holding;
  totalAssets: number;
  onClose: () => void;
}) {
  const weight = totalAssets > 0 ? (holding.eval_amount / totalAssets) * 100 : 0;
  const profitAbs = holding.profit;
  const isProfit = profitAbs >= 0;
  const costBasis = holding.avg_price * holding.quantity;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center" style={{ animation: "slideUp 0.22s ease-out" }}>
        <div className="w-full max-w-md bg-gray-900 border-t border-gray-700 rounded-t-3xl px-5 pt-5 pb-10 space-y-4 shadow-2xl">
          <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto" />

          {/* 헤더 */}
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold text-white text-lg">{holding.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{holding.ticker}</span>
                <span className="text-xs text-gray-600">·</span>
                <span className="text-xs text-gray-500">{holding.quantity}주 보유</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
          </div>

          {/* 평가손익 크게 */}
          <div className={`rounded-2xl p-4 ${isProfit ? "bg-red-500/10 border border-red-500/20" : "bg-blue-500/10 border border-blue-500/20"}`}>
            <div className="text-xs text-gray-400 mb-1">평가손익</div>
            <div className={`text-2xl font-bold ${isProfit ? "text-red-400" : "text-blue-400"}`}>
              {isProfit ? "+" : ""}{profitAbs.toLocaleString()}원
            </div>
            <div className={`text-sm font-semibold mt-0.5 ${isProfit ? "text-red-400" : "text-blue-400"}`}>
              {isProfit ? "▲" : "▼"} {Math.abs(holding.profit_pct).toFixed(2)}%
            </div>
          </div>

          {/* 상세 수치 */}
          <div className="space-y-2.5">
            {[
              { label: "현재가", value: holding.is_us ? `$${holding.current_price.toFixed(2)} (${holding.current_price_krw.toLocaleString()}원)` : `${holding.current_price_krw.toLocaleString()}원` },
              { label: "평균 매입가", value: `${holding.avg_price.toLocaleString()}원` },
              { label: "매입 총액", value: `${costBasis.toLocaleString()}원` },
              { label: "평가 금액", value: `${holding.eval_amount.toLocaleString()}원` },
              { label: "포트폴리오 비중", value: `${weight.toFixed(1)}%` },
              { label: "당일 등락", value: holding.change_pct >= 0 ? `▲ ${holding.change_pct.toFixed(2)}%` : `▼ ${Math.abs(holding.change_pct).toFixed(2)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center text-sm border-b border-gray-800 pb-2">
                <span className="text-gray-400">{label}</span>
                <span className={`font-semibold ${
                  label === "당일 등락"
                    ? holding.change_pct >= 0 ? "text-red-400" : "text-blue-400"
                    : label === "포트폴리오 비중" ? "text-yellow-400"
                    : "text-white"
                }`}>{value}</span>
              </div>
            ))}
          </div>

          {/* 비중 바 */}
          <div>
            <div className="text-xs text-gray-500 mb-1.5">포트폴리오 내 비중</div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isProfit ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${Math.min(weight, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>0%</span>
              <span>{weight.toFixed(1)}%</span>
              <span>100%</span>
            </div>
          </div>

          <Link href={`/stock/${holding.ticker}`}
            className="block w-full text-center bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-3 rounded-xl text-sm transition-all active:scale-95">
            📊 {holding.name} 차트 보기 →
          </Link>
        </div>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}

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

interface ShortPosition {
  id: number;
  ticker: string;
  name: string;
  exchange: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  profit: number;
  profit_pct: number;
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
  short_unrealized: number;
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
  const [shortPositions, setShortPositions] = useState<ShortPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [portfolioRes, chartRes, shortRes] = await Promise.all([
        api.get("/portfolio/me"),
        api.get("/portfolio/history-chart").catch(() => ({ data: [] })),
        api.get("/short/positions").catch(() => ({ data: [] })),
      ]);
      setPortfolio(portfolioRes.data);
      setChartData(chartRes.data);
      setShortPositions(shortRes.data);
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
    // 30초마다 포트폴리오 평가금액 갱신
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
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
    <>
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [`${Number(v).toLocaleString()}원`, "자산"]}
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

        <div className="mt-3 pt-3 border-t border-gray-700/50 flex gap-3 text-xs text-gray-400 flex-wrap">
          <span>💵 현금 {portfolio.cash.toLocaleString()}원</span>
          <span>📊 주식 {portfolio.total_eval.toLocaleString()}원</span>
          {portfolio.short_unrealized !== 0 && (
            <span className={portfolio.short_unrealized >= 0 ? "text-blue-400" : "text-red-400"}>
              📉 공매도 {portfolio.short_unrealized >= 0 ? "+" : ""}{portfolio.short_unrealized.toLocaleString()}원
            </span>
          )}
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

      {/* 공매도 포지션 */}
      {shortPositions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">📉 공매도 포지션</h2>
            <span className="text-xs text-gray-500">{shortPositions.length}개</span>
          </div>
          <div className="space-y-2">
            {shortPositions.map((p) => (
              <div key={p.id} className="bg-gray-800 border border-orange-500/20 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">{p.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-medium">SHORT</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.quantity}주 · 진입 {p.entry_price.toLocaleString()}원
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">{p.current_price.toLocaleString()}원</div>
                  <div className={`text-xs font-semibold mt-0.5 ${p.profit >= 0 ? "text-blue-400" : "text-red-400"}`}>
                    {p.profit >= 0 ? "+" : ""}{p.profit_pct.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <button key={h.ticker} onClick={() => setSelectedHolding(h)} className="w-full text-left">
                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 flex justify-between items-center hover:border-gray-500 transition-all active:scale-[0.98]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{h.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[h.exchange] ?? "bg-gray-600 text-gray-300"}`}>
                        {h.exchange}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {h.quantity}주 · 평단 {h.avg_price.toLocaleString()}원
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
              </button>
            ))}
          </div>
        )}
      </div>
    </main>

    {selectedHolding && (
      <HoldingDetailModal
        holding={selectedHolding}
        totalAssets={portfolio.total_assets}
        onClose={() => setSelectedHolding(null)}
      />
    )}
    </>
  );
}
