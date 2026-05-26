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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    api.get(`/stock/popular?market=${market}`).then((res) => setPopular(res.data));
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
    } catch (e: any) {
      setMessage(e.response?.data?.detail || "거래 실패");
    } finally {
      setLoading(false);
    }
  };

  const displayList = query ? stocks : popular;

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm">← 홈</Link>
        <h1 className="font-bold text-lg">💹 거래하기</h1>
        <div />
      </div>

      {/* 시장 선택 */}
      <div className="flex gap-2">
        {(["ALL", "KR", "US"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMarket(m)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${market === m ? "bg-yellow-400 text-gray-900" : "bg-gray-800 text-gray-300"}`}
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
          className="flex-1 bg-gray-800 rounded-xl px-4 py-3 text-sm outline-none placeholder-gray-500"
        />
        <button onClick={handleSearch} className="bg-yellow-400 text-gray-900 px-4 rounded-xl font-bold text-sm">
          검색
        </button>
      </div>

      {/* 종목 리스트 */}
      <div>
        <p className="text-xs text-gray-500 mb-2">{query ? "검색 결과" : "인기 종목"}</p>
        <div className="space-y-2">
          {displayList.map((s) => (
            <button
              key={s.ticker}
              onClick={() => { setSelected(s); setMessage(""); }}
              className={`w-full rounded-2xl p-4 flex justify-between items-center transition-colors ${selected?.ticker === s.ticker ? "bg-yellow-400/20 border border-yellow-400/40" : "bg-gray-800"}`}
            >
              <div className="text-left">
                <div className="font-medium text-sm">{s.name}</div>
                <div className="text-xs text-gray-400">{s.ticker}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{s.price.toLocaleString()}{s.market === "KR" ? "원" : "$"}</div>
                <div className={`text-xs ${s.change_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                  {s.change_pct >= 0 ? "▲" : "▼"} {Math.abs(s.change_pct).toFixed(2)}%
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 거래 패널 */}
      {selected && (
        <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
          <div className="font-semibold">{selected.name} 거래</div>

          {/* 매수/매도 탭 */}
          <div className="flex gap-2">
            <button
              onClick={() => setTradeType("BUY")}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tradeType === "BUY" ? "bg-red-500 text-white" : "bg-gray-700 text-gray-400"}`}
            >
              매수
            </button>
            <button
              onClick={() => setTradeType("SELL")}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tradeType === "SELL" ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"}`}
            >
              매도
            </button>
          </div>

          {/* 수량 */}
          <div className="flex items-center gap-3">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="bg-gray-700 w-10 h-10 rounded-xl font-bold text-lg">−</button>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="flex-1 bg-gray-700 rounded-xl px-4 py-2 text-center font-bold outline-none"
            />
            <button onClick={() => setQuantity(quantity + 1)} className="bg-gray-700 w-10 h-10 rounded-xl font-bold text-lg">+</button>
          </div>

          <div className="text-sm text-gray-400 text-right">
            예상 금액: <span className="text-white font-semibold">{(selected.price * quantity).toLocaleString()}{selected.market === "KR" ? "원" : "$"}</span>
          </div>

          {message && (
            <div className={`text-sm text-center py-2 rounded-xl ${message.includes("완료") ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
              {message}
            </div>
          )}

          <button
            onClick={handleTrade}
            disabled={loading}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${tradeType === "BUY" ? "bg-red-500 active:bg-red-600" : "bg-blue-500 active:bg-blue-600"} disabled:opacity-50`}
          >
            {loading ? "처리 중..." : `${tradeType === "BUY" ? "매수" : "매도"} 확인`}
          </button>
        </div>
      )}
    </main>
  );
}
