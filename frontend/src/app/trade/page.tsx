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

function MarketStatusBanner({ status, market }: { status: MarketStatusInfo; market: string }) {
  const isOpen = status.is_open;
  const isPre = status.status === "pre";

  return (
    <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between text-xs font-medium border ${
      isOpen
        ? "bg-green-500/10 border-green-500/30 text-green-400"
        : isPre
        ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
        : "bg-gray-800 border-gray-700 text-gray-400"
    }`}>
      <span>{status.message}</span>
      <span className={`w-2 h-2 rounded-full ml-2 flex-shrink-0 ${
        isOpen ? "bg-green-400 animate-pulse" : isPre ? "bg-yellow-400" : "bg-gray-600"
      }`} />
    </div>
  );
}

export default function TradePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<"ALL" | "KR" | "US">("ALL");
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [popular, setPopular] = useState<StockInfo[]>([]);
  const [selected, setSelected] = useState<StockInfo | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [popularLoading, setPopularLoading] = useState(true);
  const [myInfo, setMyInfo] = useState<PortfolioInfo | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);

  // 현재 선택된 종목의 시장 장 상태
  const currentMarketStatus: MarketStatusInfo | null = selected
    ? (selected.market === "KR" ? marketStatus?.KR : marketStatus?.US) ?? null
    : null;

  const isTradeAllowed = currentMarketStatus?.is_open ?? false;

  const fetchMarketStatus = useCallback(async () => {
    try {
      const res = await api.get("/stock/market-status?market=ALL");
      setMarketStatus(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    api.get("/portfolio/me").then((res) => setMyInfo(res.data)).catch(() => {});
    fetchMarketStatus();

    // 1분마다 장 상태 갱신
    const interval = setInterval(fetchMarketStatus, 60_000);
    return () => clearInterval(interval);
  }, [router, fetchMarketStatus]);

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

  const getHeldQuantity = (ticker: string) =>
    myInfo?.holdings.find(h => h.ticker === ticker)?.quantity ?? 0;

  const handleQuickQty = (type: "all" | "half" | "third") => {
    if (!selected) return;
    if (tradeType === "BUY" && myInfo) {
      const maxQty = Math.floor(myInfo.cash / selected.price);
      if (type === "all") setQuantity(Math.max(1, maxQty));
      else if (type === "half") setQuantity(Math.max(1, Math.floor(maxQty / 2)));
      else setQuantity(Math.max(1, Math.floor(maxQty / 3)));
    } else if (tradeType === "SELL") {
      const held = getHeldQuantity(selected.ticker);
      if (type === "all") setQuantity(Math.max(1, held));
      else if (type === "half") setQuantity(Math.max(1, Math.floor(held / 2)));
      else setQuantity(Math.max(1, Math.floor(held / 3)));
    }
  };

  const handleTrade = async () => {
    if (!selected) return;
    setLoading(true);
    setMessage("");
    try {
      const endpoint = tradeType === "BUY" ? "/trade/buy" : "/trade/sell";
      const res = await api.post(endpoint, { ticker: selected.ticker, quantity, market: selected.market });
      setMessage(res.data.message);
      setMessageType("success");
      api.get("/portfolio/me").then((res) => setMyInfo(res.data)).catch(() => {});
    } catch (e: any) {
      setMessage(e.response?.data?.detail || "거래 실패");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const displayList = query && stocks.length > 0 ? stocks : popular;
  const heldQty = selected ? getHeldQuantity(selected.ticker) : 0;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{ background: "#0f0f0f", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm hover:text-white transition-colors">← 홈</Link>
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
          <MarketStatusBanner status={marketStatus.KR} market="KR" />
          <MarketStatusBanner status={marketStatus.US} market="US" />
        </div>
      )}

      {/* 시장 선택 */}
      <div className="flex gap-2">
        {(["ALL", "KR", "US"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMarket(m); setStocks([]); setQuery(""); setSelected(null); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              market === m ? "bg-yellow-400 text-gray-900" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {m === "ALL" ? "전체" : m === "KR" ? "🇰🇷 한국" : "🇺🇸 미국"}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="종목명, 티커 검색..."
          className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none placeholder-gray-500 border border-gray-700 focus:border-yellow-400 transition-colors"
        />
        <button
          onClick={handleSearch}
          className="bg-yellow-400 text-gray-900 px-5 rounded-xl font-bold text-sm hover:bg-yellow-300 transition-colors"
        >
          검색
        </button>
      </div>

      {/* 종목 리스트 */}
      <div>
        <p className="text-xs text-gray-500 mb-2 font-medium">
          {query && stocks.length > 0 ? "🔍 검색 결과" : "🔥 인기 종목"}
        </p>
        {popularLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-800 rounded-2xl p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : displayList.length === 0 ? (
          <div className="bg-gray-800 rounded-2xl p-6 text-center text-gray-500 text-sm">
            검색 결과가 없어요
          </div>
        ) : (
          <div className="space-y-2">
            {displayList.map((s) => {
              const mStatus = s.market === "KR" ? marketStatus?.KR : marketStatus?.US;
              return (
                <button
                  key={s.ticker}
                  onClick={() => { setSelected(s); setMessage(""); setQuantity(1); }}
                  className={`w-full rounded-2xl p-4 flex justify-between items-center transition-all border ${
                    selected?.ticker === s.ticker
                      ? "bg-yellow-400/10 border-yellow-400/50"
                      : "bg-gray-800 border-transparent hover:border-gray-600"
                  }`}
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{s.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[s.exchange] ?? "bg-gray-600 text-gray-300"}`}>
                        {s.exchange}
                      </span>
                      {/* 장 상태 점 */}
                      {mStatus && (
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          mStatus.is_open ? "bg-green-400" : "bg-gray-600"
                        }`} />
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.ticker}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">
                      {s.price.toLocaleString()}{s.market === "KR" ? "원" : "$"}
                    </div>
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
                <span className="text-sm text-gray-400">{selected.price.toLocaleString()}{selected.market === "KR" ? "원" : "$"}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[selected.exchange] ?? "bg-gray-600 text-gray-300"}`}>
                  {selected.exchange}
                </span>
              </div>
            </div>
            <div className="text-right space-y-1">
              {heldQty > 0 && (
                <div>
                  <div className="text-xs text-gray-500">보유</div>
                  <div className="text-sm font-semibold text-white">{heldQty}주</div>
                </div>
              )}
              {/* 장 상태 */}
              {currentMarketStatus && (
                <div className={`text-xs font-medium px-2 py-0.5 rounded-lg ${
                  currentMarketStatus.is_open
                    ? "bg-green-500/20 text-green-400"
                    : currentMarketStatus.status === "pre"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-gray-700 text-gray-400"
                }`}>
                  {currentMarketStatus.is_open ? "● 거래 가능" : currentMarketStatus.status === "pre" ? "● 장전" : "● 마감"}
                </div>
              )}
            </div>
          </div>

          {/* 장 마감 안내 */}
          {currentMarketStatus && !currentMarketStatus.is_open && (
            <div className="bg-gray-700/50 rounded-xl px-4 py-3 text-xs text-gray-400 text-center">
              {currentMarketStatus.message}
              <div className="text-gray-500 mt-0.5">개장 시간: {currentMarketStatus.open_time} ~ {currentMarketStatus.close_time}</div>
            </div>
          )}

          {/* 매수/매도 탭 */}
          <div className="flex gap-2">
            <button
              onClick={() => { setTradeType("BUY"); setQuantity(1); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                tradeType === "BUY" ? "bg-red-500 text-white" : "bg-gray-700 text-gray-400"
              }`}
            >매수</button>
            <button
              onClick={() => { setTradeType("SELL"); setQuantity(1); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                tradeType === "SELL" ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"
              }`}
            >매도</button>
          </div>

          {/* 편의 수량 버튼 */}
          <div className="flex gap-2">
            {[
              { label: "1/3", type: "third" as const },
              { label: "1/2", type: "half" as const },
              { label: "전량", type: "all" as const },
            ].map((btn) => (
              <button
                key={btn.type}
                onClick={() => handleQuickQty(btn.type)}
                disabled={!isTradeAllowed}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* 수량 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={!isTradeAllowed}
              className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >−</button>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={!isTradeAllowed}
              className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-center font-bold outline-none text-lg disabled:opacity-40"
            />
            <button
              onClick={() => setQuantity(quantity + 1)}
              disabled={!isTradeAllowed}
              className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >+</button>
          </div>

          <div className="bg-gray-700/50 rounded-xl px-4 py-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">예상 금액</span>
            <span className="text-white font-bold">
              {(selected.price * quantity).toLocaleString()}{selected.market === "KR" ? "원" : "$"}
            </span>
          </div>

          {message && (
            <div className={`text-sm text-center py-3 rounded-xl font-medium ${
              messageType === "success"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-red-500/20 text-red-400 border border-red-500/30"
            }`}>
              {message}
            </div>
          )}

          <button
            onClick={handleTrade}
            disabled={loading || !isTradeAllowed}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              !isTradeAllowed
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : tradeType === "BUY"
                ? "bg-red-500 hover:bg-red-400 text-white"
                : "bg-blue-500 hover:bg-blue-400 text-white"
            } disabled:opacity-60`}
          >
            {loading
              ? "처리 중..."
              : !isTradeAllowed
              ? "장 마감 (거래 불가)"
              : `${tradeType === "BUY" ? "매수" : "매도"} 확인`}
          </button>
        </div>
      )}
    </main>
  );
}
