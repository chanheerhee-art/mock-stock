import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "모의주식 랭킹 🏆",
  description: "친구들과 수익률 경쟁! 나는 몇 위일까?",
  openGraph: {
    title: "📈 모의주식 랭킹",
    description: "실시간 수익률 순위 — 나는 몇 위일까?",
    url: "https://mock-stock-app.vercel.app/ranking",
    siteName: "모의주식",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "📈 모의주식 랭킹",
    description: "실시간 수익률 순위 — 나는 몇 위일까?",
  },
};

export default function RankingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
