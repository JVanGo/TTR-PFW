import { Link } from "@/i18n/navigation";

export const PAGE_SIZE = 50;

export interface RankingTableRow {
  id: string;
  rank: number;
  name: string;
  club: string | null;
  dtr: number;
  klassierung: string;
  isMatchInactive: boolean;
}

interface Labels {
  columnRank: string;
  columnName: string;
  columnClub: string;
  columnDtr: string;
  inactiveBadge: string;
  noResults: string;
}

interface Props {
  rows: RankingTableRow[];
  formatNumber: (value: number) => string;
  labels: Labels;
}

/** The `<table>` markup shared by the full client-side RankingTable and the
 * lightweight server-paginated RankingBrowser — kept plain (no "use client")
 * so either can render it. */
export function RankingTableRows({ rows, formatNumber, labels }: Props) {
  return (
    <div className="overflow-x-auto rounded-md border">
      {/* No min width: on phones the club moves under the name instead of
          taking its own column, so DTR stays on screen without scrolling. */}
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-right font-medium">{labels.columnRank}</th>
            <th className="px-3 py-2 text-left font-medium">{labels.columnName}</th>
            <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
              {labels.columnClub}
            </th>
            <th className="px-3 py-2 text-right font-medium">{labels.columnDtr}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-accent/40 border-t">
              <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                {formatNumber(row.rank)}
              </td>
              <td className="px-3 py-2">
                <Link href={`/player/${row.id}`} className="font-medium hover:underline">
                  {row.name}
                </Link>
                {row.isMatchInactive && (
                  <span className="bg-muted text-muted-foreground ml-2 inline-flex rounded-full px-2 py-0.5 text-xs">
                    {labels.inactiveBadge}
                  </span>
                )}
                <span className="text-muted-foreground block text-xs sm:hidden">
                  {row.club ?? "—"}
                </span>
              </td>
              <td className="text-muted-foreground hidden px-3 py-2 sm:table-cell">
                {row.club ?? "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{row.dtr}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="text-muted-foreground px-3 py-10 text-center">
                {labels.noResults}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
