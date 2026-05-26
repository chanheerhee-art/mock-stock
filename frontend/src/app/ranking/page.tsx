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

    // JWT에서 user_id 파싱 (간단 방법)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setMyId(payload.sub);
    } catch {}

    api.get("/ranking/").then((res) => {
      setRanking(res.data);
    }).finally(() => setLoading(false));
  }, [router]);

  const handleShare = () => {
    const url = window.location.href;
    const text = `📈 모의주식 랭킹 확인해봐!\n${ranking[0]?.nickname}이 1등이야 ㄷㄷ`;

    if (navigator.share) {
      navigator.share({ title: "모의주식 랭킹", text, url });
    } else {
      navigator.clipboard.writeText(`${text}\n${url}`);
      alert("링크가 복사됐어요! 카톡에 붙여넣기 하세요 😊");
    }
  };

  if (loading) return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-4xl animate-bounce">🏆</div>
    </main>
  );

  return (
    <main className="max-w-md mx-auto px-4 py-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-gray-400 text-sm">← 홈</Link>
        <h1 className="font-bold text-lg">🏆 랭킹</h1>
        <button onClick={handleShare} className="text-yellow-400 text-sm font-medium">
          공유
        </button>
      </div>

      {/* 랭킹 리스트 */}
      <div className="space-y-2">
        {ranking.map((user) => {
          const isMe = String(user.user_id) === myId;
          const isProfitable = user.profit_pct >= 0;
          return (
            <div
              key={user.user_id}
              className={`rounded-2xl p-4 flex items-center gap-3 ${isMe ? "bg-yellow-400/10 border border-yellow-400/30" : "bg-gray-800"}`}
            >
              <div className="text-2xl w-8 text-center">
                {user.rank <= 3 ? MEDAL[user.rank - 1] : `${user.rank}`}
              </div>
              {user.profile_image && (
                <img src={user.profile_image} className="w-9 h-9 rounded-full" alt="" />
              )}
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {user.nickname} {isMe && <span className="text-yellow-400 text-xs">(나)</span>}
                </div>
                <div className="text-xs text-gray-400">{user.total_assets.toLocaleString()}원</div>
              </div>
              <div className={`text-sm font-bold ${isProfitable ? "text-red-400" : "text-blue-400"}`}>
                {isProfitable ? "+" : ""}{user.profit_pct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* 카톡 공유 버튼 */}
      <button
        onClick={handleShare}
        className="w-full bg-yellow-400 text-gray-900 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        💬 카톡으로 랭킹 공유하기
      </button>
    </main>
  );
}
