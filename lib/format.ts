/**
 * Format a PFW score with up to two decimals, stripping trailing zeros.
 */
export function formatPfw(pfw: number): string {
  return pfw
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(/^$/, "0");
}
