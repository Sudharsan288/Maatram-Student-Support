// Dashboard / report numbers as pure functions.
import { STATUSES, PRIORITIES, isFinal, isOverdue, toMs } from "./config.js";

const DAY = 86400000;
const countBy = (list, fn) => list.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});

export function computeMetrics(queries, nowMs, coordinators = []) {
  const open = queries.filter((q) => !isFinal(q.status));
  const overdue = open.filter((q) => isOverdue(q, nowMs));
  const unassigned = open.filter((q) => !q.assignedTo);
  const resolvedList = queries.filter((q) => isFinal(q.status) && toMs(q.resolvedAt) && toMs(q.createdAt));
  const durations = resolvedList.map((q) => toMs(q.resolvedAt) - toMs(q.createdAt)).filter((d) => d >= 0);
  const avgResolutionMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const byStatus = STATUSES.map((s) => ({ label: s, value: queries.filter((q) => q.status === s).length }));
  const catCounts = countBy(queries, (q) => q.category || "Other");
  const byCategory = Object.entries(catCounts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const byPriority = PRIORITIES.map((p) => ({ label: p, value: queries.filter((q) => (q.priority || "Medium") === p).length }));

  const byCoordinator = coordinators.map((c) => {
    const mine = queries.filter((q) => q.assignedTo === c.uid);
    const mineOpen = mine.filter((q) => !isFinal(q.status));
    const done = mine.filter((q) => isFinal(q.status) && toMs(q.resolvedAt) && toMs(q.createdAt));
    const d = done.map((q) => toMs(q.resolvedAt) - toMs(q.createdAt)).filter((x) => x >= 0);
    return {
      uid: c.uid, label: c.displayName || c.email || c.uid, open: mineOpen.length,
      overdue: mineOpen.filter((q) => isOverdue(q, nowMs)).length, resolved: done.length,
      avgResolutionMs: d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0, total: mine.length,
    };
  }).sort((a, b) => b.open - a.open);

  const days = 14;
  const startDay = new Date(nowMs); startDay.setHours(0, 0, 0, 0);
  const trend = Array.from({ length: days }, (_, i) => {
    const from = startDay.getTime() - (days - 1 - i) * DAY;
    const label = new Date(from).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return {
      label,
      created: queries.filter((q) => { const t = toMs(q.createdAt); return t >= from && t < from + DAY; }).length,
      resolved: queries.filter((q) => { const t = toMs(q.resolvedAt); return isFinal(q.status) && t >= from && t < from + DAY; }).length,
    };
  });

  return {
    total: queries.length, open: open.length, overdue: overdue.length, unassigned: unassigned.length,
    waiting: queries.filter((q) => q.status === "Waiting for Student").length,
    resolved: queries.filter((q) => isFinal(q.status)).length,
    escalated: open.filter((q) => toMs(q.escalatedAt)).length,
    avgResolutionMs, byStatus, byCategory, byPriority, byCoordinator, trend,
    topCategory: byCategory[0]?.label || "—",
  };
}
