"use client";

import { useActionState } from "react";
import {
  importRangliste,
  importMatches,
  type RanglistImportState,
  type MatchImportState,
} from "./actions";

const RANGLISTE_INITIAL: RanglistImportState = { status: "idle" };
const MATCHES_INITIAL: MatchImportState = { status: "idle" };

export function VerbandsranglisteImportForm() {
  const [state, formAction, pending] = useActionState(importRangliste, RANGLISTE_INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="file" name="file" accept=".xlsx" required className="text-sm" />
      <button
        type="submit"
        disabled={pending}
        className="bg-foreground text-background self-start rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Importing…" : "Upload Verbandsrangliste"}
      </button>
      {state.status === "error" && <p className="text-destructive text-sm">{state.message}</p>}
      {state.status === "success" && state.summary && (
        <p className="text-sm text-emerald-600">
          {state.summary.updated} updated, {state.summary.added} added, {state.summary.deactivated}{" "}
          marked inactive.
        </p>
      )}
    </form>
  );
}

export function SaisonentwicklungImportForm() {
  const [state, formAction, pending] = useActionState(importMatches, MATCHES_INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="file" name="file" accept=".xlsx" required className="text-sm" />
      <button
        type="submit"
        disabled={pending}
        className="bg-foreground text-background self-start rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Importing…" : "Upload TTR-Saisonentwicklung"}
      </button>
      {state.status === "error" && <p className="text-destructive text-sm">{state.message}</p>}
      {state.status === "success" && state.summary && (
        <p className="text-sm text-emerald-600">
          {state.summary.matchesAdded.toLocaleString()} matches added across{" "}
          {state.summary.playersTouched.toLocaleString()} players;{" "}
          {state.summary.opponentsLinked.toLocaleString()} opponent links resolved
          {state.summary.unmatchedSheets > 0 &&
            `; ${state.summary.unmatchedSheets} sheets skipped (no matching player)`}
          .
        </p>
      )}
    </form>
  );
}
