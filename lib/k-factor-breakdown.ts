const BASE_K = 16;

export type KFactorBreakdownReasonKey = "age" | "newcomer" | "returning";

export interface KFactorBreakdownItem {
  reason: KFactorBreakdownReasonKey;
  amount: number;
}

export interface KFactorBreakdown {
  base: number;
  items: KFactorBreakdownItem[];
  total: number;
}

/**
 * Turns a match row's stored K-factor components (see matches.k_age_bonus /
 * k_is_newcomer_bonus / k_is_returning_bonus) into the ordered list of
 * reasons a player's Änderungskonstante (K) is what it is, for display on
 * the player profile. Only bonuses that actually apply are included.
 */
export function buildKFactorBreakdown(input: {
  kFactor: number;
  ageBonus: number;
  isNewcomerBonus: boolean;
  isReturningBonus: boolean;
}): KFactorBreakdown {
  const items: KFactorBreakdownItem[] = [];
  if (input.ageBonus > 0) items.push({ reason: "age", amount: input.ageBonus });
  if (input.isNewcomerBonus) items.push({ reason: "newcomer", amount: 4 });
  if (input.isReturningBonus) items.push({ reason: "returning", amount: 4 });
  return { base: BASE_K, items, total: input.kFactor };
}
