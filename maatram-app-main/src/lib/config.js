// Shared constants and small pure helpers (no Firebase imports, so they can be unit-tested).

export const ROLE_LABELS = { student: "Student Representative", coordinator: "Coordinator", admin: "Admin" };
export const STATUSES = ["New", "Assigned", "In Progress", "Waiting for Student", "Resolved", "Closed"];
export const FINAL_STATUSES = ["Resolved", "Closed"];
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const CHANNELS = ["WhatsApp", "Email", "Phone Call", "SMS", "In Person", "Web Form", "Other"];
// Matches the MH26-04 problem statement: admission, scholarship, events, mentoring, technical, other.
export const DEFAULT_CATEGORIES = ["Admission", "Scholarship", "Events", "Mentoring", "Technical", "Other"];

export const DEFAULT_FOLLOWUP = {
  reminderHours: { Urgent: 4, High: 24, Medium: 48, Low: 72 },
  escalationAfterHours: 24,
  studentReminderEveryHours: 24,
  maxStudentReminders: 3,
};
export const DEFAULT_ASSIGNMENT = { autoAssign: true, fallbackLeastLoaded: true, rules: [] };

export const MAX_ATTACHMENTS = 3;
export const HOUR = 3600000;

export function mergeFollowup(saved) {
  const s = saved || {};
  return {
    ...DEFAULT_FOLLOWUP, ...s,
    reminderHours: { ...DEFAULT_FOLLOWUP.reminderHours, ...(s.reminderHours || {}) },
  };
}
export function mergeAssignment(saved) {
  const s = saved || {};
  return { ...DEFAULT_ASSIGNMENT, ...s, rules: Array.isArray(s.rules) ? s.rules : [] };
}

export const isFinal = (status) => FINAL_STATUSES.includes(status);

export function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  return 0;
}

export function slaHoursFor(priority, followup) {
  const f = mergeFollowup(followup);
  return f.reminderHours[priority] ?? f.reminderHours.Medium;
}

export function isOverdue(q, nowMs) {
  const due = toMs(q.dueAt);
  return !isFinal(q.status) && due > 0 && due < nowMs;
}

export function formatDateTime(ts) {
  const ms = toMs(ts);
  return ms ? new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const hours = ms / HOUR;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

const KEYWORDS = {
  Admission: ["admission", "admit", "seat", "counselling", "counseling", "application form", "eligibility", "cutoff", "enrol", "enroll"],
  Scholarship: ["scholarship", "fee waiver", "fees", "fee ", "stipend", "financial aid", "tuition", "disburse"],
  Events: ["event", "workshop", "seminar", "session", "webinar", "registration", "meetup", "camp", "hackathon"],
  Mentoring: ["mentor", "mentoring", "guidance", "career", "internship", "advice", "counsel me"],
  Technical: ["login", "password", "portal", "website", "app ", "error", "bug", "otp", "upload", "not working", "technical", "link"],
};
export function suggestCategory(text, categories = DEFAULT_CATEGORIES) {
  const t = ` ${(text || "").toLowerCase()} `;
  let best = null; let bestScore = 0;
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    if (!categories.includes(cat)) continue;
    const score = words.filter((w) => t.includes(w)).length;
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return best;
}

export function toCsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // prevent spreadsheet formula injection
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export function getErrorMessage(error) {
  const errors = {
    "auth/email-already-in-use": "This email already has an account. Please sign in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password must contain at least 8 characters.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/network-request-failed": "Check your internet connection.",
    "permission-denied": "Permission denied. Publish the latest firestore.rules to your Firebase project.",
    "failed-precondition": "A Firestore index is required. Run: firebase deploy --only firestore:indexes",
  };
  return errors[error?.code] || error?.message || "Something went wrong.";
}

export const STATUS_COLORS = { New: "#2363a5", Assigned: "#6341a5", "In Progress": "#f5b914", "Waiting for Student": "#e08a00", Resolved: "#247344", Closed: "#9a9a9a" };
