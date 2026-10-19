"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  PAGE_SIZE,
  RankingTableRows,
  type RankingTableRow,
} from "@/components/ranking/RankingTableRows";

export type { RankingTableRow };

interface Props {
  rows: RankingTableRow[];
  clubs: string[];
  club: string;
  onClubChange: (club: string) => void;
}

export function RankingTable({ rows, clubs, club, onClubChange }: Props) {
  const t = useTranslations("RankingTable");
  const format = useFormatter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (club && row.club !== club) return false;
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, deferredSearch, club]);

  // Reset to page 1 whenever the filters change (React's render-time state
  // adjustment pattern — avoids a setState-in-effect cascade).
  const filterKey = `${deferredSearch}|${club}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="search"
          inputMode="search"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
          aria-label={t("searchAriaLabel")}
        />
        <select
          value={club}
          onChange={(e) => onClubChange(e.target.value)}
          className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
          aria-label={t("clubFilterAriaLabel")}
        >
          <option value="">{t("allClubs")}</option>
          {clubs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="text-muted-foreground text-sm">
        {t("showing", { count: filtered.length })}
        {club && t("atClub", { club })}.
      </p>

      <RankingTableRows
        rows={pageRows}
        formatNumber={(n) => format.number(n)}
        labels={{
          columnRank: t("columnRank"),
          columnName: t("columnName"),
          columnClub: t("columnClub"),
          columnDtr: t("columnDtr"),
          inactiveBadge: t("inactiveBadge"),
          noResults: t("noResults"),
        }}
      />

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="border-input rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            {t("previous")}
          </button>
          <span className="text-muted-foreground">
            {t("pageOf", { current: currentPage, total: pageCount })}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
            className="border-input rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      )}
    </div>
  );
}
