"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { pointsTable } from "@/lib/dtr-formula";

// Every K a player can have: 16 base, +4 or +8 for age, +4 newcomer, +4 returning.
const K_OPTIONS = [16, 20, 24, 28, 32] as const;

export function PointsTable() {
  const t = useTranslations("Calculator");
  const locale = useLocale();
  const [k, setK] = useState<number>(16);
  const rows = pointsTable(k);

  const signed = (n: number) => n.toLocaleString(locale, { signDisplay: "exceptZero" });
  const tone = (n: number) =>
    n > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : n < 0
        ? "text-red-600 dark:text-red-400"
        : "";
  const gapLabel = (from: number | null, to: number | null) =>
    from == null
      ? t("tableGapAtMost", { gap: signed(to!) })
      : to == null
        ? t("tableGapAtLeast", { gap: signed(from) })
        : from === to
          ? signed(from)
          : t("tableGapRange", { from: signed(from), to: signed(to) });

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{t("tableHeading")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{t("tableIntro")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("tableKLabel")}</span>
        <div className="bg-muted inline-flex rounded-md p-1" role="tablist">
          {K_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={k === option}
              onClick={() => setK(option)}
              className={
                "rounded px-3 py-1.5 font-medium tabular-nums " +
                (k === option ? "bg-background shadow-sm" : "text-muted-foreground")
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/80 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("tableGapHeader")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("win")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("loss")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.fromGap ?? "min"} className="border-t">
                <td className="px-3 py-2 tabular-nums">{gapLabel(row.fromGap, row.toGap)}</td>
                <td className={"px-3 py-2 text-right tabular-nums " + tone(row.win)}>
                  {signed(row.win)}
                </td>
                <td className={"px-3 py-2 text-right tabular-nums " + tone(row.loss)}>
                  {signed(row.loss)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">{t("tableExample")}</p>
    </section>
  );
}
