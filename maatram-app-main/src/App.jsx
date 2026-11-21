import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { auth, db, isFirebaseConfigured } from "./firebase";
import {
  createUserWithEmailAndPassword, deleteUser, updateProfile, signInWithEmailAndPassword,
  sendPasswordResetEmail, onAuthStateChanged, signOut,
} from "firebase/auth";
import {
  Timestamp, addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { Brand } from "./components/common.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import QueriesPage from "./pages/QueriesPage.jsx";
import LogQueryPage from "./pages/LogQueryPage.jsx";
import QueryDetailsPage from "./pages/QueryDetailsPage.jsx";
import { CategoriesPage, NotificationsPage, ReportsPage, RulesPage, UsersPage } from "./pages/AdminPages.jsx";
import {
  CHANNELS, DEFAULT_CATEGORIES, HOUR, PRIORITIES, ROLE_LABELS, STATUSES, getErrorMessage, isFinal, mergeAssignment,
  mergeFollowup, slaHoursFor,
} from "./lib/config.js";
import { prepareAttachments } from "./lib/attachments.js";
import { notifyUser } from "./lib/notify.js";
import { runFollowUpSweep } from "./lib/followups.js";
import { clearDemoData, loadDemoData } from "./lib/demoData.js";

const catId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const qDoc = (item) => doc(db, "users", item.ownerUid, "queries", item.id);
const histCol = (item) => collection(db, "users", item.ownerUid, "queries", item.id, "history");

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [role, setRole] = useState(null);
  const [roleReady, setRoleReady] = useState(!auth);
  const [roleError, setRoleError] = useState("");
  const [profile, setProfile] = useState(null);

  const [registering, setRegistering] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [institution, setInstitution] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [notice, setNotice] = useState("");
  const [page, setPage] = useState("dashboard");
  const [initialSearch, setInitialSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const [queries, setQueries] = useState([]);
  const [queriesLoaded, setQueriesLoaded] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [queryHistory, setQueryHistory] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [users, setUsers] = useState([]);
  const [guidelines, setGuidelines] = useState("");
  const [assignmentCfg, setAssignmentCfg] = useState(null);
  const [followupCfg, setFollowupCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const isAdmin = role === "admin";
  const isCoordinator = role === "coordinator";

  // ---------- clock (used for overdue flags) ----------
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // ---------- authentication ----------
  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      setNotice("");
      setRole(null); setRoleError(""); setProfile(null);
      setQueries([]); setQueriesLoaded(false); setUsers([]); setNotifications([]); setSelectedKey(null);
      setPage("dashboard"); setRoleReady(!user);
    });
  }, []);

  useEffect(() => {
    if (!authUser) return undefined;
    let active = true;
    (async () => {
      try {
        const roleRef = doc(db, "roles", authUser.uid);
        let snap = await getDoc(roleRef);
        for (let attempt = 0; !snap.exists() && attempt < 4; attempt += 1) {
          await new Promise((r) => setTimeout(r, 400));
          snap = await getDoc(roleRef);
        }
        if (!snap.exists()) throw new Error("Role document not found. Contact the administrator.");
        const userRole = snap.data().role;
        if (!ROLE_LABELS[userRole]) throw new Error("Invalid account role.");
        let prof = null;
        try { const p = await getDoc(doc(db, "users", authUser.uid)); prof = p.exists() ? p.data() : null; } catch { /* optional */ }
        if (active) { setRole(userRole); setProfile(prof); setRoleError(""); setRoleReady(true); }
        try {
          await setDoc(doc(db, "users", authUser.uid), {
            email: authUser.email || "", displayName: authUser.displayName || (authUser.email || "").split("@")[0], lastLoginAt: serverTimestamp(),
          }, { merge: true });
        } catch (e) { console.error("Profile update error:", e); }
      } catch (error) {
        console.error("Role loading error:", error);
        if (active) { setRole(null); setRoleError("Your account does not have a valid assigned role. Please contact the administrator."); setNotice(getErrorMessage(error)); setRoleReady(true); }
      }
    })();
    return () => { active = false; };
  }, [authUser]);

  // ---------- shared settings ----------
  useEffect(() => {
    if (!authUser || !roleReady || !role) return undefined;
    const fail = (e) => console.error("Settings listener:", e);
    const stops = [
      onSnapshot(collection(db, "categories"), (snap) => {
        const values = snap.docs.map((d) => d.data().name).filter((n) => typeof n === "string" && n.trim());
        setCategories(values.length ? values : DEFAULT_CATEGORIES);
      }, (e) => { console.error(e); setNotice(getErrorMessage(e)); }),
      onSnapshot(doc(db, "settings", "rules"), (s) => setGuidelines(s.exists() ? s.data().content || "" : ""), fail),
      onSnapshot(doc(db, "settings", "followup"), (s) => setFollowupCfg(s.exists() ? s.data() : null), fail),
    ];
    if (role === "admin") {
      stops.push(onSnapshot(doc(db, "settings", "assignment"), (s) => setAssignmentCfg(s.exists() ? s.data() : null), fail));
      stops.push(onSnapshot(collection(db, "users"), (snap) => setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))), (e) => { console.error(e); setNotice(getErrorMessage(e)); }));
    }
    return () => stops.forEach((stop) => stop());
  }, [authUser, role, roleReady]);

  // ---------- queries (role scoped) ----------
  useEffect(() => {
    if (!authUser || !roleReady || !role) return undefined;
    const source = role === "student" ? collection(db, "users", authUser.uid, "queries") : collectionGroup(db, "queries");
    const ref = role === "coordinator" ? query(source, where("assignedTo", "==", authUser.uid)) : source;
    return onSnapshot(ref, (snap) => {
      setQueries(snap.docs.map((item) => ({
        ...item.data(), id: item.id, ownerUid: item.ref.parent.parent?.id || authUser.uid,
        title: item.data().title || "Untitled Query", category: item.data().category || "Other", description: item.data().description || "",
        priority: item.data().priority || "Medium", status: item.data().status || "New", assignedTo: item.data().assignedTo || "",
        lastActivityAt: item.data().lastActivityAt || item.data().createdAt || null,
      })));
      setQueriesLoaded(true);
    }, (error) => { console.error("Query loading error:", error); setNotice(getErrorMessage(error)); setQueriesLoaded(true); });
  }, [authUser, role, roleReady]);

  const selected = useMemo(() => queries.find((q) => `${q.ownerUid}/${q.id}` === selectedKey) || null, [queries, selectedKey]);

  useEffect(() => {
    if (!authUser || !selected) return undefined;
    const base = ["users", selected.ownerUid, "queries", selected.id];
    const stopHistory = onSnapshot(query(collection(db, ...base, "history"), orderBy("createdAt", "asc")),
      (snap) => setQueryHistory(snap.docs.map((e) => ({ id: e.id, ...e.data() }))), (e) => console.error("History:", e));
    const stopFiles = onSnapshot(query(collection(db, ...base, "attachments"), orderBy("createdAt", "asc")),
      (snap) => setAttachments(snap.docs.map((e) => ({ id: e.id, ...e.data() }))), (e) => { console.warn("Attachments:", e.code); setAttachments([]); });
    return () => { stopHistory(); stopFiles(); };
  }, [authUser, selected?.id, selected?.ownerUid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authUser || !roleReady || !role) return undefined;
    return onSnapshot(query(collection(db, "users", authUser.uid, "notifications"), orderBy("createdAt", "desc")),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 50)), (e) => console.error("Notifications:", e));
  }, [authUser, roleReady, role]);

  // ---------- derived ----------
  const coordinators = useMemo(() => users.filter((u) => u.role === "coordinator").sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "")), [users]);
  const coordinatorName = useCallback((uid) => {
    if (!uid) return "";
    const c = users.find((u) => u.uid === uid);
    return c ? c.displayName || c.email : queries.find((q) => q.assignedTo === uid)?.assignedEmail || "";
  }, [users, queries]);
  const followup = useMemo(() => mergeFollowup(followupCfg), [followupCfg]);
  const assignCfg = useMemo(() => mergeAssignment(assignmentCfg), [assignmentCfg]);
  const actorName = authUser?.displayName || authUser?.email || ROLE_LABELS[role];
  const unread = notifications.filter((n) => !n.read).length;
  const dueFrom = (priority) => Timestamp.fromMillis(Date.now() + slaHoursFor(priority, followup) * HOUR);
  const resetClock = (item) => ({ dueAt: dueFrom(item.priority), reminderSentAt: null, escalatedAt: null, studentReminderCount: 0, studentRemindedAt: null });

  // ---------- admin follow-up sweep (works without Cloud Functions) ----------
  const sweepData = useRef({});
  const sweepRunning = useRef(false);
  useEffect(() => { sweepData.current = { queries, users, assignmentCfg, followupCfg, authUser }; });
  const runSweep = useCallback(async (silent) => {
    const d = sweepData.current;
    if (sweepRunning.current || !d.authUser) return;
    sweepRunning.current = true; if (!silent) setSweepBusy(true);
    try {
      const r = await runFollowUpSweep({ queries: d.queries, users: d.users, assignmentCfg: d.assignmentCfg, followupCfg: d.followupCfg, actor: d.authUser });
      if (!silent || r.assigned || r.reminders || r.escalations || r.studentReminders)
        setNotice(`Follow-up check done: ${r.assigned} auto-assigned, ${r.reminders} reminders, ${r.escalations} escalations, ${r.studentReminders} student reminders.`);
    } catch (error) { console.error("Sweep error:", error); if (!silent) setNotice(getErrorMessage(error)); }
    finally { sweepRunning.current = false; setSweepBusy(false); }
  }, []);
  useEffect(() => {
    if (!isAdmin || !queriesLoaded) return undefined;
    const first = setTimeout(() => runSweep(true), 4000);
    const timer = setInterval(() => runSweep(true), 5 * 60000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [isAdmin, queriesLoaded, runSweep]);

  // ---------- auth actions ----------
  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true); setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    try {
      if (registering) {
        const cleanName = fullName.trim(); const cleanInstitution = institution.trim();
        if (!cleanName || !cleanInstitution) { setNotice("Enter your full name and institution."); return; }
        if (password !== confirmPassword) { setNotice("Password and confirm password do not match."); return; }
        if (password.length < 8) { setNotice("Password must contain at least 8 characters."); return; }
        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(result.user, { displayName: cleanName });
        const batch = writeBatch(db);
        const profileDoc = { uid: result.user.uid, email: result.user.email || cleanEmail, role: "student", displayName: cleanName, institution: cleanInstitution, createdAt: serverTimestamp() };
        if (phone.trim()) profileDoc.phone = phone.trim();
        batch.set(doc(db, "users", result.user.uid), profileDoc);
        batch.set(doc(db, "roles", result.user.uid), { role: "student", createdAt: serverTimestamp() });
        try { await batch.commit(); } catch (profileError) {
          try { await deleteUser(result.user); } catch (c) { console.error("Signup cleanup failed:", c); }
          throw profileError;
        }
        setNotice("Account created successfully as Student Representative.");
        setPassword(""); setConfirmPassword("");
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      }
    } catch (error) { console.error("Authentication error:", error); setNotice(getErrorMessage(error)); }
    finally { setAuthLoading(false); }
  }
  async function forgotPassword() {
    if (!email.trim()) { setNotice("Enter your email address first."); return; }
    try { await sendPasswordResetEmail(auth, email.trim().toLowerCase()); setNotice("Password reset email sent if the account exists."); }
    catch (error) { setNotice(getErrorMessage(error)); }
  }
  async function logout() {
    try { await signOut(auth); setPassword(""); } catch (error) { setNotice(getErrorMessage(error)); }
  }

  // ---------- query actions ----------
  async function submitQuery(form, files, clearFiles) {
    if (role !== "student") { setNotice("Only Student Representatives can log queries."); return; }
    if (!categories.includes(form.category) || !PRIORITIES.includes(form.priority) || !CHANNELS.includes(form.channel)) { setNotice("Select a valid category, priority and channel."); return; }
    setBusy(true); setNotice("");
    try {
      const prepared = await prepareAttachments(files);
      const ref = await addDoc(collection(db, "users", authUser.uid, "queries"), {
        title: form.title.trim(), category: form.category, description: form.description.trim(), studentName: form.studentName.trim(),
        institution: form.institution.trim(), priority: form.priority, channel: form.channel, status: "New",
        createdAt: serverTimestamp(), lastActivityAt: serverTimestamp(), studentEmail: form.studentEmail.trim().toLowerCase(),
        studentPhone: form.studentPhone.trim(), loggedByEmail: authUser.email || "", studentUid: authUser.uid,
        assignedTo: "", assignedEmail: "", dueAt: dueFrom(form.priority), reminderSentAt: null, escalatedAt: null, attachmentCount: prepared.length,
      });
      await addDoc(collection(ref, "history"), {
        type: "created", fromStatus: null, toStatus: "New", actorUid: authUser.uid, actorName,
        note: `Query received through ${form.channel}.${prepared.length ? ` ${prepared.length} attachment(s).` : ""}`, createdAt: serverTimestamp(),
      });
      for (const file of prepared) await addDoc(collection(ref, "attachments"), { ...file, uploadedBy: authUser.uid, createdAt: serverTimestamp() });
      clearFiles();
      setPage("queries"); setNotice("Query logged. It will be assigned to a coordinator shortly.");
    } catch (error) { console.error("Query submission error:", error); setNotice(getErrorMessage(error)); }
    finally { setBusy(false); }
  }

  async function updateStatus(item, status, note) {
    if (!STATUSES.includes(status) || !(isAdmin || isCoordinator)) return;
    try {
      const batch = writeBatch(db);
      const final = isFinal(status);
      const update = { status, statusUpdatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() };
      if (final) { update.resolvedAt = serverTimestamp(); update.dueAt = null; update.reminderSentAt = null; update.escalatedAt = null; }
      else { Object.assign(update, resetClock(item)); if (isFinal(item.status)) update.resolvedAt = null; }
      if (status === "Waiting for Student") update.waitingForStudentAt = serverTimestamp();
      batch.update(qDoc(item), update);
      batch.set(doc(histCol(item)), { type: "status_changed", fromStatus: item.status, toStatus: status, actorUid: authUser.uid, actorName, note: note || "Status updated.", createdAt: serverTimestamp() });
      await batch.commit();
      if (status === "Waiting for Student") await notifyUser(item.ownerUid, authUser.uid, { type: "student_reply_needed", title: "Student reply needed", message: `${item.studentName || "The student"} needs to reply on "${item.title}". ${note || ""}`, queryId: item.id, ownerUid: item.ownerUid });
      if (final) await notifyUser(item.ownerUid, authUser.uid, { type: "query_resolved", title: "Query resolved", message: `"${item.title}" for ${item.studentName || "the student"} is now ${status}. Please let the student know.`, queryId: item.id, ownerUid: item.ownerUid });
      setNotice(`Status updated to ${status}.`);
    } catch (error) { console.error("Status update error:", error); setNotice(getErrorMessage(error)); }
  }

  async function addNote(item, note) {
    try {
      const batch = writeBatch(db);
      const update = { lastActivityAt: serverTimestamp() };
      if (!isFinal(item.status)) Object.assign(update, { dueAt: dueFrom(item.priority), reminderSentAt: null, escalatedAt: null });
      batch.update(qDoc(item), update);
      batch.set(doc(histCol(item)), { type: "note", actorUid: authUser.uid, actorName, note, createdAt: serverTimestamp() });
      await batch.commit();
      setNotice("Note added.");
    } catch (error) { console.error("Note error:", error); setNotice(getErrorMessage(error)); }
  }

  async function assignQuery(item, coordinatorUid, note) {
    if (!isAdmin) return;
    const c = coordinators.find((u) => u.uid === coordinatorUid);
    if (!c) { setNotice("Please select a valid Coordinator account."); return; }
    try {
      const nextStatus = item.status === "New" ? "Assigned" : item.status;
      const previous = item.assignedTo ? coordinatorName(item.assignedTo) : "";
      const batch = writeBatch(db);
      batch.update(qDoc(item), {
        assignedTo: c.uid, assignedEmail: c.email || "", assignedAt: serverTimestamp(), assignedByRule: "", status: nextStatus,
        lastActivityAt: serverTimestamp(), ...resetClock(item),
      });
      batch.set(doc(histCol(item)), {
        type: "assigned", fromStatus: item.status, toStatus: nextStatus, actorUid: authUser.uid, actorName, assignedTo: c.uid, assignedEmail: c.email || "",
        note: `${previous ? `Reassigned from ${previous} to` : "Assigned to"} ${c.displayName || c.email}.${note ? ` Note: ${note}` : ""}`, createdAt: serverTimestamp(),
      });
      await batch.commit();
      await notifyUser(c.uid, authUser.uid, { type: "query_assigned", title: previous ? "Query reassigned to you" : "New query assigned to you", message: `${item.title} (${item.priority}).${note ? ` ${note}` : ""}`, queryId: item.id, ownerUid: item.ownerUid });
      if (item.assignedTo) await notifyUser(item.assignedTo, authUser.uid, { type: "status_changed", title: "Query reassigned", message: `"${item.title}" was reassigned to ${c.displayName || c.email}.`, queryId: item.id, ownerUid: item.ownerUid });
      setNotice("Coordinator assigned.");
    } catch (error) { console.error("Assignment error:", error); setNotice(getErrorMessage(error)); }
  }

  async function studentReply(item, text, files) {
    try {
      const prepared = await prepareAttachments(files);
      const batch = writeBatch(db);
      batch.update(qDoc(item), { status: "In Progress", statusUpdatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(), ...resetClock(item) });
      batch.set(doc(histCol(item)), { type: "student_reply", fromStatus: item.status, toStatus: "In Progress", actorUid: authUser.uid, actorName, note: text, createdAt: serverTimestamp() });
      prepared.forEach((f) => batch.set(doc(collection(qDoc(item), "attachments")), { ...f, uploadedBy: authUser.uid, createdAt: serverTimestamp() }));
      await batch.commit();
      await notifyUser(item.assignedTo, authUser.uid, { type: "student_reply", title: "Student replied", message: `Reply received on "${item.title}".`, queryId: item.id, ownerUid: item.ownerUid });
      setNotice("Reply sent to the team.");
    } catch (error) { console.error("Reply error:", error); setNotice(getErrorMessage(error)); }
  }

  // ---------- admin actions ----------
  async function changeUserRole(uid, nextRole) {
    if (!isAdmin || !ROLE_LABELS[nextRole] || uid === authUser.uid) return;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "roles", uid), { role: nextRole, updatedAt: serverTimestamp() }, { merge: true });
      batch.set(doc(db, "users", uid), { role: nextRole, updatedAt: serverTimestamp() }, { merge: true });
      await batch.commit();
      setNotice(`User role updated to ${ROLE_LABELS[nextRole]}.`);
    } catch (error) { setNotice(getErrorMessage(error)); }
  }
  const setSenior = (uid, value) => updateDoc(doc(db, "users", uid), { isSenior: value, updatedAt: serverTimestamp() }).catch((e) => setNotice(getErrorMessage(e)));
  async function addCategory(name) {
    const clean = name.trim();
    if (!clean || !catId(clean)) return;
    if (categories.some((c) => c.toLowerCase() === clean.toLowerCase())) { setNotice("This category already exists."); return; }
    try { await setDoc(doc(db, "categories", catId(clean)), { name: clean, createdAt: serverTimestamp() }); setNotice("Category added."); }
    catch (error) { setNotice(getErrorMessage(error)); }
  }
  async function removeCategory(name) {
    try { await deleteDoc(doc(db, "categories", catId(name))); setNotice("Category removed."); } catch (error) { setNotice(getErrorMessage(error)); }
  }
  async function restoreCategories() {
    try {
      const batch = writeBatch(db);
      DEFAULT_CATEGORIES.forEach((name) => batch.set(doc(db, "categories", catId(name)), { name, createdAt: serverTimestamp() }));
      await batch.commit(); setNotice("Recommended categories restored.");
    } catch (error) { setNotice(getErrorMessage(error)); }
  }
  const saveSetting = (id, data, label) => setDoc(doc(db, "settings", id), { ...data, updatedAt: serverTimestamp(), updatedBy: authUser.uid }, { merge: true })
    .then(() => setNotice(`${label} saved.`)).catch((e) => setNotice(getErrorMessage(e)));
  async function loadDemo() {
    setDemoBusy(true);
    try { const n = await loadDemoData(coordinators, authUser.uid); setNotice(`${n} dummy queries loaded.`); }
    catch (error) { setNotice(getErrorMessage(error)); } finally { setDemoBusy(false); }
  }
  async function clearDemo() {
    setDemoBusy(true);
    try { const n = await clearDemoData(queries); setNotice(`${n} demo queries removed.`); }
    catch (error) { setNotice(getErrorMessage(error)); } finally { setDemoBusy(false); }
  }
  async function markNotificationRead(n) {
    try { await updateDoc(doc(db, "users", authUser.uid, "notifications", n.id), { read: true, readAt: serverTimestamp() }); } catch (error) { setNotice(getErrorMessage(error)); }
  }

  function openPage(next) { setPage(next); setSelectedKey(null); setInitialSearch(""); setNotice(""); }
  function openQuery(item) { setSelectedKey(`${item.ownerUid}/${item.id}`); setPage("details"); }
  function openFromNotification(n) {
    const found = queries.find((q) => q.id === n.queryId && q.ownerUid === n.ownerUid);
    if (found) openQuery(found); else setNotice("That query is no longer visible to you.");
  }

  // ---------- screens ----------
  if (!isFirebaseConfigured) {
    return (
      <div className="login-page"><div className="login-card">
        <div className="login-logo"><img src="/maatram-logo.png" alt="Maatram" /></div>
        <div className="login-heading"><span className="eyebrow">PROJECT SETUP REQUIRED</span><h2>Connect your Firebase project</h2>
          <p>Copy <strong>.env.example</strong> to <strong>.env.local</strong>, add your Firebase Web App configuration, then restart the dev server.</p></div>
        <ol className="setup-steps"><li>Create a Firebase project and enable Email/Password sign-in.</li><li>Create a Cloud Firestore database.</li><li>Publish firestore.rules and firestore.indexes.json.</li><li>Paste the Web App config into .env.local.</li></ol>
      </div></div>
    );
  }
  if (!authReady || (authUser && !roleReady)) {
    return <div className="splash-screen"><div className="splash-content"><img src="/maatram-logo.png" alt="Maatram" className="splash-logo" /><h1>MAATRAM</h1><p>STUDENT SUPPORT SYSTEM</p><div className="splash-loader"></div></div></div>;
  }
  if (authUser && roleReady && !role) {
    return (
      <div className="login-page"><div className="login-card">
        <div className="login-heading"><span className="eyebrow">ACCOUNT ACCESS</span><h2>Role approval required</h2>
          <p>{roleError || "This account does not have an assigned role."}</p><p>Signed in as: {authUser.email}</p></div>
        <button className="primary-button" onClick={logout}>Sign out</button>
      </div></div>
    );
  }
  if (!authUser) {
    return (
      <div className="login-page"><div className="login-card">
        <div className="login-logo"><img src="/maatram-logo.png" alt="Maatram Foundation" /></div>
        <div className="login-heading"><span className="eyebrow">STUDENT SUPPORT PORTAL</span>
          <h2>{registering ? "Create your account" : "Welcome back"}</h2>
          <p>{registering ? "Register as a Student Representative." : "Sign in to continue to your portal."}</p></div>
        <form onSubmit={handleAuth} className="login-form">
          {registering && (<>
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter your full name" autoComplete="name" maxLength={80} required />
            <label htmlFor="institution">Institution</label>
            <input id="institution" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Your college / institution" autoComplete="organization" maxLength={120} required />
            <label htmlFor="phone">Mobile (optional, for SMS / WhatsApp alerts)</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" autoComplete="tel" maxLength={20} />
          </>)}
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 8 : 6} required />
          {registering && (<>
            <label htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" minLength={8} required />
            <p className="auth-helper-text">Public registration is only for Student Representatives. Coordinator and Admin accounts are approved by an Admin.</p>
          </>)}
          {!registering && <div className="forgot-password"><button type="button" className="text-button" onClick={forgotPassword}>Forgot password?</button></div>}
          <button type="submit" className="primary-button sign-in-button" disabled={authLoading}>{authLoading ? "Please wait..." : registering ? "Create account" : "Sign in"}</button>
        </form>
        <p className="auth-switch">{registering ? "Already have an account?" : "Don't have an account?"}
          <button className="text-button" type="button" onClick={() => { setRegistering(!registering); setNotice(""); }}>{registering ? "Sign in" : "Create account"}</button></p>
        {notice && <div className="notice-message">{notice}</div>}
        <div className="login-footer">© 2026 Maatram Foundation</div>
      </div></div>
    );
  }

  const queriesLabel = isAdmin ? "All Queries" : isCoordinator ? "Assigned Queries" : "My Queries";
  const nav = [
    ["dashboard", "▦", "Dashboard"], ["notifications", "♧", "Notifications"], ["queries", "☷", queriesLabel],
    ...(role === "student" ? [["raise", "+", "Log a Query"]] : []),
    ...(isAdmin ? [["users", "♙", "Users"], ["categories", "▤", "Categories"], ["rules", "⚙", "Rules"], ["reports", "▥", "Reports"]] : []),
  ];
  const titles = { dashboard: "Dashboard", notifications: "Notifications", queries: queriesLabel, raise: "Log a Query", users: "User Management", categories: "Category Management", rules: "Rules & Automation", reports: "Reports", details: "Query Details" };
  const loadingQueries = !queriesLoaded;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand /></div>
        <div className="sidebar-user">
          <div className="user-avatar">{(authUser.email || "M")[0].toUpperCase()}</div>
          <div className="user-info"><strong>{ROLE_LABELS[role]}</strong><span>{authUser.email}</span></div>
        </div>
        <nav className="sidebar-nav">
          <span className="nav-label">WORKSPACE</span>
          {nav.map(([key, icon, label]) => (
            <button key={key} className={page === key ? "active" : ""} onClick={() => openPage(key)}>
              <span>{icon}</span>{label}
              {key === "queries" && <span className="nav-count">{queries.length}</span>}
              {key === "notifications" && unread > 0 && <span className="nav-count">{unread}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><span>{isAdmin ? "Administration" : isCoordinator ? "Coordinator workspace" : "Need assistance?"}</span>
            <p>{isAdmin ? "Assign, escalate and monitor every query." : isCoordinator ? "Work on queries assigned to you." : "Log a query and track its progress."}</p></div>
          <button className="logout-button" onClick={logout}><span>↪</span>Sign out</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><span className="topbar-label">MAATRAM FOUNDATION</span><h2>{titles[page] || "Dashboard"}</h2></div>
          <div className="topbar-user">
            <button className="notification-shortcut" onClick={() => openPage("notifications")} title="Notifications">♧ <span>{unread}</span></button>
            <div className="topbar-user-info"><strong>{ROLE_LABELS[role]}</strong><span>{authUser.email}</span></div>
            <div className="user-avatar">{(authUser.email || "M")[0].toUpperCase()}</div>
          </div>
        </header>

        {notice && <div className="app-notice"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}

        {page === "dashboard" && (
          <DashboardPage role={role} queries={queries} now={now} coordinators={coordinators} categories={categories}
            onOpenQuery={openQuery} onNavigate={openPage} onSearch={(text) => { setPage("queries"); setInitialSearch(text); }} />
        )}
        {page === "raise" && role === "student" && (
          <LogQueryPage key={profile?.institution || "x"} categories={categories} guidelines={guidelines} defaultInstitution={profile?.institution}
            busy={busy} onSubmit={submitQuery} onCancel={() => openPage("dashboard")} />
        )}
        {page === "queries" && (
          <QueriesPage key={initialSearch} role={role} queries={queries} categories={categories} coordinators={coordinators} now={now}
            loading={loadingQueries} onOpen={openQuery} initialSearch={initialSearch} coordinatorName={coordinatorName} />
        )}
        {page === "notifications" && <NotificationsPage notifications={notifications} onRead={markNotificationRead} onOpenQuery={openFromNotification} />}
        {page === "details" && selected && (
          <QueryDetailsPage q={selected} history={queryHistory} attachments={attachments} role={role} coordinators={coordinators} queries={queries}
            now={now} assignmentCfg={assignCfg} coordinatorName={coordinatorName} onBack={() => openPage("queries")}
            actions={{ assign: assignQuery, setStatus: updateStatus, addNote, studentReply }} />
        )}
        {page === "details" && !selected && <section className="page-content"><p className="empty-state">Query not found.</p></section>}

        {page === "users" && isAdmin && <UsersPage users={users} queries={queries} currentUid={authUser.uid} onRole={changeUserRole} onSenior={setSenior} />}
        {page === "categories" && isAdmin && <CategoriesPage categories={categories} onAdd={addCategory} onRemove={removeCategory} onRestore={restoreCategories} />}
        {page === "rules" && isAdmin && (
          <RulesPage key={`${assignmentCfg ? 1 : 0}${followupCfg ? 1 : 0}${guidelines.length ? 1 : 0}`} assignmentCfg={assignmentCfg} followupCfg={followupCfg} guidelines={guidelines}
            coordinators={coordinators} categories={categories} sweepBusy={sweepBusy} onRunSweep={() => runSweep(false)}
            onSaveAssignment={(cfg) => saveSetting("assignment", cfg, "Assignment rules")}
            onSaveFollowup={(cfg) => saveSetting("followup", cfg, "Follow-up timings")}
            onSaveGuidelines={(text) => saveSetting("rules", { content: text }, "Guidelines")} />
        )}
        {page === "reports" && isAdmin && (
          <ReportsPage queries={queries} coordinators={coordinators} categories={categories} now={now} demoBusy={demoBusy} onLoadDemo={loadDemo} onClearDemo={clearDemo} />
        )}
      </main>

      <nav className="mobile-nav">
        {nav.map(([id, icon, label]) => (
          <button key={id} className={page === id ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => openPage(id)}><span>{icon}</span><small>{label}</small></button>
        ))}
      </nav>
    </div>
  );
}

export default App;
