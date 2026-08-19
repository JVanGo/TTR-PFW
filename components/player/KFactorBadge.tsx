"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buildKFactorBreakdown, type KFactorBreakdownReasonKey } from "@/lib/k-factor-breakdown";

interface Props {
  kFactor: number;
  ageBonus: number;
  isNewcomerBonus: boolean;
  isReturningBonus: boolean;
}

const REASON_LABEL_KEY: Record<KFactorBreakdownReasonKey, string> = {
  age: "kBreakdownAge",
  newcomer: "kBreakdownNewcomer",
  returning: "kBreakdownReturning",
};

export function KFactorBadge({ kFactor, ageBonus, isNewcomerBonus, isReturningBonus }: Props) {
  const t = useTranslations("PlayerPage");
  const [open, setOpen] = useState(false);
  const breakdown = buildKFactorBreakdown({
    kFactor,
    ageBonus,
    isNewcomerBonus,
    isReturningBonus,
  });

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="bg-muted text-foreground hover:bg-muted/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      >
        {t("kBadge", { value: kFactor })}
      </button>

      {open && (
        <>
          {/* Click-away catcher: covers the viewport so any outside tap closes the panel. */}
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="bg-popover text-popover-foreground absolute top-full left-0 z-20 mt-1 w-64 rounded-md border p-3 text-xs shadow-md">
            <p className="text-muted-foreground mb-2 font-medium">{t("kBreakdownTitle")}</p>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt>{t("kBreakdownBase")}</dt>
                <dd className="tabular-nums">{breakdown.base}</dd>
              </div>
              {breakdown.items.map((item) => (
                <div key={item.reason} className="flex justify-between">
                  <dt>{t(REASON_LABEL_KEY[item.reason])}</dt>
                  <dd className="tabular-nums">+{item.amount}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex justify-between border-t pt-2 font-medium">
              <dt>{t("kBreakdownTotal")}</dt>
              <dd className="tabular-nums">{breakdown.total}</dd>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
