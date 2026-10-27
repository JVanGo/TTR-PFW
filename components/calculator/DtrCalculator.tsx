"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/age-categories";
import { calculateMatchday, kFactorFor, type CalculatedMatchday } from "@/lib/dtr-formula";
import type { CalculatorPlayer } from "@/lib/calculator-players";
import { Button } from "@/components/ui/button";

type Mode = "single" | "matchday";

interface Side {
  /** The picked player, or null when the DTR was typed in. */
  player: CalculatorPlayer | null;
  dtr: string;
  ageCategory: AgeCategory | null;
  newcomer: boolean;
  returning: boolean;
}

interface Opponent extends Side {
  key: number;
  won: boolean;
}

const EMPTY_SIDE: Side = {
  player: null,
  dtr: "",
  ageCategory: null,
  newcomer: false,
  returning: false,
};

const MAX_RESULTS = 8;

/** Lowercase, accents stripped — so "muller" finds "MÜLLER". */
function searchKey(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function kOf(side: Side): number {
  return kFactorFor({
    ageCategory: side.ageCategory,
    careerMatches: side.newcomer ? 0 : Infinity,
    returningGamesLeft: side.returning ? 1 : 0,
  }).k;
}

function parsedDtr(side: Side): number | null {
  const n = Number(side.dtr);
  return side.dtr.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** A picked player fills in everything their next game's K depends on. */
function sideFromPlayer(player: CalculatorPlayer): Side {
  return {
    player,
    dtr: String(player.dtr),
    ageCategory: player.ageCategory,
    newcomer: player.careerMatches != null && player.careerMatches < 30,
    returning: (player.returningGamesLeft ?? 0) > 0,
  };
}

export function DtrCalculator({ players }: { players: CalculatorPlayer[] }) {
  const t = useTranslations("Calculator");
  const [mode, setMode] = useState<Mode>("single");
  const [self, setSelf] = useState<Side>(EMPTY_SIDE);
  const [opponents, setOpponents] = useState<Opponent[]>([{ ...EMPTY_SIDE, key: 0, won: true }]);
  const [nextKey, setNextKey] = useState(1);

  const shownOpponents = mode === "single" ? opponents.slice(0, 1) : opponents;

  const selfDtr = parsedDtr(self);
  const opponentDtrs = shownOpponents.map(parsedDtr);
  const result =
    selfDtr != null && opponentDtrs.every((d) => d != null)
      ? calculateMatchday(
          { dtr: selfDtr, k: kOf(self) },
          shownOpponents.map((o, i) => ({
            opponent: { dtr: opponentDtrs[i]!, k: kOf(o) },
            won: o.won,
          })),
        )
      : null;

  function updateOpponent(key: number, patch: Partial<Opponent>) {
    setOpponents((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-muted inline-flex w-fit rounded-md p-1 text-sm" role="tablist">
        {(["single", "matchday"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={
              "rounded px-3 py-1.5 font-medium " +
              (mode === m ? "bg-background shadow-sm" : "text-muted-foreground")
            }
          >
            {t(m === "single" ? "modeSingle" : "modeMatchday")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SideCard title={t("you")} side={self} players={players} onChange={setSelf} />

        <div className="flex flex-col gap-4">
          {shownOpponents.map((o, i) => (
            <SideCard
              key={o.key}
              title={mode === "single" ? t("opponent") : t("opponentN", { number: i + 1 })}
              side={o}
              players={players}
              onChange={(side) => updateOpponent(o.key, side)}
              onRemove={
                mode === "matchday" && opponents.length > 1
                  ? () => setOpponents((prev) => prev.filter((x) => x.key !== o.key))
                  : undefined
              }
            >
              <WinLossToggle won={o.won} onChange={(won) => updateOpponent(o.key, { won })} />
            </SideCard>
          ))}
          {mode === "matchday" && (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                setOpponents((prev) => [...prev, { ...EMPTY_SIDE, key: nextKey, won: true }]);
                setNextKey((k) => k + 1);
              }}
            >
              <Plus /> {t("addOpponent")}
            </Button>
          )}
        </div>
      </div>

      {result && selfDtr != null ? (
        <Result
          mode={mode}
          self={self}
          selfDtr={selfDtr}
          opponents={shownOpponents}
          opponentDtrs={opponentDtrs as number[]}
          result={result}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t("enterNumbers")}</p>
      )}
    </div>
  );
}

function SideCard({
  title,
  side,
  players,
  onChange,
  onRemove,
  children,
}: {
  title: string;
  side: Side;
  players: CalculatorPlayer[];
  onChange: (side: Side) => void;
  onRemove?: () => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations("Calculator");
  const k = kOf(side);
  const unknownCounts = side.player != null && side.player.careerMatches == null;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={t("remove")}
          >
            <X />
          </Button>
        )}
      </div>

      <PlayerPicker
        players={players}
        picked={side.player}
        onPick={(p) => onChange(p ? sideFromPlayer(p) : { ...side, player: null })}
      />

      <label className="flex items-center gap-2 text-sm">
        <span className="w-24 shrink-0">{t("dtr")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={side.dtr}
          onChange={(e) => onChange({ ...side, player: null, dtr: e.target.value })}
          className="border-input bg-background w-28 rounded-md border px-2 py-1 tabular-nums"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="w-24 shrink-0">{t("ageGroup")}</span>
        <select
          value={side.ageCategory ?? ""}
          onChange={(e) =>
            onChange({ ...side, ageCategory: (e.target.value || null) as AgeCategory | null })
          }
          className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1"
        >
          <option value="">{t("adult")}</option>
          {AGE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={side.newcomer}
          onChange={(e) => onChange({ ...side, newcomer: e.target.checked })}
        />
        {t("newcomerLabel")}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={side.returning}
          onChange={(e) => onChange({ ...side, returning: e.target.checked })}
        />
        {t("returningLabel")}
      </label>

      <p className="text-sm font-medium">{t("kLabel", { k })}</p>
      {unknownCounts && <p className="text-muted-foreground text-xs">{t("kUnknownNote")}</p>}

      {children}
    </div>
  );
}

function PlayerPicker({
  players,
  picked,
  onPick,
}: {
  players: CalculatorPlayer[];
  picked: CalculatorPlayer | null;
  onPick: (player: CalculatorPlayer | null) => void;
}) {
  const t = useTranslations("Calculator");
  const [query, setQuery] = useState("");

  if (picked) {
    return (
      <div className="bg-muted flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
        <span className="min-w-0">
          <span className="font-medium">{picked.name}</span>
          {picked.club && <span className="text-muted-foreground"> · {picked.club}</span>}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onPick(null)}
          aria-label={t("clearPick")}
        >
          <X />
        </Button>
      </div>
    );
  }

  const needle = searchKey(query.trim());
  const matches =
    needle.length >= 2
      ? players.filter((p) => searchKey(p.name).includes(needle)).slice(0, MAX_RESULTS)
      : [];

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
      />
      {matches.length > 0 && (
        <ul className="bg-background absolute z-10 mt-1 w-full divide-y rounded-md border shadow-md">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  onPick(p);
                }}
                className="hover:bg-accent flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm"
              >
                <span className="min-w-0">
                  {p.name}
                  {p.club && <span className="text-muted-foreground"> · {p.club}</span>}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">{p.dtr}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WinLossToggle({ won, onChange }: { won: boolean; onChange: (won: boolean) => void }) {
  const t = useTranslations("Calculator");
  return (
    <div className="flex gap-2">
      {[true, false].map((w) => (
        <Button
          key={String(w)}
          type="button"
          variant={won === w ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(w)}
          aria-pressed={won === w}
        >
          {t(w ? "win" : "loss")}
        </Button>
      ))}
    </div>
  );
}

function Result({
  mode,
  self,
  selfDtr,
  opponents,
  opponentDtrs,
  result,
}: {
  mode: Mode;
  self: Side;
  selfDtr: number;
  opponents: Opponent[];
  opponentDtrs: number[];
  result: CalculatedMatchday;
}) {
  const t = useTranslations("Calculator");
  const locale = useLocale();
  const num = (n: number, digits: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const signed = (n: number) => (n + 0).toLocaleString(locale, { signDisplay: "exceptZero" });
  const tone = (n: number) =>
    n > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : n < 0
        ? "text-red-600 dark:text-red-400"
        : "";
  const opponentName = (i: number) =>
    opponents[i].player?.name ??
    (mode === "single" ? t("opponent") : t("opponentN", { number: i + 1 }));
  const selfK = kOf(self);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border p-4">
        <h2 className="mb-3 font-semibold">{t("result")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{self.player?.name ?? t("you")}</span>
            <span className="tabular-nums">
              {selfDtr} → <span className="font-semibold">{result.newDtr}</span>{" "}
              <span className={tone(result.totalDelta)}>({signed(result.totalDelta)})</span>
            </span>
          </li>
          {result.games.map((g, i) => (
            <li
              key={opponents[i].key}
              className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-2"
            >
              <span>{opponentName(i)}</span>
              <span className="tabular-nums">
                {opponentDtrs[i]} → {g.opponentNewDtr}{" "}
                <span className={tone(g.opponentDelta)}>({signed(g.opponentDelta)})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border p-4 text-sm">
        <h2 className="mb-2 font-semibold">{t("howHeading")}</h2>
        <p className="text-muted-foreground">{t("formulaChance")}</p>
        <p className="text-muted-foreground">{t("formulaChange")}</p>

        <ol className="mt-4 flex flex-col gap-4">
          {result.games.map((g, i) => {
            const oppK = kOf(opponents[i]);
            const oppDtr = opponentDtrs[i];
            const won = opponents[i].won;
            return (
              <li key={opponents[i].key} className="flex flex-col gap-1">
                <p className="font-medium">
                  {t("gameLine", {
                    number: i + 1,
                    name: opponentName(i),
                    dtr: oppDtr,
                    result: t(won ? "win" : "loss"),
                  })}
                </p>
                <p className="tabular-nums">
                  {t("chanceLine", {
                    opp: oppDtr,
                    self: selfDtr,
                    p: num(g.winProbability * 100, 1),
                  })}
                </p>
                <p className="tabular-nums">
                  {t("changeLine", {
                    result: won ? 1 : 0,
                    p: num(g.winProbability, 3),
                    k: selfK,
                    exact: num(g.exactDelta, 2),
                    delta: signed(g.delta),
                  })}
                </p>
                <p className="text-muted-foreground tabular-nums">
                  {t("opponentChangeLine", {
                    name: opponentName(i),
                    result: won ? 0 : 1,
                    p: num(1 - g.winProbability, 3),
                    k: oppK,
                    delta: signed(g.opponentDelta),
                  })}
                </p>
              </li>
            );
          })}
        </ol>

        <p className="mt-4 font-medium tabular-nums">
          {t("totalLine", {
            calc: `${selfDtr}${result.games
              .map((g) => (g.delta < 0 ? ` − ${-g.delta}` : ` + ${g.delta + 0}`))
              .join("")} = ${result.newDtr}`,
          })}
        </p>
        {mode === "matchday" && result.games.length > 1 && (
          <p className="text-muted-foreground mt-1 text-xs">{t("startOfDayNote")}</p>
        )}
      </div>
    </div>
  );
}
