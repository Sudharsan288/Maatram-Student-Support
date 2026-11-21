import { useMemo, useState } from "react";
import { BarList, StackedBar } from "../components/Charts.jsx";
import { Stat } from "../components/common.jsx";
import { computeMetrics } from "../lib/metrics.js";
import { DEFAULT_CATEGORIES, PRIORITIES, STATUS_COLORS, ROLE_LABELS, formatDateTime, formatDuration, isFinal, mergeAssignment, mergeFollowup, toCsv, toMs } from "../lib/config.js";

export function NotificationsPage({ notifications, onRead, onOpenQuery }) {
  return (
    <section className="page-content">
      <div className="page-intro"><span className="eyebrow">FOLLOW-UP CENTRE</span><h1>Notifications</h1><p>Assignments, reminders, escalations and replies related to your work.</p></div>
      <div className="notification-list">
        {notifications.length === 0 ? <p className="empty-state">You have no notifications yet.</p> : notifications.map((n) => (
          <article className={`notification-item ${n.read ? "is-read" : ""}`} key={n.id}>
            <div><strong>{n.title || "Maatram notification"}</strong><p>{n.message}</p><small>{formatDateTime(n.createdAt)}</small></div>
            <div className="notif-actions">
              {n.queryId && n.ownerUid && <button className="text-button" onClick={() => onOpenQuery(n)}>Open query</button>}
              {!n.read && <button className="secondary-button" onClick={() => onRead(n)}>Mark read</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function UsersPage({ users, queries, currentUid, onRole, onSenior }) {
  const load = (uid) => queries.filter((q) => q.assignedTo === uid && !isFinal(q.status)).length;
  return (
    <section className="page-content">
      <div className="page-intro"><span className="eyebrow">ADMINISTRATION</span><h1>User Management</h1><p>Promote registered users to Coordinator or Admin. Mark experienced coordinators as Senior to receive escalations.</p></div>
      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Institution</th><th>Role</th><th>Senior</th><th>Open load</th></tr></thead>
          <tbody>
            {users.filter((u) => !String(u.uid).startsWith("demo-") && u.uid !== "inbox").map((u) => (
              <tr key={u.uid}>
                <td>{u.displayName || "User"}</td><td>{u.email}</td><td>{u.institution || "—"}</td>
                <td><select value={u.role || "student"} disabled={u.uid === currentUid} onChange={(e) => onRole(u.uid, e.target.value)}>
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td>{u.role === "coordinator" ? <input type="checkbox" checked={!!u.isSenior} onChange={(e) => onSenior(u.uid, e.target.checked)} aria-label="Senior coordinator" /> : "—"}</td>
                <td>{u.role === "coordinator" ? load(u.uid) : "—"}</td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan="6">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CategoriesPage({ categories, onAdd, onRemove, onRestore }) {
  const [name, setName] = useState("");
  return (
    <section className="page-content">
      <div className="page-intro"><span className="eyebrow">ADMINISTRATION</span><h1>Query Categories</h1><p>Categories offered when logging a query. Recommended set: {DEFAULT_CATEGORIES.join(", ")}.</p></div>
      <div className="management-card">
        <h3>Add new category</h3>
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onAdd(name); setName(""); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" required maxLength={40} />
          <button className="primary-button" disabled={!name.trim()}>Add Category</button>
          <button type="button" className="secondary-button" onClick={onRestore}>Restore recommended set</button>
        </form>
      </div>
      <div className="category-list">
        {categories.map((c) => <div className="category-item" key={c}><span>{c}</span><button className="danger-button" onClick={() => onRemove(c)}>Remove</button></div>)}
      </div>
    </section>
  );
}

export function RulesPage({ assignmentCfg, followupCfg, guidelines, coordinators, categories, onSaveAssignment, onSaveFollowup, onSaveGuidelines, onRunSweep, sweepBusy }) {
  const [assign, setAssign] = useState(() => mergeAssignment(assignmentCfg));
  const [follow, setFollow] = useState(() => mergeFollowup(followupCfg));
  const [text, setText] = useState(guidelines || "");
  const [draft, setDraft] = useState({ category: "*", institution: "", coordinatorUid: "" });
  const addRule = () => {
    if (!draft.coordinatorUid || (draft.category === "*" && !draft.institution.trim())) return;
    setAssign((a) => ({ ...a, rules: [...a.rules, { id: `r${Date.now()}`, ...draft, institution: draft.institution.trim() }] }));
    setDraft({ category: "*", institution: "", coordinatorUid: "" });
  };
  const nameOf = (uid) => coordinators.find((c) => c.uid === uid)?.displayName || coordinators.find((c) => c.uid === uid)?.email || "(removed coordinator)";
  return (
    <section className="page-content">
      <div className="page-intro"><span className="eyebrow">ADMINISTRATION</span><h1>Rules & Automation</h1><p>Assignment rules, follow-up timings and the guidelines shown to Student Representatives.</p></div>

      <div className="management-card">
        <h3>Auto-assignment rules</h3>
        <p className="muted">The most specific matching rule wins (category + institution beats either alone). If nothing matches, the coordinator with the fewest open queries is chosen.</p>
        <label className="check-row"><input type="checkbox" checked={assign.autoAssign} onChange={(e) => setAssign({ ...assign, autoAssign: e.target.checked })} /> Automatically assign new queries</label>
        <label className="check-row"><input type="checkbox" checked={assign.fallbackLeastLoaded} onChange={(e) => setAssign({ ...assign, fallbackLeastLoaded: e.target.checked })} /> Fall back to least-loaded coordinator</label>
        <div className="rule-list">
          {assign.rules.length === 0 && <p className="empty-state">No rules yet — add one below.</p>}
          {assign.rules.map((r) => (
            <div className="rule-row" key={r.id}>
              <span>If category is <b>{r.category === "*" ? "any" : r.category}</b>{r.institution ? <> and institution contains <b>“{r.institution}”</b></> : null} → <b>{nameOf(r.coordinatorUid)}</b></span>
              <button className="danger-button" onClick={() => setAssign({ ...assign, rules: assign.rules.filter((x) => x.id !== r.id) })}>Remove</button>
            </div>
          ))}
        </div>
        <div className="inline-form rule-form">
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option value="*">Any category</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <input value={draft.institution} onChange={(e) => setDraft({ ...draft, institution: e.target.value })} placeholder="Institution contains… (optional)" />
          <select value={draft.coordinatorUid} onChange={(e) => setDraft({ ...draft, coordinatorUid: e.target.value })}><option value="">Assign to…</option>{coordinators.map((c) => <option key={c.uid} value={c.uid}>{c.displayName || c.email}</option>)}</select>
          <button type="button" className="secondary-button" onClick={addRule}>Add rule</button>
        </div>
        <button className="primary-button" onClick={() => onSaveAssignment(assign)}>Save assignment rules</button>
      </div>

      <div className="management-card">
        <h3>Follow-up timings</h3>
        <p className="muted">If a query gets no update within its window, the coordinator is reminded; if it stays overdue past the escalation delay, Admin and senior coordinators are alerted. Hours:</p>
        <div className="sla-grid">
          {PRIORITIES.map((p) => (
            <label key={p}>{p} priority<input type="number" min="1" max="720" value={follow.reminderHours[p]} onChange={(e) => setFollow({ ...follow, reminderHours: { ...follow.reminderHours, [p]: Number(e.target.value) || 1 } })} /></label>
          ))}
          <label>Escalate after (extra hours)<input type="number" min="1" max="720" value={follow.escalationAfterHours} onChange={(e) => setFollow({ ...follow, escalationAfterHours: Number(e.target.value) || 1 })} /></label>
          <label>Remind student every (hours)<input type="number" min="1" max="720" value={follow.studentReminderEveryHours} onChange={(e) => setFollow({ ...follow, studentReminderEveryHours: Number(e.target.value) || 1 })} /></label>
          <label>Max student reminders<input type="number" min="1" max="10" value={follow.maxStudentReminders} onChange={(e) => setFollow({ ...follow, maxStudentReminders: Number(e.target.value) || 1 })} /></label>
        </div>
        <div className="form-actions left">
          <button className="primary-button" onClick={() => onSaveFollowup(follow)}>Save timings</button>
          <button className="secondary-button" disabled={sweepBusy} onClick={onRunSweep}>{sweepBusy ? "Running…" : "Run follow-up check now"}</button>
        </div>
      </div>

      <form className="management-card" onSubmit={(e) => { e.preventDefault(); onSaveGuidelines(text); }}>
        <h3>Guidelines shown to Student Representatives</h3>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Always capture the student's email, and attach a screenshot when the issue is technical." />
        <button type="submit" className="primary-button">Save guidelines</button>
      </form>
    </section>
  );
}

export function ReportsPage({ queries, coordinators, categories, now, onLoadDemo, onClearDemo, demoBusy }) {
  const m = useMemo(() => computeMetrics(queries, now, coordinators), [queries, now, coordinators]);
  const demoCount = queries.filter((q) => q.isDemo).length;
  const catRows = useMemo(() => {
    const names = Array.from(new Set([...categories, ...m.byCategory.map((c) => c.label)]));
    return names.map((label) => {
      const list = queries.filter((q) => (q.category || "Other") === label);
      const done = list.filter((q) => isFinal(q.status) && toMs(q.resolvedAt));
      const avg = done.length ? done.reduce((s, q) => s + (toMs(q.resolvedAt) - toMs(q.createdAt)), 0) / done.length : 0;
      return { label, total: list.length, open: list.filter((q) => !isFinal(q.status)).length, avg };
    }).sort((a, b) => b.total - a.total);
  }, [queries, categories, m.byCategory]);

  function exportReport() {
    const rows = [["Coordinator", "Total", "Open", "Overdue", "Resolved", "Avg resolution"]];
    m.byCoordinator.forEach((c) => rows.push([c.label, c.total, c.open, c.overdue, c.resolved, formatDuration(c.avgResolutionMs)]));
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "maatram-coordinator-report.csv"; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <section className="page-content">
      <div className="page-intro"><span className="eyebrow">ADMINISTRATION</span><h1>Reports & Analytics</h1><p>Where help is needed, who is overloaded and how fast queries are resolved.</p></div>
      <div className="stats-grid">
        <Stat title="Total queries" value={m.total} icon="☷" /><Stat title="Open" value={m.open} icon="◉" />
        <Stat title="Overdue" value={m.overdue} icon="!" tone={m.overdue ? "danger" : ""} /><Stat title="Escalated" value={m.escalated} icon="↑" />
        <Stat title="Resolved / closed" value={m.resolved} icon="✓" /><Stat title="Avg. time to resolve" value={formatDuration(m.avgResolutionMs)} icon="◷" />
        <Stat title="Unassigned" value={m.unassigned} icon="?" /><Stat title="Top category" value={m.topCategory} icon="★" />
      </div>
      <div className="chart-grid">
        <div className="chart-card wide"><h3>Status distribution</h3><StackedBar items={m.byStatus} colorFor={(l) => STATUS_COLORS[l]} /></div>
        <div className="chart-card"><h3>Queries by category</h3><BarList items={m.byCategory} /></div>
        <div className="chart-card"><h3>Priority mix</h3><BarList items={m.byPriority} /></div>
      </div>
      <div className="management-card">
        <div className="card-head"><h3>Coordinator performance</h3><button className="secondary-button" onClick={exportReport}>Export CSV</button></div>
        <div className="table-container"><table className="data-table">
          <thead><tr><th>Coordinator</th><th>Assigned</th><th>Open</th><th>Overdue</th><th>Resolved</th><th>Avg. resolution</th></tr></thead>
          <tbody>
            {m.byCoordinator.map((c) => <tr key={c.uid}><td>{c.label}</td><td>{c.total}</td><td>{c.open}</td><td className={c.overdue ? "text-danger" : ""}>{c.overdue}</td><td>{c.resolved}</td><td>{formatDuration(c.avgResolutionMs)}</td></tr>)}
            {m.byCoordinator.length === 0 && <tr><td colSpan="6">No coordinators registered yet.</td></tr>}
          </tbody></table></div>
      </div>
      <div className="management-card">
        <h3>Category summary</h3>
        <div className="table-container"><table className="data-table">
          <thead><tr><th>Category</th><th>Total</th><th>Open</th><th>Avg. resolution</th></tr></thead>
          <tbody>{catRows.map((c) => <tr key={c.label}><td>{c.label}</td><td>{c.total}</td><td>{c.open}</td><td>{formatDuration(c.avg)}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="management-card demo-card">
        <h3>Demo data</h3>
        <p className="muted">Loads clearly-marked dummy queries (no real student data) spread over the last 25 days, assigned across your coordinators. Remove them any time.</p>
        <div className="form-actions left">
          <button className="primary-button" disabled={demoBusy} onClick={onLoadDemo}>{demoBusy ? "Working…" : "Load demo data"}</button>
          <button className="danger-button" disabled={demoBusy || !demoCount} onClick={onClearDemo}>Remove demo data ({demoCount})</button>
        </div>
        <small className="muted">Last refreshed {formatDateTime(now)}</small>
      </div>
    </section>
  );
}
