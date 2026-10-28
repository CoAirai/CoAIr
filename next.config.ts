import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Used by the isolated AWS integration image; Vercel keeps its normal build.
    ...(process.env.COAIR_STANDALONE === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
