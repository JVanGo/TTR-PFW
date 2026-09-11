import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The TTR-Saisonentwicklung.xlsx export is ~30 MB. Lifted so admins can
      // upload it directly. Vercel Hobby will still cap actual requests; the
      // production path is documented as a follow-up.
      bodySizeLimit: "50mb",
    },
  },
  // pdf-parse (used by the competition team-count import) loads a separate
  // pdf.worker.mjs file by path at runtime. Left to Next's default bundling
  // that path resolution breaks once deployed, even though it works fine in
  // local dev — this opts it out of bundling so Node requires it natively
  // and Vercel ships the whole package (worker file included).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
