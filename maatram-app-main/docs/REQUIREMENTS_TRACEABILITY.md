# MH26-04 requirement → implementation matrix

| # | Problem-statement line | Where it is implemented | Status |
|---|---|---|---|
| 1 | Record a query from any channel in under a minute | `LogQueryPage` — one short form; channel (WhatsApp, Email, Phone Call, SMS, In Person, Web Form, Other), category auto-suggestion from keywords, institution pre-filled from the rep's profile | ✅ |
| 2 | Student, institution, category (admission, scholarship, events, mentoring, technical, other) | Default categories now match the statement exactly; Admin can edit / restore them | ✅ |
| 3 | Priority and short description | Priority Low–Urgent, title + description | ✅ |
| 4 | Room for attachments (screenshots / documents) | Up to 3 images/PDFs per query (images auto-compressed), shown on the query page; also on student replies | ✅ (prototype storage in Firestore) |
| 5 | Bonus: pull queries from email / shared inbox | `integrations/google-apps-script/Code.gs` + `ingestQuery` Cloud Function (also accepts Twilio WhatsApp/SMS webhooks) | ✅ bonus |
| 6 | Assign manually or by rules (category, institution, current workload) | Admin assigns manually with workload shown; **Rules → Auto-assignment rules** (category and/or institution → coordinator, most specific wins, least-loaded fallback); runs via Cloud Function on creation and via the Admin's follow-up checker | ✅ |
| 7 | Reassignment with full history kept | Reassign panel with reason; every change is an append-only history entry | ✅ |
| 8 | Status stages New / Assigned / In progress / Waiting for student / Resolved / Closed | `STATUSES`; reopening supported | ✅ |
| 9 | Notes and time-stamped history of every change | Note box on each status change, "Add note" without status change, student replies, system events; each with actor + timestamp | ✅ |
| 10 | Nudge coordinator after a set time without update | Per-priority timings (Rules page); `processQueryFollowUps` hourly + client checker; reminders by in-app, email, SMS/WhatsApp | ✅ |
| 11 | Flag overdue | Red *Overdue* badge, dashboard counters, "Overdue" quick filter | ✅ |
| 12 | Escalate to senior coordinator or admin after a longer wait | Escalation after N extra hours to all Admins + coordinators marked **Senior** (Users page) | ✅ |
| 13 | Remind the student when their reply is needed | "Waiting for Student" → student told immediately, then reminded every N hours (max M); student can reply in-app, which resumes the query | ✅ |
| 14 | Reminders by email, SMS or WhatsApp | Email via Resend; SMS + WhatsApp via Twilio (all optional, auto-skipped when not configured; outcome logged in history) | ✅ needs provider keys |
| 15 | Student Representative: log queries and view the ones they logged | Role-scoped listing, enforced by Firestore rules | ✅ |
| 16 | Coordinator: work on assigned queries | Sees only assigned queries; can change status, add notes | ✅ |
| 17 | Admin: everything plus categories, rules, users, reports | Users (roles + senior), Categories, Rules & Automation, Reports | ✅ |
| 18 | Dashboard: open, overdue | Stat cards + "Needs attention" list | ✅ |
| 19 | Queries per coordinator | Dashboard chart + Reports table | ✅ |
| 20 | Average time to resolve | Dashboard + Reports (overall, per coordinator, per category) | ✅ |
| 21 | Most common categories | Dashboard bar chart + Reports | ✅ |
| 22 | Find any query by student, category, status, coordinator or date | Queries page: free-text search + status/category/priority/coordinator/date filters + sort + CSV export | ✅ |
| 23 | Student told when resolved | In-app notice to the rep + email / SMS / WhatsApp to the student (Cloud Function) | ✅ |
| 24 | Working prototype with sign-in and three roles | Firebase Email/Password auth; roles enforced by Security Rules | ✅ |
| 25 | Short note on moving from scattered channels + privacy | `docs/MIGRATION_AND_PRIVACY_NOTE.md` | ✅ |
| 26 | Starter kit: role-based access, scheduler, notifications, chart library; use dummy data | Firebase Auth + Rules, Cloud Scheduler function, Resend/Twilio, SVG charts (no dependency); **Load demo data** button creates dummy records only | ✅ |

## Honest limits
* Scheduled emails/SMS/WhatsApp need the Firebase **Blaze** plan and provider keys. Without them the app still works fully: in-app reminders, escalation and auto-assignment run through the Admin's follow-up checker (auto-run every 5 minutes while an Admin is signed in, or via **Run follow-up check now**).
* Attachments live in Firestore (free plan friendly, size-limited). Use Cloud Storage for production.
* Coordinators do not see team-wide statistics (privacy by design) — only Admin does.
