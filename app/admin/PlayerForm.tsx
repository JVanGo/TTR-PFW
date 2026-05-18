"use client";

import { useActionState } from "react";
import { PLAYER_CLASSES } from "@/lib/conversions";
import { createPlayer, updatePlayer, type ActionState } from "./actions";

const INITIAL: ActionState = { status: "idle" };

interface PlayerFormValues {
  id?: string;
  name?: string;
  class?: string;
  pfw?: number | string;
  club?: string | null;
  is_active?: boolean;
}

interface Props {
  mode: "create" | "edit";
  initial?: PlayerFormValues;
  onDone?: () => void;
}

export function PlayerForm({ mode, initial }: Props) {
  const boundAction =
    mode === "create" || !initial?.id ? createPlayer : updatePlayer.bind(null, initial.id);
  const [state, formAction, pending] = useActionState(boundAction, INITIAL);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Name</span>
        <input
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Class</span>
        <select
          name="class"
          required
          defaultValue={initial?.class ?? "A1"}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          {PLAYER_CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">PFW</span>
        <input
          name="pfw"
          type="number"
          step="0.01"
          required
          defaultValue={initial?.pfw ?? ""}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Club</span>
        <input
          name="club"
          defaultValue={initial?.club ?? ""}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={initial?.is_active ?? true}
          className="h-4 w-4"
        />
        <span>Active (appears in the current Verbandsrangliste)</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : mode === "create" ? "Add player" : "Save changes"}
        </button>
        {state.status === "error" && (
          <span className="text-destructive text-sm">{state.message}</span>
        )}
        {state.status === "success" && (
          <span className="text-sm text-emerald-600">{state.message}</span>
        )}
      </div>
    </form>
  );
}
