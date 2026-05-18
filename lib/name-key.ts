/**
 * Normalised key for matching player names across different sources
 * (Verbandsrangliste, match exports, hand-entered admin edits).
 *
 * Strips diacritics, lowercases, splits on whitespace, and sorts the tokens
 * alphabetically. Sorting matters because match exports write "LASTNAME Firstname"
 * while the Verbandsrangliste uses "Firstname Lastname"; the sort makes the two
 * orderings collide on the same key. Mirrors public.normalize_name(text) in SQL.
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}
