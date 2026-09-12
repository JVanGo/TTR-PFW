"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AGE_CATEGORIES } from "@/lib/age-categories";

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

interface CompetitionInput {
  name: string;
  max_age_category: string | null;
  fixed_team_count: number | null;
  team_size: number;
  small_last_team_clubs: string[];
}

function parseCompetitionForm(formData: FormData): CompetitionInput | string {
  const name = (formData.get("name") as string | null)?.trim();
  const maxAgeRaw = (formData.get("max_age_category") as string | null)?.trim();
  const fixedTeamCountRaw = (formData.get("fixed_team_count") as string | null)?.trim();
  const teamSizeRaw = (formData.get("team_size") as string | null)?.trim();
  const smallLastTeamClubsRaw = (formData.get("small_last_team_clubs") as string | null) ?? "";

  if (!name) return "Name is required.";

  const maxAgeCategory = maxAgeRaw || null;
  if (maxAgeCategory && !(AGE_CATEGORIES as readonly string[]).includes(maxAgeCategory)) {
    return "Pick a valid max age category.";
  }

  let fixedTeamCount: number | null = null;
  if (fixedTeamCountRaw) {
    fixedTeamCount = Number(fixedTeamCountRaw);
    if (!Number.isInteger(fixedTeamCount) || fixedTeamCount < 1 || fixedTeamCount > 10) {
      return "Fixed team count must be a whole number between 1 and 10.";
    }
  }

  const teamSize = Number(teamSizeRaw);
  if (teamSize !== 3 && teamSize !== 4) return "Team size must be 3 or 4.";

  const smallLastTeamClubs = Array.from(
    new Set(
      smallLastTeamClubsRaw
        .split(/[,\n]/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  );

  return {
    name,
    max_age_category: maxAgeCategory,
    fixed_team_count: fixedTeamCount,
    team_size: teamSize,
    small_last_team_clubs: smallLastTeamClubs,
  };
}

export async function createCompetition(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseCompetitionForm(formData);
  if (typeof parsed === "string") {
    return { status: "error", message: parsed };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("competitions").insert(parsed);
  if (error) {
    return { status: "error", message: error.message };
  }
  revalidatePath("/admin/competitions");
  revalidatePath("/ranking");
  return { status: "success", message: `Added ${parsed.name}.` };
}

export async function updateCompetition(
  id: string,
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseCompetitionForm(formData);
  if (typeof parsed === "string") {
    return { status: "error", message: parsed };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("competitions").update(parsed).eq("id", id);
  if (error) {
    return { status: "error", message: error.message };
  }
  revalidatePath("/admin/competitions");
  revalidatePath("/ranking");
  return { status: "success", message: `Updated ${parsed.name}.` };
}

export async function deleteCompetition(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("competitions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/competitions");
  revalidatePath("/ranking");
}
