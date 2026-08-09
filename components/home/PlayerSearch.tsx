"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { searchPlayers, type PlayerSearchResult } from "@/lib/search";

export function PlayerSearch() {
  const t = useTranslations("PlayerSearch");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      searchPlayers(query).then((rows) => {
        setResults(rows);
        setOpen(true);
      });
    }, 200);
    return () => clearTimeout(timeoutRef.current);
  }, [query]);

  const showDropdown = open && query.trim().length >= 2;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <input
        type="search"
        inputMode="search"
        placeholder={t("placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
        aria-label={t("ariaLabel")}
      />
      {showDropdown && (
        <div className="bg-popover text-popover-foreground absolute z-10 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          {results.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">{t("noResults")}</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="hover:bg-accent hover:text-accent-foreground flex w-full flex-col px-3 py-2 text-left text-sm"
                    onClick={() => router.push(`/player/${r.id}`)}
                  >
                    <span className="font-medium">{r.name}</span>
                    {r.club && <span className="text-muted-foreground text-xs">{r.club}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
