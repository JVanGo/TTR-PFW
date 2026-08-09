import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UnlocalizedHeader } from "@/components/UnlocalizedHeader";

/**
 * Admin isn't translated (see i18n plan — only Jeff uses it) and lives
 * outside app/[locale]/, so it doesn't inherit that layout's header. This
 * gives it its own small, English-only one instead of losing site chrome
 * entirely.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: allow } = await admin
    .from("admin_emails")
    .select("email")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (!allow) {
    redirect("/login?error=not_authorised");
  }

  return (
    <>
      <UnlocalizedHeader label="Admin" />
      <main className="flex-1">{children}</main>
    </>
  );
}
