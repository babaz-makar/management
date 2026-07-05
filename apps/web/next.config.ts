import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 自分のツールをここでプレビューする場合、そのパッケージ名を追加する
  // 例: transpilePackages: ["@management/my-tool"],
  transpilePackages: ["@management/shift-management"],
};

export default nextConfig;
