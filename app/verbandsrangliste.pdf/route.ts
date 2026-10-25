import { CURRENT_SEASON } from "@/lib/ranking";
import { createPublicClient } from "@/lib/supabase/public";
import {
  fetchLatestSnapshotTeilrunde,
  fetchSnapshotList,
  snapshotDateFor,
} from "@/lib/verbandsrangliste";
import { buildVerbandsranglistePdf } from "@/lib/verbandsrangliste-pdf";

/**
 * The newest Verbandsrangliste of the current season as a PDF, linked from
 * the Ranking page. Lives outside app/[locale]/ (proxy.ts skips `.pdf`
 * paths, so next-intl never rewrites it). Built on request, but the
 * snapshot is frozen, so the CDN may keep it for an hour.
 */
export async function GET() {
  const supabase = createPublicClient();
  const teilrunde = await fetchLatestSnapshotTeilrunde(supabase, CURRENT_SEASON);
  if (teilrunde == null) {
    return new Response("No Verbandsrangliste has been taken for this season yet.", {
      status: 404,
    });
  }

  const rows = await fetchSnapshotList(supabase, CURRENT_SEASON, teilrunde);
  const pdf = await buildVerbandsranglistePdf(
    rows,
    CURRENT_SEASON,
    teilrunde,
    snapshotDateFor(CURRENT_SEASON, teilrunde),
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Verbandsrangliste-${CURRENT_SEASON}-Teilrunde-${teilrunde}.pdf"`,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
