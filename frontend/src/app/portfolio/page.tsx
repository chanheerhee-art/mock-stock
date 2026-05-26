"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface TradeHistory {
  ticker: string;
  name: string;
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
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-4xl animate-bounce">📊</div>
    </main>
  );

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm">← 홈</Link>
        <h1 className="font-bold text-lg">📊 거래 내역</h1>
        <div />
      </div>

      {history.length === 0 ? (
        <div className="bg-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">
          거래 내역이 없습니다.<br />
          <Link href="/trade" className="text-yellow-400 mt-2 block">거래하러 가기 →</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((h, i) => (
            <div key={i} className="bg-gray-800 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${h.trade_type === "BUY" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                    {h.trade_type === "BUY" ? "매수" : "매도"}
                  </span>
                  <span className="font-medium text-sm">{h.name}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {h.quantity}주 · {h.price.toLocaleString()}원
                </div>
                <div className="text-xs text-gray-600">
                  {new Date(h.traded_at).toLocaleString("ko-KR")}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-semibold ${h.trade_type === "BUY" ? "text-red-400" : "text-blue-400"}`}>
                  {h.trade_type === "BUY" ? "-" : "+"}{h.total.toLocaleString()}원
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
