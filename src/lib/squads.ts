/**
 * R2-40 / Feature 40: Squad scoring helpers — pure derived aggregation.
 *
 * Squad score is DERIVED (sum of member scores with activity bonus), never
 * dual-written, so solo + squad coexist in one engine:
 *   S_squad = Σ S(u) · (1 + 0.1 · ActiveSquadMembers)
 * No mid-battle reassignment (enforced in rules when squads ship).
 * Does NOT touch battle-server tx; aggregation happens post-commit.
 */

export interface SquadMemberScore {
  uid: string;
  score: number;
  active: boolean;
}

export function squadScore(members: readonly SquadMemberScore[]): number {
  let sum = 0;
  let active = 0;
  for (const m of members) {
    const s = typeof m.score === 'number' && Number.isFinite(m.score) ? m.score : 0;
    sum += s;
    if (m.active) active++;
  }
  return Math.round(sum * (1 + 0.1 * active));
}
