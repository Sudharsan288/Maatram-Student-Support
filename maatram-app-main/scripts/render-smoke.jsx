// Renders every page with sample data to catch runtime errors (run: npm run smoke).
import { renderToString } from "react-dom/server";
import DashboardPage from "../src/pages/DashboardPage.jsx";
import QueriesPage from "../src/pages/QueriesPage.jsx";
import LogQueryPage from "../src/pages/LogQueryPage.jsx";
import QueryDetailsPage from "../src/pages/QueryDetailsPage.jsx";
import { CategoriesPage, NotificationsPage, ReportsPage, RulesPage, UsersPage } from "../src/pages/AdminPages.jsx";
import { buildDemoQueries } from "../src/lib/demoData.js";
import { DEFAULT_CATEGORIES, mergeAssignment } from "../src/lib/config.js";

const now = Date.now();
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const coordinators = [{ uid: "c1", displayName: "Asha", email: "a@x.org", role: "coordinator" }, { uid: "c2", displayName: "Bala", email: "b@x.org", role: "coordinator", isSenior: true }];
const rows = buildDemoQueries(coordinators, "admin1");
const queries = rows.map((r) => {
  const d = { ...r.data };
  for (const k of ["createdAt", "lastActivityAt", "dueAt", "resolvedAt"]) if (d[k]) d[k] = ts(d[k].toMillis());
  return { ...d, id: r.id, ownerUid: "demo-rep" };
});
const name = (uid) => coordinators.find((c) => c.uid === uid)?.displayName || "";
const noop = () => {};
const actions = { assign: noop, setStatus: noop, addNote: noop, studentReply: noop };
const history = [{ id: "1", type: "created", toStatus: "New", note: "x", actorName: "Rep", createdAt: ts(now) }];
const out = {};
for (const role of ["admin", "coordinator", "student"]) {
  out[`dash-${role}`] = renderToString(<DashboardPage role={role} queries={queries} now={now} coordinators={coordinators} categories={DEFAULT_CATEGORIES} onOpenQuery={noop} onNavigate={noop} onSearch={noop} />);
  out[`list-${role}`] = renderToString(<QueriesPage role={role} queries={queries} categories={DEFAULT_CATEGORIES} coordinators={coordinators} now={now} onOpen={noop} coordinatorName={name} />);
  for (const status of ["New", "Waiting for Student", "Resolved"]) {
    const q = { ...queries.find((x) => x.status === status) || queries[0], status };
    out[`detail-${role}-${status}`] = renderToString(<QueryDetailsPage q={q} history={history} attachments={[{ id: "a", name: "s.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,AA" }]} role={role} coordinators={coordinators} queries={queries} now={now} assignmentCfg={mergeAssignment(null)} actions={actions} onBack={noop} coordinatorName={name} />);
  }
}
out.log = renderToString(<LogQueryPage categories={DEFAULT_CATEGORIES} guidelines="Be kind" defaultInstitution="X" busy={false} onSubmit={noop} onCancel={noop} />);
out.users = renderToString(<UsersPage users={coordinators} queries={queries} currentUid="z" onRole={noop} onSenior={noop} />);
out.cats = renderToString(<CategoriesPage categories={DEFAULT_CATEGORIES} onAdd={noop} onRemove={noop} onRestore={noop} />);
out.rules = renderToString(<RulesPage assignmentCfg={{ rules: [{ id: "r", category: "Events", institution: "", coordinatorUid: "c1" }] }} followupCfg={null} guidelines="" coordinators={coordinators} categories={DEFAULT_CATEGORIES} onSaveAssignment={noop} onSaveFollowup={noop} onSaveGuidelines={noop} onRunSweep={noop} sweepBusy={false} />);
out.reports = renderToString(<ReportsPage queries={queries} coordinators={coordinators} categories={DEFAULT_CATEGORIES} now={now} onLoadDemo={noop} onClearDemo={noop} demoBusy={false} />);
out.notifs = renderToString(<NotificationsPage notifications={[{ id: "n", title: "T", message: "M", createdAt: ts(now), queryId: "q", ownerUid: "o" }]} onRead={noop} onOpenQuery={noop} />);
for (const [k, v] of Object.entries(out)) if (!v || v.length < 50) throw new Error(`Empty render: ${k}`);
console.log(`Rendered ${Object.keys(out).length} page variants without errors ✔`);
console.log("demo sample statuses:", [...new Set(queries.map((q) => q.status))].join(", "));
