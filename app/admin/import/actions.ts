"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRangliste, diffRangliste, type RanglistEntry } from "@/lib/import/verbandsrangliste";
import { parseSaisonentwicklung, type ParsedMatch } from "@/lib/import/saisonentwicklung";
import { nameKey } from "@/lib/name-key";
import { RANKING_CACHE_TAG } from "@/lib/ranking";

export interface RanglistImportState {
  status: "idle" | "success" | "error";
  message?: string;
  summary?: {
    updated: number;
    added: number;
    deactivated: number;
  };
}

export interface RanglistPreviewState {
  status: "idle" | "success" | "error";
  message?: string;
  toInsertCount?: number;
  toUpdateCount?: number;
  toDeactivateCount?: number;
  clubChanges?: { name: string; from: string | null; to: string | null }[];
  clubChangesTruncated?: boolean;
  deactivated?: string[];
  deactivatedTruncated?: boolean;
}

const PREVIEW_LIST_LIMIT = 30;

interface ExistingPlayerRow {
  id: string;
  name: string;
  name_key: string;
  club: string | null;
  is_active: boolean;
}

/** Paginated fetch of every player, shared by the preview and apply steps so
 * both diff against the exact same snapshot's shape. */
async function fetchAllPlayersForDiff(admin: SupabaseClient): Promise<ExistingPlayerRow[]> {
  const existing: ExistingPlayerRow[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await admin
      .from("players")
      .select("id, name, name_key, club, is_active")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    existing.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return existing;
}

function clubKey(club: string | null): string {
  return (club ?? "").trim().toLowerCase();
}

export interface MatchImportState {
  status: "idle" | "success" | "error";
  message?: string;
  summary?: {
    matchesAdded: number;
    playersTouched: number;
    opponentsLinked: number;
    unmatchedSheets: number;
  };
}

const SEASON = "2026-2027";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Not authenticated");
  const admin = createAdminClient();
  const { data: allow } = await admin
    .from("admin_emails")
    .select("email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!allow) throw new Error("Not authorised");
  return admin;
}

/**
 * Parses and diffs an uploaded Verbandsrangliste against production without
 * writing anything — lets the admin see exactly what would happen (added,
 * updated, and especially who'd be marked inactive for simply not appearing
 * in this one file) before committing. See importRangliste for the same diff
 * actually applied.
 */
export async function previewRangliste(formData: FormData): Promise<RanglistPreviewState> {
  try {
    const admin = await requireAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", message: "Pick a .xlsx file to upload." };
    }
    const buffer = await file.arrayBuffer();
    const parsed = parseRangliste(buffer);
    if (parsed.length === 0) {
      return { status: "error", message: "Couldn't find any player rows in that file." };
    }

    const existing = await fetchAllPlayersForDiff(admin);
    const diff = diffRangliste(parsed, existing);

    const nameById = new Map(existing.map((p) => [p.id, p.name]));
    const clubById = new Map(existing.map((p) => [p.id, p.club]));

    const clubChangesAll = diff.toUpdate
      .map(({ id, entry }) => ({
        name: entry.name,
        from: clubById.get(id) ?? null,
        to: entry.club,
      }))
      .filter((c) => clubKey(c.from) !== clubKey(c.to));

    const deactivatedAll = diff.toDeactivate
      .map((id) => nameById.get(id))
      .filter((n): n is string => n != null);

    return {
      status: "success",
      toInsertCount: diff.toInsert.length,
      toUpdateCount: diff.toUpdate.length,
      toDeactivateCount: diff.toDeactivate.length,
      clubChanges: clubChangesAll.slice(0, PREVIEW_LIST_LIMIT),
      clubChangesTruncated: clubChangesAll.length > PREVIEW_LIST_LIMIT,
      deactivated: deactivatedAll.slice(0, PREVIEW_LIST_LIMIT),
      deactivatedTruncated: deactivatedAll.length > PREVIEW_LIST_LIMIT,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: "error", message };
  }
}

export async function importRangliste(formData: FormData): Promise<RanglistImportState> {
  try {
    const admin = await requireAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", message: "Pick a .xlsx file to upload." };
    }
    const buffer = await file.arrayBuffer();
    const parsed = parseRangliste(buffer);
    if (parsed.length === 0) {
      return { status: "error", message: "Couldn't find any player rows in that file." };
    }

    const existing = await fetchAllPlayersForDiff(admin);
    const diff = diffRangliste(parsed, existing);

    if (diff.toInsert.length > 0) {
      const rows = diff.toInsert.map((e: RanglistEntry) => ({
        name: e.name,
        class: e.class,
        pfw: e.pfw,
        club: e.club,
        is_active: true,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await admin.from("players").insert(chunk);
        if (error) return { status: "error", message: error.message };
      }
    }

    if (diff.toUpdate.length > 0) {
      await Promise.all(
        diff.toUpdate.map(({ id, entry }) =>
          admin
            .from("players")
            .update({
              name: entry.name,
              class: entry.class,
              pfw: entry.pfw,
              club: entry.club,
              is_active: true,
            })
            .eq("id", id),
        ),
      );
    }

    if (diff.toDeactivate.length > 0) {
      await admin.from("players").update({ is_active: false }).in("id", diff.toDeactivate);
    }

    revalidatePath("/");
    revalidatePath("/admin");
    updateTag(RANKING_CACHE_TAG);

    return {
      status: "success",
      summary: {
        added: diff.toInsert.length,
        updated: diff.toUpdate.length,
        deactivated: diff.toDeactivate.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: "error", message };
  }
}

export async function importMatches(
  _prev: MatchImportState,
  formData: FormData,
): Promise<MatchImportState> {
  try {
    const admin = await requireAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", message: "Pick a .xlsx file to upload." };
    }
    const buffer = await file.arrayBuffer();
    const parsed = parseSaisonentwicklung(buffer);
    if (parsed.length === 0) {
      return { status: "error", message: "No per-player sheets found in that workbook." };
    }

    const players: Array<{ id: string; name_key: string }> = [];
    let from = 0;
    const pageSize = 1000;
    for (;;) {
      const { data, error } = await admin
        .from("players")
        .select("id, name_key")
        .range(from, from + pageSize - 1);
      if (error) return { status: "error", message: error.message };
      if (!data || data.length === 0) break;
      players.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const byKey = new Map(players.map((p) => [p.name_key, p.id]));

    const playerIdsTouched = new Set<string>();
    for (const sheet of parsed) {
      const playerId = byKey.get(sheet.nameKey);
      if (playerId) playerIdsTouched.add(playerId);
    }

    if (playerIdsTouched.size > 0) {
      await admin
        .from("matches")
        .delete()
        .in("player_id", Array.from(playerIdsTouched))
        .eq("season", SEASON);
    }

    let totalInserted = 0;
    let opponentsLinked = 0;
    let unmatched = 0;
    const batch: Array<Record<string, unknown>> = [];

    const flush = async () => {
      if (batch.length === 0) return;
      const { error } = await admin.from("matches").insert(batch);
      if (error) throw new Error(error.message);
      totalInserted += batch.length;
      batch.length = 0;
    };

    for (const sheet of parsed) {
      const playerId = byKey.get(sheet.nameKey);
      if (!playerId) {
        unmatched++;
        continue;
      }
      for (const m of sheet.matches as ParsedMatch[]) {
        const oppId = byKey.get(nameKey(m.opponent_name)) ?? null;
        if (oppId) opponentsLinked++;
        batch.push({
          player_id: playerId,
          match_date: m.date,
          competition: m.competition,
          opponent_name: m.opponent_name,
          opponent_player_id: oppId,
          opponent_ttr: m.opponent_ttr,
          score: m.score,
          result: m.result,
          ttr_delta: m.ttr_delta,
          new_ttr: m.new_ttr,
          season: SEASON,
        });
        if (batch.length >= 1000) await flush();
      }
    }
    await flush();

    revalidatePath("/");
    revalidatePath("/admin");
    updateTag(RANKING_CACHE_TAG);

    return {
      status: "success",
      summary: {
        matchesAdded: totalInserted,
        playersTouched: playerIdsTouched.size,
        opponentsLinked,
        unmatchedSheets: unmatched,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: "error", message };
  }
}
