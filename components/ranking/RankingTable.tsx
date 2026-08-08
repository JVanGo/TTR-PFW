"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

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
  initialClub: string;
}

const PAGE_SIZE = 50;

export function RankingTable({ rows, clubs, selectedLevel, initialClub }: Props) {
  const [search, setSearch] = useState("");
  const [club, setClub] = useState(initialClub);
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
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
          aria-label="Search players by name"
        />
        <select
          value={club}
          onChange={(e) => setClub(e.target.value)}
          className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
          aria-label="Filter by club"
        >
          <option value="">All clubs</option>
          {clubs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="text-muted-foreground text-sm">
        Showing {filtered.length.toLocaleString()} players
        {selectedLevel !== "All" && ` in Class ${selectedLevel}`}
        {club && ` at ${club}`}.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Club</th>
              <th className="px-3 py-2 text-left font-medium">Class</th>
              <th className="px-3 py-2 text-right font-medium">DTR</th>
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
                      inactive
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
                  No players match the current filters.
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
            ← Previous
          </button>
          <span className="text-muted-foreground">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
            className="border-input rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
