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
  // pdf-parse/pdfjs-dist's worker script (pdf.worker.mjs) is only referenced
  // indirectly via require.resolve() at runtime (lib/import/pdf-parse-node-setup.ts),
  // which Next's automatic file tracing doesn't follow — confirmed missing
  // from the route's own page.js.nft.json without this, which broke with
  // "Cannot find module '.../pdf.worker.mjs'" once deployed. NOTE:
  // serverExternalPackages was tried instead/also for this and made things
  // worse (see pdf-parse-node-setup.ts's own history) — this is the correct,
  // narrower fix and doesn't depend on bundling strategy.
  outputFileTracingIncludes: {
    "/admin/competitions/team-counts": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
