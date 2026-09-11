"use client";

import { useActionState } from "react";
import type { Competition } from "@/lib/competitions";
import { importTeamCounts, type ActionState } from "./actions";

const INITIAL: ActionState = { status: "idle" };

interface Props {
  competitions: Competition[];
  defaultSeason: string;
}

export function ImportForm({ competitions, defaultSeason }: Props) {
  const [state, formAction, pending] = useActionState(importTeamCounts, INITIAL);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Competition</span>
        <select
          name="competition_id"
          required
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="">— Pick one —</option>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Season</span>
        <input
          name="season"
          required
          defaultValue={defaultSeason}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Main schedule PDF URL</span>
        <input
          name="main_url"
          type="url"
          required
          placeholder="https://www.fltt.lu/media/.../ch-seniors-....pdf"
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Top-tier schedule PDF URL (optional)</span>
        <input
          name="top_tier_url"
          type="url"
          placeholder="https://www.fltt.lu/media/.../nl1-....pdf"
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <span className="text-muted-foreground text-xs">
          Only needed if this competition&apos;s top division publishes teams without a number (e.g.
          National TT League).
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Importing…" : "Import team counts"}
        </button>
      </div>
      {state.status === "error" && <p className="text-destructive text-sm">{state.message}</p>}
      {state.status === "success" && <p className="text-sm text-emerald-600">{state.message}</p>}
    </form>
  );
}
