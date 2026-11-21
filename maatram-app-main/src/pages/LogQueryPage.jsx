import { useState } from "react";
import { ACCEPT } from "../lib/attachments.js";
import { CHANNELS, MAX_ATTACHMENTS, PRIORITIES, suggestCategory } from "../lib/config.js";

export default function LogQueryPage({ categories, guidelines, defaultInstitution, busy, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: "", category: categories[0] || "Other", description: "", studentName: "", studentEmail: "", studentPhone: "",
    institution: defaultInstitution || "", priority: "Medium", channel: "WhatsApp",
  });
  const [files, setFiles] = useState([]);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));
  const suggestion = suggestCategory(`${form.title} ${form.description}`, categories);

  return (
    <section className="page-content">
      <div className="page-intro">
        <span className="eyebrow">WE ARE HERE TO HELP</span>
        <h1>Log a Query</h1>
        <p>Capture a request from any channel in under a minute. Fields marked * are required.</p>
      </div>
      {guidelines && <div className="guideline-card"><strong>Guidelines from the Maatram team</strong><p>{guidelines}</p></div>}
      <form className="query-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form, files, () => setFiles([])); }}>
        <label>Received through *</label>
        <select value={form.channel} onChange={set("channel")}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>

        <label>Student name *</label>
        <input value={form.studentName} onChange={set("studentName")} maxLength={100} required placeholder="Student's full name" />
        <div className="two-col">
          <div><label>Student email *</label><input type="email" value={form.studentEmail} onChange={set("studentEmail")} maxLength={160} required placeholder="For follow-up and resolution updates" /></div>
          <div><label>Student mobile (optional)</label><input type="tel" value={form.studentPhone} onChange={set("studentPhone")} maxLength={20} placeholder="+91… for SMS / WhatsApp" /></div>
        </div>
        <label>Institution *</label>
        <input value={form.institution} onChange={set("institution")} maxLength={140} required placeholder="College / institution" />

        <label>Short title *</label>
        <input value={form.title} onChange={set("title")} maxLength={140} required placeholder="e.g. Scholarship amount not credited" />
        <label>Description *</label>
        <textarea rows={5} value={form.description} onChange={set("description")} maxLength={4000} required placeholder="What does the student need?" />

        <div className="two-col">
          <div>
            <label>Category *</label>
            <select value={form.category} onChange={set("category")}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
            {suggestion && suggestion !== form.category && (
              <button type="button" className="suggest-chip" onClick={() => setForm((p) => ({ ...p, category: suggestion }))}>Looks like “{suggestion}” — use it</button>
            )}
          </div>
          <div><label>Priority *</label><select value={form.priority} onChange={set("priority")}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>

        <label>Attachments (screenshots / documents, up to {MAX_ATTACHMENTS})</label>
        <div className="upload-area">
          <input type="file" accept={ACCEPT} multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, MAX_ATTACHMENTS))} />
          <span>Images are compressed automatically. PDFs up to 550 KB.</span>
        </div>
        {files.map((f) => <div className="uploaded-file" key={f.name}><div><strong>{f.name}</strong></div></div>)}

        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Submitting…" : "Submit Query →"}</button>
        </div>
      </form>
    </section>
  );
}
