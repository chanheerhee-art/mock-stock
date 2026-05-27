"use client";
import { useEffect, useState, useCallback } from "react";
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

interface Holding {
  ticker: string;
  name: string;
  market: string;
  quantity: number;
  avg_price: number;
  current_price_krw: number;
  eval_amount: number;
  profit: number;
  profit_pct: number;
  change_pct: number;
}

interface UserPortfolio {
  user_id: number;
  nickname: string;
  profile_image?: string;
  cash: number;
  total_eval: number;
  total_assets: number;
  profit: number;
  profit_pct: number;
  holdings: Holding[];
  usd_krw: number;
}

const MEDAL = ["🥇", "🥈", "🥉"];

function fmt(n: number) {
  if (Math.abs(n) >= 100_000_000) return (n / 100_000_000).toFixed(1) + "억";
  if (Math.abs(n) >= 10_000) return (n / 10_000).toFixed(0) + "만";
  return n.toLocaleString();
}

function ProfileModal({
  userId,
  rank,
  onClose,
}: {
  userId: number;
  rank: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<UserPortfolio | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/ranking/user/${userId}`).then((res) => {
      setData(res.data);
    }).finally(() => setLoading(false));
  }, [userId]);

  // 배경 클릭 시 닫기
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={handleBackdrop}
    >
      <div
        className="w-full max-w-md rounded-t-3xl overflow-hidden"
        style={{ background: "#1a1a1a", maxHeight: "85vh" }}
      >
        {/* 핸들바 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-600" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-3xl animate-bounce">📊</div>
          </div>
        ) : !data ? (
          <div className="text-center py-16 text-gray-500">불러올 수 없어요</div>
        ) : (
          <div className="overflow-y-auto" style={{ maxHeight: "calc(85vh - 32px)" }}>
            {/* 유저 헤더 */}
            <div className="px-5 pt-2 pb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {data.profile_image ? (
                    <img src={data.profile_image} className="w-14 h-14 rounded-full border-2 border-gray-600" alt="" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-2xl">👤</div>
                  )}
                  <div className="absolute -bottom-1 -right-1 text-lg leading-none">
                    {rank <= 3 ? MEDAL[rank - 1] : `#${rank}`}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-white text-lg">{data.nickname}</div>
                  <div className={`text-sm font-semibold mt-0.5 ${data.profit_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                    {data.profit_pct >= 0 ? "+" : ""}{data.profit_pct.toFixed(2)}%
                    <span className="text-gray-500 font-normal ml-2">
                      {data.profit >= 0 ? "+" : ""}{fmt(data.profit)}원
                    </span>
                  </div>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-white text-xl px-2">✕</button>
              </div>

              {/* 자산 요약 */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: "총자산", value: fmt(data.total_assets) + "원" },
                  { label: "주식평가", value: fmt(data.total_eval) + "원" },
                  { label: "현금", value: fmt(data.cash) + "원" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: "#252525" }}>
                    <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                    <div className="text-sm font-semibold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 구분선 */}
            <div className="h-px bg-gray-800 mx-5" />

            {/* 보유종목 */}
            <div className="px-5 py-4">
              <div className="text-sm font-semibold text-gray-400 mb-3">
                보유종목 {data.holdings.length > 0 ? `${data.holdings.length}개` : ""}
              </div>

              {data.holdings.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">보유 종목이 없어요</div>
              ) : (
                <div className="space-y-2">
                  {data.holdings.map((h) => (
                    <div
                      key={h.ticker}
                      className="flex items-center gap-3 rounded-2xl p-3"
                      style={{ background: "#252525" }}
                    >
                      {/* 마켓 뱃지 */}
                      <div
                        className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0"
                        style={{
                          background: h.market === "US" ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)",
                          color: h.market === "US" ? "#60a5fa" : "#f87171",
                        }}
                      >
                        {h.market}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{h.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {h.quantity}주 · 평균 {h.avg_price.toLocaleString()}원
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-white">{fmt(h.eval_amount)}원</div>
                        <div className={`text-xs font-semibold mt-0.5 ${h.profit_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                          {h.profit_pct >= 0 ? "+" : ""}{h.profit_pct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 하단 여백 (safe area) */}
            <div className="h-6" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function RankingPage() {
  const router = useRouter();
  const [ranking, setRanking] = useState<RankUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<{ id: number; rank: number } | null>(null);

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
    const pageUrl = "https://mock-stock-app.vercel.app/ranking";
    const ogImageUrl = "https://mock-stock-app.vercel.app/ranking/opengraph-image";
    const top3 = ranking.slice(0, 3);
    const MEDAL = ["🥇", "🥈", "🥉"];

    const descLines = top3.length > 0
      ? top3.map((u, i) => `${MEDAL[i]} ${u.nickname} ${u.profit_pct >= 0 ? "+" : ""}${u.profit_pct.toFixed(2)}%`).join("\n")
      : "아직 참여자가 없어요";

    // 카카오링크 SDK
    const win = window as typeof window & { Kakao?: { isInitialized: () => boolean; init: (key: string) => void; Share: { sendDefault: (opts: unknown) => void } } };
    if (win.Kakao) {
      if (!win.Kakao.isInitialized()) {
        win.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID!);
      }
      win.Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title: "📈 모의주식 랭킹",
          description: descLines + "\n\n나는 몇 위일까? 확인해봐!",
          imageUrl: ogImageUrl,
          imageWidth: 1200,
          imageHeight: 630,
          link: { mobileWebUrl: pageUrl, webUrl: pageUrl },
        },
        buttons: [
          { title: "🏆 랭킹 확인하기", link: { mobileWebUrl: pageUrl, webUrl: pageUrl } },
        ],
      });
      return;
    }

    // 카카오 SDK 없으면 네이티브 공유 or 클립보드
    const text = `📈 모의주식 랭킹\n${descLines}\n\n나는 몇 위일까? 확인해봐!\n${pageUrl}`;
    if (navigator.share) {
      navigator.share({ title: "모의주식 랭킹", text, url: pageUrl });
    } else {
      navigator.clipboard.writeText(text);
      alert("클립보드에 복사됐어요! 카톡에 붙여넣기 하세요 😊");
    }
  };

  if (loading) return (
    <main className="flex items-center justify-center min-h-screen" style={{ background: "#0f0f0f" }}>
      <div className="text-4xl animate-bounce">🏆</div>
    </main>
  );

  return (
    <>
      <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{ background: "#0f0f0f", minHeight: "100vh" }}>
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
                <button
                  key={user.user_id}
                  onClick={() => setSelectedUser({ id: user.user_id, rank: user.rank })}
                  className={`w-full rounded-2xl p-4 flex items-center gap-3 border transition-all active:scale-95 text-left ${
                    isMe
                      ? "bg-yellow-400/10 border-yellow-400/40"
                      : "bg-gray-800 border-gray-700 hover:border-gray-500"
                  }`}
                >
                  <div className="text-2xl w-8 text-center font-bold shrink-0">
                    {user.rank <= 3 ? MEDAL[user.rank - 1] : (
                      <span className="text-gray-500 text-base">{user.rank}</span>
                    )}
                  </div>
                  {user.profile_image ? (
                    <img src={user.profile_image} className="w-10 h-10 rounded-full border border-gray-600 shrink-0" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm shrink-0">👤</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-white flex items-center gap-1">
                      {user.nickname}
                      {isMe && <span className="text-yellow-400 text-xs bg-yellow-400/20 px-1.5 py-0.5 rounded-full">나</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{user.total_assets.toLocaleString()}원</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-sm font-bold ${isProfitable ? "text-red-400" : "text-blue-400"}`}>
                      {isProfitable ? "+" : ""}{user.profit_pct.toFixed(2)}%
                    </div>
                    <div className="text-gray-600 text-xs">›</div>
                  </div>
                </button>
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

      {/* 프로필 모달 */}
      {selectedUser && (
        <ProfileModal
          userId={selectedUser.id}
          rank={selectedUser.rank}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </>
  );
}
