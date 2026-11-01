import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Club-tournament entry counts, parsed from the result PDFs FLTT publishes per
// tournament at /sport-national/competitions-individuelles/tournois-individuels
// (synced by scripts/sync-tournament-entries.ts into tournament-entries.json).
//
// Needed for the small-category rule (DTR section "Vereinsturniere", as Jeff
// set it on 2026-11-01): if fewer than 6 players of a category's higher
// Klassierung entered it, players of that Klassierung only get 8/4/2 instead
// of the normal placement bonus. Decisions made when building it:
//  - "higher Klassierung" = every class in the category except the lowest one,
//    pooled (A-B1 "(0/2/6)" => 0+2+6 = 8 A players). Single-class categories
//    (e.g. "D3") count all their entrants, so D3 with 5 entrants is reduced.
//  - Only adult categories ("D2-D3", "A-B1", "D3"...). Youth tournaments name
//    their categories differently in the PDF than in R2 ("C3•JUN"), so they
//    keep the full bonus for now.
//  - The placer's class is read from the PDF, not R2: R2's placement rows carry
//    the player's later class (e.g. a B1 "winning" B2-B3 after being promoted).

export const SMALL_CATEGORY_THRESHOLD = 6;

const CLASS_ORDER = [
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
  "D1",
  "D2",
  "D3",
] as const;
type ClassLabel = (typeof CLASS_ORDER)[number];

export interface TournamentCategoryEntry {
  participants: number;
  /** The "(21)" / "(0/2/6)" part: counts of the category's higher classes,
   * strongest first. Absent for single-class categories. */
  classCounts: number[] | null;
}

export interface TournamentPlacer {
  /** Normalised name in its original token order (see placerNameNorm). */
  name: string;
  playerClass: ClassLabel;
}

export interface TournamentEntries {
  /** Date in the PDF's file name; R2 sometimes dates the same tournament a day earlier/later. */
  isoDate: string;
  source: string;
  categories: Record<string, TournamentCategoryEntry>;
  placers: TournamentPlacer[];
}

export interface TournamentEntriesFile {
  syncedAt: string;
  tournaments: TournamentEntries[];
}

/** Lowercase ASCII letters only, bracketed parts dropped ("XIA Aaron (Xunming)" -> "xiaaaron"). */
export function placerNameNorm(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

const CATEGORY_RE = /Cat(?:égorie|\.)\s+(.+?)\s+participants:\s*(\d+)(?:\s*\(([\d/]+)\))?/g;
// "1. MIELCZAREK Simon (Iechternach) D3 +1,5" — the text extractor glues
// neighbouring columns together ("D3-11. KOROTICH ..."), so a name is the run
// starting at an uppercase letter that isn't directly followed by a digit.
// Names can carry their own bracketed part ("XIA Aaron (Xunming) (Houwald)");
// the club is always the LAST bracket before the class.
const PLACER_RE =
  /([A-ZÀ-ÖØ-ÞŠŽ][A-ZÀ-ÖØ-ÞŠŽ'’ -]*[A-ZÀ-ÖØ-ÞŠŽ](?: [^()\n\d]+?)?(?: \([^)\n]+\))*) \([^)\n]+\)\s*(A1|A2|A3|B1|B2|B3|C1|C2|C3|D1|D2|D3)\b/g;

export function parseTournamentPdfText(
  text: string,
): Pick<TournamentEntries, "categories" | "placers"> {
  const categories: Record<string, TournamentCategoryEntry> = {};
  for (const m of text.matchAll(CATEGORY_RE)) {
    categories[m[1].trim()] = {
      participants: Number(m[2]),
      classCounts: m[3] ? m[3].split("/").map(Number) : null,
    };
  }
  const placers: TournamentPlacer[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(PLACER_RE)) {
    const name = placerNameNorm(m[1]);
    if (!name.includes(" ")) continue;
    const key = `${name}|${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    placers.push({ name, playerClass: m[2] as ClassLabel });
  }
  return { categories, placers };
}

/** Classes a category label covers: "D2-D3" -> [D2, D3], "A-B1" -> [A1, A2, A3, B1], "D3" -> [D3]. */
export function categoryClasses(label: string): ClassLabel[] | null {
  const parts = label.split("-");
  if (parts.length === 1) {
    return (CLASS_ORDER as readonly string[]).includes(label) ? [label as ClassLabel] : null;
  }
  if (parts.length !== 2) return null;
  const lo = parts[0].length === 1 ? `${parts[0]}1` : parts[0];
  const hi = parts[1].length === 1 ? `${parts[1]}3` : parts[1];
  const a = (CLASS_ORDER as readonly string[]).indexOf(lo);
  const b = (CLASS_ORDER as readonly string[]).indexOf(hi);
  if (a < 0 || b < 0 || b < a) return null;
  return CLASS_ORDER.slice(a, b + 1);
}

function findPlacerClass(placers: TournamentPlacer[], playerName: string): ClassLabel | null {
  const target = placerNameNorm(playerName);
  if (!target) return null;
  const exact = placers.filter((p) => p.name === target);
  if (exact.length > 0) return exact[0].playerClass;

  // Some PDFs write "Haifeng XU" instead of "XU Haifeng".
  const sorted = (s: string) => s.split(" ").sort().join(" ");
  const reordered = placers.filter((p) => sorted(p.name) === sorted(target));
  if (reordered.length === 1) return reordered[0].playerClass;

  // PDF uses a short first name ("REMY Alex" vs R2 "REMY Alexandre"): same
  // token count, each PDF token a prefix of the R2 token.
  const targetTokens = target.split(" ");
  const prefix = placers.filter((p) => {
    const t = p.name.split(" ");
    return t.length === targetTokens.length && t.every((tok, i) => targetTokens[i].startsWith(tok));
  });
  if (prefix.length === 1) return prefix[0].playerClass;

  // Name wrapped onto two lines in the PDF, so only its tail survived
  // ("ATOS PENIM Gabriel" for "GOMES MATOS PENIM Gabriel").
  const flat = target.replace(/ /g, "");
  const tail = placers.filter((p) => {
    const f = p.name.replace(/ /g, "");
    return f.length >= 8 && flat.endsWith(f);
  });
  if (tail.length === 1) return tail[0].playerClass;
  return null;
}

export type SmallCategoryDecision =
  | { kind: "reduced"; source: string; pooledHigherCount: number }
  | { kind: "full"; source: string }
  | { kind: "no-pdf" }
  | { kind: "no-category" }
  | { kind: "player-not-found"; source: string }
  | { kind: "youth" };

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function decideSmallCategory(
  file: TournamentEntriesFile,
  placement: { isoDate: string; category: string; playerName: string },
): SmallCategoryDecision {
  const classes = categoryClasses(placement.category);
  if (!classes) return { kind: "youth" };

  // Prefer a PDF dated exactly on the game day; only fall back to a day either
  // side (R2 and the PDF file name sometimes disagree by one day) when there
  // is none. Otherwise back-to-back tournaments (Noumer Sat / Lénger Sun, both
  // with a C2-C3) could hand one tournament's counts to the other.
  const withCategoryOn = (iso: string) =>
    file.tournaments.filter((t) => t.isoDate === iso && t.categories[placement.category]);
  let candidates = withCategoryOn(placement.isoDate);
  if (candidates.length === 0) {
    candidates = [
      ...withCategoryOn(shiftIsoDate(placement.isoDate, -1)),
      ...withCategoryOn(shiftIsoDate(placement.isoDate, 1)),
    ];
  }
  if (candidates.length === 0) {
    const anyPdf = [-1, 0, 1].some((d) =>
      file.tournaments.some((t) => t.isoDate === shiftIsoDate(placement.isoDate, d)),
    );
    return anyPdf ? { kind: "no-category" } : { kind: "no-pdf" };
  }

  // Several candidates (e.g. regional championships, one PDF per region):
  // the one listing this player is the right one.
  let doc: TournamentEntries = candidates[0];
  let playerClass: ClassLabel | null = null;
  for (const t of candidates) {
    const c = findPlacerClass(t.placers, placement.playerName);
    if (c) {
      doc = t;
      playerClass = c;
      break;
    }
  }

  const entry = doc.categories[placement.category];
  if (classes.length > 1 && !entry.classCounts) return { kind: "full", source: doc.source };
  const pooledHigherCount =
    classes.length === 1
      ? entry.participants
      : (entry.classCounts ?? []).slice(0, classes.length - 1).reduce((a, b) => a + b, 0);
  // Big enough category: full bonus whatever the player's class, so a placer
  // missing from the PDF (FLTT occasionally leaves a slot blank) doesn't matter.
  if (pooledHigherCount >= SMALL_CATEGORY_THRESHOLD) return { kind: "full", source: doc.source };
  if (!playerClass) return { kind: "player-not-found", source: doc.source };

  const idx = classes.indexOf(playerClass);
  const isHigher = classes.length === 1 ? idx === 0 : idx >= 0 && idx < classes.length - 1;
  return isHigher
    ? { kind: "reduced", source: doc.source, pooledHigherCount }
    : { kind: "full", source: doc.source };
}

export const TOURNAMENT_ENTRIES_PATH = join(
  process.cwd(),
  "lib",
  "import",
  "tournament-entries.json",
);

export function loadTournamentEntries(path = TOURNAMENT_ENTRIES_PATH): TournamentEntriesFile {
  if (!existsSync(path)) return { syncedAt: "", tournaments: [] };
  return JSON.parse(readFileSync(path, "utf8")) as TournamentEntriesFile;
}
