import { useMemo, useState } from "react";
import { QueryList } from "../components/common.jsx";
import { PRIORITIES, STATUSES, isFinal, isOverdue, toCsv, toMs, formatDateTime } from "../lib/config.js";

export default function QueriesPage({ role, queries, categories, coordinators, now, onOpen, loading, initialSearch = "", coordinatorName }) {
  const isAdmin = role === "admin";
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");
  const [priority, setPriority] = useState("All");
  const [coordinator, setCoordinator] = useState("All");
  const [quick, setQuick] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("newest");

  const visible = useMemo(() => {
    const s = search.toLowerCase().trim();
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMsV = to ? new Date(`${to}T23:59:59`).getTime() : null;
    const list = queries.filter((q) => {
      const hay = [q.title, q.category, q.status, q.studentName, q.studentEmail, q.assignedEmail, q.institution, q.description, q.channel, q.priority, q.id, coordinatorName(q.assignedTo)];
      if (s && !hay.some((v) => (v || "").toLowerCase().includes(s))) return false;
      if (status !== "All" && q.status !== status) return false;
      if (category !== "All" && q.category !== category) return false;
      if (priority !== "All" && q.priority !== priority) return false;
      if (coordinator === "none" ? !!q.assignedTo : coordinator !== "All" && q.assignedTo !== coordinator) return false;
      if (quick === "overdue" && !isOverdue(q, now)) return false;
      if (quick === "unassigned" && (q.assignedTo || isFinal(q.status))) return false;
      if (quick === "open" && isFinal(q.status)) return false;
      const c = toMs(q.createdAt);
      if (fromMs !== null && c < fromMs) return false;
      if (toMsV !== null && c > toMsV) return false;
      return true;
    });
    const rank = (p) => PRIORITIES.indexOf(p || "Medium");
    const sorters = {
      newest: (a, b) => toMs(b.createdAt) - toMs(a.createdAt),
      oldest: (a, b) => toMs(a.createdAt) - toMs(b.createdAt),
      priority: (a, b) => rank(b.priority) - rank(a.priority) || toMs(a.createdAt) - toMs(b.createdAt),
      due: (a, b) => (toMs(a.dueAt) || Infinity) - (toMs(b.dueAt) || Infinity),
    };
    return list.sort(sorters[sort]);
  }, [queries, search, status, category, priority, coordinator, quick, from, to, sort, now, coordinatorName]);

  function exportCsv() {
    const rows = [["ID", "Title", "Student", "Institution", "Category", "Priority", "Channel", "Status", "Coordinator", "Created", "Due", "Overdue"]];
    visible.forEach((q) => rows.push([q.id, q.title, q.studentName, q.institution, q.category, q.priority, q.channel, q.status, coordinatorName(q.assignedTo) || "", formatDateTime(q.createdAt), formatDateTime(q.dueAt), isOverdue(q, now) ? "Yes" : "No"]));
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `maatram-queries-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const chips = [["all", "All"], ["open", "Open"], ["overdue", "Overdue"], ...(role !== "student" ? [["unassigned", "Unassigned"]] : [])];
  return (
    <section className="page-content">
      <div className="page-intro">
        <span className="eyebrow">QUERY MANAGEMENT</span>
        <h1>{isAdmin ? "All Queries" : role === "coordinator" ? "Assigned Queries" : "My Queries"}</h1>
        <p>Search and filter by student, category, status, coordinator or date.</p>
      </div>
      <div className="chip-row">
        {chips.map(([v, l]) => <button key={v} type="button" className={`chip ${quick === v ? "active" : ""}`} onClick={() => setQuick(v)}>{l}</button>)}
        <span className="chip-spacer" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Highest priority</option><option value="due">Due soonest</option>
        </select>
        <button type="button" className="secondary-button" onClick={exportCsv} disabled={!visible.length}>Export CSV</button>
      </div>
      <div className="filter-bar enhanced-filter-bar">
        <input type="text" placeholder="Search student, institution, query, email or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option>{STATUSES.map((v) => <option key={v}>{v}</option>)}</select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}><option>All</option>{categories.map((v) => <option key={v}>{v}</option>)}</select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}><option>All</option>{PRIORITIES.map((v) => <option key={v}>{v}</option>)}</select>
        {isAdmin && (
          <select value={coordinator} onChange={(e) => setCoordinator(e.target.value)}>
            <option value="All">All coordinators</option><option value="none">Unassigned</option>
            {coordinators.map((p) => <option key={p.uid} value={p.uid}>{p.displayName || p.email}</option>)}
          </select>
        )}
        <label className="date-filter">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="date-filter">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <p className="result-count">{visible.length} of {queries.length} queries</p>
      {loading ? <p className="empty-state">Loading queries…</p> : visible.length === 0 ? <p className="empty-state">No queries found.</p> : <QueryList queries={visible} now={now} onSelect={onOpen} coordinatorName={isAdmin ? coordinatorName : null} />}
    </section>
  );
}
