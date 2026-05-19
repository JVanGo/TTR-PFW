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
