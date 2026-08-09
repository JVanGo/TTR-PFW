import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-11/12" />
      <Skeleton className="mt-2 h-4 w-2/3" />

      <Skeleton className="mt-8 h-10 w-full" />
      <Skeleton className="mt-4 h-4 w-40" />

      <section className="mt-12">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-2 h-4 w-56" />
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </section>
    </div>
  );
}
