import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // The React Compiler currently breaks react-three-fiber v9 scene
  // rendering (meshes mount but are skipped by the renderer).
  reactCompiler: false,
  // The floating dev-tools badge overlaps the game HUD footer in preview.
  devIndicators: false,
};

export default nextConfig;
