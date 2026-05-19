import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { estimateTtr, isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { ClassPills } from "@/components/ranking/ClassPills";
import { RankingTable, type RankingRow } from "@/components/ranking/RankingTable";

interface PageProps {
  searchParams: Promise<{ kl?: string }>;
}

interface PlayerRow {
  id: string;
  name: string;
  class: PlayerClass;
  pfw: number;
  club: string | null;
  is_active: boolean;
}

export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const selectedKl = sp.kl && isPlayerClass(sp.kl) ? sp.kl : null;
  const selectedLabel = selectedKl ?? "All";

  const supabase = await createClient();
  const data = await fetchAllRows<PlayerRow>(
    supabase,
    "players",
    "id, name, class, pfw, club, is_active",
  );

  const all = data.slice().sort((a, b) => {
    if (b.pfw !== a.pfw) return b.pfw - a.pfw;
    return a.name.localeCompare(b.name);
  });

  const counts: Record<string, number> = {};
  for (const p of all) {
    counts[p.class] = (counts[p.class] ?? 0) + 1;
  }

  const filtered = selectedKl ? all.filter((p) => p.class === selectedKl) : all;

  const rows: RankingRow[] = filtered.map((p, i) => ({
    id: p.id,
    rank: i + 1,
    name: p.name,
    class: p.class,
    club: p.club,
    pfw: Number(p.pfw),
    estimatedTtr: estimateTtr(Number(p.pfw), p.class),
    isActive: p.is_active,
  }));

  const clubSet = new Set<string>();
  for (const p of filtered) {
    if (p.club) clubSet.add(p.club);
  }
  const clubs = Array.from(clubSet).sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          FLTT Ranking — with estimated TTR
        </h1>
        <p className="text-muted-foreground text-sm">
          The Luxembourg Verbandsrangliste with an estimated German TTR for each player.{" "}
          <Link href="/about" className="underline">
            Estimates explained →
          </Link>
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <ClassPills selected={selectedLabel} counts={counts} total={all.length} />
        <RankingTable rows={rows} clubs={clubs} selectedClass={selectedLabel} />
      </div>
    </div>
  );
}
