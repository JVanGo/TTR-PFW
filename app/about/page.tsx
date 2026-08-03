import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">About this site</h1>

      <p className="text-muted-foreground mt-4 text-sm leading-6">
        This page shows the official Luxembourg table tennis ranking (the FLTT Verbandsrangliste)
        alongside an estimated German TTR rating for every player. The estimates help FLTT place
        foreign players at the right level for tournaments and league matches.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Where the data comes from</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        The PFW values and class assignments come from the FLTT Verbandsrangliste (snapshot
        2025-08-13). Match histories are taken from the FLTT match exports for the 2025-2026 season
        and run through the FLTT IR-22 performance system to produce per-match TTR changes.
      </p>

      <h2 className="mt-8 text-lg font-semibold">How the TTR is estimated</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        We compared 41 players who appear in both the FLTT ranking and the German TTR ranking and
        fitted a linear regression:
      </p>
      <pre className="bg-muted/40 mt-3 overflow-x-auto rounded-md border p-3 text-xs">
        PFW ≈ 0.596 × TTR − 588 (R² = 0.78, n = 41)
      </pre>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Rearranged, the estimate for a player in A1–B3 is:
      </p>
      <pre className="bg-muted/40 mt-3 overflow-x-auto rounded-md border p-3 text-xs">
        TTR = round((PFW + 587.68) / 0.596)
      </pre>

      <h2 className="mt-8 text-lg font-semibold">How C1–D3 is estimated</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        The 41 matched players were all above TTR 1200, so the regression has no real data for this
        range, and PFW itself turned out not to be a reliable basis down there. Instead, C1–D3
        players are estimated from their classement points — the FLTT in-class standing that runs
        from -5,5 (about to drop a classement) to +11,5 (about to be promoted), a 17-point span per
        classement.
      </p>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Stacking all six classements (C1 down to D3) end to end turns classement + points into one
        continuous scale, anchored so C1&apos;s top (+11,5) is TTR 1345 and D3&apos;s 0 points is
        TTR 800. Because the scale is continuous, the bottom of one classement lines up exactly with
        the top of the next — no jump at the boundary. Players whose classement points haven&apos;t
        been entered yet show as &quot;not available&quot; rather than a guess.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Confidence</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        These are estimates only. Individual players can sit well above or below the line — the R²
        of 0.78 says the formula gets the broad picture right but can miss any one player by 100+
        TTR points. Use the estimate as a starting point, not a final verdict.
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
        <Link href="/" className="underline">
          ← Back to ranking
        </Link>
      </p>
    </div>
  );
}
