"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface StockInfo {
  ticker: string;
  name: string;
  price: number;
  change_pct: number;
  market: string;
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }
    setPopularLoading(true);
    api.get(`/stock/popular?market=${market}`)
      .then((res) => setPopular(res.data))
      .finally(() => setPopularLoading(false));
  }, [router, market]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    const res = await api.get(`/stock/search?q=${query}&market=${market}`);
    setStocks(res.data);
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
    } catch (e: any) {
      setMessage(e.response?.data?.detail || "거래 실패");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const displayList = query && stocks.length > 0 ? stocks : popular;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-5" style={{background: "#0f0f0f", minHeight: "100vh"}}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm flex items-center gap-1 hover:text-white transition-colors">
          ← 홈
        </Link>
        <h1 className="font-bold text-lg text-white">💹 거래하기</h1>
        <div className="w-10" />
      </div>

      {/* 시장 선택 */}
      <div className="flex gap-2">
        {(["ALL", "KR", "US"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMarket(m); setStocks([]); setQuery(""); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              market === m
                ? "bg-yellow-400 text-gray-900"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
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
          placeholder="종목명 검색 (예: 삼성, AAPL)"
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
            {[1,2,3].map(i => (
              <div key={i} className="bg-gray-800 rounded-2xl p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {displayList.map((s) => (
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
                  <div className="font-semibold text-sm text-white">{s.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.ticker} · {s.market}</div>
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
            ))}
          </div>
        )}
      </div>

      {/* 거래 패널 */}
      {selected && (
        <div className="bg-gray-800 rounded-2xl p-5 space-y-4 border border-gray-700">
          <div>
            <div className="font-bold text-white">{selected.name}</div>
            <div className="text-sm text-gray-400">{selected.price.toLocaleString()}{selected.market === "KR" ? "원" : "$"}</div>
          </div>

          {/* 매수/매도 탭 */}
          <div className="flex gap-2">
            <button
              onClick={() => setTradeType("BUY")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                tradeType === "BUY" ? "bg-red-500 text-white" : "bg-gray-700 text-gray-400"
              }`}
            >
              매수
            </button>
            <button
              onClick={() => setTradeType("SELL")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                tradeType === "SELL" ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"
              }`}
            >
              매도
            </button>
          </div>

          {/* 수량 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl transition-colors"
            >−</button>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-center font-bold outline-none text-lg"
            />
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl transition-colors"
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
            disabled={loading}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              tradeType === "BUY"
                ? "bg-red-500 hover:bg-red-400 text-white"
                : "bg-blue-500 hover:bg-blue-400 text-white"
            } disabled:opacity-50`}
          >
            {loading ? "처리 중..." : `${tradeType === "BUY" ? "매수" : "매도"} 확인`}
          </button>
        </div>
      )}
    </main>
  );
}
