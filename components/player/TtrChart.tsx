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

export interface TtrPoint {
  date: string;
  ttr: number;
  opponent: string;
  delta: number;
  score: string;
  result: "W" | "L" | "FF";
}

interface Props {
  points: TtrPoint[];
}

function formatDate(d: string, locale: string): string {
  return new Date(d).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

interface TooltipRenderProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TtrPoint }>;
  locale: string;
  vsLabel: string;
  dtrLabel: string;
}

function ChartTooltip({ active, payload, locale, vsLabel, dtrLabel }: TooltipRenderProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  if (!point) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{formatDate(point.date, locale)}</p>
      <p>
        {vsLabel} <span className="font-medium">{point.opponent}</span> · {point.score} ·{" "}
        {point.result}
      </p>
      <p>
        {dtrLabel} {point.ttr}{" "}
        <span
          className={
            point.delta > 0
              ? "text-emerald-600"
              : point.delta < 0
                ? "text-red-600"
                : "text-muted-foreground"
          }
        >
          ({point.delta >= 0 ? "+" : ""}
          {point.delta})
        </span>
      </p>
    </div>
  );
}

export function TtrChart({ points }: Props) {
  const t = useTranslations("TtrChart");
  const locale = useLocale();
  if (points.length === 0) return null;
  const ttrs = points.map((p) => p.ttr);
  const min = Math.min(...ttrs) - 10;
  const max = Math.max(...ttrs) + 10;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
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
