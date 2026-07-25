import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 生产部署：构建自包含的 standalone 产物（server.js + 精简 node_modules），
  // 服务器只需 node 运行，无需 npm ci / next build，避免小内存实例 OOM。
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: { bodySizeLimit: "1mb" }
  }
};

export default nextConfig;
