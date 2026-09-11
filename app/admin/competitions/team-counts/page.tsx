import Link from "next/link";
import { getCompetitions } from "@/lib/competitions";
import { CURRENT_SEASON } from "@/lib/ranking";
import { ImportForm } from "./ImportForm";

// Raises the Server Actions on this page as close to Vercel Hobby's ceiling
// as the plan allows — fetching + parsing two PDFs plus a players query can
// run past the 10s default, which kills the function outright (a bare
// browser-level failure, not a graceful error message).
export const maxDuration = 60;

export default async function TeamCountsPage() {
  const competitions = await getCompetitions();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div>
        <Link href="/admin/competitions" className="text-muted-foreground text-sm hover:underline">
          ← Back to competitions
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Import team counts
        </h1>
        <p className="text-muted-foreground text-sm">
          Reads FLTT&apos;s published schedule PDFs and works out how many teams each club has
          entered, so the Lineup Builder can suggest the right number instead of you picking it by
          hand. Paste in the current round&apos;s PDF URLs from fltt.lu (Sport National →
          Compétitions par équipes → Championnats - Programmes) — the &quot;top-tier&quot; URL is
          only needed for competitions that split their strongest division into its own PDF (like
          Championnat Seniors&apos; National TT League).
        </p>
      </div>

      <section className="mt-8 rounded-md border p-4">
        <ImportForm competitions={competitions} defaultSeason={CURRENT_SEASON} />
      </section>
    </div>
  );
}
