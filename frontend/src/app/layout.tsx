import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "모의주식",
  description: "친구들과 함께하는 모의주식 게임",
  openGraph: {
    title: "📈 모의주식 랭킹",
    description: "나의 수익률은 몇 위일까?",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-gray-950 text-white min-h-screen">{children}</body>
    </html>
  );
}
