import { createClient } from "@supabase/supabase-js";

/**
 * Plain anon-key client with no cookies/session attached. Only for reading
 * tables that are public to every visitor (RLS already allows anyone to
 * read `players`/`matches`) — safe to use inside `unstable_cache`, where the
 * result is shared across everyone's requests rather than one visitor's.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
