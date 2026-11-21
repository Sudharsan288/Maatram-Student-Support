import { useMemo, useState } from "react";
import { QueryFlags, Status } from "../components/common.jsx";
import { ACCEPT } from "../lib/attachments.js";
import { pickCoordinator, openLoadMap } from "../lib/assignment.js";
import { STATUSES, formatDateTime, isFinal, toMs, MAX_ATTACHMENTS } from "../lib/config.js";

const EVENT_LABEL = {
  created: "Query logged", assigned: "Assignment", status_changed: "Status changed", note: "Note added",
  student_reply: "Student reply", reminder_sent: "Reminder sent", escalated: "Escalated",
  student_reminder: "Student reminder", notified: "Student notified",
};

export default function QueryDetailsPage({ q, history, attachments, role, coordinators, queries, now, assignmentCfg, actions, onBack, coordinatorName }) {
  const [assignUid, setAssignUid] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const isAdmin = role === "admin";
  const staff = role === "admin" || role === "coordinator";
  const load = useMemo(() => openLoadMap(queries), [queries]);
  const suggestion = useMemo(() => (isAdmin ? pickCoordinator(q, coordinators, { ...load }, assignmentCfg) : null), [isAdmin, q, coordinators, load, assignmentCfg]);
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const overdueText = toMs(q.dueAt) ? formatDateTime(q.dueAt) : isFinal(q.status) ? "Closed out" : "Not scheduled";

  return (
    <section className="page-content">
      <button className="back-button" onClick={onBack}>← Back to Queries</button>
      <div className="page-heading">
        <div><h2>{q.title}</h2><p>Query ID: {q.id}</p></div>
        <div className="badge-row"><QueryFlags q={q} now={now} /><Status status={q.status} /></div>
      </div>

      <div className="details-card">
        {[["Category", q.category], ["Student", q.studentName || "Not available"], ["Institution", q.institution || "Not available"],
          ["Received through", q.channel], ["Student email", q.studentEmail || "Not available"], ["Student mobile", q.studentPhone || "—"],
          ["Logged by", q.loggedByEmail || "Not available"], ["Submitted", formatDateTime(q.createdAt)], ["Follow-up due", overdueText],
          ["Assigned coordinator", q.assignedTo ? `${coordinatorName(q.assignedTo) || q.assignedEmail}` : "Not assigned"]]
          .map(([k, v]) => <div className="detail-row" key={k}><span>{k}</span><strong>{v}</strong></div>)}
        {q.assignedByRule && <div className="detail-row"><span>Assigned by</span><strong>{q.assignedByRule}</strong></div>}

        <div className="detail-description"><span>Description</span><p>{q.description}</p></div>

        {attachments.length > 0 && (
          <div className="management-section">
            <h3>Attachments</h3>
            <div className="attachment-grid">
              {attachments.map((a) => (
                <a key={a.id} className="attachment-tile" href={a.dataUrl} download={a.name} target="_blank" rel="noreferrer">
                  {a.type.startsWith("image/") ? <img src={a.dataUrl} alt={a.name} /> : <span className="pdf-icon">PDF</span>}
                  <small>{a.name}</small>
                </a>
              ))}
            </div>
          </div>
        )}

        {role === "student" && q.status === "Waiting for Student" && (
          <div className="management-section reply-box">
            <h3>The team is waiting for your reply</h3>
            <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type the information the team asked for…" />
            <input type="file" accept={ACCEPT} multiple onChange={(e) => setReplyFiles(Array.from(e.target.files || []).slice(0, MAX_ATTACHMENTS))} />
            <button className="primary-button" disabled={busy || !reply.trim()} onClick={() => run(async () => { await actions.studentReply(q, reply.trim(), replyFiles); setReply(""); setReplyFiles([]); })}>Send reply to team</button>
          </div>
        )}

        {isAdmin && (
          <div className="management-section">
            <h3>{q.assignedTo ? "Reassign coordinator" : "Assign coordinator"}</h3>
            {suggestion && (
              <p className="suggestion-line">Suggested by rules: <strong>{suggestion.coordinator.displayName || suggestion.coordinator.email}</strong> — {suggestion.reason}
                {suggestion.coordinator.uid !== q.assignedTo && <button type="button" className="text-button" onClick={() => setAssignUid(suggestion.coordinator.uid)}>Use suggestion</button>}</p>
            )}
            <select value={assignUid} onChange={(e) => setAssignUid(e.target.value)}>
              <option value="">Select coordinator</option>
              {coordinators.map((c) => <option key={c.uid} value={c.uid}>{c.displayName || c.email} — {load[c.uid] || 0} open</option>)}
            </select>
            <input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder={q.assignedTo ? "Reason for reassignment (kept in history)" : "Optional note for the coordinator"} maxLength={300} />
            <button className="primary-button" disabled={!assignUid || assignUid === q.assignedTo || busy} onClick={() => run(async () => { await actions.assign(q, assignUid, assignNote); setAssignUid(""); setAssignNote(""); })}>
              {q.assignedTo ? "Reassign" : "Assign"}
            </button>
          </div>
        )}

        {staff && (
          <div className="management-section">
            <h3>Update status</h3>
            <textarea rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Note for this change (saved in the history, e.g. what was done or what is needed from the student)" maxLength={1000} />
            <div className="status-actions">
              {STATUSES.map((s) => (
                <button key={s} className={q.status === s ? "status-button active" : "status-button"} disabled={q.status === s || busy || (s === "Assigned" && !q.assignedTo)}
                  title={s === "Assigned" && !q.assignedTo ? "Assign a coordinator first" : ""}
                  onClick={() => run(async () => { await actions.setStatus(q, s, statusNote.trim()); setStatusNote(""); })}>{s}</button>
              ))}
            </div>
            <div className="note-only">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Or add a progress note without changing status" maxLength={1000} />
              <button className="secondary-button" disabled={!noteText.trim() || busy} onClick={() => run(async () => { await actions.addNote(q, noteText.trim()); setNoteText(""); })}>Add note</button>
            </div>
          </div>
        )}

        <div className="management-section query-timeline">
          <h3>Activity history</h3>
          {history.length === 0 ? <p className="empty-state">No history recorded yet.</p> : (
            <div className="timeline-list">
              {history.map((e) => (
                <div className="timeline-item" key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{EVENT_LABEL[e.type] || e.type}{e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus ? ` · ${e.fromStatus} → ${e.toStatus}` : e.toStatus && e.type !== "note" ? ` · ${e.toStatus}` : ""}</strong>
                    {e.note && <p>{e.note}</p>}
                    <small>{e.actorName || "System"} · {formatDateTime(e.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
