import type { PerformanceGapConfirmedForfeit } from "@/lib/import/forfeits";

/**
 * Historical record only — no longer read by `findPerformanceGapForfeits`,
 * which auto-applies every candidate directly since 2026-10-02 (see its own
 * doc comment for why). Kept for the full history below: the result of Jeff
 * manually reviewing every one of season 25-26's 150
 * `findPerformanceGapForfeits` candidate rows (73 deduped real-world
 * incidents) against fltt.lu, 2026-08-14 through 2026-08-15 — the track
 * record that justified switching to auto-apply in the first place.
 *
 * Review process, in order:
 * 1. 15 incidents individually checked against the live fltt.lu page (see
 *    the `note` on each below for what was found — including two,
 *    RAJCIC Zlatko and THEISEN Max, that were *first* guessed wrong as
 *    "probably not forfeits" from the row data alone, then confirmed real
 *    once actually checked — the reason this whole list leans on Jeff's
 *    word rather than any score-shape or pattern heuristic).
 * 2. 23 more accepted after Jeff gave the remaining CH MIN / CH JEU / Ch Rég
 *    rows a visual scan and found nothing suspicious, backed by a
 *    structural reason to trust the pattern (CH MIN/CH JEU are 4-team
 *    round-robins — one absent player naturally shows up losing to several
 *    different opponents the same day; Ch Rég 2025-11-23 is regional
 *    championship day, a single event spanning many age categories, which
 *    explains why so many incidents cluster there).
 * 3. The remaining 16 accepted in bulk given the track record across
 *    everything checked so far: zero false positives found within this
 *    reviewed list itself. (POOS Piotr, mentioned in `findPerformanceGapForfeits`'
 *    own doc comment as the case that motivated its whole-player
 *    crawl-staleness filter, is NOT one of these 150 rows — that filter is
 *    exactly why he never showed up as a candidate here at all, not
 *    something excluded from this list after review.)
 *
 * Final tally: all 73 deduped incidents (150 raw rows) confirmed.
 *
 * Entries below are keyed by (flttPlayerId, isoDate) — see
 * `findPerformanceGapForfeits`' own doc comment for why per-opponent
 * granularity isn't needed. Not every row carries a `note`: only the ones
 * tied to something Jeff actually said are annotated; the rest (mostly the
 * winning opponent's own row for an already-annotated incident, or one of
 * the pattern-accepted/bulk-accepted rows) rely on this file's review
 * history above rather than individual commentary.
 */
export const PERFORMANCE_GAP_CONFIRMED_FORFEITS: PerformanceGapConfirmedForfeit[] = [
  { flttPlayerId: "22480", name: "ALLOIN Clément", isoDate: "2026-03-22" },
  {
    flttPlayerId: "19061",
    name: "ANDRZEJEWSKI Jonas",
    isoDate: "2026-04-25",
    note: "Opponent's row for RAJCIC Zlatko's confirmed forfeit.",
  },
  { flttPlayerId: "21425", name: "ARCQ Mike", isoDate: "2025-11-23" },
  { flttPlayerId: "26388", name: "AUBERT REISMAN Gabriel", isoDate: "2026-05-16" },
  { flttPlayerId: "27170", name: "BARRETT Aedan", isoDate: "2026-06-13" },
  { flttPlayerId: "26683", name: "BOUTOU Anatole", isoDate: "2026-05-16" },
  { flttPlayerId: "26962", name: "BRACHMANN Nils", isoDate: "2026-06-13" },
  {
    flttPlayerId: "27504",
    name: "BURG Emily",
    isoDate: "2026-05-16",
    note:
      "Confirmed forfeited all 4 boards that day (Jeff, 2026-08-15) — CH MIN is a 4-team " +
      "round-robin, so one absence naturally produces losses to several different opponents.",
  },
  { flttPlayerId: "25390", name: "BUTTINI Michelle", isoDate: "2026-02-22" },
  { flttPlayerId: "27750", name: "CANARIA FERNANDES Matteo", isoDate: "2025-11-23" },
  { flttPlayerId: "26477", name: "CAPP Sorenn", isoDate: "2026-05-16" },
  { flttPlayerId: "25919", name: "CATTAZZO Nora", isoDate: "2025-11-23" },
  { flttPlayerId: "28208", name: "CHERNOV Andrii", isoDate: "2026-06-13" },
  { flttPlayerId: "27095", name: "COLLING Valentina", isoDate: "2026-02-22" },
  { flttPlayerId: "27601", name: "CONG Angel Hao", isoDate: "2026-01-11" },
  { flttPlayerId: "26549", name: "CONSTANTIN Eduard-Stefan", isoDate: "2026-05-16" },
  { flttPlayerId: "28468", name: "DE BLASI Léandre", isoDate: "2026-06-13" },
  {
    flttPlayerId: "17077",
    name: "DECKER Serge",
    isoDate: "2025-11-23",
    note: "Confirmed real forfeit (Jeff, 2026-08-15).",
  },
  { flttPlayerId: "25892", name: "DIAS MONTEIRO Luca", isoDate: "2026-05-16" },
  { flttPlayerId: "25692", name: "DUPONT Zoé", isoDate: "2026-02-14" },
  { flttPlayerId: "26768", name: "DURAKOVIC Dzevad", isoDate: "2025-11-23" },
  { flttPlayerId: "17057", name: "ESPINOSA José", isoDate: "2026-02-14" },
  { flttPlayerId: "27076", name: "ESSELING Mathis", isoDate: "2026-05-16" },
  { flttPlayerId: "26855", name: "EUGENIO Teodor", isoDate: "2026-05-16" },
  { flttPlayerId: "26178", name: "FABER Laura", isoDate: "2026-05-16" },
  {
    flttPlayerId: "20457",
    name: "FELTEN Tania",
    isoDate: "2025-10-04",
    note: 'Beaten by JADE Maryvonne, confirmed "a regular forfeit" (Jeff, 2026-08-15).',
  },
  { flttPlayerId: "17794", name: "FELTGEN Manon", isoDate: "2026-02-14" },
  { flttPlayerId: "8902", name: "FRIEDL Christian", isoDate: "2025-11-23" },
  { flttPlayerId: "28362", name: "GAMA BELGA BORGES Pedro", isoDate: "2026-05-16" },
  { flttPlayerId: "25769", name: "GIERES Chiara", isoDate: "2026-03-22" },
  { flttPlayerId: "26436", name: "GRÜN Lynn", isoDate: "2025-11-23" },
  {
    flttPlayerId: "25657",
    name: "HANSEN Finja",
    isoDate: "2026-05-16",
    note: "Confirmed forfeited all 6 boards that day, across 3 ties (Jeff, 2026-08-14).",
  },
  { flttPlayerId: "28069", name: "HECKEL Paul", isoDate: "2025-11-22" },
  { flttPlayerId: "28069", name: "HECKEL Paul", isoDate: "2026-06-13" },
  {
    flttPlayerId: "25798",
    name: "HORSHKOV Oleg",
    isoDate: "2025-11-13",
    note:
      "Mutual 0-0 with STEPHANY Noah — not technically a forfeit (the tie was already decided " +
      "before this board could be played), but same rating treatment either way (Jeff, 2026-08-15).",
  },
  { flttPlayerId: "27321", name: "KALMES Mia", isoDate: "2026-05-16" },
  {
    flttPlayerId: "26586",
    name: "KERTÉSZ Mark",
    isoDate: "2025-11-23",
    note: "Confirmed real forfeit (Jeff, 2026-08-15).",
  },
  { flttPlayerId: "27976", name: "KIEFFER Edwin", isoDate: "2025-11-22" },
  { flttPlayerId: "26105", name: "KOEHLER Tom", isoDate: "2026-05-16" },
  { flttPlayerId: "24928", name: "KÖRNEMARK Elliot", isoDate: "2026-05-16" },
  { flttPlayerId: "25546", name: "KRAUS Finn", isoDate: "2026-05-16" },
  { flttPlayerId: "27672", name: "KRAUS Leo", isoDate: "2026-05-16" },
  { flttPlayerId: "27843", name: "KRAUS Lucie", isoDate: "2025-09-20" },
  {
    flttPlayerId: "16147",
    name: "KRAUS Mike",
    isoDate: "2025-11-23",
    note: "Opponent's row for DECKER Serge's confirmed forfeit.",
  },
  { flttPlayerId: "20243", name: "LANNERS Raoul", isoDate: "2025-11-23" },
  { flttPlayerId: "26598", name: "LOSCH Daan", isoDate: "2026-02-07" },
  { flttPlayerId: "27069", name: "LOUTSCH Léini", isoDate: "2026-05-16" },
  { flttPlayerId: "28086", name: "LUO Lingfei", isoDate: "2026-01-11" },
  {
    flttPlayerId: "27907",
    name: "MAURYA Vrihan",
    isoDate: "2026-06-13",
    note: 'Confirmed "regular forfeit in the CH MIN" (Jeff, 2026-08-15).',
  },
  { flttPlayerId: "20937", name: "MEYER Sarah", isoDate: "2026-03-08" },
  { flttPlayerId: "27573", name: "MONTILLET CASANOVA Enrique", isoDate: "2026-05-16" },
  { flttPlayerId: "12231", name: "MOUSEL Luc", isoDate: "2025-11-23" },
  { flttPlayerId: "27011", name: "NEYEN Zoé", isoDate: "2025-09-20" },
  {
    flttPlayerId: "27215",
    name: "OBERTI SCAFATO Mattia",
    isoDate: "2026-05-16",
    note: "Confirmed real forfeit (Jeff, 2026-08-15).",
  },
  { flttPlayerId: "27322", name: "OLGUN Ahmet", isoDate: "2025-11-23" },
  { flttPlayerId: "26438", name: "ORESTA Jacopo", isoDate: "2025-11-23" },
  { flttPlayerId: "26876", name: "OSMANAJ Kleit", isoDate: "2026-06-13" },
  { flttPlayerId: "24581", name: "PIOCEL Vincent", isoDate: "2025-11-23" },
  { flttPlayerId: "28526", name: "PIRASTRU Antonio", isoDate: "2026-06-13" },
  {
    flttPlayerId: "27886",
    name: "PIRES Yannick",
    isoDate: "2026-02-07",
    note: 'Beaten by EIFFES-SCHAUS Lex, confirmed "nothing out of the ordinary" (Jeff, 2026-08-15).',
  },
  {
    flttPlayerId: "27475",
    name: "POLIACHENKO Vera",
    isoDate: "2026-05-16",
    note:
      "Confirmed real forfeit across both 2026-05-16 (CH JEU) and 2026-06-14 (Ch Nat : JUN) — " +
      "Jeff's guess is she was sick that weekend, since both events fell on it (2026-08-15).",
  },
  { flttPlayerId: "27475", name: "POLIACHENKO Vera", isoDate: "2026-06-14" },
  { flttPlayerId: "27631", name: "QUINTUS Jendrik", isoDate: "2026-06-13" },
  { flttPlayerId: "24591", name: "RAGNACCI Tun", isoDate: "2026-05-16" },
  {
    flttPlayerId: "21218",
    name: "RAJCIC Zlatko",
    isoDate: "2026-04-25",
    note:
      "Confirmed real forfeit — injured mid-match, hence the 1-3 score instead of the usual " +
      '0-3/0-0 (Jeff, 2026-08-15). Initially misjudged as "probably not a forfeit" from the row ' +
      "data alone; only Jeff's own knowledge caught it.",
  },
  { flttPlayerId: "26847", name: "REDING Pauline", isoDate: "2026-01-11" },
  { flttPlayerId: "26847", name: "REDING Pauline", isoDate: "2026-02-22" },
  {
    flttPlayerId: "26563",
    name: "REFF Stefan",
    isoDate: "2026-05-16",
    note: "Confirmed forfeited all 3 boards that day (Jeff, 2026-08-15).",
  },
  { flttPlayerId: "22453", name: "REIMEN Jil", isoDate: "2026-02-14" },
  { flttPlayerId: "26266", name: "REMY Lis", isoDate: "2026-02-22" },
  { flttPlayerId: "25058", name: "RIES Gilles", isoDate: "2026-05-16" },
  { flttPlayerId: "25671", name: "SAHR Misha", isoDate: "2026-02-15" },
  { flttPlayerId: "25860", name: "SARIGIANNIDIS Anastasios", isoDate: "2025-11-23" },
  {
    flttPlayerId: "25859",
    name: "SARIGIANNIDIS Spyros",
    isoDate: "2026-03-22",
    note: "Confirmed real forfeit, same Ch Nat : Mess A day as THEISEN Max (Jeff, 2026-08-15).",
  },
  { flttPlayerId: "27692", name: "SCHAACK Gustav", isoDate: "2025-09-20" },
  { flttPlayerId: "27250", name: "SCHEECK Jo", isoDate: "2026-01-24" },
  {
    flttPlayerId: "27289",
    name: "SCHILTZ Camille",
    isoDate: "2026-02-07",
    note: 'Beaten by EIFFES-SCHAUS Lex, confirmed "nothing out of the ordinary" (Jeff, 2026-08-15).',
  },
  { flttPlayerId: "28059", name: "SCHMITZ Vincent", isoDate: "2025-11-22" },
  { flttPlayerId: "28059", name: "SCHMITZ Vincent", isoDate: "2026-06-13" },
  { flttPlayerId: "25523", name: "SCHOELLEN Sophia", isoDate: "2026-06-14" },
  { flttPlayerId: "23848", name: "SCHOLTES Pit", isoDate: "2026-05-16" },
  { flttPlayerId: "28266", name: "SHISHKOV Stepan", isoDate: "2026-06-13" },
  { flttPlayerId: "11990", name: "SINNER Alex", isoDate: "2025-11-23" },
  { flttPlayerId: "22901", name: "SONNTAG Maxime", isoDate: "2025-11-23" },
  {
    flttPlayerId: "26933",
    name: "SORRAS Athanasios",
    isoDate: "2026-06-13",
    note: 'Confirmed "regular forfeit in the CH MIN" (Jeff, 2026-08-15).',
  },
  { flttPlayerId: "26439", name: "STEICHEN Liz", isoDate: "2026-06-13" },
  { flttPlayerId: "27646", name: "STEINMETZER Hugo", isoDate: "2025-11-22" },
  { flttPlayerId: "27111", name: "STEMPER Noah", isoDate: "2026-06-07" },
  {
    flttPlayerId: "23234",
    name: "STEPHANY Noah",
    isoDate: "2025-11-13",
    note:
      "Mutual 0-0 with HORSHKOV Oleg — Jeff: not technically a forfeit, the tie was already " +
      "decided before this board could be played, so the game just never happened; treated the " +
      "same as a forfeit either way since it shouldn't be rated (2026-08-15).",
  },
  { flttPlayerId: "27148", name: "SUN Pumo", isoDate: "2026-05-16" },
  { flttPlayerId: "19021", name: "TAMASAUSKAITE Egle", isoDate: "2026-03-08" },
  { flttPlayerId: "26812", name: "TASSI Marco", isoDate: "2025-11-23" },
  {
    flttPlayerId: "24596",
    name: "TAVARES DA CRUZ Ricardo",
    isoDate: "2026-03-22",
    note: "Opponent's row for THEISEN Max's confirmed forfeit.",
  },
  { flttPlayerId: "28151", name: "TEUWEN Maksim", isoDate: "2026-05-16" },
  {
    flttPlayerId: "24598",
    name: "THEISEN Max",
    isoDate: "2026-03-22",
    note:
      'Confirmed real forfeit (Jeff, 2026-08-15). Initially misjudged as "probably not a ' +
      "forfeit\" from the row data alone (score 0-4, a normal-looking result); only Jeff's own " +
      "knowledge caught it.",
  },
  { flttPlayerId: "26651", name: "THILL Jo", isoDate: "2025-11-23" },
  {
    flttPlayerId: "13018",
    name: "THORN Christian",
    isoDate: "2025-11-23",
    note: "3 boards this date — accepted by pattern (Ch Rég regional championship day).",
  },
  {
    flttPlayerId: "23625",
    name: "TROMBINI Stan",
    isoDate: "2025-10-04",
    note: 'Beaten by JADE Maryvonne, confirmed "a regular forfeit" (Jeff, 2026-08-15).',
  },
  { flttPlayerId: "25618", name: "VALENTE Noah", isoDate: "2026-05-16" },
  { flttPlayerId: "28259", name: "VIHERLAIHO Victor", isoDate: "2026-06-13" },
  {
    flttPlayerId: "28001",
    name: "VINTERA Artur",
    isoDate: "2025-11-23",
    note: "Beaten by GUNDECHA Avyan, confirmed real forfeit (Jeff, 2026-08-15).",
  },
  { flttPlayerId: "28001", name: "VINTERA Artur", isoDate: "2026-05-16" },
  { flttPlayerId: "28122", name: "VINTERA Martin", isoDate: "2025-11-23" },
  { flttPlayerId: "16468", name: "VITALI Sacha", isoDate: "2025-11-23" },
  { flttPlayerId: "26422", name: "WEILER Ella", isoDate: "2026-05-16" },
  { flttPlayerId: "16353", name: "WEITEN Steve", isoDate: "2025-11-23" },
  { flttPlayerId: "25412", name: "WILMES Collien", isoDate: "2026-03-22" },
  { flttPlayerId: "25412", name: "WILMES Collien", isoDate: "2026-06-14" },
  { flttPlayerId: "19492", name: "WILTGEN Joe", isoDate: "2025-11-23" },
  { flttPlayerId: "25934", name: "WONNER Antoine", isoDate: "2026-05-16" },
  { flttPlayerId: "26375", name: "WONNER Julien", isoDate: "2026-02-15" },
  { flttPlayerId: "26375", name: "WONNER Julien", isoDate: "2026-05-16" },
  { flttPlayerId: "27340", name: "XIA Aaron (Xunming)", isoDate: "2026-05-16" },
  { flttPlayerId: "27828", name: "YOSSEF Eitan", isoDate: "2026-06-07" },
  { flttPlayerId: "8824", name: "ZIGRAND René", isoDate: "2025-11-23" },
  { flttPlayerId: "27461", name: "ZIMMER Lottie", isoDate: "2026-05-16" },
  { flttPlayerId: "21402", name: "ZUIDBERG Yannick", isoDate: "2026-02-14" },
];
