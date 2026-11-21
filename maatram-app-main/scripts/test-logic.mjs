import assert from "node:assert/strict";
import { pickCoordinator, openLoadMap } from "../src/lib/assignment.js";
import { computeMetrics } from "../src/lib/metrics.js";
import { suggestCategory, toCsv, isOverdue, slaHoursFor, mergeFollowup } from "../src/lib/config.js";

const coords = [{ uid: "c1", displayName: "Asha" }, { uid: "c2", displayName: "Bala" }, { uid: "c3", displayName: "Chitra" }];
const cfg = { fallbackLeastLoaded: true, rules: [
  { category: "Scholarship", institution: "", coordinatorUid: "c1" },
  { category: "*", institution: "Anna", coordinatorUid: "c2" },
  { category: "Scholarship", institution: "Anna", coordinatorUid: "c3" },
] };
const load = {};
assert.equal(pickCoordinator({ category: "Scholarship", institution: "Anna University" }, coords, load, cfg).coordinator.uid, "c3", "most specific rule wins");
assert.equal(pickCoordinator({ category: "Scholarship", institution: "VIT" }, coords, load, cfg).coordinator.uid, "c1");
assert.equal(pickCoordinator({ category: "Events", institution: "Anna Univ" }, coords, load, cfg).coordinator.uid, "c2");
const l2 = { c1: 3, c2: 1, c3: 2 };
assert.equal(pickCoordinator({ category: "Events", institution: "X" }, coords, l2, cfg).coordinator.uid, "c2", "least-loaded fallback");
assert.equal(pickCoordinator({ category: "Events" }, coords, {}, { rules: [], fallbackLeastLoaded: false }), null);
assert.deepEqual(openLoadMap([{ assignedTo: "c1", status: "New" }, { assignedTo: "c1", status: "Closed" }]), { c1: 1 });

assert.equal(suggestCategory("Need help with scholarship fee waiver"), "Scholarship");
assert.equal(suggestCategory("cannot login to portal, error shown"), "Technical");
assert.equal(suggestCategory("hello"), null);
assert.equal(toCsv([["a", "=cmd"], ["x,y", 'q"t']]), `a,'=cmd\r\n"x,y","q""t"`);
assert.equal(slaHoursFor("Urgent"), 4);
assert.equal(mergeFollowup({ reminderHours: { Low: 10 } }).reminderHours.High, 24);

const now = Date.now();
assert.equal(isOverdue({ status: "New", dueAt: now - 1000 }, now), true);
assert.equal(isOverdue({ status: "Resolved", dueAt: now - 1000 }, now), false);
const qs = [
  { status: "New", category: "Events", createdAt: now - 3600000 },
  { status: "In Progress", category: "Events", assignedTo: "c1", dueAt: now - 1000, createdAt: now - 7200000 },
  { status: "Resolved", category: "Admission", assignedTo: "c1", createdAt: now - 7200000, resolvedAt: now - 3600000 },
];
const m = computeMetrics(qs, now, coords);
assert.equal(m.total, 3); assert.equal(m.open, 2); assert.equal(m.overdue, 1); assert.equal(m.unassigned, 1);
assert.equal(m.topCategory, "Events"); assert.equal(Math.round(m.avgResolutionMs / 60000), 60);
assert.equal(m.byCoordinator.find((c) => c.uid === "c1").open, 1);
assert.equal(m.trend.length, 14);
console.log("All logic tests passed ✔");
