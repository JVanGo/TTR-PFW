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
  weekChange: number | null;
}

interface Labels {
  columnRank: string;
  columnName: string;
  columnClub: string;
  columnClass: string;
  columnDtr: string;
  inactiveBadge: string;
  noResults: string;
  weekChangeHint: string;
}

/** A club name that opens that club's ranking view (its players + the Lineup Builder). */
function ClubLink({ club, className }: { club: string | null; className: string }) {
  if (!club) return <span className={className}>—</span>;
  return (
    <Link
      href={`/ranking?club=${encodeURIComponent(club)}`}
      className={`${className} hover:text-foreground hover:underline`}
    >
      {club}
    </Link>
  );
}

// The arrow's slot: always the same width, empty or not, so the DTR numbers
// above and below stay lined up. The DTR heading reserves the same slot so
// it sits over the numbers, not over the arrows.
const WEEK_CHANGE_SLOT = "ml-1.5 inline-block min-w-[2.5rem] text-left text-xs";

function WeekChange({ change }: { change: number | null }) {
  return (
    <span
      className={
        WEEK_CHANGE_SLOT +
        " " +
        (change != null && change > 0 ? "text-emerald-600" : "text-red-600")
      }
    >
      {change != null && `${change > 0 ? "▲" : "▼"}${Math.abs(change)}`}
    </span>
  );
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
    <>
      <div className="overflow-x-auto rounded-md border">
        {/* No min width: on phones the club and class move under the name
          instead of taking their own columns, so DTR stays on screen without
          scrolling. */}
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">{labels.columnRank}</th>
              <th className="px-3 py-2 text-left font-medium">{labels.columnName}</th>
              <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
                {labels.columnClub}
              </th>
              <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
                {labels.columnClass}
              </th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {labels.columnDtr}
                <span className={WEEK_CHANGE_SLOT} aria-hidden="true" />
              </th>
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
                  {/* On phones the club and class sit under the name instead of
                    taking their own columns. */}
                  <span className="text-muted-foreground block text-xs sm:hidden">
                    <ClubLink club={row.club} className="" /> · {row.klassierung}
                  </span>
                </td>
                <td className="hidden px-3 py-2 sm:table-cell">
                  <ClubLink club={row.club} className="text-muted-foreground" />
                </td>
                <td className="hidden px-3 py-2 sm:table-cell">{row.klassierung}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {row.dtr}
                  <WeekChange change={row.weekChange} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-3 py-10 text-center">
                  {labels.noResults}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.weekChange != null) && (
        <p className="text-muted-foreground text-xs">{labels.weekChangeHint}</p>
      )}
    </>
  );
}
