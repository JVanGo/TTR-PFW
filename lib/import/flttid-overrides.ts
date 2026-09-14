export interface FlttIdOverride {
  flttPlayerId: string;
  name: string;
  club: string;
}

/**
 * Manual identity resolutions for players whose name collides with at least
 * one other real person in the R2 match-history backup. resolveFlttId() in
 * ttr-simulation-io.ts normally disambiguates same-name candidates by
 * comparing clubs — but R2CatalogPlayerDoc.club is always null (a player's
 * own club is never in their own file, only sometimes on an opponent's
 * row), so that comparison silently fails 100% of the time whenever a name
 * collision is real. Left unresolved, these players miss their real
 * prior-season rating carry-forward and can never get an automatic
 * inactive flag, the same way RUPPERT/Nothum/Brassinne-style unmatched
 * players do.
 *
 * Each entry here was confirmed by fetching the player's own fltt.lu profile
 * page directly (which does show current club, unlike the R2 backup) and
 * matching it against this exact name+club+PFW combination — not guessed.
 * First batch confirmed 2026-09-14, covering every name collision found in
 * that day's "no last_match_date" audit.
 *
 * Persistent, not reset each season rollover — identity doesn't change with
 * the season the way a season-start rating does. If a listed player
 * transfers clubs later, this entry simply stops matching (falls back to
 * today's unresolved behavior, not a wrong match) until re-confirmed against
 * their new club.
 */
export const FLTT_ID_OVERRIDES: FlttIdOverride[] = [
  { flttPlayerId: "17057", name: "ESPINOSA José", club: "Berbuerg" },
  { flttPlayerId: "5378", name: "ESPINOSA José", club: "Lénger" },
  { flttPlayerId: "12628", name: "FERNANDES Jorge", club: "Leideleng" },
  { flttPlayerId: "20576", name: "FERNANDES Jorge", club: "Meechtem" },
  { flttPlayerId: "14002", name: "FOHL Marcel", club: "Méischdref" },
  { flttPlayerId: "24206", name: "HANSEN Sven", club: "Biissen" },
  { flttPlayerId: "28530", name: "Krier Philippe", club: "Käerch" },
  { flttPlayerId: "26030", name: "KRIER Philippe", club: "Rued" },
  { flttPlayerId: "25899", name: "MAJERUS Max", club: "Recken" },
  { flttPlayerId: "21130", name: "MAJERUS Max", club: "Féngeg" },
  { flttPlayerId: "11037", name: "MEYERS Marc", club: "Miedernach" },
  { flttPlayerId: "13064", name: "OLINGER Laurent", club: "Leideleng" },
  { flttPlayerId: "24215", name: "OLINGER Laurent", club: "Méischdref" },
  { flttPlayerId: "14996", name: "PETRY Paul", club: "Miedernach" },
  { flttPlayerId: "27853", name: "Schaus Elisabeth", club: "Préizerdaul" },
  { flttPlayerId: "13392", name: "SCHMIT Claude", club: "Biwer" },
  { flttPlayerId: "11579", name: "SCHMIT Claude", club: "Mëllerdall" },
  { flttPlayerId: "27619", name: "SCHMIT Lou", club: "Lénger" },
  { flttPlayerId: "19639", name: "SCHMIT Maurice", club: "Biekerech" },
  { flttPlayerId: "22226", name: "SCHMIT Maurice", club: "Mëllerdall" },
  { flttPlayerId: "20795", name: "SCHMIT Max", club: "Scheierbierg" },
  { flttPlayerId: "24548", name: "SCHMIT Max", club: "Gréiwemaacher" },
  { flttPlayerId: "12895", name: "SCHMIT Tom", club: "Sandweiler" },
  { flttPlayerId: "13509", name: "SCHMIT Tom", club: "Altwis-Gaasp." },
  { flttPlayerId: "27265", name: "SCHMITZ Daniel", club: "Houwald" },
  { flttPlayerId: "5851", name: "SCHREIBER Romain", club: "Ell" },
  { flttPlayerId: "7054", name: "SCHREIBER Romain", club: "Groussbus-M." },
  { flttPlayerId: "23653", name: "WAGNER Lisa", club: "Kordall" },
  { flttPlayerId: "27782", name: "WAGNER Lisa", club: "Recken" },
  { flttPlayerId: "20560", name: "WEBER Anne", club: "Nidderpallen" },
  { flttPlayerId: "26947", name: "WEBER Anne", club: "Kauneref" },
  { flttPlayerId: "17484", name: "WEBER Christian", club: "Recken" },
];
