"use server";

import { revalidatePath } from "next/cache";
import { PDFParse } from "pdf-parse";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { extractTeamCounts } from "@/lib/import/team-counts";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    throw new Error("Not authenticated");
  }
  const admin = createAdminClient();
  const { data: allow } = await admin
    .from("admin_emails")
    .select("email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!allow) {
    throw new Error("Not authorised");
  }
  return user.email.toLowerCase();
}

async function extractPdfText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetching ${url} failed: HTTP ${res.status}`);
  const data = await res.arrayBuffer();
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  return result.text;
}

export async function importTeamCounts(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const competitionId = (formData.get("competition_id") as string | null)?.trim();
  const season = (formData.get("season") as string | null)?.trim();
  const mainUrl = (formData.get("main_url") as string | null)?.trim();
  const topTierUrl = (formData.get("top_tier_url") as string | null)?.trim() || null;

  if (!competitionId) return { status: "error", message: "Pick a competition." };
  if (!season) return { status: "error", message: "Season is required." };
  if (!mainUrl) return { status: "error", message: "Main schedule PDF URL is required." };

  let mainText: string;
  let topTierText: string | null = null;
  try {
    mainText = await extractPdfText(mainUrl);
    if (topTierUrl) topTierText = await extractPdfText(topTierUrl);
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }

  const supabase = await createClient();
  const players = await fetchAllRows<{ club: string | null }>(supabase, "players", "club");
  const clubs = Array.from(new Set(players.map((p) => p.club).filter((c): c is string => !!c)));

  const { counts, unmatched } = extractTeamCounts(clubs, mainText, topTierText);

  if (counts.size > 0) {
    const rows = Array.from(counts, ([club, team_count]) => ({
      competition_id: competitionId,
      club,
      season,
      team_count,
    }));
    const { error } = await supabase
      .from("competition_club_team_counts")
      .upsert(rows, { onConflict: "competition_id,club,season" });
    if (error) return { status: "error", message: error.message };
  }

  revalidatePath("/admin/competitions/team-counts");
  revalidatePath("/ranking");

  const found = Array.from(counts, ([club, count]) => `${club}: ${count}`).join(", ");
  const message =
    `Updated ${counts.size} club${counts.size === 1 ? "" : "s"}. ` +
    (counts.size > 0 ? `Found — ${found}. ` : "") +
    (unmatched.length > 0 ? `Not found in either document — ${unmatched.join(", ")}.` : "");
  return { status: "success", message };
}
