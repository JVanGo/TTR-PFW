import Link from "next/link";

export default function AboutPage() {
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
