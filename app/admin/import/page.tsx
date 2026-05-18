import Link from "next/link";
import { VerbandsranglisteImportForm, SaisonentwicklungImportForm } from "./ImportForms";

export default function AdminImportPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link href="/admin" className="text-muted-foreground text-sm hover:underline">
        ← Back to admin
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Bulk import</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Two separate uploads. Re-uploading the same file is safe — players are matched by normalised
        name and existing matches for the current season are replaced.
      </p>

      <section className="mt-8 rounded-md border p-4">
        <h2 className="text-base font-semibold">Verbandsrangliste</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Upload an FLTT Verbandsrangliste Excel export. Matched names are updated, new names are
          added, and any active players missing from the upload are marked as former players.
        </p>
        <div className="mt-3">
          <VerbandsranglisteImportForm />
        </div>
      </section>

      <section className="mt-6 rounded-md border p-4">
        <h2 className="text-base font-semibold">Match history (TTR-Saisonentwicklung)</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Upload a finished TTR-Saisonentwicklung.xlsx with one tab per player. Each per-player
          sheet replaces the current season&apos;s matches for that player.
        </p>
        <div className="mt-3">
          <SaisonentwicklungImportForm />
        </div>
      </section>
    </div>
  );
}
