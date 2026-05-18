import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The TTR-Saisonentwicklung.xlsx export is ~30 MB. Lifted so admins can
      // upload it directly. Vercel Hobby will still cap actual requests; the
      // production path is documented as a follow-up.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
