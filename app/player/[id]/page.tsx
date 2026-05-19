import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estimateTtr, isPlayerClass } from "@/lib/conversions";
import { formatPfw } from "@/lib/format";
import { TtrChart, type TtrPoint } from "@/components/player/TtrChart";

interface PageProps {
  params: Promise<{ id: string }>;
}

const SEASON = "2025-2026";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function PlayerPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player, error } = await supabase
    .from("players")
    .select("id, name, class, pfw, club, is_active")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load player: ${error.message}`);
  if (!player) notFound();
  if (!isPlayerClass(player.class)) {
    throw new Error(`Unexpected player class: ${player.class}`);
  }

  const [
    { data: matchesData, error: matchesError },
    { data: summary, error: summaryError },
    { count: totalCount, error: countError },
    { count: betterCount, error: betterError },
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, match_date, competition, opponent_name, opponent_player_id, opponent_ttr, score, result, ttr_delta, new_ttr, created_at",
      )
      .eq("player_id", player.id)
      .eq("season", SEASON)
      .order("match_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("player_season_summary")
      .select("matches_played, ttr_change_hironn, ttr_change_reckronn, latest_ttr")
      .eq("player_id", player.id)
      .eq("season", SEASON)
      .maybeSingle(),
    supabase.from("players").select("id", { count: "exact", head: true }),
    supabase.from("players").select("id", { count: "exact", head: true }).gt("pfw", player.pfw),
  ]);

  if (matchesError) throw new Error(matchesError.message);
  if (summaryError) throw new Error(summaryError.message);
  if (countError) throw new Error(countError.message);
  if (betterError) throw new Error(betterError.message);

  const matches = matchesData ?? [];
  const estimatedTtr = estimateTtr(Number(player.pfw), player.class);
  const rankPosition = (betterCount ?? 0) + 1;
  const totalPlayers = totalCount ?? 0;

  const chartPoints: TtrPoint[] = matches.map((m) => ({
    date: m.match_date,
    ttr: m.new_ttr,
    opponent: m.opponent_name,
    delta: m.ttr_delta,
    score: m.score ?? "",
    result: m.result as "W" | "L",
  }));

  const reverseMatches = [...matches].reverse();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/" className="text-muted-foreground text-sm hover:underline">
        ← Back to ranking
      </Link>

      <header className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{player.name}</h1>
          <p className="text-muted-foreground text-sm">
            <span className="bg-muted text-foreground rounded-full px-2 py-0.5 text-xs font-medium">
              {player.class}
            </span>{" "}
            {player.club ?? "—"}
            {!player.is_active && (
              <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                not on ranking
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-muted-foreground text-xs uppercase">FLTT PFW</p>
            <p className="text-2xl font-semibold tabular-nums">{formatPfw(Number(player.pfw))}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase">Estimated TTR</p>
            <p className="text-2xl font-semibold tabular-nums">{estimatedTtr}</p>
          </div>
        </div>
      </header>

      <p className="text-muted-foreground mt-3 text-sm">
        TTR estimated from PFW using the FLTT-calibrated formula.{" "}
        <Link href="/about" className="underline">
          How this works →
        </Link>{" "}
        · #{rankPosition.toLocaleString()} of {totalPlayers.toLocaleString()} in the FLTT ranking.
      </p>

      {!player.is_active && (
        <p className="bg-muted/40 mt-3 rounded-md border p-3 text-sm">
          This player is not in the current Verbandsrangliste.
        </p>
      )}

      {matches.length > 0 ? (
        <>
          <section className="mt-8">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-md border p-4">
                <p className="text-muted-foreground text-xs uppercase">Matches played</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {summary?.matches_played ?? matches.length}
                </p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-muted-foreground text-xs uppercase">Hironn (Aug–Dec)</p>
                <DeltaValue value={summary?.ttr_change_hironn ?? 0} />
              </div>
              <div className="rounded-md border p-4">
                <p className="text-muted-foreground text-xs uppercase">Réckronn (Jan–Apr)</p>
                <DeltaValue value={summary?.ttr_change_reckronn ?? 0} />
              </div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Season TTR</h2>
            <div className="text-foreground rounded-md border p-2">
              <TtrChart points={chartPoints} />
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Match history</h2>
            <div className="max-h-[28rem] overflow-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/80 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Competition</th>
                    <th className="px-3 py-2 text-left font-medium">Opponent</th>
                    <th className="px-3 py-2 text-right font-medium">Opp. TTR</th>
                    <th className="px-3 py-2 text-right font-medium">Score</th>
                    <th className="px-3 py-2 text-center font-medium">W/L</th>
                    <th className="px-3 py-2 text-right font-medium">Δ</th>
                    <th className="px-3 py-2 text-right font-medium">New TTR</th>
                  </tr>
                </thead>
                <tbody>
                  {reverseMatches.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.match_date)}</td>
                      <td className="text-muted-foreground px-3 py-2">{m.competition}</td>
                      <td className="px-3 py-2">
                        {m.opponent_player_id ? (
                          <Link
                            href={`/player/${m.opponent_player_id}`}
                            className="hover:underline"
                          >
                            {m.opponent_name}
                          </Link>
                        ) : (
                          <span>{m.opponent_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.opponent_ttr ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.score ?? "—"}</td>
                      <td
                        className={
                          "px-3 py-2 text-center font-medium " +
                          (m.result === "W" ? "text-emerald-600" : "text-red-600")
                        }
                      >
                        {m.result}
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right tabular-nums " +
                          (m.ttr_delta > 0
                            ? "text-emerald-600"
                            : m.ttr_delta < 0
                              ? "text-red-600"
                              : "text-muted-foreground")
                        }
                      >
                        {m.ttr_delta > 0 ? "+" : ""}
                        {m.ttr_delta}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.new_ttr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="bg-muted/40 text-muted-foreground mt-8 rounded-md border p-6 text-sm">
          No match history recorded for this season yet.
        </p>
      )}
    </div>
  );
}

function DeltaValue({ value }: { value: number }) {
  const color =
    value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-muted-foreground";
  return (
    <p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>
      {value > 0 ? "+" : ""}
      {value}
    </p>
  );
}
