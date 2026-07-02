import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ワークスペースの機能パッケージ (TSX ソースを直接配信) をトランスパイル対象にする
  transpilePackages: [
    "@management/feature-a",
    "@management/feature-b",
    "@management/feature-c",
    "@management/feature-d",
  ],
};

export default nextConfig;
