/**
 * Kader (national squad) roster, valid from 2025-11-12.
 * Source: kaderzusammensetzung-november-2025.pdf (repo root). A-Kader,
 * Anschlusskader, and Aufbaugruppe all count as "Kader" for the Lineup
 * Builder's Mannschaftsaufstellung tolerance rule — the PDF's rule just says
 * "Spieler des Kaders" without distinguishing sub-tiers.
 */
export interface KaderEntry {
  name: string;
  club: string;
}

// A few names below were adjusted from the PDF's literal spelling to match
// how the player is actually stored in `players` (confirmed by exact club
// match): GOMES-MATOS -> GOMES MATOS, SCHUDER-MINDEN -> SCHUDER MINDEN
// (hyphens vs. spaces), HUESO -> HUESO MUTH, OBERTI -> OBERTI SCAFATO
// (PDF truncated a compound surname), XIA Aaron -> XIA Aaron (Xunming).
// "BODEVING Nicolas" (Wolz, Aufbaugruppe) has no exact match — the closest
// is "BODEVING Jean-Nicolas" (also Wolz), left unmatched rather than assumed.

export const KADER_PLAYERS: KaderEntry[] = [
  // A-Kader
  { name: "MLADENOVIC Luka", club: "Berbuerg" },
  { name: "DE NUTTE Sarah", club: "Diddeleng" },
  { name: "SAHR Aaron", club: "Houwald" },
  { name: "NI Xia Lian", club: "Ettelbréck" },
  { name: "SCHOLTES Tom", club: "Berbuerg" },
  { name: "SADIKOVIC Enisa", club: "Diddeleng" },
  { name: "STEPHANY Loris", club: "Berbuerg" },
  { name: "VAN DESSEL Maël", club: "Hueschtert-Folscht" },
  { name: "WANTZ Gene", club: "Recken" },
  // Anschlusskader
  { name: "BERTEMES Daniel", club: "Meechtem" },
  { name: "CATTAZZO Nora", club: "Diddeleng" },
  { name: "COLLE Chris", club: "Ell" },
  { name: "DUMONT Tessy", club: "Lënster" },
  { name: "DIJOU Cédric", club: "Ettelbréck" },
  { name: "DUPONT Zoé", club: "Hueschtert-Folscht" },
  { name: "ELSEN Luca", club: "Recken" },
  { name: "GIERES Chiara", club: "Berbuerg" },
  { name: "FERBER Foos", club: "Préizerdaul" },
  { name: "GOMES MATOS Marjolaine", club: "Hueschtert-Folscht" },
  { name: "FERBER Nick", club: "Préizerdaul" },
  { name: "HANSEN Finja", club: "Diddeleng" },
  { name: "GOEDERT Mattis", club: "Ell" },
  { name: "HIGGINS Holly", club: "Wolz" },
  { name: "HABSCHEID Sam", club: "Recken" },
  { name: "KELLOUJ Inass", club: "Gréiwemaacher" },
  { name: "LAIR Sandro", club: "Union" },
  { name: "MOSTAFA Kinda", club: "Union" },
  { name: "LAMBINET Noah", club: "Lenneng" },
  { name: "SADIKOVIC Melisa", club: "Diddeleng" },
  { name: "REDING Leo", club: "Recken" },
  { name: "SCHOELLEN Marie", club: "Recken" },
  { name: "RIES Gilles", club: "Lenneng" },
  { name: "SCHROEDER Jona", club: "Préizerdaul" },
  { name: "SALVADORI Louis", club: "Houwald" },
  { name: "SCHUDER MINDEN Jona", club: "Berbuerg" },
  { name: "SARIGIANNIDIS Anastasios", club: "Bartreng" },
  { name: "SARIGIANNIDIS Spyros", club: "Bartreng" },
  { name: "SCHLOTTHAUER Vincent", club: "Scheierbierg" },
  { name: "SCHMIT Luca", club: "Bech" },
  { name: "SCHOLTES Pit", club: "Lenneng" },
  { name: "TAVARES DA CRUZ Ricardo", club: "Diddeleng" },
  { name: "THEISEN Max", club: "Lëntgen" },
  { name: "THEISEN Philip", club: "Lëntgen" },
  { name: "VALENTE Noah", club: "Lénger" },
  // Aufbaugruppe
  { name: "ARMANI Lorenzo", club: "Nouspelt" },
  { name: "COSNIER Eva", club: "Diddeleng" },
  { name: "BODEVING Nicolas", club: "Wolz" },
  { name: "KIRSCH Charlyn", club: "Housen" },
  { name: "BOUDART Matheo", club: "Hueschtert-Folscht" },
  { name: "SCHOELLEN Sophia", club: "Recken" },
  { name: "CHEN Ange", club: "Lëntgen" },
  { name: "STEICHEN Liz", club: "Groussbus-Mäerzeg" },
  { name: "GOEDERT Noé", club: "Ell" },
  { name: "STEMPER Anna-Lena", club: "Lenneng" },
  { name: "HUESO MUTH Axel", club: "Houwald" },
  { name: "THISSEN Maylis", club: "Scheierbierg" },
  { name: "KERTESZ Mark", club: "Mamer" },
  { name: "VAN DER ELST Lara", club: "Hueschtert-Folscht" },
  { name: "KOHLL Georges", club: "Lenneng" },
  { name: "OBERTI SCAFATO Mattia", club: "Zéisseng" },
  { name: "RAMANANTSIALONINA Andry", club: "Zéisseng" },
  { name: "RIES Benoît", club: "Lenneng" },
  { name: "SAHR Misha", club: "Lénger" },
  { name: "SCHMIT Mil", club: "Lénger" },
  { name: "STEMPER Noah", club: "Lenneng" },
  { name: "SUN Pumo", club: "Houwald" },
  { name: "WOLTER Jonah", club: "Nouspelt" },
  { name: "WOLTER Noah", club: "Nouspelt" },
  { name: "WONNER Julien", club: "Bartreng" },
  { name: "XIA Aaron (Xunming)", club: "Houwald" },
];
