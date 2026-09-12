"use client";

import { useActionState } from "react";
import { AGE_CATEGORIES } from "@/lib/age-categories";
import { createCompetition, updateCompetition, type ActionState } from "./actions";

const INITIAL: ActionState = { status: "idle" };

interface CompetitionFormValues {
  id?: string;
  name?: string;
  max_age_category?: string | null;
  fixed_team_count?: number | string | null;
  team_size?: number | string;
  small_last_team_clubs?: string[];
}

interface Props {
  mode: "create" | "edit";
  initial?: CompetitionFormValues;
}

export function CompetitionForm({ mode, initial }: Props) {
  const boundAction =
    mode === "create" || !initial?.id
      ? createCompetition
      : updateCompetition.bind(null, initial.id);
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
        <span className="font-medium">Team size</span>
        <select
          name="team_size"
          required
          defaultValue={initial?.team_size ?? 4}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value={4}>4</option>
          <option value={3}>3</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Fixed number of teams</span>
        <input
          name="fixed_team_count"
          type="number"
          min={1}
          max={10}
          defaultValue={initial?.fixed_team_count ?? ""}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <span className="text-muted-foreground text-xs">
          Leave blank if the club chooses how many teams to enter.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Max age category</span>
        <select
          name="max_age_category"
          defaultValue={initial?.max_age_category ?? ""}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option value="">— No age limit (open to adults) —</option>
          {AGE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c} or younger
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Clubs with a smaller (3-man) last team</span>
        <textarea
          name="small_last_team_clubs"
          rows={3}
          defaultValue={(initial?.small_last_team_clubs ?? []).join("\n")}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <span className="text-muted-foreground text-xs">
          One club per line (or comma-separated). Their last team builds one player smaller than the
          rest — e.g. a club with a team in Division 6 while the competition is otherwise 4-man.
        </span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : mode === "create" ? "Add competition" : "Save changes"}
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
