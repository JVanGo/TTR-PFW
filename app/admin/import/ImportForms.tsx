"use client";

import { useActionState, useState, useTransition } from "react";
import {
  previewRangliste,
  importRangliste,
  importMatches,
  type RanglistPreviewState,
  type RanglistImportState,
  type MatchImportState,
} from "./actions";

const MATCHES_INITIAL: MatchImportState = { status: "idle" };

export function VerbandsranglisteImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RanglistPreviewState | null>(null);
  const [result, setResult] = useState<RanglistImportState | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
  }

  function handlePreview() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const outcome = await previewRangliste(fd);
      setPreview(outcome);
    });
  }

  function handleApply() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const outcome = await importRangliste(fd);
      setResult(outcome);
      setPreview(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPreview(null);
          setResult(null);
        }}
        className="text-sm"
      />

      {!preview && (
        <button
          type="button"
          onClick={handlePreview}
          disabled={pending || !file}
          className="bg-foreground text-background self-start rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Reading…" : "Preview changes"}
        </button>
      )}

      {preview?.status === "error" && <p className="text-destructive text-sm">{preview.message}</p>}

      {preview?.status === "success" && (
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">
            {preview.toInsertCount} new player{preview.toInsertCount === 1 ? "" : "s"},{" "}
            {preview.toUpdateCount} updated, {preview.toDeactivateCount} would be marked inactive.
          </p>

          {preview.clubChanges != null && preview.clubChanges.length > 0 && (
            <div className="mt-3">
              <p className="font-medium">Club changes:</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.clubChanges.map((c, i) => (
                  <li key={i}>
                    {c.name}: {c.from ?? "—"} → {c.to ?? "—"}
                  </li>
                ))}
              </ul>
              {preview.clubChangesTruncated && (
                <p className="text-muted-foreground mt-1">…and more.</p>
              )}
            </div>
          )}

          {preview.deactivated != null && preview.deactivated.length > 0 && (
            <div className="mt-3">
              <p className="text-destructive font-medium">
                Would be marked inactive — not in this file:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {preview.deactivated.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              {preview.deactivatedTruncated && (
                <p className="text-muted-foreground mt-1">…and more.</p>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleApply}
              disabled={pending}
              className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Applying…" : "Apply changes"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-muted-foreground text-sm hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result?.status === "error" && <p className="text-destructive text-sm">{result.message}</p>}
      {result?.status === "success" && result.summary && (
        <p className="text-sm text-emerald-600">
          Applied: {result.summary.updated} updated, {result.summary.added} added,{" "}
          {result.summary.deactivated} marked inactive.
        </p>
      )}
    </div>
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
