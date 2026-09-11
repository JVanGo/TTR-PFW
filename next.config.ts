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
  // NOTE: pdf-parse (used by the competition team-count import) previously
  // had serverExternalPackages set here, guessing its worker file needed to
  // ship unbundled. That guess was wrong and actively broke it: Next's
  // "external module" loader resolved pdf-parse/pdfjs-dist's browser build
  // instead of the Node one, crashing with "ReferenceError: DOMMatrix is not
  // defined" (confirmed via Vercel's runtime logs) — the Node/legacy build
  // pdfjs-dist ships polyfills that one; the browser build assumes a real
  // browser provides it. Left as Next's default (bundled) — that correctly
  // resolves the Node build.
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
