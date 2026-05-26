"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface SeasonResult {
  rank: number;
  nickname: string;
  profile_image?: string;
  final_assets: number;
  profit: number;
  profit_pct: number;
}

interface SeasonHistory {
  season_number: number;
  year: number;
  month: number;
  ended_at: string;
  results: SeasonResult[];
}

interface Snapshot {
  date: string;
  total_assets: number;
  profit_pct: number;
  season: number;
}

interface CurrentSeason {
  season_number: number;
  year: number;
  month: number;
  days_left: number;
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<SeasonHistory[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentSeason, setCurrentSeason] = useState<CurrentSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"chart" | "seasons">("chart");
  const [myId, setMyId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const uid = parseInt(payload.sub);
      setMyId(uid);

      Promise.all([
        api.get("/season/current"),
        api.get("/season/history"),
        api.get(`/season/snapshot/${uid}`),
      ]).then(([cur, hist, snap]) => {
        setCurrentSeason(cur.data);
        setHistory(hist.data);
        setSnapshots(snap.data);
      }).finally(() => setLoading(false));
    } catch {
      router.replace("/");
    }
  }, [router]);

  if (loading) return (
    <main className="flex items-center justify-center min-h-screen" style={{ background: "#0f0f0f" }}>
      <div className="text-4xl animate-bounce">📈</div>
    </main>
  );

  // 간단한 SVG 라인 차트
  const renderChart = () => {
    if (snapshots.length < 2) return (
      <div className="bg-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">
        데이터가 쌓이는 중이에요<br />
        <span className="text-xs text-gray-600">매일 18시에 자산이 기록돼요</span>
      </div>
    );

    const values = snapshots.map(s => s.total_assets);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const W = 320, H = 120, PAD = 10;

    const points = snapshots.map((s, i) => {
      const x = PAD + (i / (snapshots.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((s.total_assets - min) / range) * (H - PAD * 2);
      return `${x},${y}`;
    }).join(" ");

    const isProfit = snapshots[snapshots.length - 1].profit_pct >= 0;
    const color = isProfit ? "#f87171" : "#60a5fa";

    return (
      <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">자산 변동 그래프</span>
          <span className={`text-xs font-bold ${isProfit ? "text-red-400" : "text-blue-400"}`}>
            {isProfit ? "+" : ""}{snapshots[snapshots.length - 1].profit_pct.toFixed(2)}%
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* 마지막 점 */}
          {snapshots.length > 0 && (() => {
            const last = snapshots[snapshots.length - 1];
            const x = W - PAD;
            const y = H - PAD - ((last.total_assets - min) / range) * (H - PAD * 2);
            return <circle cx={x} cy={y} r="3" fill={color} />;
          })()}
        </svg>
        {/* 날짜 라벨 */}
        <div className="flex justify-between text-xs text-gray-600">
          <span>{snapshots[0]?.date}</span>
          <span>{snapshots[Math.floor(snapshots.length / 2)]?.date}</span>
          <span>{snapshots[snapshots.length - 1]?.date}</span>
        </div>
      </div>
    );
  };

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{ background: "#0f0f0f", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm hover:text-white transition-colors">← 홈</Link>
        <h1 className="font-bold text-lg text-white">📅 시즌 기록</h1>
        <div className="w-10" />
      </div>

      {/* 현재 시즌 배너 */}
      {currentSeason && (
        <div className="bg-gradient-to-r from-yellow-400/20 to-orange-400/20 border border-yellow-400/30 rounded-2xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-400">현재 시즌</div>
              <div className="font-bold text-white text-lg">
                시즌 {currentSeason.season_number}
              </div>
              <div className="text-xs text-gray-400">{currentSeason.year}년 {currentSeason.month}월</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-yellow-400">{currentSeason.days_left}</div>
              <div className="text-xs text-gray-400">일 남음</div>
            </div>
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("chart")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === "chart" ? "bg-yellow-400 text-gray-900" : "bg-gray-800 text-gray-400"}`}
        >
          📈 자산 그래프
        </button>
        <button
          onClick={() => setTab("seasons")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === "seasons" ? "bg-yellow-400 text-gray-900" : "bg-gray-800 text-gray-400"}`}
        >
          🏆 지난 시즌
        </button>
      </div>

      {/* 자산 그래프 탭 */}
      {tab === "chart" && (
        <div className="space-y-3">
          {renderChart()}
          {/* 스냅샷 목록 */}
          <div className="space-y-2">
            {[...snapshots].reverse().slice(0, 10).map((s, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex justify-between items-center">
                <div>
                  <div className="text-sm text-white font-medium">{s.date}</div>
                  <div className="text-xs text-gray-500">시즌 {s.season}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">{s.total_assets.toLocaleString()}원</div>
                  <div className={`text-xs font-semibold ${s.profit_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                    {s.profit_pct >= 0 ? "+" : ""}{s.profit_pct.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 지난 시즌 탭 */}
      {tab === "seasons" && (
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="bg-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">
              아직 완료된 시즌이 없어요<br />
              <span className="text-xs text-gray-600">매월 1일에 새 시즌이 시작돼요</span>
            </div>
          ) : (
            history.map((season) => (
              <div key={season.season_number} className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-700/50 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-white">시즌 {season.season_number}</span>
                    <span className="text-xs text-gray-400 ml-2">{season.year}년 {season.month}월</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-700/50">
                  {season.results.slice(0, 5).map((r) => (
                    <div key={r.rank} className="px-4 py-3 flex items-center gap-3">
                      <div className="text-lg w-6 text-center">
                        {r.rank <= 3 ? MEDAL[r.rank - 1] : <span className="text-gray-500 text-sm">{r.rank}</span>}
                      </div>
                      {r.profile_image ? (
                        <img src={r.profile_image} className="w-8 h-8 rounded-full" alt="" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs">👤</div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">{r.nickname}</div>
                        <div className="text-xs text-gray-400">{r.final_assets.toLocaleString()}원</div>
                      </div>
                      <div className={`text-sm font-bold ${r.profit_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                        {r.profit_pct >= 0 ? "+" : ""}{r.profit_pct.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
