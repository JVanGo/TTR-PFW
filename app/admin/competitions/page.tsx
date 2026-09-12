import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { AdminCompetitionList, type AdminCompetitionRow } from "./AdminCompetitionList";
import { CompetitionForm } from "./CompetitionForm";

export default async function AdminCompetitionsPage() {
  const supabase = await createClient();
  const competitions = await fetchAllRows<AdminCompetitionRow>(
    supabase,
    "competitions",
    "id, name, max_age_category, fixed_team_count, team_size, small_last_team_counts",
  );
  competitions.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <Link href="/admin" className="text-muted-foreground text-sm hover:underline">
          ← Back to admin
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Competitions</h1>
        <p className="text-muted-foreground text-sm">
          Powers the competition picker in the Lineup Builder on the ranking page: how many teams
          are fixed (if any), what team size to use, and any max age category.
        </p>
        <Link
          href="/admin/competitions/team-counts"
          className="text-muted-foreground mt-2 inline-block text-sm hover:underline"
        >
          Import per-club team counts from FLTT →
        </Link>
      </div>

      <section className="mt-8 rounded-md border p-4">
        <h2 className="text-base font-semibold">Add competition</h2>
        <div className="mt-3">
          <CompetitionForm mode="create" />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">
          All competitions ({competitions.length.toLocaleString()})
        </h2>
        <AdminCompetitionList competitions={competitions} />
      </section>
    </div>
  );
}
