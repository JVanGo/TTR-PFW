import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewcomerRow, type NewcomerPlayer } from "./NewcomerRow";

export default async function NewcomersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("id, name, class, pfw, club, created_at")
    .eq("age_category_reviewed", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const players: NewcomerPlayer[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    class: p.class,
    pfw: Number(p.pfw),
    club: p.club,
    created_at: p.created_at,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/admin" className="text-muted-foreground text-sm hover:underline">
        ← Back to admin
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        Newcomers to review
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Players added since you last checked, with no confirmed age group yet. Look each one up in
        FLTT&apos;s own records and either pick their youth age group or confirm they&apos;re an
        adult — a &quot;new&quot; row here is sometimes a longtime player only just added to this
        system for the first time, not a genuine beginner, so it&apos;s still worth a glance rather
        than assuming.
      </p>

      {players.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-sm">Nothing waiting on review.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Class</th>
                <th className="px-3 py-2 text-right font-medium">PFW</th>
                <th className="px-3 py-2 text-left font-medium">Club</th>
                <th className="px-3 py-2 text-left font-medium">Added</th>
                <th className="px-3 py-2 text-left font-medium">Age group</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <NewcomerRow key={p.id} player={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
