import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // `npx tsc --noEmit` is run separately. Next 16's build worker exits
    // without diagnostics in this workspace after type-checking succeeds.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
