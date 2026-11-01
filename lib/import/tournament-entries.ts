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
//  - Fewer than 6 means 0-5: 3 or fewer gets the same 8/4/2 as 4-5 (Jeff,
//    2026-11-01; FLTT's own current system gives nothing at 3 or fewer).
//  - Youth tournaments count too (Jeff, 2026-11-01). Their PDF category names
//    ("Ind. PrM-JUN C3 & JUN D") don't match R2's labels ("C3•JUN"), so a
//    youth placement is matched by finding the player among the placers listed
//    under a category (assignPlacersByLayout). The higher Klassierung there is
//    the strongest class in the category name (the one the "(13)" counts);
//    single-class youth categories count every entrant, like adult ones.
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
  /** Players placed in this category, from the PDF's layout (see
   * assignPlacersByLayout): normalised name + printed place (unnumbered = joint 3rd). */
  placers?: CategoryPlacer[];
}

export interface CategoryPlacer {
  name: string;
  place: 1 | 2 | 3;
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
  return findByName(placers, playerName)?.playerClass ?? null;
}

function findByName<T extends { name: string }>(placers: T[], playerName: string): T | null {
  const target = placerNameNorm(playerName);
  if (!target) return null;
  const exact = placers.filter((p) => p.name === target);
  if (exact.length > 0) return exact[0];

  // Some PDFs write "Haifeng XU" instead of "XU Haifeng".
  const sorted = (s: string) => s.split(" ").sort().join(" ");
  const reordered = placers.filter((p) => sorted(p.name) === sorted(target));
  if (reordered.length === 1) return reordered[0];

  // PDF uses a short first name ("REMY Alex" vs R2 "REMY Alexandre"): same
  // token count, each PDF token a prefix of the R2 token.
  const targetTokens = target.split(" ");
  const prefix = placers.filter((p) => {
    const t = p.name.split(" ");
    return t.length === targetTokens.length && t.every((tok, i) => targetTokens[i].startsWith(tok));
  });
  if (prefix.length === 1) return prefix[0];

  // Name wrapped onto two lines in the PDF, so only its tail survived
  // ("ATOS PENIM Gabriel" for "GOMES MATOS PENIM Gabriel").
  const flat = target.replace(/ /g, "");
  const tail = placers.filter((p) => {
    const f = p.name.replace(/ /g, "");
    return f.length >= 8 && flat.endsWith(f);
  });
  if (tail.length === 1) return tail[0];
  return null;
}

export type SmallCategoryDecision =
  | { kind: "reduced"; source: string; pooledHigherCount: number }
  | { kind: "full"; source: string }
  | { kind: "no-pdf" }
  | { kind: "no-category" }
  | { kind: "player-not-found"; source: string };

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every class a youth category name mentions, strongest first:
 * "Ind. PrM-JUN C3 & JUN D" -> [C3, D1, D2, D3], "PrM-JUN A-B" -> [A1..B3]. */
export function youthCategoryClasses(name: string): ClassLabel[] {
  const out = new Set<ClassLabel>();
  const re = /(?<![A-Za-z])([A-D])([1-3])?(?:-([A-D])([1-3])?)?(?![A-Za-z0-9])/g;
  for (const m of name.matchAll(re)) {
    const lo = `${m[1]}${m[2] ?? "1"}`;
    const hi = m[3] ? `${m[3]}${m[4] ?? "3"}` : `${m[1]}${m[2] ?? "3"}`;
    const a = (CLASS_ORDER as readonly string[]).indexOf(lo);
    const b = (CLASS_ORDER as readonly string[]).indexOf(hi);
    if (a >= 0 && b >= a) for (const c of CLASS_ORDER.slice(a, b + 1)) out.add(c);
  }
  return CLASS_ORDER.filter((c) => out.has(c));
}

/** True for doubles and federation (non-club) tournaments, which never get a placement bonus. */
function isExcludedCategory(source: string, category: string): boolean {
  return /^Equipes/i.test(category) || /championnats|regionaux/i.test(source);
}

/**
 * The rule itself, for one placer in one category of one PDF.
 * Adult category "D2-D3": higher = D2, counted by "(21)". Multi-class "A-B1
 * (0/2/6)": every class but the lowest, pooled. Single class "D3": everyone.
 * Youth "Ind. PrM-JUN C3 & JUN D (13)": the strongest class named (C3);
 * several counts ("A-B (0/1/1)") pool the classes they count.
 */
export function decideInCategory(
  doc: TournamentEntries,
  category: string,
  playerName: string,
): SmallCategoryDecision {
  const entry = doc.categories[category];
  if (!entry) return { kind: "no-category" };
  const full = { kind: "full" as const, source: doc.source };
  const counts = entry.classCounts;
  let higher: ClassLabel[];
  let pooledHigherCount: number;
  const adult = categoryClasses(category);
  if (adult) {
    if (adult.length === 1) {
      higher = adult;
      pooledHigherCount = entry.participants;
    } else {
      if (!counts) return full;
      higher = adult.slice(0, adult.length - 1);
      pooledHigherCount = counts.slice(0, adult.length - 1).reduce((a, b) => a + b, 0);
    }
  } else {
    const classes = youthCategoryClasses(category);
    if (classes.length === 0) return full;
    higher = !counts
      ? classes
      : counts.length === 1
        ? [classes[0]]
        : classes.slice(0, counts.length);
    pooledHigherCount = !counts ? entry.participants : counts.reduce((a, b) => a + b, 0);
  }
  // Big enough category: full bonus whatever the player's class, so a placer
  // missing from the PDF (FLTT occasionally leaves a slot blank) doesn't matter.
  if (pooledHigherCount >= SMALL_CATEGORY_THRESHOLD) return full;
  const playerClass = findPlacerClass(doc.placers, playerName);
  if (!playerClass) return { kind: "player-not-found", source: doc.source };
  return higher.includes(playerClass)
    ? { kind: "reduced", source: doc.source, pooledHigherCount }
    : full;
}

/** For a placement FLTT's own data (R2) has: find its PDF category and apply the rule. */
export function decideSmallCategory(
  file: TournamentEntriesFile,
  placement: { isoDate: string; category: string; playerName: string },
): SmallCategoryDecision {
  const adult = categoryClasses(placement.category) !== null;

  // Prefer a PDF dated exactly on the game day; only fall back to a day either
  // side (R2 and the PDF file name sometimes disagree by one day) when there
  // is none. Otherwise back-to-back tournaments (Noumer Sat / Lénger Sun, both
  // with a C2-C3) could hand one tournament's counts to the other.
  const hitsOn = (iso: string): { doc: TournamentEntries; category: string; listed: boolean }[] => {
    const hits: { doc: TournamentEntries; category: string; listed: boolean }[] = [];
    for (const t of file.tournaments) {
      if (t.isoDate !== iso) continue;
      if (adult) {
        if (t.categories[placement.category] && !isExcludedCategory(t.source, placement.category)) {
          hits.push({
            doc: t,
            category: placement.category,
            listed: findPlacerClass(t.placers, placement.playerName) !== null,
          });
        }
        continue;
      }
      // Youth: PDF names its categories differently from R2 ("C3•JUN"), so
      // find the category that lists this player among its placers.
      for (const [category, entry] of Object.entries(t.categories)) {
        if (categoryClasses(category) || isExcludedCategory(t.source, category)) continue;
        if (findByName(entry.placers ?? [], placement.playerName)) {
          hits.push({ doc: t, category, listed: true });
        }
      }
    }
    return hits;
  };
  let hits = hitsOn(placement.isoDate);
  if (hits.length === 0) {
    hits = [
      ...hitsOn(shiftIsoDate(placement.isoDate, -1)),
      ...hitsOn(shiftIsoDate(placement.isoDate, 1)),
    ];
  }
  if (hits.length === 0) {
    const anyPdf = [-1, 0, 1].some((d) =>
      file.tournaments.some((t) => t.isoDate === shiftIsoDate(placement.isoDate, d)),
    );
    if (!anyPdf) return { kind: "no-pdf" };
    return adult ? { kind: "no-category" } : { kind: "player-not-found", source: "" };
  }
  let hit = hits.find((h) => h.listed) ?? hits[0];
  if (!adult && hits.length > 1) {
    // Placed in two youth categories that day: R2's label ("C3•JUN") names
    // the category's class, so prefer the category whose name mentions it.
    const labelClasses = categoryClasses(placement.category.split("•")[0]) ?? [];
    hit =
      hits.find((h) => {
        const cls = youthCategoryClasses(h.category);
        return labelClasses.length > 0 && labelClasses.every((c) => cls.includes(c));
      }) ?? hit;
  }
  return decideInCategory(hit.doc, hit.category, placement.playerName);
}

/** Does this R2 placement row describe the given PDF category? */
export function r2LabelMatchesPdfCategory(r2Label: string, pdfCategory: string): boolean {
  if (categoryClasses(r2Label)) return r2Label === pdfCategory;
  if (categoryClasses(pdfCategory)) return false;
  const labelClasses = categoryClasses(r2Label.split("•")[0]) ?? [];
  const cls = youthCategoryClasses(pdfCategory);
  return labelClasses.length > 0 && labelClasses.every((c) => cls.includes(c));
}

export interface PdfPlacement {
  isoDate: string;
  source: string;
  category: string;
  /** Normalised name as printed in the PDF. */
  name: string;
  place: 1 | 2 | 3;
  reduced: boolean;
}

/**
 * Every placement the PDFs list (club tournaments only, no doubles), with the
 * small-category rule already applied. FLTT's own data (R2) leaves some out:
 * in 25/26 mostly the ones its old system gave no bonus for (A/B players,
 * tiny categories), which must still get DTR points (Jeff, 2026-11-01).
 */
export function pdfPlacements(file: TournamentEntriesFile): PdfPlacement[] {
  const out: PdfPlacement[] = [];
  for (const t of file.tournaments) {
    for (const [category, entry] of Object.entries(t.categories)) {
      if (isExcludedCategory(t.source, category)) continue;
      for (const p of entry.placers ?? []) {
        const decision = decideInCategory(t, category, p.name);
        out.push({
          isoDate: t.isoDate,
          source: t.source,
          category,
          name: p.name,
          place: p.place,
          reduced: decision.kind === "reduced",
        });
      }
    }
  }
  return out;
}

/** Same name-matching tolerance as the rule uses (short first names, reversed order, wrapped names). */
export function pdfNameMatches(pdfName: string, playerName: string): boolean {
  return findByName([{ name: pdfName }], playerName) !== null;
}

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

const NAME_IN_LINE_RE =
  /(?:\d\.\s*)?([A-ZÀ-ÖØ-ÞŠŽ][A-ZÀ-ÖØ-ÞŠŽ'’ -]*[A-ZÀ-ÖØ-ÞŠŽ](?: [^()\d]+?)?(?: \([^)]+\))*) \([^)]+\)/g;

/**
 * Which placers belong to which category. The PDF has two columns of
 * categories, and its text runs cross the column boundary ("+1,5 D3 D3-11.
 * KOROTICH Mikhail (Zolwer)"), so plain text order can't tell them apart.
 * Rule that holds across FLTT's layout: a left-column heading or name sits at
 * the very start of a run beginning in the left quarter of the page; anything
 * else (a run starting further right, or glued after other text) is right.
 */
export function assignPlacersByLayout(
  pages: { width: number; items: PdfTextItem[] }[],
): Record<string, CategoryPlacer[]> {
  type Entity = {
    page: number;
    y: number;
    col: "L" | "R";
    kind: "header" | "name";
    name: string;
    place: 1 | 2 | 3;
  };
  const entities: Entity[] = [];
  pages.forEach((page, pageIdx) => {
    const lines: PdfTextItem[][] = [];
    for (const it of page.items) {
      if (!it.str.trim()) continue;
      const line = lines.find((l) => Math.abs(l[0].y - it.y) <= 2);
      if (line) line.push(it);
      else lines.push([it]);
    }
    for (const items of lines) {
      items.sort((a, b) => a.x - b.x);
      let text = "";
      const starts: { offset: number; item: PdfTextItem }[] = [];
      for (const it of items) {
        if (text) text += " ";
        starts.push({ offset: text.length, item: it });
        text += it.str;
      }
      const columnAt = (offset: number): "L" | "R" => {
        let owner = starts[0];
        for (const st of starts) if (st.offset <= offset) owner = st;
        const atStart = offset - owner.offset <= 1;
        return atStart && owner.item.x < page.width * 0.25 ? "L" : "R";
      };
      const y = items[0].y;
      for (const m of text.matchAll(CATEGORY_RE)) {
        entities.push({
          page: pageIdx,
          y,
          col: columnAt(m.index),
          kind: "header",
          name: m[1].trim(),
          place: 3,
        });
      }
      for (const m of text.matchAll(NAME_IN_LINE_RE)) {
        const name = placerNameNorm(m[1]);
        if (!name.includes(" ") || /participants/i.test(m[0])) continue;
        const printed = m[0].match(/^(\d)\./)?.[1];
        const place = printed === "1" ? 1 : printed === "2" ? 2 : 3;
        entities.push({ page: pageIdx, y, col: columnAt(m.index), kind: "name", name, place });
      }
    }
  });
  entities.sort((a, b) => a.page - b.page || b.y - a.y);
  const out: Record<string, CategoryPlacer[]> = {};
  const current: Record<"L" | "R", string | null> = { L: null, R: null };
  for (const e of entities) {
    if (e.kind === "header") {
      current[e.col] = e.name;
      out[e.name] ??= [];
    } else {
      const cat = current[e.col];
      if (cat) out[cat].push({ name: e.name, place: e.place });
    }
  }
  return out;
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
