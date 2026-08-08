import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRankingRows, CURRENT_SEASON } from "@/lib/ranking";
import { TtrChart, type TtrPoint } from "@/components/player/TtrChart";

interface PageProps {
  params: Promise<{ id: string }>;
}

const SEASON = CURRENT_SEASON;

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
    .select("id, name, club, is_active")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load player: ${error.message}`);
  if (!player) notFound();

  const [
    { data: matchesData, error: matchesError },
    { data: summary, error: summaryError },
    rankingRows,
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, match_date, competition, opponent_name, opponent_player_id, opponent_ttr, score, result, ttr_delta, new_ttr, k_factor, created_at",
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
    getRankingRows(supabase),
  ]);

  if (matchesError) throw new Error(matchesError.message);
  if (summaryError) throw new Error(summaryError.message);

  const matches = matchesData ?? [];
  const ranking = rankingRows.find((r) => r.id === player.id);
  const currentDtr = ranking?.dtr ?? summary?.latest_ttr ?? null;
  const klassierung = ranking?.klassierung ?? null;
  const rankPosition = ranking?.rank ?? null;
  const totalPlayers = rankingRows.length;

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
      <Link href="/ranking" className="text-muted-foreground text-sm hover:underline">
        ← Back to ranking
      </Link>

      <header className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{player.name}</h1>
          <p className="text-muted-foreground text-sm">
            {klassierung && (
              <span className="bg-muted text-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                {klassierung}
              </span>
            )}{" "}
            {player.club ?? "—"}
            {!player.is_active && (
              <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                not on ranking
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs uppercase">DTR</p>
          <p className="text-4xl font-semibold tabular-nums sm:text-5xl">
            {currentDtr ?? "Not available"}
          </p>
        </div>
      </header>

      <p className="text-muted-foreground mt-3 text-sm">
        <Link href="/about" className="underline">
          How DTR works →
        </Link>
        {rankPosition !== null && (
          <>
            {" "}
            · #{rankPosition.toLocaleString()} of {totalPlayers.toLocaleString()} by DTR.
          </>
        )}
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
            <h2 className="mb-3 text-lg font-semibold">Season DTR</h2>
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
                    <th className="px-3 py-2 text-right font-medium">Opp. DTR</th>
                    <th className="px-3 py-2 text-right font-medium">Score</th>
                    <th className="px-3 py-2 text-center font-medium">W/L</th>
                    <th className="px-3 py-2 text-right font-medium">Δ</th>
                    <th className="px-3 py-2 text-right font-medium">K</th>
                    <th className="px-3 py-2 text-right font-medium">New DTR</th>
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
                      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                        {m.k_factor ?? "—"}
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
