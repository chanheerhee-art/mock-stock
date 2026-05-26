"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface StockInfo {
  ticker: string;
  name: string;
  price: number;
  change_pct: number;
  market: string;
  exchange: string;
}

interface PortfolioInfo {
  cash: number;
  holdings: { ticker: string; quantity: number }[];
}

interface ShortPosition {
  id: number;
  ticker: string;
  name: string;
  market: string;
  exchange: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  margin: number;
  profit: number;
  profit_pct: number;
  current_price_raw: number;
  is_us: boolean;
}

interface MarketStatusInfo {
  is_open: boolean;
  status: "open" | "closed" | "pre" | "after";
  message: string;
  open_time: string;
  close_time: string;
}

interface MarketStatus {
  KR: MarketStatusInfo;
  US: MarketStatusInfo;
}

const EXCHANGE_BADGE: Record<string, string> = {
  KOSPI: "bg-blue-500/20 text-blue-400",
  KOSDAQ: "bg-green-500/20 text-green-400",
  NASDAQ: "bg-purple-500/20 text-purple-400",
  NasdaqGS: "bg-purple-500/20 text-purple-400",
  NasdaqGM: "bg-purple-500/20 text-purple-400",
  NYSE: "bg-orange-500/20 text-orange-400",
  ETF: "bg-yellow-500/20 text-yellow-400",
};

function MarketStatusBanner({ status }: { status: MarketStatusInfo }) {
  const isOpen = status.is_open;
  const isPre = status.status === "pre";
  return (
    <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between text-xs font-medium border ${
      isOpen ? "bg-green-500/10 border-green-500/30 text-green-400"
      : isPre ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
      : "bg-gray-800 border-gray-700 text-gray-400"
    }`}>
      <span>{status.message}</span>
      <span className={`w-2 h-2 rounded-full ml-2 flex-shrink-0 ${
        isOpen ? "bg-green-400 animate-pulse" : isPre ? "bg-yellow-400" : "bg-gray-600"
      }`} />
    </div>
  );
}

// 메인 탭: 일반거래 / 공매도
type MainTab = "TRADE" | "SHORT";
// 거래 탭: 매수 / 매도
type TradeType = "BUY" | "SELL";

export default function TradePage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<MainTab>("TRADE");

  // 일반 거래 상태
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<"ALL" | "KR" | "US">("ALL");
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [popular, setPopular] = useState<StockInfo[]>([]);
  const [selected, setSelected] = useState<StockInfo | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [tradeType, setTradeType] = useState<TradeType>("BUY");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [popularLoading, setPopularLoading] = useState(true);
  const [myInfo, setMyInfo] = useState<PortfolioInfo | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [usdKrw, setUsdKrw] = useState<number | null>(null);

  // 공매도 상태
  const [shortSelected, setShortSelected] = useState<StockInfo | null>(null);
  const [shortQty, setShortQty] = useState(1);
  const [shortPositions, setShortPositions] = useState<ShortPosition[]>([]);
  const [shortLoading, setShortLoading] = useState(false);
  const [shortMessage, setShortMessage] = useState("");
  const [shortMessageType, setShortMessageType] = useState<"success" | "error">("success");
  const [shortStocks, setShortStocks] = useState<StockInfo[]>([]);
  const [shortQuery, setShortQuery] = useState("");

  const currentMarketStatus: MarketStatusInfo | null = selected
    ? (selected.market === "KR" ? marketStatus?.KR : marketStatus?.US) ?? null
    : null;
  const isTradeAllowed = currentMarketStatus?.is_open ?? false;

  const shortMarketStatus: MarketStatusInfo | null = shortSelected
    ? (shortSelected.market === "KR" ? marketStatus?.KR : marketStatus?.US) ?? null
    : null;
  const isShortAllowed = shortMarketStatus?.is_open ?? false;

  const fetchMarketStatus = useCallback(async () => {
    try {
      const res = await api.get("/stock/market-status?market=ALL");
      setMarketStatus(res.data);
    } catch {}
  }, []);

  const fetchShortPositions = useCallback(async () => {
    try {
      const res = await api.get("/short/positions");
      setShortPositions(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }
    api.get("/portfolio/me").then((res) => setMyInfo(res.data)).catch(() => {});
    api.get("/stock/exchange-rate").then((res) => setUsdKrw(res.data.usd_krw)).catch(() => {});
    fetchMarketStatus();
    fetchShortPositions();
    const interval = setInterval(fetchMarketStatus, 60_000);
    return () => clearInterval(interval);
  }, [router, fetchMarketStatus, fetchShortPositions]);

  useEffect(() => {
    setPopularLoading(true);
    api.get(`/stock/popular?market=${market}`)
      .then((res) => setPopular(res.data))
      .finally(() => setPopularLoading(false));
  }, [market]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    const res = await api.get(`/stock/search?q=${encodeURIComponent(query)}&market=${market}`);
    setStocks(res.data);
  };

  const handleShortSearch = async () => {
    if (!shortQuery.trim()) return;
    const res = await api.get(`/stock/search?q=${encodeURIComponent(shortQuery)}&market=${market}`);
    setShortStocks(res.data);
  };

  const getHeldQuantity = (ticker: string) =>
    myInfo?.holdings.find(h => h.ticker === ticker)?.quantity ?? 0;

  const handleQuickQty = (type: "all" | "half" | "third") => {
    if (!selected || !myInfo) return;
    if (tradeType === "BUY") {
      const maxQty = Math.floor(myInfo.cash / (selected.market === "US" && usdKrw ? selected.price * usdKrw : selected.price));
      if (type === "all") setQuantity(Math.max(1, maxQty));
      else if (type === "half") setQuantity(Math.max(1, Math.floor(maxQty / 2)));
      else setQuantity(Math.max(1, Math.floor(maxQty / 3)));
    } else {
      const held = getHeldQuantity(selected.ticker);
      if (type === "all") setQuantity(Math.max(1, held));
      else if (type === "half") setQuantity(Math.max(1, Math.floor(held / 2)));
      else setQuantity(Math.max(1, Math.floor(held / 3)));
    }
  };

  const handleShortQuickQty = (type: "all" | "half" | "third") => {
    if (!shortSelected || !myInfo) return;
    const price = shortSelected.market === "US" && usdKrw ? shortSelected.price * usdKrw : shortSelected.price;
    const margin = price * 0.3;
    const maxQty = Math.floor(myInfo.cash / margin);
    if (type === "all") setShortQty(Math.max(1, maxQty));
    else if (type === "half") setShortQty(Math.max(1, Math.floor(maxQty / 2)));
    else setShortQty(Math.max(1, Math.floor(maxQty / 3)));
  };

  const handleTrade = async () => {
    if (!selected) return;
    setLoading(true); setMessage("");
    try {
      const endpoint = tradeType === "BUY" ? "/trade/buy" : "/trade/sell";
      const res = await api.post(endpoint, { ticker: selected.ticker, quantity, market: selected.market });
      setMessage(res.data.message);
      setMessageType("success");
      api.get("/portfolio/me").then((res) => setMyInfo(res.data)).catch(() => {});
    } catch (e: any) {
      setMessage(e.response?.data?.detail || "거래 실패");
      setMessageType("error");
    } finally { setLoading(false); }
  };

  const handleShortOpen = async () => {
    if (!shortSelected) return;
    setShortLoading(true); setShortMessage("");
    try {
      const res = await api.post("/short/open", { ticker: shortSelected.ticker, quantity: shortQty, market: shortSelected.market });
      setShortMessage(res.data.message);
      setShortMessageType("success");
      api.get("/portfolio/me").then((res) => setMyInfo(res.data)).catch(() => {});
      fetchShortPositions();
    } catch (e: any) {
      setShortMessage(e.response?.data?.detail || "공매도 실패");
      setShortMessageType("error");
    } finally { setShortLoading(false); }
  };

  const handleShortClose = async (positionId: number) => {
    setShortLoading(true); setShortMessage("");
    try {
      const res = await api.post(`/short/close/${positionId}`);
      setShortMessage(res.data.message + ` (${res.data.profit >= 0 ? "+" : ""}${res.data.profit.toLocaleString()}원, ${res.data.profit_pct.toFixed(2)}%)`);
      setShortMessageType(res.data.profit >= 0 ? "success" : "error");
      api.get("/portfolio/me").then((res) => setMyInfo(res.data)).catch(() => {});
      fetchShortPositions();
    } catch (e: any) {
      setShortMessage(e.response?.data?.detail || "청산 실패");
      setShortMessageType("error");
    } finally { setShortLoading(false); }
  };

  const displayList = query && stocks.length > 0 ? stocks : popular;
  const shortDisplayList = shortQuery && shortStocks.length > 0 ? shortStocks : popular;
  const heldQty = selected ? getHeldQuantity(selected.ticker) : 0;

  const priceKrw = (s: StockInfo) => s.market === "US" && usdKrw ? s.price * usdKrw : s.price;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{ background: "#0f0f0f", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm hover:text-white">← 홈</Link>
        <h1 className="font-bold text-lg text-white">💹 거래하기</h1>
        {myInfo && (
          <div className="text-right">
            <div className="text-xs text-gray-500">보유 현금</div>
            <div className="text-xs font-semibold text-yellow-400">{myInfo.cash.toLocaleString()}원</div>
          </div>
        )}
      </div>

      {/* 장 상태 배너 */}
      {marketStatus && (
        <div className="space-y-1.5">
          <MarketStatusBanner status={marketStatus.KR} />
          <MarketStatusBanner status={marketStatus.US} />
        </div>
      )}

      {/* 메인 탭: 일반거래 / 공매도 */}
      <div className="flex gap-2 bg-gray-800 p-1 rounded-2xl">
        <button
          onClick={() => setMainTab("TRADE")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            mainTab === "TRADE" ? "bg-yellow-400 text-gray-900" : "text-gray-400"
          }`}
        >📈 일반 거래</button>
        <button
          onClick={() => setMainTab("SHORT")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
            mainTab === "SHORT" ? "bg-orange-500 text-white" : "text-gray-400"
          }`}
        >📉 공매도</button>
      </div>

      {/* ── 일반 거래 탭 ── */}
      {mainTab === "TRADE" && (
        <>
          {/* 시장 선택 */}
          <div className="flex gap-2">
            {(["ALL", "KR", "US"] as const).map((m) => (
              <button key={m} onClick={() => { setMarket(m); setStocks([]); setQuery(""); setSelected(null); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  market === m ? "bg-yellow-400 text-gray-900" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}>
                {m === "ALL" ? "전체" : m === "KR" ? "🇰🇷 한국" : "🇺🇸 미국"}
              </button>
            ))}
          </div>

          {/* 검색 */}
          <div className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="종목명, 티커 검색..."
              className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none placeholder-gray-500 border border-gray-700 focus:border-yellow-400 transition-colors" />
            <button onClick={handleSearch} className="bg-yellow-400 text-gray-900 px-5 rounded-xl font-bold text-sm hover:bg-yellow-300 transition-colors">검색</button>
          </div>

          {/* 종목 리스트 */}
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium">
              {query && stocks.length > 0 ? "🔍 검색 결과" : "🔥 인기 종목"}
            </p>
            {popularLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="bg-gray-800 rounded-2xl p-4 animate-pulse h-16" />)}</div>
            ) : displayList.length === 0 ? (
              <div className="bg-gray-800 rounded-2xl p-6 text-center text-gray-500 text-sm">검색 결과가 없어요</div>
            ) : (
              <div className="space-y-2">
                {displayList.map((s) => {
                  const mStatus = s.market === "KR" ? marketStatus?.KR : marketStatus?.US;
                  return (
                    <button key={s.ticker} onClick={() => { setSelected(s); setMessage(""); setQuantity(1); }}
                      className={`w-full rounded-2xl p-4 flex justify-between items-center transition-all border ${
                        selected?.ticker === s.ticker ? "bg-yellow-400/10 border-yellow-400/50" : "bg-gray-800 border-transparent hover:border-gray-600"
                      }`}>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{s.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[s.exchange] ?? "bg-gray-600 text-gray-300"}`}>{s.exchange}</span>
                          {mStatus && <span className={`w-1.5 h-1.5 rounded-full ${mStatus.is_open ? "bg-green-400" : "bg-gray-600"}`} />}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{s.ticker}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-white">
                          {s.market === "US" ? `$${s.price.toFixed(2)}` : `${s.price.toLocaleString()}원`}
                        </div>
                        {s.market === "US" && usdKrw && <div className="text-xs text-gray-500">≈ {(s.price * usdKrw).toLocaleString()}원</div>}
                        <div className={`text-xs font-semibold mt-0.5 ${s.change_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                          {s.change_pct >= 0 ? "▲" : "▼"} {Math.abs(s.change_pct).toFixed(2)}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 거래 패널 */}
          {selected && (
            <div className="bg-gray-800 rounded-2xl p-5 space-y-4 border border-gray-700">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-white">{selected.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm text-gray-400">
                      {selected.market === "US" ? `$${selected.price.toFixed(2)}` : `${selected.price.toLocaleString()}원`}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[selected.exchange] ?? "bg-gray-600 text-gray-300"}`}>{selected.exchange}</span>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  {heldQty > 0 && <div><div className="text-xs text-gray-500">보유</div><div className="text-sm font-semibold text-white">{heldQty}주</div></div>}
                  {currentMarketStatus && (
                    <div className={`text-xs font-medium px-2 py-0.5 rounded-lg ${
                      currentMarketStatus.is_open ? "bg-green-500/20 text-green-400"
                      : currentMarketStatus.status === "pre" ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-gray-700 text-gray-400"
                    }`}>
                      {currentMarketStatus.is_open ? "● 거래 가능" : currentMarketStatus.status === "pre" ? "● 장전" : "● 마감"}
                    </div>
                  )}
                </div>
              </div>

              {currentMarketStatus && !currentMarketStatus.is_open && (
                <div className="bg-gray-700/50 rounded-xl px-4 py-3 text-xs text-gray-400 text-center">
                  {currentMarketStatus.message}
                  <div className="text-gray-500 mt-0.5">개장: {currentMarketStatus.open_time} ~ {currentMarketStatus.close_time}</div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setTradeType("BUY"); setQuantity(1); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tradeType === "BUY" ? "bg-red-500 text-white" : "bg-gray-700 text-gray-400"}`}>매수</button>
                <button onClick={() => { setTradeType("SELL"); setQuantity(1); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tradeType === "SELL" ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"}`}>매도</button>
              </div>

              <div className="flex gap-2">
                {[{ label: "1/3", type: "third" as const }, { label: "1/2", type: "half" as const }, { label: "전량", type: "all" as const }].map((btn) => (
                  <button key={btn.type} onClick={() => handleQuickQty(btn.type)} disabled={!isTradeAllowed}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {btn.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={!isTradeAllowed}
                  className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl transition-colors disabled:opacity-40">−</button>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={!isTradeAllowed} className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-center font-bold outline-none text-lg disabled:opacity-40" />
                <button onClick={() => setQuantity(quantity + 1)} disabled={!isTradeAllowed}
                  className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl transition-colors disabled:opacity-40">+</button>
              </div>

              <div className="bg-gray-700/50 rounded-xl px-4 py-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">예상 금액</span>
                  <span className="text-white font-bold">
                    {selected.market === "US" ? `$${(selected.price * quantity).toFixed(2)}` : `${(selected.price * quantity).toLocaleString()}원`}
                  </span>
                </div>
                {selected.market === "US" && usdKrw && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-xs">원화 환산 (₩{usdKrw.toLocaleString()})</span>
                    <span className="text-gray-300 text-sm font-semibold">≈ {(selected.price * usdKrw * quantity).toLocaleString()}원</span>
                  </div>
                )}
              </div>

              {message && (
                <div className={`text-sm text-center py-3 rounded-xl font-medium ${
                  messageType === "success" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}>{message}</div>
              )}

              <button onClick={handleTrade} disabled={loading || !isTradeAllowed}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                  !isTradeAllowed ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : tradeType === "BUY" ? "bg-red-500 hover:bg-red-400 text-white"
                  : "bg-blue-500 hover:bg-blue-400 text-white"
                } disabled:opacity-60`}>
                {loading ? "처리 중..." : !isTradeAllowed ? "장 마감 (거래 불가)" : `${tradeType === "BUY" ? "매수" : "매도"} 확인`}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── 공매도 탭 ── */}
      {mainTab === "SHORT" && (
        <>
          {/* 공매도 개념 안내 */}
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-xs text-orange-300 space-y-1">
            <div className="font-bold text-orange-400 mb-1">📉 공매도란?</div>
            <div>주식을 빌려서 팔고 → 나중에 싸게 사서 갚아 차익 실현</div>
            <div>주가가 <span className="text-blue-400 font-semibold">내릴수록 이익</span>, 올라가면 손실</div>
            <div className="text-orange-400 font-semibold">⚠️ 증거금 30% 필요 · 손실 이론상 무한대</div>
          </div>

          {/* 오픈 포지션 목록 */}
          {shortPositions.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">📋 오픈 포지션</p>
              <div className="space-y-2">
                {shortPositions.map((p) => (
                  <div key={p.id} className="bg-gray-800 border border-orange-500/20 rounded-2xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{p.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-medium">SHORT</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {p.quantity}주 · 진입가 {p.entry_price.toLocaleString()}원
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">현재가</div>
                        <div className="text-sm font-bold text-white">{p.current_price.toLocaleString()}원</div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className={`text-sm font-bold ${p.profit >= 0 ? "text-blue-400" : "text-red-400"}`}>
                        {p.profit >= 0 ? "+" : ""}{p.profit.toLocaleString()}원 ({p.profit_pct >= 0 ? "+" : ""}{p.profit_pct.toFixed(2)}%)
                      </div>
                      <button onClick={() => handleShortClose(p.id)} disabled={shortLoading}
                        className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
                        청산하기
                      </button>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">증거금 {p.margin.toLocaleString()}원 예치 중</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shortMessage && (
            <div className={`text-sm text-center py-3 rounded-xl font-medium ${
              shortMessageType === "success" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
            }`}>{shortMessage}</div>
          )}

          {/* 종목 검색 */}
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium">📉 공매도 종목 선택</p>
            <div className="flex gap-2 mb-3">
              <input value={shortQuery} onChange={(e) => setShortQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleShortSearch()}
                placeholder="종목명, 티커 검색..."
                className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none placeholder-gray-500 border border-gray-700 focus:border-orange-400 transition-colors" />
              <button onClick={handleShortSearch} className="bg-orange-500 text-white px-5 rounded-xl font-bold text-sm hover:bg-orange-400 transition-colors">검색</button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {shortDisplayList.map((s) => {
                const mStatus = s.market === "KR" ? marketStatus?.KR : marketStatus?.US;
                return (
                  <button key={s.ticker} onClick={() => { setShortSelected(s); setShortMessage(""); setShortQty(1); }}
                    className={`w-full rounded-2xl p-3 flex justify-between items-center transition-all border ${
                      shortSelected?.ticker === s.ticker ? "bg-orange-500/10 border-orange-500/50" : "bg-gray-800 border-transparent hover:border-gray-600"
                    }`}>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">{s.name}</span>
                        {mStatus && <span className={`w-1.5 h-1.5 rounded-full ${mStatus.is_open ? "bg-green-400" : "bg-gray-600"}`} />}
                      </div>
                      <div className="text-xs text-gray-400">{s.ticker}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">
                        {s.market === "US" ? `$${s.price.toFixed(2)}` : `${s.price.toLocaleString()}원`}
                      </div>
                      <div className={`text-xs font-semibold ${s.change_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                        {s.change_pct >= 0 ? "▲" : "▼"} {Math.abs(s.change_pct).toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 공매도 진입 패널 */}
          {shortSelected && (
            <div className="bg-gray-800 rounded-2xl p-5 space-y-4 border border-orange-500/30">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold text-white">{shortSelected.name}</div>
                  <div className="text-sm text-gray-400">
                    {shortSelected.market === "US" ? `$${shortSelected.price.toFixed(2)}` : `${shortSelected.price.toLocaleString()}원`}
                  </div>
                </div>
                {shortMarketStatus && (
                  <div className={`text-xs font-medium px-2 py-0.5 rounded-lg ${
                    shortMarketStatus.is_open ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"
                  }`}>
                    {shortMarketStatus.is_open ? "● 거래 가능" : "● 마감"}
                  </div>
                )}
              </div>

              {shortMarketStatus && !shortMarketStatus.is_open && (
                <div className="bg-gray-700/50 rounded-xl px-4 py-3 text-xs text-gray-400 text-center">
                  {shortMarketStatus.message}
                </div>
              )}

              <div className="flex gap-2">
                {[{ label: "1/3", type: "third" as const }, { label: "1/2", type: "half" as const }, { label: "최대", type: "all" as const }].map((btn) => (
                  <button key={btn.type} onClick={() => handleShortQuickQty(btn.type)} disabled={!isShortAllowed}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-40">
                    {btn.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => setShortQty(Math.max(1, shortQty - 1))} disabled={!isShortAllowed}
                  className="bg-gray-700 text-white w-11 h-11 rounded-xl font-bold text-xl disabled:opacity-40">−</button>
                <input type="number" min={1} value={shortQty} onChange={(e) => setShortQty(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={!isShortAllowed} className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-center font-bold outline-none text-lg disabled:opacity-40" />
                <button onClick={() => setShortQty(shortQty + 1)} disabled={!isShortAllowed}
                  className="bg-gray-700 text-white w-11 h-11 rounded-xl font-bold text-xl disabled:opacity-40">+</button>
              </div>

              <div className="bg-gray-700/50 rounded-xl px-4 py-3 space-y-1.5 text-xs">
                {(() => {
                  const p = priceKrw(shortSelected);
                  const total = p * shortQty;
                  const margin = total * 0.3;
                  return (
                    <>
                      <div className="flex justify-between"><span className="text-gray-400">공매도 금액</span><span className="text-white font-semibold">{total.toLocaleString()}원</span></div>
                      <div className="flex justify-between"><span className="text-orange-400">필요 증거금 (30%)</span><span className="text-orange-400 font-semibold">{margin.toLocaleString()}원</span></div>
                      <div className="flex justify-between text-gray-600"><span>목표 (10% 하락 시)</span><span className="text-blue-400">+{(total * 0.1).toLocaleString()}원</span></div>
                    </>
                  );
                })()}
              </div>

              <button onClick={handleShortOpen} disabled={shortLoading || !isShortAllowed}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                  !isShortAllowed ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-400 text-white"
                } disabled:opacity-60`}>
                {shortLoading ? "처리 중..." : !isShortAllowed ? "장 마감 (거래 불가)" : `📉 공매도 진입`}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
