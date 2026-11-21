// Client-side follow-up sweep (Admin only). Mirrors the scheduled Cloud Function so reminders,
// escalation and auto-assignment also work on the free plan while an Admin has the app open.
// Idempotent: it uses the same reminderSentAt / escalatedAt flags as the Cloud Function.
import { Timestamp, addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { HOUR, isFinal, mergeAssignment, mergeFollowup, slaHoursFor, toMs } from "./config.js";
import { openLoadMap, pickCoordinator } from "./assignment.js";
import { notifyUser } from "./notify.js";

const qRef = (q) => doc(db, "users", q.ownerUid, "queries", q.id);
const hRef = (q) => collection(db, "users", q.ownerUid, "queries", q.id, "history");

export async function autoAssignQuery(q, coordinators, load, assignmentCfg, actor, followupCfg) {
  const pick = pickCoordinator(q, coordinators, load, assignmentCfg);
  if (!pick) return false;
  const c = pick.coordinator;
  load[c.uid] = (load[c.uid] || 0) + 1;
  const status = q.status === "New" ? "Assigned" : q.status;
  const hours = slaHoursFor(q.priority, followupCfg);
  await updateDoc(qRef(q), {
    assignedTo: c.uid, assignedEmail: c.email || "", assignedAt: serverTimestamp(), assignedByRule: pick.reason,
    status, lastActivityAt: serverTimestamp(), dueAt: Timestamp.fromMillis(Date.now() + hours * HOUR),
    reminderSentAt: null, escalatedAt: null,
  });
  await addDoc(hRef(q), {
    type: "assigned", fromStatus: q.status, toStatus: status, actorUid: actor.uid, actorName: "Auto-assignment",
    automated: true, assignedTo: c.uid, assignedEmail: c.email || "",
    note: `Auto-assigned to ${c.displayName || c.email}. ${pick.reason}.`, createdAt: serverTimestamp(),
  });
  await notifyUser(c.uid, actor.uid, { type: "query_assigned", title: "New query assigned to you", message: `${q.title} (${q.priority}) — ${pick.reason}.`, queryId: q.id, ownerUid: q.ownerUid });
  return true;
}

export async function runFollowUpSweep({ queries, users, assignmentCfg, followupCfg, actor }) {
  const now = Date.now();
  const assignCfg = mergeAssignment(assignmentCfg);
  const f = mergeFollowup(followupCfg);
  const coordinators = users.filter((u) => u.role === "coordinator");
  const admins = users.filter((u) => u.role === "admin");
  const seniors = users.filter((u) => u.role === "coordinator" && u.isSenior);
  const result = { assigned: 0, reminders: 0, escalations: 0, studentReminders: 0 };
  const load = openLoadMap(queries);

  for (const q of queries) {
    if (isFinal(q.status)) continue;
    if (!q.assignedTo && assignCfg.autoAssign && q.ownerUid !== undefined) {
      if (await autoAssignQuery(q, coordinators, load, assignCfg, actor, f)) { result.assigned += 1; continue; }
    }
    const due = toMs(q.dueAt);
    if (!due || due > now) continue;

    if (!toMs(q.reminderSentAt)) {
      const msg = q.assignedTo
        ? `No update on "${q.title}" (${q.status}) within its follow-up window. Please update it.`
        : `"${q.title}" is still unassigned past its follow-up window.`;
      if (q.assignedTo) await notifyUser(q.assignedTo, actor.uid, { type: "coordinator_reminder", title: "Query follow-up required", message: msg, queryId: q.id, ownerUid: q.ownerUid });
      else for (const a of admins) await notifyUser(a.uid, actor.uid, { type: "unassigned_alert", title: "Unassigned query overdue", message: msg, queryId: q.id, ownerUid: q.ownerUid });
      await updateDoc(qRef(q), { reminderSentAt: serverTimestamp(), lastReminderAt: serverTimestamp() });
      await addDoc(hRef(q), { type: "reminder_sent", actorUid: actor.uid, actorName: "Maatram Follow-up Service", automated: true, note: q.assignedTo ? "Reminder sent to the assigned coordinator." : "Alert sent to Admin: query is unassigned.", createdAt: serverTimestamp() });
      result.reminders += 1;
    }

    if (!toMs(q.escalatedAt) && now >= due + f.escalationAfterHours * HOUR) {
      const msg = `"${q.title}" has been overdue for more than ${f.escalationAfterHours}h. Please review or reassign.`;
      for (const p of [...admins, ...seniors]) await notifyUser(p.uid, actor.uid, { type: "query_escalation", title: "Overdue query escalated", message: msg, queryId: q.id, ownerUid: q.ownerUid });
      await updateDoc(qRef(q), { escalatedAt: serverTimestamp() });
      await addDoc(hRef(q), { type: "escalated", actorUid: actor.uid, actorName: "Maatram Escalation Service", automated: true, note: "Escalated to Admin / senior coordinators.", createdAt: serverTimestamp() });
      result.escalations += 1;
    }

    if (q.status === "Waiting for Student") {
      const count = q.studentReminderCount || 0;
      const last = toMs(q.studentRemindedAt) || toMs(q.waitingForStudentAt);
      if (count < f.maxStudentReminders && now - last >= f.studentReminderEveryHours * HOUR) {
        await notifyUser(q.ownerUid, actor.uid, { type: "student_reply_needed", title: "Student reply needed", message: `The team is waiting for ${q.studentName || "the student"}'s reply on "${q.title}".`, queryId: q.id, ownerUid: q.ownerUid });
        await updateDoc(qRef(q), { studentRemindedAt: serverTimestamp(), studentReminderCount: count + 1 });
        await addDoc(hRef(q), { type: "student_reminder", actorUid: actor.uid, actorName: "Maatram Follow-up Service", automated: true, note: `Reminder ${count + 1}/${f.maxStudentReminders} sent: student reply needed.`, createdAt: serverTimestamp() });
        result.studentReminders += 1;
      }
    }
  }
  return result;
}
