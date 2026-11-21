import { useMemo, useState } from "react";
import { BarList, StackedBar, TrendChart } from "../components/Charts.jsx";
import { QueryList, Stat } from "../components/common.jsx";
import { computeMetrics } from "../lib/metrics.js";
import { STATUS_COLORS, formatDuration, isFinal, isOverdue, toMs, ROLE_LABELS } from "../lib/config.js";

const RANGES = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["all", "All time"]];

export default function DashboardPage({ role, queries, now, coordinators, categories, onOpenQuery, onNavigate, onSearch }) {
  const [range, setRange] = useState("all");
  const [category, setCategory] = useState("All");
  const [coordinator, setCoordinator] = useState("All");
  const [text, setText] = useState("");
  const isAdmin = role === "admin";

  const scoped = useMemo(() => queries.filter((q) => {
    if (range !== "all" && toMs(q.createdAt) < now - Number(range) * 86400000) return false;
    if (category !== "All" && q.category !== category) return false;
    if (coordinator === "none") return !q.assignedTo;
    if (coordinator !== "All" && q.assignedTo !== coordinator) return false;
    return true;
  }), [queries, range, category, coordinator, now]);

  const m = useMemo(() => computeMetrics(scoped, now, coordinators), [scoped, now, coordinators]);
  const attention = useMemo(() => scoped
    .filter((q) => !isFinal(q.status) && (isOverdue(q, now) || !q.assignedTo || toMs(q.escalatedAt)))
    .sort((a, b) => toMs(a.dueAt || a.createdAt) - toMs(b.dueAt || b.createdAt)).slice(0, 5), [scoped, now]);

  const intro = isAdmin ? "Team-wide view of every query." : role === "coordinator" ? "Your assigned workload." : "Queries you have logged.";
  return (
    <section className="page-content">
      <div className="welcome-banner">
        <div>
          <span className="eyebrow">{ROLE_LABELS[role].toUpperCase()} PORTAL</span>
          <h1>Support <span>dashboard</span></h1>
          <p>{intro}</p>
          {role === "student" && <button className="primary-button" onClick={() => onNavigate("raise")}>+ Log a Query</button>}
        </div>
        <div className="welcome-decoration">M</div>
      </div>

      <form className="dash-filters" onSubmit={(e) => { e.preventDefault(); onSearch(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search student, institution, category, status…" />
        <select value={range} onChange={(e) => setRange(e.target.value)}>{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}><option>All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        {isAdmin && (
          <select value={coordinator} onChange={(e) => setCoordinator(e.target.value)}>
            <option value="All">All coordinators</option><option value="none">Unassigned</option>
            {coordinators.map((c) => <option key={c.uid} value={c.uid}>{c.displayName || c.email}</option>)}
          </select>
        )}
        <button className="secondary-button" type="submit">Search</button>
      </form>

      <div className="stats-grid">
        <Stat title="Open queries" value={m.open} icon="◉" />
        <Stat title="Overdue" value={m.overdue} icon="!" tone={m.overdue ? "danger" : ""} />
        <Stat title={isAdmin ? "Unassigned" : "Waiting for student"} value={isAdmin ? m.unassigned : m.waiting} icon="?" tone={isAdmin && m.unassigned ? "warn" : ""} />
        <Stat title="Avg. time to resolve" value={formatDuration(m.avgResolutionMs)} icon="◷" hint={`${m.resolved} resolved / closed`} />
      </div>

      <div className="chart-grid">
        <div className="chart-card wide"><h3>Status overview</h3><StackedBar items={m.byStatus} colorFor={(l) => STATUS_COLORS[l]} /></div>
        <div className="chart-card"><h3>Most common categories</h3><BarList items={m.byCategory} /></div>
        {isAdmin ? (
          <div className="chart-card">
            <h3>Open queries per coordinator</h3>
            <BarList items={m.byCoordinator.map((c) => ({ label: c.label, value: c.open, sub: c.overdue ? ` · ${c.overdue} overdue` : "" }))} empty="No coordinators yet." />
          </div>
        ) : (
          <div className="chart-card"><h3>Priority mix</h3><BarList items={m.byPriority} /></div>
        )}
        <div className="chart-card wide"><h3>Created vs resolved · last 14 days</h3><TrendChart data={m.trend} /></div>
      </div>

      <div className="section-heading"><div><h3>Needs attention</h3><p>Overdue, escalated or unassigned queries — where help is needed now</p></div>
        <button className="text-button" onClick={() => onNavigate("queries")}>View all →</button></div>
      {attention.length ? <QueryList queries={attention} now={now} onSelect={onOpenQuery} /> : <p className="empty-state">Nothing needs attention right now.</p>}
    </section>
  );
}
