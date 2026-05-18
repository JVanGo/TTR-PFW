"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LoginState {
  status: "idle" | "success" | "error";
  message?: string;
}

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

export async function requestMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get("email");
  if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }
  const email = normalise(rawEmail);

  const admin = createAdminClient();
  const { data: allowed, error: lookupError } = await admin
    .from("admin_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    console.error("login.allowlistLookupFailed", { email }, lookupError);
    return { status: "error", message: "Something went wrong — try again." };
  }
  if (!allowed) {
    return { status: "error", message: "This email is not authorised." };
  }

  const supabase = await createClient();
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : "";
  const emailRedirectTo = origin ? `${origin}/auth/callback?next=/admin` : undefined;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo, shouldCreateUser: true },
  });

  if (error) {
    console.error("login.signInWithOtpFailed", { email }, error);
    return { status: "error", message: "Could not send the magic link — try again." };
  }

  return {
    status: "success",
    message: `Magic link sent to ${email}. Open the email and click the link to sign in.`,
  };
}
