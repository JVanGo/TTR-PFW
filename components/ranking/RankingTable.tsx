"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export interface RankingTableRow {
  id: string;
  rank: number;
  name: string;
  club: string | null;
  dtr: number;
  klassierung: string;
  isActive: boolean;
}

interface Props {
  rows: RankingTableRow[];
  clubs: string[];
  selectedLevel: string;
  club: string;
  onClubChange: (club: string) => void;
}

const PAGE_SIZE = 50;

export function RankingTable({ rows, clubs, selectedLevel, club, onClubChange }: Props) {
  const t = useTranslations("RankingTable");
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
        {selectedLevel !== "All" && t("inClass", { level: selectedLevel })}
        {club && t("atClub", { club })}.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">{t("columnRank")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("columnName")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("columnClub")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("columnClass")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("columnDtr")}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className="hover:bg-accent/40 border-t">
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {row.rank.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/player/${row.id}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  {!row.isActive && (
                    <span className="bg-muted text-muted-foreground ml-2 inline-flex rounded-full px-2 py-0.5 text-xs">
                      {t("inactiveBadge")}
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-2">{row.club ?? "—"}</td>
                <td className="px-3 py-2">{row.klassierung}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.dtr}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-3 py-10 text-center">
                  {t("noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
