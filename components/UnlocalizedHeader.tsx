import Link from "next/link";

/**
 * Shared by the two route trees that live outside app/[locale]/ and are
 * never translated (admin, login) — gives them the same site-identity
 * header the public pages have, without pulling in next-intl.
 */
export function UnlocalizedHeader({ label }: { label: string }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight sm:text-lg">
          FLTT Ranking
        </Link>
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
      </div>
    </header>
  );
}
