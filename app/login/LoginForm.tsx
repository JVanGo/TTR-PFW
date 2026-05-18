"use client";

import { useActionState } from "react";
import { requestMagicLink, type LoginState } from "./actions";

const INITIAL: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(requestMagicLink, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Email address</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send magic link"}
      </button>
      {state.status === "error" && (
        <p className="border-destructive bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {state.message}
        </p>
      )}
    </form>
  );
}
