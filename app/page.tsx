import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRankingRows } from "@/lib/ranking";
import { PlayerSearch } from "@/components/home/PlayerSearch";

export default async function HomePage() {
  const supabase = await createClient();
  const rows = await getRankingRows(supabase);

  const clubCounts = new Map<string, number>();
  for (const p of rows) {
    if (!p.club) continue;
    clubCounts.set(p.club, (clubCounts.get(p.club) ?? 0) + 1);
  }
  const clubs = Array.from(clubCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">FLTT DTR Ranking</h1>
      <p className="text-muted-foreground mt-3 text-base leading-7">
        DTR (Dëschtennis-Rating) is a rating that tracks every player&apos;s real playing strength,
        recalculated after each match of the 2025-2026 season. It&apos;s based on the same system
        used for the German TTR rating: win a match against a similarly-rated opponent and your
        rating goes up by a handful of points; lose, and it goes down. Beating a much stronger
        player is worth more, losing to a much weaker one costs more.
      </p>
      <p className="text-muted-foreground mt-4 text-base leading-7">
        Every player started the season with a baseline rating: adult players began at 1025, younger
        players began lower (900 or 850, depending on age group) since the rating hasn&apos;t yet
        had a chance to reflect their real strength. From there, every match this season has moved
        each player&apos;s rating up or down to where it stands today.{" "}
        <Link href="/about" className="underline">
          Read more →
        </Link>
      </p>

      <div className="mt-8">
        <PlayerSearch />
      </div>

      <div className="mt-4">
        <Link
          href="/ranking"
          className="text-sm font-medium underline underline-offset-4 hover:no-underline"
        >
          Browse the full ranking →
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Clubs</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse players by club — {clubs.length.toLocaleString()} clubs in total.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {clubs.map(([club, count]) => (
            <Link
              key={club}
              href={`/ranking?club=${encodeURIComponent(club)}`}
              className="hover:bg-accent hover:text-accent-foreground flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span>{club}</span>
              <span className="text-muted-foreground tabular-nums">{count}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
