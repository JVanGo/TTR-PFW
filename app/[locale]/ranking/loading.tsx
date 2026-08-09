import { Skeleton } from "@/components/ui/skeleton";

export default function RankingLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-72" />

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-9 w-full sm:w-64" />
        <div className="rounded-md border">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="m-2 h-8 w-full rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
