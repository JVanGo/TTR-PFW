import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { AdminPlayerList, type AdminPlayerRow } from "./AdminPlayerList";
import { PlayerForm } from "./PlayerForm";
import { signOut } from "./actions";

interface RawPlayer {
  id: string;
  name: string;
  class: string;
  pfw: number;
  club: string | null;
  is_active: boolean;
}

export default async function AdminPage() {
  const supabase = await createClient();
  const data = await fetchAllRows<RawPlayer>(
    supabase,
    "players",
    "id, name, class, pfw, club, is_active",
  );
  data.sort((a, b) => b.pfw - a.pfw);

  const players: AdminPlayerRow[] = data.map((p) => ({
    id: p.id,
    name: p.name,
    class: p.class,
    pfw: Number(p.pfw),
    club: p.club,
    is_active: p.is_active,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Admin</h1>
          <p className="text-muted-foreground text-sm">
            Edit players individually, or use the import tool for bulk updates.
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-muted-foreground text-sm hover:underline">
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-md border p-4 lg:col-span-1">
          <h2 className="text-base font-semibold">Add player</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            Create a new player row. Mark inactive if they aren&apos;t in the current
            Verbandsrangliste.
          </p>
          <PlayerForm mode="create" />
        </div>
        <div className="rounded-md border p-4 lg:col-span-2">
          <h2 className="text-base font-semibold">Bulk import</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Replace the ranking or refresh match history by uploading the FLTT Excel exports.
          </p>
          <Link
            href="/admin/import"
            className="bg-foreground text-background mt-3 inline-flex rounded-md px-4 py-2 text-sm font-medium"
          >
            Open import tool →
          </Link>
        </div>
        <div className="rounded-md border p-4 lg:col-span-3">
          <h2 className="text-base font-semibold">Competitions</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Manage the competitions the Lineup Builder&apos;s competition picker offers (fixed team
            counts, team size, age limits).
          </p>
          <Link
            href="/admin/competitions"
            className="bg-foreground text-background mt-3 inline-flex rounded-md px-4 py-2 text-sm font-medium"
          >
            Manage competitions →
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">
          All players ({players.length.toLocaleString()})
        </h2>
        <AdminPlayerList players={players} />
      </section>
    </div>
  );
}
