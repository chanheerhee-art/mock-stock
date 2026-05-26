"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface RankUser {
  rank: number;
  user_id: number;
  nickname: string;
  profile_image?: string;
  total_assets: number;
  profit: number;
  profit_pct: number;
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default function RankingPage() {
  const router = useRouter();
  const [ranking, setRanking] = useState<RankUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setMyId(payload.sub);
    } catch {}

    api.get("/ranking/").then((res) => {
      setRanking(res.data);
    }).finally(() => setLoading(false));
  }, [router]);

  const handleShare = () => {
    const url = window.location.origin + "/ranking";
    const top = ranking[0];
    const text = top
      ? `📈 모의주식 랭킹\n🥇 ${top.nickname} +${top.profit_pct.toFixed(2)}%\n나는 몇 위일까? 확인해봐!`
      : "📈 모의주식 랭킹 확인해봐!";

    if (navigator.share) {
      navigator.share({ title: "모의주식 랭킹", text, url });
    } else {
      navigator.clipboard.writeText(`${text}\n${url}`);
      alert("링크 복사됨! 카톡에 붙여넣기 하세요 😊");
    }
  };

  if (loading) return (
    <main className="flex items-center justify-center min-h-screen" style={{background: "#0f0f0f"}}>
      <div className="text-4xl animate-bounce">🏆</div>
    </main>
  );

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{background: "#0f0f0f", minHeight: "100vh"}}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm hover:text-white transition-colors">← 홈</Link>
        <h1 className="font-bold text-lg text-white">🏆 랭킹</h1>
        <button onClick={handleShare} className="text-yellow-400 text-sm font-semibold hover:text-yellow-300 transition-colors">
          공유
        </button>
      </div>

      {/* 랭킹 리스트 */}
      {ranking.length === 0 ? (
        <div className="bg-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">
          아직 참여자가 없어요
        </div>
      ) : (
        <div className="space-y-2">
          {ranking.map((user) => {
            const isMe = String(user.user_id) === myId;
            const isProfitable = user.profit_pct >= 0;
            return (
              <div
                key={user.user_id}
                className={`rounded-2xl p-4 flex items-center gap-3 border transition-all ${
                  isMe
                    ? "bg-yellow-400/10 border-yellow-400/40"
                    : "bg-gray-800 border-gray-700"
                }`}
              >
                <div className="text-2xl w-8 text-center font-bold">
                  {user.rank <= 3 ? MEDAL[user.rank - 1] : (
                    <span className="text-gray-500 text-base">{user.rank}</span>
                  )}
                </div>
                {user.profile_image ? (
                  <img src={user.profile_image} className="w-10 h-10 rounded-full border border-gray-600" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm">👤</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-white flex items-center gap-1">
                    {user.nickname}
                    {isMe && <span className="text-yellow-400 text-xs bg-yellow-400/20 px-1.5 py-0.5 rounded-full">나</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{user.total_assets.toLocaleString()}원</div>
                </div>
                <div className={`text-sm font-bold ${isProfitable ? "text-red-400" : "text-blue-400"}`}>
                  {isProfitable ? "+" : ""}{user.profit_pct.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 카톡 공유 버튼 */}
      <button
        onClick={handleShare}
        className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
      >
        💬 카톡으로 랭킹 공유하기
      </button>
    </main>
  );
}
