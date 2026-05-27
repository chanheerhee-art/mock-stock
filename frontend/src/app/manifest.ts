import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "모의주식",
    short_name: "모의주식",
    description: "친구들과 함께하는 모의주식 게임",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#030712",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "거래하기",
        url: "/trade",
        description: "주식 매수/매도",
      },
      {
        name: "랭킹",
        url: "/ranking",
        description: "수익률 순위",
      },
    ],
  };
}
