"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, CartesianGrid,
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
  pre_price?: number | null;
  after_price?: number | null;
}

interface ChartPoint {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

// 캔들스틱 렌더링용
interface CandleBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  isUp: boolean;
  bodyRange: [number, number];
  wickRange: [number, number];
  bodyLow: number;
  bodyHigh: number;
}

interface MarketStatusInfo {
  is_open: boolean;
  status: "open" | "closed" | "pre" | "after";
  session: "regular" | "pre" | "after" | "closed";
  message: string;
  open_time: string;
  close_time: string;
}

interface PortfolioInfo {
  cash: number;
  holdings: { ticker: string; quantity: number }[];
}

interface OrderbookEntry { price: number; quantity: number; }
interface Orderbook {
  current_price: number;
  asks: OrderbookEntry[];
  bids: OrderbookEntry[];
}

interface DividendInfo {
  dividend_yield: number | null;
  annual_dividend: number | null;
  currency: string;
  dividends: { date: string; amount: number }[];
  splits: { date: string; ratio: string }[];
}

type TradeType = "BUY" | "SELL";
type ChartType = "line" | "candle";

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

// ── 캔들차트 커스텀 Shape ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CandleShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload || width <= 0) return null;

  const { isUp, open, close, high, low } = payload;
  const color = isUp ? "#f87171" : "#60a5fa";

  // recharts가 넘겨주는 y, height는 bodyRange 기준
  const bodyX = x + width * 0.15;
  const bodyW = width * 0.7;
  const bodyY = Math.min(y, y + height);
  const bodyH = Math.abs(height) || 1;

  // 심지: high/low를 픽셀로 직접 계산 필요 → yAxis domain 사용
  // props에서 yAxis 정보 꺼내기
  const { yAxisMap } = props;
  let wickTop = bodyY;
  let wickBottom = bodyY + bodyH;

  if (yAxisMap) {
    const yAxis = Object.values(yAxisMap as Record<string, { scale: (v: number) => number }>)[0];
    if (yAxis?.scale) {
      wickTop = yAxis.scale(high);
      wickBottom = yAxis.scale(low);
    }
  }

  return (
    <g>
      {/* 심지 */}
      <line
        x1={bodyX + bodyW / 2} y1={wickTop}
        x2={bodyX + bodyW / 2} y2={wickBottom}
        stroke={color} strokeWidth={1}
      />
      {/* 몸통 */}
      <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} fill={color} rx={1} />
    </g>
  );
}

export default function StockDetailPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const router = useRouter();
  const [stock, setStock] = useState<StockInfo | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [period, setPeriod] = useState("1mo");
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [usdKrw, setUsdKrw] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  // 거래 패널 상태
  const [showTrade, setShowTrade] = useState(false);
  const [tradeType, setTradeType] = useState<TradeType>("BUY");
  const [quantity, setQuantity] = useState(1);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [myInfo, setMyInfo] = useState<PortfolioInfo | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatusInfo | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 추가 패널
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [orderbookLoading, setOrderbookLoading] = useState(false);
  const [dividendInfo, setDividendInfo] = useState<DividendInfo | null>(null);
  const [showOrderbook, setShowOrderbook] = useState(false);
  const [showDividend, setShowDividend] = useState(false);

  const isUS = stock?.market === "US";
  const isTradeAllowed = marketStatus?.is_open ?? false;
  const heldQty = myInfo?.holdings.find(h => h.ticker === ticker)?.quantity ?? 0;

  const session = marketStatus?.session ?? "regular";
  const sessionPriceUsd = isUS && stock
    ? (session === "pre" && stock.pre_price ? stock.pre_price
      : session === "after" && stock.after_price ? stock.after_price
      : stock.price)
    : stock?.price ?? 0;
  const sessionLabel = session === "pre" ? "프리마켓" : session === "after" ? "애프터마켓" : "현재가";
  const priceKrw = stock ? (isUS && usdKrw ? (sessionPriceUsd ?? stock.price) * usdKrw : stock.price) : 0;

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

  const fetchOrderbook = useCallback(async () => {
    setOrderbookLoading(true);
    try {
      const res = await api.get(`/stock/orderbook/${ticker}`);
      setOrderbook(res.data);
    } catch {}
    setOrderbookLoading(false);
  }, [ticker]);

  const fetchDividend = useCallback(async () => {
    try {
      const res = await api.get(`/stock/dividends/${ticker}`);
      setDividendInfo(res.data);
    } catch {}
  }, [ticker]);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 가격만 갱신 (15초 폴링용)
  const fetchPrice = useCallback(async () => {
    try {
      const [stockRes, statusRes] = await Promise.all([
        api.get(`/stock/price/${ticker}`),
        api.get("/stock/market-status?market=ALL").catch(() => ({ data: null })),
      ]);
      setStock(stockRes.data);
      setLastUpdated(new Date());
      if (statusRes.data) {
        const mkt = stockRes.data.market === "KR" ? statusRes.data.KR : statusRes.data.US;
        setMarketStatus(mkt);
      }
    } catch {}
  }, [ticker]);

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
    }).then(() => setLastUpdated(new Date())).finally(() => setLoading(false));

    fetchChart("1mo");
    fetchMyInfo();
    fetchDividend();

    // 15초마다 가격 자동 갱신
    const priceInterval = setInterval(fetchPrice, 15_000);
    return () => clearInterval(priceInterval);
  }, [ticker, router, fetchChart, fetchMyInfo, fetchDividend, fetchPrice]);

  // 호가창 열 때만 로드 + 10초마다 갱신
  useEffect(() => {
    if (!showOrderbook) return;
    fetchOrderbook();
    const id = setInterval(fetchOrderbook, 10_000);
    return () => clearInterval(id);
  }, [showOrderbook, fetchOrderbook]);

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

  const showToast = useCallback((message: string, type: "success" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const handleTrade = async () => {
    if (!stock) return;
    setTradeLoading(true);
    try {
      const endpoint = tradeType === "BUY" ? "/trade/buy" : "/trade/sell";
      const res = await api.post(endpoint, { ticker: stock.ticker, quantity, market: stock.market });
      const portfolioRes = await api.get("/portfolio/me");
      setMyInfo(portfolioRes.data);
      setQuantity(1);
      showToast(res.data.message, "success");
    } catch (e: any) {
      showToast(e.response?.data?.detail || "거래 실패", "error");
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

  // 캔들 데이터 변환
  const candleData: CandleBar[] = chart
    .filter(c => c.open != null && c.high != null && c.low != null)
    .map(c => {
      const open = c.open!;
      const close = c.close;
      const high = c.high!;
      const low = c.low!;
      const up = close >= open;
      return {
        date: c.date,
        open, close, high, low,
        volume: c.volume ?? 0,
        isUp: up,
        bodyLow: Math.min(open, close),
        bodyHigh: Math.max(open, close),
        bodyRange: [Math.min(open, close), Math.max(open, close)],
        wickRange: [low, high],
      };
    });

  const hasCandleData = candleData.length > 0;
  const chartData = chartType === "candle" && hasCandleData ? candleData : chart;

  const closes = chart.map(c => c.close);
  const chartHigh = closes.length ? Math.max(...closes) : null;
  const chartLow = closes.length ? Math.min(...closes) : null;
  const basePrice = chart.length > 0 ? chart[0].close : null;
  const lineColor = chart.length >= 2
    ? (chart[chart.length - 1].close >= chart[0].close ? "#f87171" : "#60a5fa")
    : "#9ca3af";

  // 호가창 최대 거래량 (배율 계산용)
  const maxQty = orderbook
    ? Math.max(...orderbook.asks.map(a => a.quantity), ...orderbook.bids.map(b => b.quantity), 1)
    : 1;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 z-[100] -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl border ${
            toast.type === "success" ? "bg-green-500/90 text-white border-green-400/50" : "bg-red-500/90 text-white border-red-400/50"
          }`}
          style={{ animation: "fadeInDown 0.2s ease-out", maxWidth: "90vw", textAlign: "center" }}
        >
          {toast.type === "success" ? "✅ " : "❌ "}{toast.message}
        </div>
      )}

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
              <span className={`w-2 h-2 rounded-full ${
                session === "pre" ? "bg-yellow-400 animate-pulse"
                : session === "after" ? "bg-purple-400 animate-pulse"
                : marketStatus.is_open ? "bg-green-400 animate-pulse" : "bg-gray-600"
              }`} />
            )}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">{stock.ticker}</span>
            {lastUpdated && (
              <span className="text-xs text-gray-600">
                · {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 기준
              </span>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold text-white">
                  {isUS ? `$${stock.price.toFixed(2)}` : `${stock.price.toLocaleString()}원`}
                </div>
                {isUS && session !== "regular" && (
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${
                    session === "pre" ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"
                  }`}>
                    {session === "pre" ? "🌅 프리" : "🌙 애프터"}
                  </span>
                )}
              </div>
              {isUS && priceKrwDisplay && (
                <div className="text-sm text-gray-400 mt-0.5">
                  ≈ {priceKrwDisplay.toLocaleString()}원
                  <span className="text-gray-600 ml-1">(₩{usdKrw?.toLocaleString()})</span>
                </div>
              )}
              {isUS && session !== "regular" && sessionPriceUsd && sessionPriceUsd !== stock.price && (
                <div className={`text-sm font-semibold mt-0.5 ${
                  session === "pre" ? "text-yellow-400" : "text-purple-400"
                }`}>
                  {sessionLabel} ${sessionPriceUsd.toFixed(2)}
                  {usdKrw && <span className="text-xs text-gray-500 ml-1">≈ {(sessionPriceUsd * usdKrw).toLocaleString()}원</span>}
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

          {/* 배당 요약 */}
          {dividendInfo?.dividend_yield && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5 ml-2">
              <span className="text-xs text-green-400 font-semibold">
                💰 배당 {dividendInfo.dividend_yield}%
              </span>
            </div>
          )}
        </div>

        {/* 차트 */}
        <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => handlePeriod(p.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    period === p.value ? "bg-yellow-400 text-gray-900" : "text-gray-400 hover:text-gray-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* 라인/캔들 토글 */}
            <div className="flex gap-1 bg-gray-700 p-0.5 rounded-lg">
              <button onClick={() => setChartType("line")}
                className={`px-2 py-1 rounded text-xs font-semibold transition-all ${chartType === "line" ? "bg-gray-500 text-white" : "text-gray-400"}`}>
                라인
              </button>
              <button onClick={() => setChartType("candle")}
                className={`px-2 py-1 rounded text-xs font-semibold transition-all ${chartType === "candle" ? "bg-gray-500 text-white" : "text-gray-400"}`}>
                캔들
              </button>
            </div>
          </div>

          {chartLoading ? (
            <div className="h-52 flex items-center justify-center">
              <div className="text-gray-600 text-sm animate-pulse">차트 로딩 중...</div>
            </div>
          ) : chart.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-600 text-sm">
              차트 데이터가 없어요
            </div>
          ) : chartType === "candle" && hasCandleData ? (
            /* ── 캔들차트 + 거래량 ── */
            <div className="space-y-1">
              {/* 가격 차트 */}
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={candleData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={false} tickLine={false} axisLine={false} height={0} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false}
                      axisLine={false} width={55}
                      tickFormatter={(v) => isUS ? `$${v}` : `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8, fontSize: 11 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as CandleBar;
                        const fmt = (v: number) => isUS ? `$${v.toFixed(2)}` : `${v.toLocaleString()}원`;
                        const vol = d.volume >= 1_000_000
                          ? `${(d.volume / 1_000_000).toFixed(1)}M`
                          : d.volume >= 1_000 ? `${(d.volume / 1_000).toFixed(0)}K`
                          : `${d.volume}`;
                        return (
                          <div className="bg-gray-800 border border-gray-600 rounded-xl p-3 text-xs space-y-1">
                            <div className="text-gray-400">{d.date}</div>
                            <div className="flex gap-3">
                              <div><span className="text-gray-500">시 </span><span className="text-white">{fmt(d.open)}</span></div>
                              <div><span className="text-gray-500">고 </span><span className="text-red-400">{fmt(d.high)}</span></div>
                            </div>
                            <div className="flex gap-3">
                              <div><span className="text-gray-500">저 </span><span className="text-blue-400">{fmt(d.low)}</span></div>
                              <div><span className="text-gray-500">종 </span><span className={d.isUp ? "text-red-400" : "text-blue-400"}>{fmt(d.close)}</span></div>
                            </div>
                            <div className="text-gray-500 pt-0.5 border-t border-gray-700">거래량 {vol}</div>
                          </div>
                        );
                      }}
                    />
                    {basePrice && <ReferenceLine y={basePrice} stroke="#374151" strokeDasharray="3 3" />}
                    <Bar dataKey="wickRange" shape={<CandleShape />} isAnimationActive={false}>
                      {candleData.map((d, i) => (
                        <Cell key={i} fill={d.isUp ? "#f87171" : "#60a5fa"} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {/* 거래량 바 */}
              <div className="h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={candleData} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 9 }} tickLine={false} axisLine={false}
                      interval="preserveStartEnd" tickFormatter={(v) => v.slice(5)} height={14} />
                    <YAxis hide domain={[0, "auto"]} />
                    <Bar dataKey="volume" isAnimationActive={false} radius={[1, 1, 0, 0]}>
                      {candleData.map((d, i) => (
                        <Cell key={i} fill={d.isUp ? "rgba(248,113,113,0.5)" : "rgba(96,165,250,0.5)"} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            /* ── 라인차트 + 거래량 ── */
            <div className="space-y-1">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={false} tickLine={false} axisLine={false} height={0} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false}
                      axisLine={false} width={55}
                      tickFormatter={(v) => isUS ? `$${v}` : `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: "#1f2937", border: "none", borderRadius: 8, fontSize: 11 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as ChartPoint;
                        const fmt = (v: number) => isUS ? `$${v.toFixed(2)}` : `${v.toLocaleString()}원`;
                        const vol = (d.volume ?? 0) >= 1_000_000
                          ? `${((d.volume ?? 0) / 1_000_000).toFixed(1)}M`
                          : (d.volume ?? 0) >= 1_000 ? `${((d.volume ?? 0) / 1_000).toFixed(0)}K`
                          : `${d.volume ?? 0}`;
                        return (
                          <div className="bg-gray-800 border border-gray-600 rounded-xl p-3 text-xs space-y-1">
                            <div className="text-gray-400">{d.date}</div>
                            <div><span className="text-gray-500">종가 </span><span className="text-white">{fmt(d.close)}</span></div>
                            <div className="text-gray-500">거래량 {vol}</div>
                          </div>
                        );
                      }}
                    />
                    {basePrice && <ReferenceLine y={basePrice} stroke="#374151" strokeDasharray="3 3" />}
                    <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} dot={false}
                      activeDot={{ r: 4, fill: lineColor }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {/* 거래량 바 */}
              <div className="h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 9 }} tickLine={false} axisLine={false}
                      interval="preserveStartEnd" tickFormatter={(v) => v.slice(5)} height={14} />
                    <YAxis hide domain={[0, "auto"]} />
                    <Bar dataKey="volume" fill={`${lineColor}55`} isAnimationActive={false} radius={[1, 1, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

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
        </div>

        {/* ── 호가창 ── */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
          <button
            className="w-full px-4 py-3 flex justify-between items-center"
            onClick={() => setShowOrderbook(v => !v)}
          >
            <span className="text-sm font-semibold text-white">📊 호가창</span>
            <span className="text-gray-500 text-xs">{showOrderbook ? "▲ 접기" : "▼ 펼치기"}</span>
          </button>

          {showOrderbook && (
            <div className="px-4 pb-4">
              {orderbookLoading && !orderbook ? (
                <div className="text-center text-gray-600 text-xs py-4">호가 로딩 중...</div>
              ) : orderbook ? (
                <div className="space-y-0.5">
                  {/* 매도 호가 (역순 — 위로 갈수록 높은 가격) */}
                  {[...orderbook.asks].reverse().map((ask, i) => (
                    <div key={`ask-${i}`} className="flex items-center gap-2 h-7 relative">
                      <div className="w-24 text-right text-xs font-medium text-blue-400">
                        {isUS ? `$${ask.price.toFixed(2)}` : ask.price.toLocaleString()}
                      </div>
                      <div className="flex-1 relative h-5 flex items-center">
                        <div
                          className="absolute right-0 h-4 bg-blue-500/20 rounded-sm"
                          style={{ width: `${(ask.quantity / maxQty) * 100}%` }}
                        />
                        <span className="relative z-10 text-xs text-gray-400 ml-auto pr-1">
                          {ask.quantity.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* 현재가 구분선 */}
                  <div className="flex items-center gap-2 py-1.5 border-y border-yellow-500/30">
                    <div className="w-24 text-right">
                      <span className={`text-sm font-bold ${isUp ? "text-red-400" : "text-blue-400"}`}>
                        {isUS ? `$${orderbook.current_price.toFixed(2)}` : orderbook.current_price.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-yellow-400 font-medium">현재가</span>
                  </div>

                  {/* 매수 호가 */}
                  {orderbook.bids.map((bid, i) => (
                    <div key={`bid-${i}`} className="flex items-center gap-2 h-7 relative">
                      <div className="w-24 text-right text-xs font-medium text-red-400">
                        {isUS ? `$${bid.price.toFixed(2)}` : bid.price.toLocaleString()}
                      </div>
                      <div className="flex-1 relative h-5 flex items-center">
                        <div
                          className="absolute left-0 h-4 bg-red-500/20 rounded-sm"
                          style={{ width: `${(bid.quantity / maxQty) * 100}%` }}
                        />
                        <span className="relative z-10 text-xs text-gray-400 pl-1">
                          {bid.quantity.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="text-xs text-gray-600 text-center pt-2">* 시뮬레이션 호가 (10초 갱신)</div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* ── 배당/스플릿 ── */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
          <button
            className="w-full px-4 py-3 flex justify-between items-center"
            onClick={() => setShowDividend(v => !v)}
          >
            <span className="text-sm font-semibold text-white">
              💰 배당 & 스플릿
              {dividendInfo?.dividend_yield && (
                <span className="ml-2 text-xs text-green-400 font-normal">
                  연 {dividendInfo.dividend_yield}%
                </span>
              )}
            </span>
            <span className="text-gray-500 text-xs">{showDividend ? "▲ 접기" : "▼ 펼치기"}</span>
          </button>

          {showDividend && dividendInfo && (
            <div className="px-4 pb-4 space-y-3">
              {/* 요약 */}
              {(dividendInfo.dividend_yield || dividendInfo.annual_dividend) && (
                <div className="flex gap-3">
                  {dividendInfo.dividend_yield && (
                    <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-400 mb-0.5">연 배당률</div>
                      <div className="text-lg font-bold text-green-400">{dividendInfo.dividend_yield}%</div>
                    </div>
                  )}
                  {dividendInfo.annual_dividend && (
                    <div className="flex-1 bg-gray-700/50 border border-gray-600 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-400 mb-0.5">연 배당금</div>
                      <div className="text-lg font-bold text-white">
                        {dividendInfo.currency === "KRW"
                          ? `${dividendInfo.annual_dividend.toLocaleString()}원`
                          : `$${dividendInfo.annual_dividend.toFixed(2)}`}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 배당 이력 */}
              {dividendInfo.dividends.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-2 font-medium">최근 배당 이력</div>
                  <div className="space-y-1.5">
                    {dividendInfo.dividends.map((d, i) => (
                      <div key={i} className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">{d.date}</span>
                        <span className="text-green-400 font-medium">
                          {dividendInfo.currency === "KRW"
                            ? `${d.amount.toLocaleString()}원`
                            : `$${d.amount.toFixed(4)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 스플릿 이력 */}
              {dividendInfo.splits.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-2 font-medium">주식 분할 이력</div>
                  <div className="space-y-1.5">
                    {dividendInfo.splits.map((s, i) => (
                      <div key={i} className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">{s.date}</span>
                        <span className="text-yellow-400 font-medium">{s.ratio} 분할</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dividendInfo.dividends.length === 0 && dividendInfo.splits.length === 0 && !dividendInfo.dividend_yield && (
                <div className="text-xs text-gray-500 text-center py-2">배당 정보가 없습니다</div>
              )}
            </div>
          )}
        </div>

        {/* 거래 버튼 */}
        <button
          onClick={() => { (document.activeElement as HTMLElement)?.blur(); setTimeout(() => { setShowTrade(true); setQuantity(1); }, 80); }}
          className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-4 rounded-2xl text-sm active:scale-95 transition-all"
        >
          💹 {stock.name} 거래하기
        </button>
      </main>

      {/* 하단 고정 거래 패널 */}
      {showTrade && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowTrade(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center" style={{ animation: "slideUp 0.25s ease-out" }}>
            <div className="w-full max-w-md bg-gray-900 border-t border-gray-700 rounded-t-3xl px-4 pt-5 pb-10 space-y-3 shadow-2xl"
              style={{ maxHeight: "85vh", overflowY: "auto" }}>
              <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />

              {/* 헤더 */}
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-white text-base">{stock.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-400">
                        {isUS ? `$${(sessionPriceUsd ?? stock.price).toFixed(2)}` : `${stock.price.toLocaleString()}원`}
                        {isUS && session !== "regular" && (
                          <span className={`ml-1 text-xs px-1.5 py-0.5 rounded font-semibold ${
                            session === "pre" ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"
                          }`}>{sessionLabel}</span>
                        )}
                      </span>
                      {isUS && session !== "regular" && stock.price !== (sessionPriceUsd ?? stock.price) && (
                        <span className="text-xs text-gray-600">정규장 ${stock.price.toFixed(2)}</span>
                      )}
                    </div>
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
                      session === "pre" ? "bg-yellow-500/20 text-yellow-400"
                      : session === "after" ? "bg-purple-500/20 text-purple-400"
                      : marketStatus.is_open ? "bg-green-500/20 text-green-400"
                      : "bg-gray-700 text-gray-400"
                    }`}>
                      {session === "pre" ? "● 프리마켓"
                        : session === "after" ? "● 애프터마켓"
                        : marketStatus.is_open ? "● 거래 가능"
                        : "● 마감"}
                    </div>
                  )}
                  <button onClick={() => setShowTrade(false)} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
                </div>
              </div>

              {marketStatus && !marketStatus.is_open && (
                <div className="bg-gray-700/50 rounded-xl px-4 py-2.5 text-xs text-gray-400 text-center">
                  {marketStatus.message}
                  <span className="text-gray-500 ml-1">개장: {marketStatus.open_time} ~ {marketStatus.close_time}</span>
                </div>
              )}

              {/* 매수/매도 탭 */}
              <div className="flex gap-2">
                <button onClick={() => { setTradeType("BUY"); setQuantity(1); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tradeType === "BUY" ? "bg-red-500 text-white" : "bg-gray-700 text-gray-400"}`}>
                  매수
                </button>
                <button onClick={() => { setTradeType("SELL"); setQuantity(1); }}
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
                    {isUS ? `$${((sessionPriceUsd ?? stock.price) * quantity).toFixed(2)}` : `${(stock.price * quantity).toLocaleString()}원`}
                  </span>
                </div>
                {isUS && usdKrw && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-xs">{sessionLabel} 원화 환산</span>
                    <span className="text-gray-300 text-sm font-semibold">≈ {((sessionPriceUsd ?? stock.price) * usdKrw * quantity).toLocaleString()}원</span>
                  </div>
                )}
                {myInfo && (
                  <div className="flex justify-between items-center pt-1 border-t border-gray-600/50">
                    <span className="text-gray-500 text-xs">보유 현금</span>
                    <span className="text-gray-400 text-xs">{myInfo.cash.toLocaleString()}원</span>
                  </div>
                )}
              </div>

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
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeInDown {
          from { transform: translate(-50%, -16px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
