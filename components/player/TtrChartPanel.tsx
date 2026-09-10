"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TtrChart, type TtrPoint } from "@/components/player/TtrChart";

interface Props {
  seasonPoints: TtrPoint[];
  allTimePoints: TtrPoint[];
  showToggle: boolean;
}

export function TtrChartPanel({ seasonPoints, allTimePoints, showToggle }: Props) {
  const t = useTranslations("PlayerPage");
  const [mode, setMode] = useState<"season" | "all">("season");
  const points = mode === "season" ? seasonPoints : allTimePoints;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {mode === "season" ? t("seasonDtr") : t("allSeasonsDtr")}
        </h2>
        {showToggle && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("season")}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (mode === "season"
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              {t("thisSeason")}
            </button>
            <button
              type="button"
              onClick={() => setMode("all")}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (mode === "all"
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              {t("allSeasons")}
            </button>
          </div>
        )}
      </div>
      <div className="text-foreground rounded-md border p-2">
        <TtrChart points={points} />
      </div>
    </section>
  );
}
