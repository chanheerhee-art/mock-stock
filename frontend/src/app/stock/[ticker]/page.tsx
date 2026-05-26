"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import api from "@/lib/api";

interface StockInfo {
  ticker: string;
  name: string;
  price: number;
  change: number;
  change_pct: number;
  market: string;
  exchange: string;
}

interface ChartPoint {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
}

const PERIODS = [
  { label: "1주", value: "1wk" },
  { label: "1달", value: "1mo" },
  { label: "3달", value: "3mo" },
  { label: "6달", value: "6mo" },
  { label: "1년", value: "1y" },
];

const EXCHANGE_BADGE: Record<string, string> = {
  KOSPI: "bg-blue-500/20 text-blue-400",
  KOSDAQ: "bg-green-500/20 text-green-400",
  NasdaqGS: "bg-purple-500/20 text-purple-400",
  NasdaqGM: "bg-purple-500/20 text-purple-400",
  NYSE: "bg-orange-500/20 text-orange-400",
  ETF: "bg-yellow-500/20 text-yellow-400",
};

export default function StockDetailPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const router = useRouter();
  const [stock, setStock] = useState<StockInfo | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [period, setPeriod] = useState("1mo");
  const [usdKrw, setUsdKrw] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  const fetchChart = useCallback(async (p: string) => {
    setChartLoading(true);
    try {
      const res = await api.get(`/stock/chart/${ticker}?period=${p}`);
      setChart(res.data);
    } catch {}
    setChartLoading(false);
  }, [ticker]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    Promise.all([
      api.get(`/stock/price/${ticker}`),
      api.get("/stock/exchange-rate").catch(() => ({ data: { usd_krw: null } })),
    ]).then(([stockRes, rateRes]) => {
      setStock(stockRes.data);
      setUsdKrw(rateRes.data.usd_krw);
    }).finally(() => setLoading(false));

    fetchChart("1mo");
  }, [ticker, router, fetchChart]);

  const handlePeriod = (p: string) => {
    setPeriod(p);
    fetchChart(p);
  };

  if (loading) return (
    <main className="flex items-center justify-center min-h-screen" style={{ background: "#0f0f0f" }}>
      <div className="text-4xl animate-bounce">📊</div>
    </main>
  );

  if (!stock) return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: "#0f0f0f" }}>
      <p className="text-gray-400">종목을 찾을 수 없어요</p>
      <Link href="/dashboard" className="text-yellow-400 text-sm">← 홈으로</Link>
    </main>
  );

  const isUp = stock.change_pct >= 0;
  const isUS = stock.market === "US";
  const priceKrw = isUS && usdKrw ? stock.price * usdKrw : null;

  // 차트 기준선 (첫 번째 종가)
  const basePrice = chart.length > 0 ? chart[0].close : null;
  const chartColor = chart.length >= 2
    ? (chart[chart.length - 1].close >= chart[0].close ? "#f87171" : "#60a5fa")
    : "#9ca3af";

  // 차트 최고/최저
  const closes = chart.map(c => c.close);
  const chartHigh = closes.length ? Math.max(...closes) : null;
  const chartLow = closes.length ? Math.min(...closes) : null;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-5" style={{ background: "#0f0f0f", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-gray-400 text-sm hover:text-white">← 뒤로</button>
        <Link
          href="/trade"
          className="bg-yellow-400 text-gray-900 px-4 py-1.5 rounded-xl text-sm font-bold hover:bg-yellow-300 transition-colors"
        >
          거래하기
        </Link>
      </div>

      {/* 종목 정보 */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-bold text-white">{stock.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[stock.exchange] ?? "bg-gray-600 text-gray-300"}`}>
            {stock.exchange}
          </span>
        </div>
        <div className="text-xs text-gray-500 mb-3">{stock.ticker}</div>

        <div className="flex items-end gap-3">
          <div>
            <div className="text-3xl font-bold text-white">
              {isUS ? `$${stock.price.toFixed(2)}` : `${stock.price.toLocaleString()}원`}
            </div>
            {isUS && priceKrw && (
              <div className="text-sm text-gray-400 mt-0.5">
                ≈ {priceKrw.toLocaleString()}원
                <span className="text-gray-600 ml-1">(₩{usdKrw?.toLocaleString()})</span>
              </div>
            )}
          </div>
          <div className={`text-base font-bold mb-1 ${isUp ? "text-red-400" : "text-blue-400"}`}>
            {isUp ? "▲" : "▼"} {Math.abs(stock.change_pct).toFixed(2)}%
            <span className="text-sm ml-1 font-normal">
              ({isUS ? `$${Math.abs(stock.change).toFixed(2)}` : `${Math.abs(stock.change).toLocaleString()}원`})
            </span>
          </div>
        </div>
      </div>

      {/* 차트 */}
      <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
        {/* 기간 선택 */}
        <div className="flex gap-1 mb-4">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriod(p.value)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === p.value
                  ? "bg-yellow-400 text-gray-900"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {chartLoading ? (
          <div className="h-44 flex items-center justify-center">
            <div className="text-gray-600 text-sm animate-pulse">차트 로딩 중...</div>
          </div>
        ) : chart.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-gray-600 text-sm">
            차트 데이터가 없어요
          </div>
        ) : (
          <>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tickFormatter={(v) => v.slice(5)} // MM-DD 만
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={55}
                    tickFormatter={(v) => isUS ? `$${v}` : `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8, fontSize: 11 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [isUS ? `$${Number(v).toFixed(2)}` : `${Number(v).toLocaleString()}원`, "종가"]}
                    labelStyle={{ color: "#9ca3af" }}
                  />
                  {basePrice && (
                    <ReferenceLine y={basePrice} stroke="#374151" strokeDasharray="3 3" />
                  )}
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke={chartColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: chartColor }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 기간 내 고/저 */}
            {chartHigh && chartLow && (
              <div className="flex justify-between mt-3 text-xs text-gray-500 border-t border-gray-700 pt-3">
                <span>기간 최저 <span className="text-blue-400 font-medium">
                  {isUS ? `$${chartLow.toFixed(2)}` : chartLow.toLocaleString()}
                </span></span>
                <span>기간 최고 <span className="text-red-400 font-medium">
                  {isUS ? `$${chartHigh.toFixed(2)}` : chartHigh.toLocaleString()}
                </span></span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 거래 바로가기 버튼 */}
      <Link href="/trade" className="block">
        <button className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-4 rounded-2xl text-sm active:scale-95 transition-all">
          💹 {stock.name} 거래하러 가기
        </button>
      </Link>
    </main>
  );
}
