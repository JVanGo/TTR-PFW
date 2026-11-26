import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch every row of a Supabase select() in pages, bypassing PostgREST's
 * default 1,000-row response cap. Use only for small bounded tables —
 * `players` (~2.2k rows) and admin lists. For anything that grows without
 * bound (e.g. `matches`), paginate at the call site instead.
 */
export async function fetchAllRows<Row>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  pageSize = 1000,
): Promise<Row[]> {
  const out: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchAllRows(${table}): ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/**
 * Like fetchAllRows, but counts first and then fetches every page at once
 * (two round trips instead of one per page). Pages are ordered by `id`,
 * which must be unique, so no row is skipped or read twice between pages.
 * Used on public pages where load time matters (the DTR-Rechner); the
 * import/simulation code keeps the plain sequential fetchAllRows.
 */
export async function fetchAllRowsParallel<Row>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  pageSize = 1000,
): Promise<Row[]> {
  const { count, error: countError } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (countError) throw new Error(`fetchAllRowsParallel(${table}): ${countError.message}`);

  const pageCount = Math.ceil((count ?? 0) / pageSize);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, async (_, page) => {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .order("id")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(`fetchAllRowsParallel(${table}): ${error.message}`);
      return (data ?? []) as Row[];
    }),
  );
  return pages.flat();
}
