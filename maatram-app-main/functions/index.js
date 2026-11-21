import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import logger from "firebase-functions/logger";

initializeApp();
const db = getFirestore();
const REGION = "asia-south1";
const HOUR = 3600000;
const FINAL = ["Resolved", "Closed"];

// Secrets: set unused ones to the placeholder value "unset" — the code then skips that channel.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const INGEST_TOKEN = defineSecret("INGEST_TOKEN");
// Plain parameters (not sensitive). Empty value = channel disabled.
const MAIL_FROM = defineString("MAIL_FROM", { default: "Maatram Support <onboarding@resend.dev>" });
const TWILIO_ACCOUNT_SID = defineString("TWILIO_ACCOUNT_SID", { default: "" });
const TWILIO_SMS_FROM = defineString("TWILIO_SMS_FROM", { default: "" });
const TWILIO_WHATSAPP_FROM = defineString("TWILIO_WHATSAPP_FROM", { default: "" }); // e.g. whatsapp:+14155238886
const SECRETS = [RESEND_API_KEY, TWILIO_AUTH_TOKEN, INGEST_TOKEN];

const DEFAULT_FOLLOWUP = {
  reminderHours: { Urgent: 4, High: 24, Medium: 48, Low: 72 },
  escalationAfterHours: 24, studentReminderEveryHours: 24, maxStudentReminders: 3,
};
const CATEGORY_KEYWORDS = {
  Admission: ["admission", "admit", "seat", "counselling", "eligibility", "enrol"],
  Scholarship: ["scholarship", "fee waiver", "fees", "stipend", "financial aid", "tuition"],
  Events: ["event", "workshop", "seminar", "session", "webinar", "registration", "camp"],
  Mentoring: ["mentor", "guidance", "career", "internship", "advice"],
  Technical: ["login", "password", "portal", "website", "error", "bug", "otp", "upload", "not working"],
};

// ---------------------------------------------------------------- delivery
const clean = (v) => (typeof v === "string" ? v.trim() : "");
const secretOk = (s) => { try { const v = s.value(); return v && v !== "unset" ? v : ""; } catch { return ""; } };

async function sendEmail(to, subject, html) {
  const key = secretOk(RESEND_API_KEY);
  if (!to) return "email:no-address";
  if (!key) return "email:not-configured";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM.value(), to: [to], subject, html }),
  });
  if (!res.ok) { logger.error("Email rejected", { status: res.status, body: await res.text() }); return "email:failed"; }
  return "email:sent";
}

async function twilioSend(to, from, body, label) {
  const sid = clean(TWILIO_ACCOUNT_SID.value()); const token = secretOk(TWILIO_AUTH_TOKEN);
  if (!to) return `${label}:no-number`;
  if (!sid || !token || !from) return `${label}:not-configured`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: label === "whatsapp" ? `whatsapp:${to}` : to, From: from, Body: body }),
  });
  if (!res.ok) { logger.error("Twilio rejected", { status: res.status, body: await res.text() }); return `${label}:failed`; }
  return `${label}:sent`;
}

/** Sends over every configured channel. Returns e.g. ["email:sent","whatsapp:not-configured"]. */
async function deliver({ email, phone, subject, text }) {
  const results = [await sendEmail(email, subject, `<p>${text}</p><p style="color:#777">— Maatram Foundation support team</p>`)];
  const p = clean(phone);
  if (p) {
    results.push(await twilioSend(p, clean(TWILIO_WHATSAPP_FROM.value()), `${subject}\n${text}`, "whatsapp"));
    results.push(await twilioSend(p, clean(TWILIO_SMS_FROM.value()), `${subject}: ${text}`, "sms"));
  }
  return results;
}

async function notifyInApp(uid, payload) {
  if (!uid || uid === "inbox" || uid.startsWith("demo-")) return;
  await db.collection("users").doc(uid).collection("notifications").add({ ...payload, read: false, createdAt: Timestamp.now(), fromUid: "system" });
}
const logHistory = (ref, type, actorName, note, extra = {}) =>
  ref.collection("history").add({ type, actorUid: "system", actorName, automated: true, note, createdAt: Timestamp.now(), ...extra });

// ---------------------------------------------------------------- settings
async function getSetting(id) { const s = await db.collection("settings").doc(id).get(); return s.exists ? s.data() : {}; }
async function getFollowup() {
  const s = await getSetting("followup");
  return { ...DEFAULT_FOLLOWUP, ...s, reminderHours: { ...DEFAULT_FOLLOWUP.reminderHours, ...(s.reminderHours || {}) } };
}
const slaHours = (f, priority) => f.reminderHours[priority] ?? f.reminderHours.Medium;

// ---------------------------------------------------------------- assignment (mirror of src/lib/assignment.js)
function pickCoordinator(q, coordinators, load, cfg) {
  if (!coordinators.length) return null;
  const byUid = new Map(coordinators.map((c) => [c.uid, c]));
  const least = (list) => [...list].sort((a, b) => (load[a.uid] || 0) - (load[b.uid] || 0) || a.uid.localeCompare(b.uid))[0];
  const spec = (r) => (r.category && r.category !== "*" ? 1 : 0) + (clean(r.institution) ? 1 : 0);
  const hits = (cfg.rules || []).filter((r) => byUid.has(r.coordinatorUid)
    && (!r.category || r.category === "*" || r.category === q.category)
    && (!clean(r.institution) || (q.institution || "").toLowerCase().includes(clean(r.institution).toLowerCase())));
  if (hits.length) {
    const top = Math.max(...hits.map(spec));
    const best = hits.filter((r) => spec(r) === top);
    const chosen = least(best.map((r) => byUid.get(r.coordinatorUid)));
    return { coordinator: chosen, reason: "Matched an assignment rule" };
  }
  if (cfg.fallbackLeastLoaded !== false) { const c = least(coordinators); return { coordinator: c, reason: `Least current workload (${load[c.uid] || 0} open)` }; }
  return null;
}

async function loadCoordinators() {
  const snap = await db.collection("users").where("role", "==", "coordinator").get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}
async function openLoad() {
  const snap = await db.collectionGroup("queries").where("assignedTo", "!=", "").get();
  const load = {};
  snap.docs.forEach((d) => { const x = d.data(); if (!FINAL.includes(x.status)) load[x.assignedTo] = (load[x.assignedTo] || 0) + 1; });
  return load;
}

// ---------------------------------------------------------------- 1. new query: acknowledge + auto-assign
export const onQueryCreated = onDocumentCreated({ document: "users/{ownerUid}/queries/{queryId}", region: REGION, secrets: SECRETS }, async (event) => {
  const ref = event.data?.ref; const q = event.data?.data();
  if (!ref || !q || q.isDemo) return;
  const followup = await getFollowup();
  const cfg = { autoAssign: true, fallbackLeastLoaded: true, rules: [], ...(await getSetting("assignment")) };

  if (cfg.autoAssign && !q.assignedTo) {
    const coordinators = await loadCoordinators();
    const pick = pickCoordinator(q, coordinators, await openLoad(), cfg);
    if (pick) {
      const c = pick.coordinator;
      await ref.update({
        assignedTo: c.uid, assignedEmail: c.email || "", assignedAt: Timestamp.now(), assignedByRule: pick.reason, status: "Assigned",
        lastActivityAt: Timestamp.now(), dueAt: Timestamp.fromMillis(Date.now() + slaHours(followup, q.priority) * HOUR),
      });
      await logHistory(ref, "assigned", "Auto-assignment", `Auto-assigned to ${c.displayName || c.email}. ${pick.reason}.`, { fromStatus: q.status, toStatus: "Assigned", assignedTo: c.uid });
      await notifyInApp(c.uid, { type: "query_assigned", title: "New query assigned to you", message: `${q.title} (${q.priority}). ${pick.reason}.`, queryId: event.params.queryId, ownerUid: event.params.ownerUid });
    }
  }
  const sent = await deliver({
    email: q.studentEmail, phone: q.studentPhone, subject: "We received your query",
    text: `Hello ${q.studentName || ""}, the Maatram team has recorded your request "${q.title}" (reference ${event.params.queryId}). We will keep you updated.`,
  });
  await logHistory(ref, "notified", "Maatram Notification Service", `Acknowledgement to student: ${sent.join(", ")}.`);
});

// ---------------------------------------------------------------- 2. status/assignment changes -> external channels
// (In-app notifications are written by the web app itself, so this trigger only handles email / SMS / WhatsApp.)
export const onQueryUpdated = onDocumentUpdated({ document: "users/{ownerUid}/queries/{queryId}", region: REGION, secrets: SECRETS }, async (event) => {
  const before = event.data?.before.data(); const after = event.data?.after.data(); const ref = event.data?.after.ref;
  if (!before || !after || after.isDemo) return;
  const title = after.title || "your query";

  if (after.assignedTo && after.assignedTo !== before.assignedTo && after.assignedEmail) {
    await deliver({ email: after.assignedEmail, phone: "", subject: "Maatram: query assigned to you", text: `A student support query has been assigned to you: ${title} (${after.priority}).` });
  }
  if (after.status !== before.status) {
    if (after.status === "Waiting for Student") {
      const r = await deliver({ email: after.studentEmail, phone: after.studentPhone, subject: "Maatram: we need more information", text: `The team needs a little more information to continue with "${title}". Please reply to your Student Representative.` });
      await logHistory(ref, "notified", "Maatram Notification Service", `Student asked for information: ${r.join(", ")}.`);
    }
    if (FINAL.includes(after.status) && !FINAL.includes(before.status)) {
      const r = await deliver({ email: after.studentEmail, phone: after.studentPhone, subject: "Maatram: your query is resolved", text: `Good news — your request "${title}" has been marked ${after.status}. Reply to your Student Representative if you need anything else.` });
      await logHistory(ref, "notified", "Maatram Notification Service", `Student told the query is ${after.status}: ${r.join(", ")}.`);
    }
  }
});

// ---------------------------------------------------------------- 3. scheduled reminders + escalation
export const processQueryFollowUps = onSchedule({ schedule: "every 60 minutes", timeZone: "Asia/Kolkata", region: REGION, secrets: SECRETS }, async () => {
  const now = Timestamp.now(); const nowMs = now.toMillis();
  const f = await getFollowup();
  const snapshot = await db.collectionGroup("queries").where("dueAt", "<=", now).limit(500).get();
  const users = await db.collection("users").get();
  const byUid = new Map(users.docs.map((d) => [d.id, { uid: d.id, ...d.data() }]));
  const admins = [...byUid.values()].filter((u) => u.role === "admin");
  const seniors = [...byUid.values()].filter((u) => u.role === "coordinator" && u.isSenior);
  const counts = { reminders: 0, escalations: 0, studentReminders: 0 };

  for (const doc of snapshot.docs) {
    const q = doc.data();
    if (FINAL.includes(q.status || "New") || q.isDemo || !q.dueAt?.toMillis) continue;
    const dueMs = q.dueAt.toMillis();
    const ownerUid = doc.ref.path.split("/")[1]; const queryId = doc.id; const title = q.title || "Student query";

    if (!q.reminderSentAt) {
      if (q.assignedTo) {
        const msg = `No update on "${title}" (${q.status}) within its follow-up window. Please update it.`;
        await notifyInApp(q.assignedTo, { type: "coordinator_reminder", title: "Query follow-up required", message: msg, queryId, ownerUid });
        const r = await deliver({ email: q.assignedEmail, phone: byUid.get(q.assignedTo)?.phone, subject: "Maatram: query follow-up required", text: msg });
        await logHistory(doc.ref, "reminder_sent", "Maatram Reminder Service", `Reminder sent to coordinator: ${r.join(", ")}.`);
      } else {
        const msg = `"${title}" is still unassigned past its follow-up window.`;
        for (const a of admins) { await notifyInApp(a.uid, { type: "unassigned_alert", title: "Unassigned query overdue", message: msg, queryId, ownerUid }); await deliver({ email: a.email, phone: a.phone, subject: "Maatram: unassigned query", text: msg }); }
        await logHistory(doc.ref, "reminder_sent", "Maatram Reminder Service", "Alert sent to Admin: query is unassigned.");
      }
      await doc.ref.update({ reminderSentAt: now, lastReminderAt: now });
      counts.reminders += 1;
    }

    if (!q.escalatedAt && nowMs >= dueMs + f.escalationAfterHours * HOUR) {
      const msg = `"${title}" has been overdue for more than ${f.escalationAfterHours}h. Please review or reassign.`;
      for (const p of [...admins, ...seniors]) { await notifyInApp(p.uid, { type: "query_escalation", title: "Overdue query escalated", message: msg, queryId, ownerUid }); await deliver({ email: p.email, phone: p.phone, subject: "Maatram: overdue query escalated", text: msg }); }
      await doc.ref.update({ escalatedAt: now });
      await logHistory(doc.ref, "escalated", "Maatram Escalation Service", "Escalated to Admin and senior coordinators.");
      counts.escalations += 1;
    }

    if (q.status === "Waiting for Student") {
      const n = q.studentReminderCount || 0;
      const last = q.studentRemindedAt?.toMillis?.() || q.waitingForStudentAt?.toMillis?.() || dueMs;
      if (n < f.maxStudentReminders && nowMs - last >= f.studentReminderEveryHours * HOUR) {
        await notifyInApp(ownerUid, { type: "student_reply_needed", title: "Student reply needed", message: `The team is waiting for ${q.studentName || "the student"}'s reply on "${title}".`, queryId, ownerUid });
        const r = await deliver({ email: q.studentEmail, phone: q.studentPhone, subject: "Maatram: your reply is needed", text: `We are still waiting for the information requested on "${title}". Please reply to your Student Representative.` });
        await doc.ref.update({ studentRemindedAt: now, studentReminderCount: n + 1 });
        await logHistory(doc.ref, "student_reminder", "Maatram Reminder Service", `Reminder ${n + 1}/${f.maxStudentReminders} to student: ${r.join(", ")}.`);
        counts.studentReminders += 1;
      }
    }
  }
  logger.info("Follow-up cycle completed", { ...counts, scanned: snapshot.size });
});

// ---------------------------------------------------------------- 4. inbox webhook (email / WhatsApp / forms -> query)
// POST JSON or form fields. Auth: header "x-ingest-token" (or ?token=) must equal INGEST_TOKEN.
// Works with: the Google Apps Script in /integrations (shared inbox), Twilio WhatsApp/SMS webhooks, any form tool.
export const ingestQuery = onRequest({ region: REGION, secrets: [INGEST_TOKEN], cors: false }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("POST only"); return; }
  const expected = secretOk(INGEST_TOKEN);
  const given = req.get("x-ingest-token") || req.query.token;
  if (!expected || given !== expected) { res.status(401).send("Unauthorized"); return; }
  const b = req.body || {};
  const fromTwilio = typeof b.From === "string" && b.Body !== undefined;
  const channel = fromTwilio ? (b.From.startsWith("whatsapp:") ? "WhatsApp" : "SMS") : (clean(b.channel) || "Email");
  const description = clean(fromTwilio ? b.Body : b.description).slice(0, 4000);
  if (!description) { res.status(400).send("description is required"); return; }
  const title = clean(b.title).slice(0, 140) || description.split("\n")[0].slice(0, 80);
  const text = ` ${title} ${description} `.toLowerCase();
  let category = clean(b.category);
  if (!category) {
    let bestScore = 0; category = "Other";
    for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) { const s = words.filter((w) => text.includes(w)).length; if (s > bestScore) { bestScore = s; category = cat; } }
  }
  const priority = ["Low", "Medium", "High", "Urgent"].includes(b.priority) ? b.priority : /urgent|asap|immediately/.test(text) ? "High" : "Medium";
  const f = await getFollowup();
  const phone = fromTwilio ? b.From.replace("whatsapp:", "") : clean(b.studentPhone);
  const ref = await db.collection("users").doc("inbox").collection("queries").add({
    title, category, description, priority, channel, status: "New",
    studentName: clean(b.studentName || b.ProfileName).slice(0, 100) || "Unknown (from inbox)", studentEmail: clean(b.studentEmail).toLowerCase(), studentPhone: phone,
    institution: clean(b.institution).slice(0, 140) || "Not provided", loggedByEmail: "inbox-integration", studentUid: "inbox",
    assignedTo: "", assignedEmail: "", createdAt: Timestamp.now(), lastActivityAt: Timestamp.now(),
    dueAt: Timestamp.fromMillis(Date.now() + slaHours(f, priority) * HOUR), reminderSentAt: null, escalatedAt: null, attachmentCount: 0, source: "inbox",
  });
  await logHistory(ref, "created", "Inbox integration", `Query captured automatically from ${channel}.`, { fromStatus: null, toStatus: "New" });
  const admins = await db.collection("users").where("role", "==", "admin").get();
  for (const a of admins.docs) await notifyInApp(a.id, { type: "unassigned_alert", title: `New query via ${channel}`, message: title, queryId: ref.id, ownerUid: "inbox" });
  if (fromTwilio) { res.type("text/xml").send("<Response><Message>Thanks — the Maatram team has received your message.</Message></Response>"); return; }
  res.status(201).json({ ok: true, id: ref.id, category });
});
