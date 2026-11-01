"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { dateLocale } from "@/i18n/routing";

export interface TtrPoint {
  date: string;
  ttr: number;
  opponent: string;
  delta: number;
  score: string;
  result: "W" | "L" | "FF";
  /** Set only for the synthetic season-start point — shown instead of the
   * usual "vs opponent · score · result" line, with no delta (there's
   * nothing before it to have changed from). */
  label?: string;
}

interface Props {
  points: TtrPoint[];
}

function formatDate(d: string, locale: string): string {
  return new Date(d).toLocaleDateString(dateLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

/** One plotted point per game day: the rating after the day's last game,
 * the day's net change, and every game played that day for the tooltip. */
interface DayPoint {
  date: string;
  ttr: number;
  delta: number;
  games: TtrPoint[];
  label?: string;
}

// Points arrive in chronological order, so a day's games are consecutive.
// The season-start point keeps its own day (it's dated the day before the
// first game anyway) so its label never mixes with real games.
function groupByDay(points: TtrPoint[]): DayPoint[] {
  const days: DayPoint[] = [];
  for (const p of points) {
    const last = days[days.length - 1];
    if (p.label) {
      days.push({ date: p.date, ttr: p.ttr, delta: 0, games: [], label: p.label });
    } else if (last && !last.label && last.date === p.date) {
      last.ttr = p.ttr;
      last.delta += p.delta;
      last.games.push(p);
    } else {
      days.push({ date: p.date, ttr: p.ttr, delta: p.delta, games: [p] });
    }
  }
  return days;
}

function deltaClass(delta: number): string {
  return delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-muted-foreground";
}

function formatDelta(delta: number): string {
  return `(${delta >= 0 ? "+" : ""}${delta})`;
}

interface TooltipRenderProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DayPoint }>;
  locale: string;
  vsLabel: string;
  dtrLabel: string;
}

function ChartTooltip({ active, payload, locale, vsLabel, dtrLabel }: TooltipRenderProps) {
  if (!active || !payload || payload.length === 0) return null;
  const day = payload[0].payload;
  if (!day) return null;
  return (
    <div className="bg-popover text-popover-foreground max-w-xs rounded-md border px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{formatDate(day.date, locale)}</p>
      {day.label ? (
        <p>{day.label}</p>
      ) : (
        <ul className="my-1 space-y-0.5">
          {day.games.map((g, i) => (
            <li key={i}>
              {vsLabel} <span className="font-medium">{g.opponent}</span> ·{" "}
              {g.score && `${g.score} · `}
              {g.result} <span className={deltaClass(g.delta)}>{formatDelta(g.delta)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={day.label ? undefined : "border-t pt-1 font-medium"}>
        {dtrLabel} {day.ttr}
        {!day.label && (
          <>
            {" "}
            <span className={deltaClass(day.delta)}>{formatDelta(day.delta)}</span>
          </>
        )}
      </p>
    </div>
  );
}

export function TtrChart({ points }: Props) {
  const t = useTranslations("TtrChart");
  const locale = useLocale();
  if (points.length === 0) return null;
  const days = groupByDay(points);
  const ttrs = days.map((d) => d.ttr);
  const min = Math.min(...ttrs) - 10;
  const max = Math.max(...ttrs) + 10;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={days} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => formatDate(d, locale)}
            tick={{ fontSize: 11, fill: "currentColor" }}
            minTickGap={32}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 11, fill: "currentColor" }}
            width={48}
            tickFormatter={(v) => String(v)}
          />
          <Tooltip
            content={({ active, payload }) => (
              <ChartTooltip
                active={active ?? false}
                payload={payload as unknown as TooltipRenderProps["payload"]}
                locale={locale}
                vsLabel={t("vs")}
                dtrLabel={t("dtrLabel")}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="ttr"
            stroke="currentColor"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
