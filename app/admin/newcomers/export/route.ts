import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/app/admin/actions";

/**
 * Excel download of everyone currently on the "Newcomers to review" page,
 * same filter and order. Route handlers don't run the admin layout's
 * sign-in check, so this one does its own.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return new Response("Not authorised", { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("name, class, pfw, club, created_at")
    .eq("age_category_reviewed", false)
    .order("created_at", { ascending: false });
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const rows = (data ?? []).map((p) => ({
    Name: p.name,
    Class: p.class,
    PFW: Number(p.pfw),
    Club: p.club ?? "",
    Added: p.created_at.slice(0, 10),
  }));

  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: ["Name", "Class", "PFW", "Club", "Added"],
  });
  sheet["!cols"] = [{ wch: 32 }, { wch: 8 }, { wch: 10 }, { wch: 22 }, { wch: 12 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Newcomers");
  const file = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="newcomers-to-review-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
