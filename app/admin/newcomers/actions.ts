"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AGE_CATEGORIES, type AgeCategory } from "@/lib/age-categories";
import { requireAdmin } from "@/app/admin/actions";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const VALID_CATEGORIES = new Set<string>(AGE_CATEGORIES);

export async function reviewAgeCategory(
  id: string,
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const raw = (formData.get("age_category") as string | null)?.trim() ?? "";
  if (raw !== "" && !VALID_CATEGORIES.has(raw)) {
    return { status: "error", message: "Pick a valid age group." };
  }
  const ageCategory: AgeCategory | null = raw === "" ? null : (raw as AgeCategory);

  const supabase = await createClient();
  const { error } = await supabase
    .from("players")
    .update({ age_category: ageCategory, age_category_reviewed: true })
    .eq("id", id);
  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/admin/newcomers");
  revalidatePath("/admin");
  return { status: "success" };
}
