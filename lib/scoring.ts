import type { DataItem, Statement, Step } from "./supabase";

// ODI scoring, shared by the results page and the individual interview view.
// Per statement: importance and satisfaction are means of the 1 to 5 ratings,
// doubled to 0 to 10. Score = importance + max(importance - satisfaction, 0).

export type RatingRow = { respondent_id: string; statement_id: string; importance: number; satisfaction: number };
export type StepResponseRow = { respondent_id: string; step_id: string; data_item_ids: string[]; other_data: string | null; free_text: string | null };
export type Rated = Statement & { stepPos: number; stepTitle: string; n: number; imp: number; sat: number; opp: number; tier: 0 | 1 | 2 | 3 };
export type ItemRow = { item: DataItem; checks: number; people: number; maxOpp: number; steps: Set<number>; bucket: 0 | 1 | 2 };

export const TIER_LABEL = ["Works well enough", "Worth watching", "High friction", "Fix this first"];
export const TIER_VAR = ["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)"];
export const TIER_SOFT = ["var(--heat-0-soft)", "var(--heat-1-soft)", "var(--heat-2-soft)", "var(--heat-3-soft)"];
export const BUCKET = ["Leave behind", "Move", "Move carefully"];
export const BUCKET_VAR = ["var(--heat-0)", "var(--heat-1)", "var(--heat-3)"];
export const f1 = (x: number) => x.toFixed(1);

export function tierOf(opp: number): 0 | 1 | 2 | 3 {
  return opp >= 15 ? 3 : opp >= 12 ? 2 : opp >= 10 ? 1 : 0;
}

export function scoreStatements(stmts: Statement[], steps: Step[], ratings: RatingRow[]): Rated[] {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  return stmts
    .filter((st) => stepById.has(st.step_id))
    .map((st) => {
      const rs = ratings.filter((r) => r.statement_id === st.id);
      const n = rs.length;
      const mi = n ? rs.reduce((a, r) => a + r.importance, 0) / n : 0;
      const ms = n ? rs.reduce((a, r) => a + r.satisfaction, 0) / n : 0;
      const imp = mi * 2, sat = ms * 2;
      const opp = n ? imp + Math.max(imp - sat, 0) : 0;
      const step = stepById.get(st.step_id)!;
      return { ...st, stepPos: step.position, stepTitle: step.title, n, imp, sat, opp, tier: tierOf(opp) };
    });
}

export function bucketItems(items: DataItem[], rated: Rated[], stepResponses: StepResponseRow[], steps: Step[]): ItemRow[] {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  return items
    .map((item) => {
      const hits = stepResponses.filter((sr) => sr.data_item_ids.includes(item.id));
      const ppl = new Set(hits.map((h) => h.respondent_id)).size;
      const stepsHit = new Set(hits.map((h) => stepById.get(h.step_id)?.position ?? 0));
      const maxOpp = Math.max(0, ...rated.filter((r) => r.data_item_id === item.id && r.n > 0).map((r) => r.opp));
      const bucket: 0 | 1 | 2 = maxOpp >= 12 ? 2 : ppl > 0 || maxOpp >= 10 ? 1 : 0;
      return { item, checks: hits.length, people: ppl, maxOpp, steps: stepsHit, bucket };
    })
    .sort((a, b) => b.bucket - a.bucket || b.maxOpp - a.maxOpp || b.people - a.people);
}
