import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "모의주식 랭킹";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MEDAL = ["🥇", "🥈", "🥉"];

interface RankUser {
  rank: number;
  user_id: number;
  nickname: string;
  total_assets: number;
  profit_pct: number;
}

async function getRanking(): Promise<RankUser[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "https://mock-stock-api-production.up.railway.app"}/ranking/`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function Image() {
  const ranking = await getRanking();
  const top5 = ranking.slice(0, 5);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #0f0f0f 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}>
          <div style={{ fontSize: 48 }}>📈</div>
          <div>
            <div style={{ color: "#facc15", fontSize: 36, fontWeight: 900, letterSpacing: -1 }}>
              모의주식 랭킹
            </div>
            <div style={{ color: "#6b7280", fontSize: 20, marginTop: 4 }}>
              실시간 수익률 순위
            </div>
          </div>
        </div>

        {/* 랭킹 리스트 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          {top5.length === 0 ? (
            <div style={{ color: "#4b5563", fontSize: 28, textAlign: "center", marginTop: 80 }}>
              아직 참여자가 없어요
            </div>
          ) : (
            top5.map((user, i) => {
              const isProfit = user.profit_pct >= 0;
              const isTop3 = i < 3;
              return (
                <div
                  key={user.user_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    background: i === 0
                      ? "rgba(250,204,21,0.12)"
                      : "rgba(255,255,255,0.04)",
                    border: i === 0
                      ? "1.5px solid rgba(250,204,21,0.3)"
                      : "1.5px solid rgba(255,255,255,0.07)",
                    borderRadius: 16,
                    padding: "18px 28px",
                  }}
                >
                  {/* 메달 / 순위 */}
                  <div style={{ fontSize: isTop3 ? 36 : 26, width: 44, textAlign: "center" }}>
                    {isTop3 ? MEDAL[i] : `${i + 1}`}
                  </div>

                  {/* 닉네임 */}
                  <div style={{ flex: 1, color: "#f9fafb", fontSize: 26, fontWeight: 700 }}>
                    {user.nickname}
                  </div>

                  {/* 총자산 */}
                  <div style={{ color: "#9ca3af", fontSize: 20, marginRight: 24 }}>
                    {(user.total_assets / 10000).toFixed(0)}만원
                  </div>

                  {/* 수익률 */}
                  <div
                    style={{
                      color: isProfit ? "#f87171" : "#60a5fa",
                      fontSize: 30,
                      fontWeight: 900,
                      minWidth: 120,
                      textAlign: "right",
                    }}
                  >
                    {isProfit ? "+" : ""}{user.profit_pct.toFixed(2)}%
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 푸터 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 32,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ color: "#4b5563", fontSize: 18 }}>
            나는 몇 위일까? 지금 확인해봐! 👀
          </div>
          <div style={{ color: "#374151", fontSize: 18 }}>
            mock-stock-app.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
