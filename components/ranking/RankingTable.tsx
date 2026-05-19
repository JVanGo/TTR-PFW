"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { formatPfw } from "@/lib/format";

export interface RankingRow {
  id: string;
  rank: number;
  name: string;
  class: string;
  club: string | null;
  pfw: number;
  estimatedTtr: number;
  isActive: boolean;
}

interface Props {
  rows: RankingRow[];
  clubs: string[];
  selectedClass: string;
}

export function RankingTable({ rows, clubs, selectedClass }: Props) {
  const [search, setSearch] = useState("");
  const [club, setClub] = useState("");
  const deferredSearch = useDeferredValue(search);
  const deferredClub = useDeferredValue(club);

  const filtered = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (deferredClub && row.club !== deferredClub) return false;
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, deferredSearch, deferredClub]);

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
        Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} players
        {selectedClass !== "All" && ` in class ${selectedClass}`}.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Class</th>
              <th className="px-3 py-2 text-left font-medium">Club</th>
              <th className="px-3 py-2 text-right font-medium">FLTT PFW</th>
              <th className="px-3 py-2 text-right font-medium">Est. TTR</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
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
                      not on ranking
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{row.class}</td>
                <td className="text-muted-foreground px-3 py-2">{row.club ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPfw(row.pfw)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.estimatedTtr}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-10 text-center">
                  No players match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
