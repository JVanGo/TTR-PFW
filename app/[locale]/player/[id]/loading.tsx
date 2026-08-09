import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Skeleton className="h-4 w-32" />

      <header className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-24" />
      </header>

      <Skeleton className="mt-3 h-4 w-48" />

      <section className="mt-8 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </section>

      <section className="mt-8">
        <Skeleton className="mb-3 h-6 w-32" />
        <Skeleton className="h-48 w-full" />
      </section>

      <section className="mt-8">
        <Skeleton className="mb-3 h-6 w-36" />
        <Skeleton className="h-64 w-full" />
      </section>
    </div>
  );
}
