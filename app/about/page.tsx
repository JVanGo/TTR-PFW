import Link from "next/link";
import { getRankingRows } from "@/lib/ranking";
import { bucketizeDtr } from "@/lib/dtr-distribution";
import { DtrDistributionChart } from "@/components/about/DtrDistributionChart";

// See app/page.tsx for why: without a cookie-bound client, Next would try to
// statically prerender this page at build time by hitting the live database
// directly — getRankingRows() is already cached, so a per-request render is
// cheap after the first hit.
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const rows = await getRankingRows();
  const buckets = bucketizeDtr(rows.map((r) => r.dtr));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">About this site</h1>

      <p className="text-muted-foreground mt-4 text-sm leading-6">
        This site tracks a DTR (Dëschtennis-Rating) for every player in the FLTT Verbandsrangliste —
        a rating that starts from a baseline value and moves up or down after every match of the
        season, the same way the German TTR rating works.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Where the data comes from</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Match histories are taken from the FLTT match exports for the 2025-2026 season and run
        through the DTR formula (see <code>DëschTennisRating.pdf</code>) to produce a per-match DTR
        change for every player.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Starting values</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Every player begins the season at a baseline rating rather than an estimate carried over
        from elsewhere: adult players start at 1025, and youth players start lower depending on
        their age group (900 for Cadets/Minimes, 850 for Benjamins/Poussins), since a new player
        hasn&apos;t yet built up match results that reflect their real strength.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Confidence</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        DTR is recalculated from real match results, not estimated — the more matches a player has
        played this season, the more it reflects their actual current form.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Current rating distribution</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        How today&apos;s {rows.length.toLocaleString()} DTR values are spread out, grouped into
        bands of 100 points.
      </p>
      <div className="mt-4 rounded-md border p-2">
        <DtrDistributionChart buckets={buckets} />
      </div>

      <h2 className="mt-8 text-lg font-semibold">
        Historical note: the original PFW-based estimate
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Before the DTR season simulation above existed, this site estimated a German TTR rating
        directly from each player&apos;s FLTT PFW score and class, using a regression fitted to 41
        players who appeared in both rankings (PFW ≈ 0.596 × TTR − 588, R² = 0.78). That estimate is
        no longer shown on the site — DTR, calculated from real matches, replaced it — but it&apos;s
        kept here for reference since some of the DTR system&apos;s starting values were
        cross-checked against it during development.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Further reading</h2>
      <ul className="text-muted-foreground mt-2 list-disc pl-6 text-sm leading-6">
        <li>
          <a
            href="https://www.fltt.lu/wp-content/uploads/2024/09/IR-22-Performance-System.pdf"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            FLTT IR-22 Performance System (PDF)
          </a>{" "}
          — the official PFW computation.
        </li>
        <li>
          <a
            href="https://www.mytischtennis.de/clicktt/TTR-Berechnung"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            DTTB TTR-Erklärung
          </a>{" "}
          — how the German TTR is calculated.
        </li>
      </ul>

      <p className="mt-8 text-sm">
        <Link href="/ranking" className="underline">
          ← Back to ranking
        </Link>
      </p>
    </div>
  );
}
