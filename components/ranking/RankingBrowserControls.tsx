"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

interface Props {
  clubs: string[];
  initialSearch: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  clubFilterAriaLabel: string;
  allClubsLabel: string;
}

/**
 * The bare (no level, no club) ranking view is server-paginated — unlike
 * RankingTable, there's no full row list in the browser to filter locally,
 * so search and club selection navigate to a fresh server render instead of
 * updating in place. Picking a club hands off to the existing (unchanged)
 * ClubRankingView/RankingTable flow, which is where local instant filtering
 * still applies.
 */
export function RankingBrowserControls({
  clubs,
  initialSearch,
  searchPlaceholder,
  searchAriaLabel,
  clubFilterAriaLabel,
  allClubsLabel,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = search.trim();
          router.push(value ? `/ranking?search=${encodeURIComponent(value)}` : "/ranking");
        }}
      >
        <input
          type="search"
          inputMode="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
          aria-label={searchAriaLabel}
        />
      </form>
      <select
        defaultValue=""
        onChange={(e) => {
          const value = e.target.value;
          router.push(value ? `/ranking?club=${encodeURIComponent(value)}` : "/ranking");
        }}
        className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
        aria-label={clubFilterAriaLabel}
      >
        <option value="">{allClubsLabel}</option>
        {clubs.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
