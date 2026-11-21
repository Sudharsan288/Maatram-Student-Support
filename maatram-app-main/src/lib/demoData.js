// Dummy data loader for demos (the problem statement forbids real student details).
import { Timestamp, collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_CATEGORIES, HOUR, PRIORITIES, slaHoursFor } from "./config.js";

const NAMES = ["Aarav K", "Divya S", "Karthik R", "Meena P", "Nivetha T", "Rohan M", "Sanjay V", "Tamil Selvi", "Uma Devi", "Vignesh B", "Yazhini A", "Harish N"];
const INSTITUTIONS = ["Demo Institute of Technology", "Sample Arts College", "Example Engineering College", "Test Women's College", "Dummy University"];
const TITLES = {
  Admission: ["Admission form not submitting", "Eligibility clarification for counselling", "Seat confirmation status"],
  Scholarship: ["Scholarship amount not credited", "Fee waiver documents needed", "Renewal of merit scholarship"],
  Events: ["Workshop registration link broken", "Event certificate not received", "Request to host a seminar"],
  Mentoring: ["Need a mentor for career guidance", "Mentor session rescheduling", "Internship advice"],
  Technical: ["Cannot login to the student portal", "OTP not arriving", "Upload fails with error"],
  Other: ["General enquiry about programs", "Change of contact details"],
};
const CHANNELS = ["WhatsApp", "Email", "Phone Call", "In Person", "Web Form", "SMS"];
const pick = (arr, i) => arr[i % arr.length];

export function buildDemoQueries(coordinators, adminUid, count = 28) {
  const now = Date.now();
  const cats = DEFAULT_CATEGORIES;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const category = pick(cats, i * 2 + (i % 3));
    const priority = PRIORITIES[(i * 7) % 4];
    const ageH = 6 + ((i * 29) % 600);
    const createdMs = now - ageH * HOUR;
    const coordinator = coordinators.length && i % 6 !== 0 ? coordinators[i % coordinators.length] : null;
    const roll = i % 8;
    let status = !coordinator ? "New" : ["Assigned", "In Progress", "In Progress", "Waiting for Student", "Resolved", "Resolved", "Closed", "Assigned"][roll];
    if (!coordinator) status = "New";
    const final = status === "Resolved" || status === "Closed";
    const resolvedMs = final ? createdMs + (4 + (i * 11) % 90) * HOUR : null;
    const dueMs = final ? null : createdMs + slaHoursFor(priority) * HOUR;
    const name = pick(NAMES, i);
    const events = [{ type: "created", from: null, to: "New", note: `Query received through ${pick(CHANNELS, i)}.`, at: createdMs, actor: "Student Rep (demo)" }];
    if (coordinator) events.push({ type: "assigned", from: "New", to: "Assigned", note: `Assigned to ${coordinator.displayName || coordinator.email}.`, at: createdMs + HOUR, actor: "Admin (demo)" });
    if (["In Progress", "Waiting for Student", "Resolved", "Closed"].includes(status)) events.push({ type: "status_changed", from: "Assigned", to: "In Progress", note: "Looking into this and checking with the office.", at: createdMs + 3 * HOUR, actor: coordinator?.displayName || "Coordinator" });
    if (status === "Waiting for Student") events.push({ type: "status_changed", from: "In Progress", to: "Waiting for Student", note: "Please share a screenshot of the error.", at: createdMs + 5 * HOUR, actor: coordinator?.displayName || "Coordinator" });
    if (final) events.push({ type: "status_changed", from: "In Progress", to: status, note: "Issue sorted and student informed.", at: resolvedMs, actor: coordinator?.displayName || "Coordinator" });
    rows.push({
      id: `demo-${String(i + 1).padStart(3, "0")}`,
      data: {
        title: pick(TITLES[category], i), category, priority, channel: pick(CHANNELS, i),
        description: `Dummy demo query ${i + 1}. Raised by ${name} about "${category.toLowerCase()}". No real student data.`,
        studentName: name, studentEmail: `demo.student${i + 1}@example.com`, studentPhone: "",
        institution: pick(INSTITUTIONS, i), loggedByEmail: "demo.rep@example.com", studentUid: "demo-rep",
        status, assignedTo: coordinator?.uid || "", assignedEmail: coordinator?.email || "",
        createdAt: Timestamp.fromMillis(createdMs), lastActivityAt: Timestamp.fromMillis(events[events.length - 1].at),
        dueAt: dueMs ? Timestamp.fromMillis(dueMs) : null, resolvedAt: resolvedMs ? Timestamp.fromMillis(resolvedMs) : null,
        reminderSentAt: null, escalatedAt: null, attachmentCount: 0, isDemo: true,
      },
      events,
    });
  }
  return rows.map((r) => ({ ...r, adminUid }));
}

export async function loadDemoData(coordinators, adminUid) {
  const rows = buildDemoQueries(coordinators, adminUid);
  for (let i = 0; i < rows.length; i += 12) {
    const batch = writeBatch(db);
    for (const row of rows.slice(i, i + 12)) {
      const ref = doc(db, "users", "demo-rep", "queries", row.id);
      batch.set(ref, row.data);
      row.events.forEach((e, n) => batch.set(doc(collection(ref, "history"), `e${n}`), {
        type: e.type, fromStatus: e.from, toStatus: e.to, note: e.note, actorUid: adminUid, actorName: e.actor,
        createdAt: Timestamp.fromMillis(e.at), demo: true,
      }));
    }
    await batch.commit();
  }
  return rows.length;
}

export async function clearDemoData(queries) {
  const demo = queries.filter((q) => q.isDemo);
  for (const q of demo) {
    const histRef = collection(db, "users", q.ownerUid, "queries", q.id, "history");
    const snap = await getDocs(histRef);
    const b = writeBatch(db);
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  for (let i = 0; i < demo.length; i += 400) {
    const b = writeBatch(db);
    demo.slice(i, i + 400).forEach((q) => b.delete(doc(db, "users", q.ownerUid, "queries", q.id)));
    await b.commit();
  }
  return demo.length;
}
