"use client";

import { useActionState } from "react";
import { AGE_CATEGORIES } from "@/lib/age-categories";
import { formatPfw } from "@/lib/format";
import { reviewAgeCategory, type ActionState } from "./actions";

const INITIAL: ActionState = { status: "idle" };

export interface NewcomerPlayer {
  id: string;
  name: string;
  class: string;
  pfw: number;
  club: string | null;
  created_at: string;
}

export function NewcomerRow({ player }: { player: NewcomerPlayer }) {
  const boundAction = reviewAgeCategory.bind(null, player.id);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL);

  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2">{player.name}</td>
      <td className="px-3 py-2">{player.class}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPfw(player.pfw)}</td>
      <td className="text-muted-foreground px-3 py-2">{player.club ?? "—"}</td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
        {new Date(player.created_at).toLocaleDateString()}
      </td>
      <td className="px-3 py-2">
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <select
            name="age_category"
            defaultValue=""
            className="border-input bg-background rounded-md border px-2 py-1 text-sm"
          >
            <option value="">Adult (no age group)</option>
            {AGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="bg-foreground text-background rounded-md px-3 py-1 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : "Confirm"}
          </button>
          {state.status === "error" && (
            <span className="text-destructive text-xs">{state.message}</span>
          )}
        </form>
      </td>
    </tr>
  );
}
