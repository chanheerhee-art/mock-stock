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

interface MarketStatusInfo {
  is_open: boolean;
  status: "open" | "closed" | "pre" | "after";
  message: string;
  open_time: string;
  close_time: string;
}

interface PortfolioInfo {
  cash: number;
  holdings: { ticker: string; quantity: number }[];
}

type TradeType = "BUY" | "SELL";

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

  // 거래 패널 상태
  const [showTrade, setShowTrade] = useState(false);
  const [tradeType, setTradeType] = useState<TradeType>("BUY");
  const [quantity, setQuantity] = useState(1);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeMessage, setTradeMessage] = useState("");
  const [tradeMessageType, setTradeMessageType] = useState<"success" | "error">("success");
  const [myInfo, setMyInfo] = useState<PortfolioInfo | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatusInfo | null>(null);

  const isUS = stock?.market === "US";
  const isTradeAllowed = marketStatus?.is_open ?? false;
  const heldQty = myInfo?.holdings.find(h => h.ticker === ticker)?.quantity ?? 0;
  const priceKrw = stock ? (isUS && usdKrw ? stock.price * usdKrw : stock.price) : 0;

  const fetchChart = useCallback(async (p: string) => {
    setChartLoading(true);
    try {
      const res = await api.get(`/stock/chart/${ticker}?period=${p}`);
      setChart(res.data);
    } catch {}
    setChartLoading(false);
  }, [ticker]);

  const fetchMyInfo = useCallback(async () => {
    try {
      const res = await api.get("/portfolio/me");
      setMyInfo(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    Promise.all([
      api.get(`/stock/price/${ticker}`),
      api.get("/stock/exchange-rate").catch(() => ({ data: { usd_krw: null } })),
      api.get("/stock/market-status?market=ALL").catch(() => ({ data: null })),
    ]).then(([stockRes, rateRes, statusRes]) => {
      setStock(stockRes.data);
      setUsdKrw(rateRes.data.usd_krw);
      if (statusRes.data) {
        const mkt = stockRes.data.market === "KR" ? statusRes.data.KR : statusRes.data.US;
        setMarketStatus(mkt);
      }
    }).finally(() => setLoading(false));

    fetchChart("1mo");
    fetchMyInfo();
  }, [ticker, router, fetchChart, fetchMyInfo]);

  const handlePeriod = (p: string) => {
    setPeriod(p);
    fetchChart(p);
  };

  const handleQuickQty = (type: "all" | "half" | "third") => {
    if (!myInfo || !stock) return;
    if (tradeType === "BUY") {
      const maxQty = Math.floor(myInfo.cash / priceKrw);
      if (type === "all") setQuantity(Math.max(1, maxQty));
      else if (type === "half") setQuantity(Math.max(1, Math.floor(maxQty / 2)));
      else setQuantity(Math.max(1, Math.floor(maxQty / 3)));
    } else {
      if (type === "all") setQuantity(Math.max(1, heldQty));
      else if (type === "half") setQuantity(Math.max(1, Math.floor(heldQty / 2)));
      else setQuantity(Math.max(1, Math.floor(heldQty / 3)));
    }
  };

  const handleTrade = async () => {
    if (!stock) return;
    setTradeLoading(true); setTradeMessage("");
    try {
      const endpoint = tradeType === "BUY" ? "/trade/buy" : "/trade/sell";
      const res = await api.post(endpoint, { ticker: stock.ticker, quantity, market: stock.market });
      setTradeMessage(res.data.message);
      setTradeMessageType("success");
      fetchMyInfo();
    } catch (e: any) {
      setTradeMessage(e.response?.data?.detail || "거래 실패");
      setTradeMessageType("error");
    } finally { setTradeLoading(false); }
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
  const priceKrwDisplay = isUS && usdKrw ? stock.price * usdKrw : null;

  const basePrice = chart.length > 0 ? chart[0].close : null;
  const chartColor = chart.length >= 2
    ? (chart[chart.length - 1].close >= chart[0].close ? "#f87171" : "#60a5fa")
    : "#9ca3af";

  const closes = chart.map(c => c.close);
  const chartHigh = closes.length ? Math.max(...closes) : null;
  const chartLow = closes.length ? Math.min(...closes) : null;

  return (
    <>
      <main
        className="max-w-md mx-auto px-4 py-6 space-y-5"
        style={{ background: "#0f0f0f", minHeight: "100vh", paddingBottom: showTrade ? "420px" : "24px" }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-gray-400 text-sm hover:text-white">← 뒤로</button>
          <Link href="/dashboard" className="text-gray-500 text-xs hover:text-gray-300">홈</Link>
        </div>

        {/* 종목 정보 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white">{stock.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[stock.exchange] ?? "bg-gray-600 text-gray-300"}`}>
              {stock.exchange}
            </span>
            {marketStatus && (
              <span className={`w-2 h-2 rounded-full ${marketStatus.is_open ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
            )}
          </div>
          <div className="text-xs text-gray-500 mb-3">{stock.ticker}</div>

          <div className="flex items-end gap-3">
            <div>
              <div className="text-3xl font-bold text-white">
                {isUS ? `$${stock.price.toFixed(2)}` : `${stock.price.toLocaleString()}원`}
              </div>
              {isUS && priceKrwDisplay && (
                <div className="text-sm text-gray-400 mt-0.5">
                  ≈ {priceKrwDisplay.toLocaleString()}원
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

          {/* 보유 현황 */}
          {heldQty > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-3 py-1.5">
              <span className="text-xs text-yellow-400 font-semibold">보유 {heldQty}주</span>
              <span className="text-xs text-gray-500">≈ {(priceKrw * heldQty).toLocaleString()}원</span>
            </div>
          )}
        </div>

        {/* 차트 */}
        <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
          <div className="flex gap-1 mb-4">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriod(p.value)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === p.value ? "bg-yellow-400 text-gray-900" : "text-gray-400 hover:text-gray-300"
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
                      tickFormatter={(v) => v.slice(5)}
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

        {/* 거래 버튼 */}
        <button
          onClick={() => { setShowTrade(true); setTradeMessage(""); setQuantity(1); }}
          className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-4 rounded-2xl text-sm active:scale-95 transition-all"
        >
          💹 {stock.name} 거래하기
        </button>
      </main>

      {/* 하단 고정 거래 패널 */}
      {showTrade && (
        <>
          {/* 배경 딤 */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowTrade(false)}
          />
          {/* Bottom Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 flex justify-center"
            style={{ animation: "slideUp 0.25s ease-out" }}
          >
            <div className="w-full max-w-md bg-gray-900 border-t border-gray-700 rounded-t-3xl px-4 pt-5 pb-10 space-y-3 shadow-2xl"
              style={{ maxHeight: "85vh", overflowY: "auto" }}>
              {/* 핸들 + 헤더 */}
              <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-white text-base">{stock.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm text-gray-400">
                      {isUS ? `$${stock.price.toFixed(2)}` : `${stock.price.toLocaleString()}원`}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[stock.exchange] ?? "bg-gray-600 text-gray-300"}`}>
                      {stock.exchange}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {heldQty > 0 && (
                    <div className="text-right">
                      <div className="text-xs text-gray-500">보유</div>
                      <div className="text-sm font-semibold text-white">{heldQty}주</div>
                    </div>
                  )}
                  {marketStatus && (
                    <div className={`text-xs font-medium px-2 py-0.5 rounded-lg ${
                      marketStatus.is_open ? "bg-green-500/20 text-green-400"
                      : marketStatus.status === "pre" ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-gray-700 text-gray-400"
                    }`}>
                      {marketStatus.is_open ? "● 거래 가능" : marketStatus.status === "pre" ? "● 장전" : "● 마감"}
                    </div>
                  )}
                  <button onClick={() => setShowTrade(false)} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
                </div>
              </div>

              {/* 장 마감 안내 */}
              {marketStatus && !marketStatus.is_open && (
                <div className="bg-gray-700/50 rounded-xl px-4 py-2.5 text-xs text-gray-400 text-center">
                  {marketStatus.message}
                  <span className="text-gray-500 ml-1">개장: {marketStatus.open_time} ~ {marketStatus.close_time}</span>
                </div>
              )}

              {/* 매수/매도 탭 */}
              <div className="flex gap-2">
                <button onClick={() => { setTradeType("BUY"); setQuantity(1); setTradeMessage(""); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tradeType === "BUY" ? "bg-red-500 text-white" : "bg-gray-700 text-gray-400"}`}>
                  매수
                </button>
                <button onClick={() => { setTradeType("SELL"); setQuantity(1); setTradeMessage(""); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tradeType === "SELL" ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"}`}>
                  매도
                </button>
              </div>

              {/* 빠른 수량 */}
              <div className="flex gap-2">
                {[{ label: "1/3", type: "third" as const }, { label: "1/2", type: "half" as const }, { label: "전량", type: "all" as const }].map((btn) => (
                  <button key={btn.type} onClick={() => handleQuickQty(btn.type)} disabled={!isTradeAllowed}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-40">
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* 수량 */}
              <div className="flex items-center gap-3">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={!isTradeAllowed}
                  className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl transition-colors disabled:opacity-40">−</button>
                <input type="number" min={1} value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={!isTradeAllowed}
                  className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-center font-bold outline-none text-lg disabled:opacity-40" />
                <button onClick={() => setQuantity(quantity + 1)} disabled={!isTradeAllowed}
                  className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl transition-colors disabled:opacity-40">+</button>
              </div>

              {/* 금액 요약 */}
              <div className="bg-gray-700/50 rounded-xl px-4 py-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">예상 금액</span>
                  <span className="text-white font-bold">
                    {isUS ? `$${(stock.price * quantity).toFixed(2)}` : `${(stock.price * quantity).toLocaleString()}원`}
                  </span>
                </div>
                {isUS && usdKrw && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-xs">원화 환산 (₩{usdKrw.toLocaleString()})</span>
                    <span className="text-gray-300 text-sm font-semibold">≈ {(stock.price * usdKrw * quantity).toLocaleString()}원</span>
                  </div>
                )}
                {myInfo && (
                  <div className="flex justify-between items-center pt-1 border-t border-gray-600/50">
                    <span className="text-gray-500 text-xs">보유 현금</span>
                    <span className="text-gray-400 text-xs">{myInfo.cash.toLocaleString()}원</span>
                  </div>
                )}
              </div>

              {/* 메시지 */}
              {tradeMessage && (
                <div className={`text-sm text-center py-2.5 rounded-xl font-medium ${
                  tradeMessageType === "success" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}>{tradeMessage}</div>
              )}

              {/* 거래 버튼 */}
              <button onClick={handleTrade} disabled={tradeLoading || !isTradeAllowed}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                  !isTradeAllowed ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : tradeType === "BUY" ? "bg-red-500 hover:bg-red-400 text-white"
                  : "bg-blue-500 hover:bg-blue-400 text-white"
                } disabled:opacity-60`}>
                {tradeLoading ? "처리 중..." : !isTradeAllowed ? "장 마감 (거래 불가)" : `${tradeType === "BUY" ? "매수" : "매도"} 확인`}
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
