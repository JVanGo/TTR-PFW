"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { DtrBucket } from "@/lib/dtr-distribution";
import { klassierungForDtr } from "@/lib/klassierung";

interface Props {
  buckets: DtrBucket[];
}

interface TooltipRenderProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DtrBucket }>;
  countLabel: (count: number) => string;
  clickHint: (klassierung: string) => string;
}

function ChartTooltip({ active, payload, countLabel, clickHint }: TooltipRenderProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0].payload;
  if (!bucket) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">
        {bucket.start}–{bucket.end}
      </p>
      <p>{countLabel(bucket.count)}</p>
      <p className="text-muted-foreground mt-1">{clickHint(klassierungForDtr(bucket.start))}</p>
    </div>
  );
}

export function DtrDistributionChart({ buckets }: Props) {
  const t = useTranslations("DtrDistributionChart");
  const router = useRouter();
  if (buckets.length === 0) return null;

  // Each bucket is a plain 100-point DTR band, not a 1:1 Klassierung class
  // (9 is under 100 points wide, 18+ spans two buckets, N spans however many
  // are needed) — the bucket's own start value is enough to look up which
  // class it mostly falls in and jump straight to that filter. Recharts
  // nests the original data point under `.payload` on the bar it clicked.
  const goToClass = ({ payload }: { payload?: DtrBucket }) => {
    if (!payload) return;
    const level = encodeURIComponent(klassierungForDtr(payload.start));
    router.push(`/ranking?level=${level}`);
  };

  return (
    <div className="text-foreground h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="start" tick={{ fontSize: 11, fill: "currentColor" }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: "currentColor" }} width={40} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active, payload }) => (
              <ChartTooltip
                active={active ?? false}
                payload={payload as unknown as TooltipRenderProps["payload"]}
                countLabel={(count) => t("tooltipCount", { count })}
                clickHint={(klassierung) => t("clickHint", { klassierung })}
              />
            )}
          />
          <Bar
            dataKey="count"
            fill="currentColor"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
            onClick={goToClass}
            style={{ cursor: "pointer" }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
