import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRankingRows, CURRENT_SEASON } from "@/lib/ranking";
import {
  isMatchInactive as computeIsMatchInactive,
  isRealMatchRow,
} from "@/lib/import/ttr-simulation";
import { type TtrPoint } from "@/components/player/TtrChart";
import { TtrChartPanel } from "@/components/player/TtrChartPanel";
import { KFactorBadge } from "@/components/player/KFactorBadge";
import { SiteFooter } from "@/components/SiteFooter";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}

/** One calendar day before an ISO date — used to place the synthetic
 * season-start chart point just before the earliest real row, without
 * assuming anything about season boundaries. */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface MatchForStartingDtr {
  match_date: string;
  competition: string;
  ttr_delta: number;
  new_ttr: number;
}

/**
 * The DTR a player began the season with, before any of this season's
 * matches changed it. `matches` is sorted earliest-first, so the player's
 * first calendar day of activity settles to their true starting number plus
 * that day's total change — working backwards from it recovers the exact
 * starting value the season simulation actually used, rather than
 * re-guessing it. The youth growth bonus and Ersteinstufung floor-reset both
 * apply immediately (not batched with that day's other results), so if the
 * first day has a real match or placement too, that row's settled total is
 * preferred over either synthetic row's intermediate one.
 */
function computeStartingDtr(matches: MatchForStartingDtr[]): number | null {
  if (matches.length === 0) return null;
  const earliestDate = matches[0].match_date;
  const earliestDayRows = matches.filter((m) => m.match_date === earliestDate);
  const settledRow =
    earliestDayRows.find(
      (m) =>
        m.competition !== "Nachwuchs-Spielstärkezuwachs" &&
        m.competition !== "Ersteinstufung-Mindestwert" &&
        m.competition !== "Inaktivitätsabzug",
    ) ?? earliestDayRows[0];
  const daySum = earliestDayRows.reduce((sum, m) => sum + m.ttr_delta, 0);
  return settledRow.new_ttr - daySum;
}

export default async function PlayerPage({ params, searchParams }: PageProps) {
  const t = await getTranslations("PlayerPage");
  const locale = await getLocale();
  const { id } = await params;
  const { season: requestedSeason } = await searchParams;
  const supabase = await createClient();

  const { data: player, error } = await supabase
    .from("players")
    .select("id, name, club, is_active, is_kader, age_category, last_match_date")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load player: ${error.message}`);
  if (!player) notFound();

  const { data: seasonSummaries, error: summariesError } = await supabase
    .from("player_season_summary")
    .select("season, matches_played, ttr_change_hironn, ttr_change_reckronn, latest_ttr")
    .eq("player_id", player.id)
    .order("season", { ascending: false });

  if (summariesError) throw new Error(summariesError.message);

  // Seasons this player has any data for, newest first, plus the current
  // season even if they haven't played a match in it yet — otherwise a
  // player who has only played in a past season (no summary row for
  // CURRENT_SEASON) would have exactly one entry here and the tabs below
  // would never render, leaving them stuck with no way to reach their real
  // past-season history. Only shown as tabs once there's more than one.
  // Falls back to the current season if the URL names one the player has no
  // data for.
  const summarySeasons = (seasonSummaries ?? []).map((s) => s.season);
  const seasons = summarySeasons.includes(CURRENT_SEASON)
    ? summarySeasons
    : [CURRENT_SEASON, ...summarySeasons];
  const selectedSeason =
    requestedSeason && seasons.includes(requestedSeason) ? requestedSeason : CURRENT_SEASON;
  const isCurrentSeason = selectedSeason === CURRENT_SEASON;
  const summary = seasonSummaries?.find((s) => s.season === selectedSeason) ?? null;

  const [
    { data: matchesData, error: matchesError },
    { data: allMatchesData, error: allMatchesError },
    rankingRows,
  ] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, match_date, competition, opponent_name, opponent_player_id, opponent_ttr, score, result, ttr_delta, new_ttr, k_factor, k_age_bonus, k_is_newcomer_bonus, k_is_returning_bonus, created_at",
      )
      .eq("player_id", player.id)
      .eq("season", selectedSeason)
      .order("match_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("matches")
      .select(
        "id, match_date, competition, opponent_name, opponent_player_id, opponent_ttr, score, result, ttr_delta, new_ttr, k_factor, k_age_bonus, k_is_newcomer_bonus, k_is_returning_bonus, created_at",
      )
      .eq("player_id", player.id)
      .order("match_date", { ascending: true })
      .order("created_at", { ascending: true }),
    getRankingRows(),
  ]);

  if (matchesError) throw new Error(matchesError.message);
  if (allMatchesError) throw new Error(allMatchesError.message);

  const matches = matchesData ?? [];
  const allMatches = allMatchesData ?? [];
  // The live ranking (rank/klassierung) only ever reflects the current
  // season — for a past season, the summary's own settled DTR is the only
  // number that still means anything.
  const ranking = isCurrentSeason ? rankingRows.find((r) => r.id === player.id) : undefined;
  // A player excluded from the live ranking (dropped off FLTT's official
  // list) whose Inaktivitätsabzug already hit its cap in a prior season gets
  // no fresh row in the current season either — nothing new to deduct, so
  // the simulation never writes one. Rather than show "Not available" for
  // someone whose real last-known rating we do have on file, fall back to
  // their most recent settled summary from any season (seasonSummaries is
  // already ordered newest-first, and only ever reaches this far when both
  // `ranking` and the current season's own `summary` come up empty).
  const currentDtr =
    ranking?.dtr ?? summary?.latest_ttr ?? seasonSummaries?.[0]?.latest_ttr ?? null;
  const klassierung = ranking?.klassierung ?? null;
  const rankPosition = ranking?.rank ?? null;
  const totalPlayers = rankingRows.length;

  const toChartPoint = (m: (typeof matches)[number]): TtrPoint => ({
    date: m.match_date,
    ttr: m.new_ttr,
    opponent: m.opponent_name,
    delta: m.ttr_delta,
    score: m.score ?? "",
    result: m.result as "W" | "L" | "FF",
  });
  // Prepend the season-start value (same number the match history table's
  // own "Season start" row shows) so the graph's line begins there instead
  // of jumping straight to the first real match's already-changed rating.
  const withStartingPoint = (points: TtrPoint[], startingValue: number | null): TtrPoint[] =>
    startingValue == null || points.length === 0
      ? points
      : [
          {
            date: dayBefore(points[0].date),
            ttr: startingValue,
            opponent: "",
            delta: 0,
            score: "",
            result: "W",
            label: t("seasonStart"),
          },
          ...points,
        ];
  const startingDtr = computeStartingDtr(matches);
  const allTimeStartingDtr = computeStartingDtr(allMatches);
  const chartPoints: TtrPoint[] = withStartingPoint(matches.map(toChartPoint), startingDtr);
  const allTimeChartPoints: TtrPoint[] = withStartingPoint(
    allMatches.map(toChartPoint),
    allTimeStartingDtr,
  );

  const reverseMatches = [...matches].reverse();
  // The most recent graded match across EVERY season (skipping placement/
  // growth/floor/forfeit rows, which carry no K-factor) reflects the
  // player's actual current K — sourced from allMatches, not the
  // season-scoped `matches`, so it doesn't disappear just because the
  // currently-viewed season has no matches yet (or show a stale K from
  // whichever past season happens to be selected).
  const currentKMatch = [...allMatches].reverse().find((m) => m.k_factor != null);
  const isMatchInactive =
    player.age_category == null &&
    computeIsMatchInactive(player.last_match_date, new Date().toISOString().slice(0, 10));

  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <Link href="/ranking" className="text-muted-foreground text-sm hover:underline">
          {t("backToRanking")}
        </Link>

        <header className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{player.name}</h1>
            <p className="text-muted-foreground text-sm">
              {klassierung && (
                <span className="bg-muted text-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                  {klassierung}
                </span>
              )}
              {player.is_kader && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {t("kaderBadge")}
                </span>
              )}
              {player.age_category && (
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-200">
                  {player.age_category}
                </span>
              )}{" "}
              {player.club ?? "—"}
              {!player.is_active && (
                <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {t("inactiveBadge")}
                </span>
              )}
              {isMatchInactive && (
                <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {t("matchInactiveBadge")}
                </span>
              )}
            </p>
            {currentKMatch &&
              currentKMatch.k_factor != null &&
              currentKMatch.k_age_bonus != null &&
              currentKMatch.k_is_newcomer_bonus != null &&
              currentKMatch.k_is_returning_bonus != null && (
                <div className="mt-1">
                  <KFactorBadge
                    kFactor={currentKMatch.k_factor}
                    ageBonus={currentKMatch.k_age_bonus}
                    isNewcomerBonus={currentKMatch.k_is_newcomer_bonus}
                    isReturningBonus={currentKMatch.k_is_returning_bonus}
                  />
                </div>
              )}
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-sm uppercase">{t("dtrLabel")}</p>
            <p className="text-4xl font-semibold tabular-nums sm:text-5xl">
              {currentDtr ?? t("notAvailable")}
            </p>
          </div>
        </header>

        {seasons.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {seasons.map((s) => (
              <Link
                key={s}
                href={`/player/${player.id}${s === CURRENT_SEASON ? "" : `?season=${s}`}`}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium " +
                  (s === selectedSeason
                    ? "bg-foreground text-background"
                    : "bg-muted text-foreground hover:bg-muted/70")
                }
              >
                {s}
              </Link>
            ))}
          </div>
        )}

        <p className="text-muted-foreground mt-3 text-sm">
          <Link href="/about" className="underline">
            {t("howItWorks")}
          </Link>
          {rankPosition !== null && t("rankOf", { rank: rankPosition, total: totalPlayers })}
        </p>

        {!player.is_active && (
          <p className="bg-muted/40 mt-3 rounded-md border p-3 text-sm">{t("inactiveNotice")}</p>
        )}

        {matches.length > 0 ? (
          <>
            <section className="mt-8">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-md border p-4">
                  <p className="text-muted-foreground text-xs uppercase">{t("matchesPlayed")}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {summary?.matches_played ??
                      matches.filter((m) => isRealMatchRow(m.competition)).length}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-muted-foreground text-xs uppercase">{t("hironn")}</p>
                  <DeltaValue value={summary?.ttr_change_hironn ?? 0} />
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-muted-foreground text-xs uppercase">{t("reckronn")}</p>
                  <DeltaValue value={summary?.ttr_change_reckronn ?? 0} />
                </div>
              </div>
            </section>

            <TtrChartPanel
              seasonPoints={chartPoints}
              allTimePoints={allTimeChartPoints}
              showToggle={seasons.length > 1}
            />

            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">{t("matchHistory")}</h2>
              <div className="max-h-[28rem] overflow-auto rounded-md border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/80 text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">{t("columnDate")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("columnCompetition")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("columnOpponent")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("columnOppDtr")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("columnScore")}</th>
                      <th className="px-3 py-2 text-center font-medium">{t("columnResult")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("columnDelta")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("columnK")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("columnNewDtr")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reverseMatches.map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDate(m.match_date, locale)}
                        </td>
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
                        <td className="px-3 py-2 text-right tabular-nums">
                          {m.opponent_ttr ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.score ?? "—"}</td>
                        <td
                          className={
                            "px-3 py-2 text-center font-medium " +
                            (m.result === "W"
                              ? "text-emerald-600"
                              : m.result === "L"
                                ? "text-red-600"
                                : "text-muted-foreground")
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
                    <tr className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">—</td>
                      <td className="text-muted-foreground px-3 py-2">{t("seasonStart")}</td>
                      <td className="px-3 py-2">—</td>
                      <td className="px-3 py-2 text-right tabular-nums">—</td>
                      <td className="px-3 py-2 text-right tabular-nums">—</td>
                      <td className="text-muted-foreground px-3 py-2 text-center font-medium">—</td>
                      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">—</td>
                      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">—</td>
                      <td className="px-3 py-2 text-right tabular-nums">{startingDtr ?? "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <p className="bg-muted/40 text-muted-foreground mt-8 rounded-md border p-6 text-sm">
            {t("noMatches")}
          </p>
        )}
      </div>
      <SiteFooter />
    </>
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
