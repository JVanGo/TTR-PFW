"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DtrBucket } from "@/lib/dtr-distribution";

interface Props {
  buckets: DtrBucket[];
}

interface TooltipRenderProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DtrBucket }>;
}

function ChartTooltip({ active, payload }: TooltipRenderProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0].payload;
  if (!bucket) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">
        {bucket.start}–{bucket.end}
      </p>
      <p>
        {bucket.count.toLocaleString()} {bucket.count === 1 ? "player" : "players"}
      </p>
    </div>
  );
}

export function DtrDistributionChart({ buckets }: Props) {
  if (buckets.length === 0) return null;

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
              />
            )}
          />
          <Bar
            dataKey="count"
            fill="currentColor"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
