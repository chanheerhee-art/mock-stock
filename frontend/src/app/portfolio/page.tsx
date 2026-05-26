"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface TradeHistory {
  ticker: string;
  name: string;
  market: string;
  trade_type: "BUY" | "SELL";
  quantity: number;
  price: number;
  total: number;
  traded_at: string;
}

export default function PortfolioPage() {
  const router = useRouter();
  const [history, setHistory] = useState<TradeHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    api.get("/trade/history").then((res) => {
      setHistory(res.data);
    }).finally(() => setLoading(false));
  }, [router]);

  if (loading) return (
    <main className="flex items-center justify-center min-h-screen" style={{ background: "#0f0f0f" }}>
      <div className="text-4xl animate-bounce">📊</div>
    </main>
  );

  // 날짜별 그룹핑
  const grouped = history.reduce((acc, h) => {
    const date = new Date(h.traded_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(h);
    return acc;
  }, {} as Record<string, TradeHistory[]>);

  const totalBuy = history.filter(h => h.trade_type === "BUY").reduce((s, h) => s + h.total, 0);
  const totalSell = history.filter(h => h.trade_type === "SELL").reduce((s, h) => s + h.total, 0);

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{ background: "#0f0f0f", minHeight: "100vh" }}>
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm hover:text-white transition-colors">← 홈</Link>
        <h1 className="font-bold text-lg text-white">📊 거래 내역</h1>
        <div className="w-10" />
      </div>

      {history.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-0.5">총 매수</div>
            <div className="text-sm font-bold text-red-400">{totalBuy.toLocaleString()}원</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-0.5">총 매도</div>
            <div className="text-sm font-bold text-blue-400">{totalSell.toLocaleString()}원</div>
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center space-y-3">
          <div className="text-3xl">📭</div>
          <p className="text-gray-500 text-sm">거래 내역이 없어요</p>
          <Link href="/trade" className="inline-block text-yellow-400 text-sm font-medium">거래하러 가기 →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, trades]) => (
            <div key={date}>
              <div className="text-xs text-gray-500 font-medium mb-2 px-1">{date}</div>
              <div className="space-y-2">
                {trades.map((h, i) => (
                  <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-4 flex justify-between items-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          h.trade_type === "BUY"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}>
                          {h.trade_type === "BUY" ? "매수" : "매도"}
                        </span>
                        <span className="font-semibold text-sm text-white">{h.name}</span>
                        {h.market === "US" && (
                          <span className="text-xs text-gray-600">🇺🇸</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {h.quantity}주 · {h.price.toLocaleString()}원
                        {h.market === "US" && (
                          <span className="text-gray-600 ml-1">(원화환산)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        {new Date(h.traded_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${h.trade_type === "BUY" ? "text-red-400" : "text-blue-400"}`}>
                        {h.trade_type === "BUY" ? "-" : "+"}{h.total.toLocaleString()}원
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
