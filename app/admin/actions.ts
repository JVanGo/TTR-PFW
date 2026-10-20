"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlayerClass, type PlayerClass } from "@/lib/conversions";
import { CURRENT_SEASON, RANKING_CACHE_TAG } from "@/lib/ranking";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/age-categories";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function requireAdmin(): Promise<string> {
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

interface PlayerInput {
  name: string;
  class: PlayerClass;
  pfw: number;
  club: string | null;
  is_active: boolean;
  classement_points: number | null;
  age_category: AgeCategory | null;
  age_category_reviewed: true;
  starting_dtr: number | null;
  starting_dtr_season: string | null;
}

function parsePlayerForm(formData: FormData): PlayerInput | string {
  const name = (formData.get("name") as string | null)?.trim();
  const klRaw = (formData.get("class") as string | null)?.trim();
  const pfwRaw = (formData.get("pfw") as string | null)?.trim();
  const club = (formData.get("club") as string | null)?.trim() || null;
  const isActive = formData.get("is_active") === "on";
  const classementRaw = (formData.get("classement_points") as string | null)?.trim();
  const ageCategoryRaw = (formData.get("age_category") as string | null)?.trim() ?? "";
  const startingDtrRaw = (formData.get("starting_dtr") as string | null)?.trim();

  if (!name) return "Name is required.";
  if (!klRaw || !isPlayerClass(klRaw)) return "Pick a valid class (A1–D3).";
  const pfw = pfwRaw ? Number(pfwRaw) : NaN;
  if (!Number.isFinite(pfw)) return "PFW must be a number.";

  let classementPoints: number | null = null;
  if (classementRaw) {
    classementPoints = Number(classementRaw);
    if (!Number.isFinite(classementPoints)) return "Classement points must be a number.";
    if (classementPoints < -5.5 || classementPoints > 11.5) {
      return "Classement points must be between -5.5 and 11.5.";
    }
  }

  if (ageCategoryRaw !== "" && !(AGE_CATEGORIES as readonly string[]).includes(ageCategoryRaw)) {
    return "Pick a valid age category.";
  }

  let startingDtr: number | null = null;
  if (startingDtrRaw) {
    startingDtr = Number(startingDtrRaw);
    if (!Number.isInteger(startingDtr)) return "Starting DTR must be a whole number.";
    if (startingDtr < 0 || startingDtr > 3000) return "Starting DTR must be between 0 and 3000.";
  }

  return {
    name,
    class: klRaw,
    pfw,
    club,
    is_active: isActive,
    classement_points: classementPoints,
    age_category: ageCategoryRaw === "" ? null : (ageCategoryRaw as AgeCategory),
    age_category_reviewed: true,
    starting_dtr: startingDtr,
    starting_dtr_season: startingDtr == null ? null : CURRENT_SEASON,
  };
}

export async function createPlayer(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parsePlayerForm(formData);
  if (typeof parsed === "string") {
    return { status: "error", message: parsed };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("players").insert(parsed);
  if (error) {
    return { status: "error", message: error.message };
  }
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/ranking");
  updateTag(RANKING_CACHE_TAG);
  return { status: "success", message: `Added ${parsed.name}.` };
}

export async function updatePlayer(
  id: string,
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = parsePlayerForm(formData);
  if (typeof parsed === "string") {
    return { status: "error", message: parsed };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("players").update(parsed).eq("id", id);
  if (error) {
    return { status: "error", message: error.message };
  }
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/ranking");
  revalidatePath(`/player/${id}`);
  updateTag(RANKING_CACHE_TAG);
  return { status: "success", message: `Updated ${parsed.name}.` };
}

export async function deletePlayer(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/ranking");
  updateTag(RANKING_CACHE_TAG);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
