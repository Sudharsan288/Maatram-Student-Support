// Rule-based coordinator assignment: category / institution rules, then least-loaded fallback.
import { isFinal } from "./config.js";

export function openLoadMap(queries) {
  const map = {};
  for (const q of queries) if (q.assignedTo && !isFinal(q.status)) map[q.assignedTo] = (map[q.assignedTo] || 0) + 1;
  return map;
}

function matches(rule, q) {
  const catOk = !rule.category || rule.category === "*" || rule.category === q.category;
  const inst = (rule.institution || "").trim().toLowerCase();
  const instOk = !inst || (q.institution || "").toLowerCase().includes(inst);
  return catOk && instOk;
}
const specificity = (r) => (r.category && r.category !== "*" ? 1 : 0) + ((r.institution || "").trim() ? 1 : 0);

/**
 * @returns {{coordinator: object, reason: string} | null}
 * `load` is a mutable { uid: openCount } map so batch assignment stays balanced.
 */
export function pickCoordinator(q, coordinators, load, config) {
  if (!coordinators.length) return null;
  const byUid = new Map(coordinators.map((c) => [c.uid, c]));
  const leastLoaded = (list) =>
    [...list].sort((a, b) => (load[a.uid] || 0) - (load[b.uid] || 0) || String(a.uid).localeCompare(String(b.uid)))[0];

  const hits = (config.rules || []).filter((r) => byUid.has(r.coordinatorUid) && matches(r, q));
  if (hits.length) {
    const top = Math.max(...hits.map(specificity));
    const best = hits.filter((r) => specificity(r) === top);
    const chosen = leastLoaded(best.map((r) => byUid.get(r.coordinatorUid)));
    const rule = best.find((r) => r.coordinatorUid === chosen.uid);
    const parts = [];
    if (rule.category && rule.category !== "*") parts.push(`category ${rule.category}`);
    if ((rule.institution || "").trim()) parts.push(`institution contains "${rule.institution.trim()}"`);
    return { coordinator: chosen, reason: `Rule: ${parts.join(" + ")}` };
  }
  if (config.fallbackLeastLoaded !== false) {
    const chosen = leastLoaded(coordinators);
    return { coordinator: chosen, reason: `Least current workload (${load[chosen.uid] || 0} open)` };
  }
  return null;
}
