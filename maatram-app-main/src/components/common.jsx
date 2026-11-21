import { formatDateTime, isOverdue, toMs } from "../lib/config.js";

export function Brand() {
  return (
    <div className="brand">
      <img src="/maatram-logo.png" alt="" />
      <div><strong>MAATRAM</strong><span>FOUNDATION</span></div>
    </div>
  );
}

export function Stat({ title, value, icon, tone, hint }) {
  return (
    <div className={`stat-card ${tone ? `tone-${tone}` : ""}`}>
      <div className="stat-card-top"><span>{title}</span>{icon && <span className="stat-icon">{icon}</span>}</div>
      <strong className="stat-value">{value}</strong>
      {hint && <small className="stat-hint">{hint}</small>}
    </div>
  );
}

export function Status({ status }) {
  const cls = (status || "New").toLowerCase().replace(/\s+/g, "-");
  return <span className={`status-badge ${cls}`}>{status || "New"}</span>;
}

export function QueryFlags({ q, now }) {
  return (
    <>
      <span className={`prio-badge prio-${(q.priority || "Medium").toLowerCase()}`}>{q.priority || "Medium"}</span>
      {isOverdue(q, now) && <span className="flag-badge flag-overdue">Overdue</span>}
      {toMs(q.escalatedAt) > 0 && !["Resolved", "Closed"].includes(q.status) && <span className="flag-badge flag-escalated">Escalated</span>}
      {!q.assignedTo && !["Resolved", "Closed"].includes(q.status) && <span className="flag-badge flag-unassigned">Unassigned</span>}
    </>
  );
}

export function QueryList({ queries, onSelect, now, coordinatorName }) {
  if (!queries || queries.length === 0) return <p className="empty-state">No queries available.</p>;
  return (
    <div className="query-list">
      {queries.map((item) => (
        <button type="button" className="query-card" key={`${item.ownerUid}-${item.id}`} onClick={() => onSelect(item)}>
          <div className="query-card-content">
            <div className="query-card-heading">
              <h3>{item.title}</h3>
              <div className="badge-row"><QueryFlags q={item} now={now} /><Status status={item.status} /></div>
            </div>
            <p>{item.description}</p>
            <div className="query-card-meta">
              <span>{item.category} · {item.channel || "Channel n/a"}</span>
              {item.studentName && <span>{item.studentName}</span>}
              {item.institution && <span>{item.institution}</span>}
              {coordinatorName && item.assignedTo && <span>→ {coordinatorName(item.assignedTo)}</span>}
              <span>{formatDateTime(item.createdAt)}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
