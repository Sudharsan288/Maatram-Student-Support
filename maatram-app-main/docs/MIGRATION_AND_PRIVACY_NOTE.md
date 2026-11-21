# How the office team moves from scattered channels to Maatram — and how student details stay private

*Short note for MH26-04 · Student Support and Follow-up System*

## 1. Moving from scattered channels to one platform

**The idea: don't ask people to stop using WhatsApp, calls or email — make sure everything lands in one place within minutes.**

| Week | What changes | Who does what |
|---|---|---|
| **Before launch** | Admin creates accounts, promotes coordinators, sets categories (Admission, Scholarship, Events, Mentoring, Technical, Other), assignment rules and follow-up timings (Rules page). Demo data is loaded for a 30-minute walkthrough, then removed. | Admin |
| **Week 1 – Parallel run** | Student representatives log every query they receive (WhatsApp, call, email, in person, form) using *Log a Query* — about a minute each, with screenshots attached. The shared support inbox is connected (Google Apps Script in `/integrations`) so emails arrive automatically. Old channels continue; nothing is lost. | Student reps, Admin |
| **Week 2 – Single source of truth** | Coordinators work only from *Assigned Queries*. Anyone who gets a query in a chat replies "Logged as #ID" and logs it. Status questions are answered from the dashboard, not by scrolling chats. | Coordinators |
| **Week 3 onward – Review loop** | Admin reviews the dashboard weekly: overdue count, queries per coordinator, average resolution time, most common categories. Rules and timings are tuned (e.g. more coordinators for the busiest category). Old chat groups become announcement-only. | Admin |

**Success checks:** every query has an owner; overdue count trends down; "who owns this?" messages disappear.

## 2. Keeping student details private

1. **Least-privilege access, enforced on the server.** Firestore Security Rules (not just the UI) ensure a Student Representative sees only queries they logged, a Coordinator sees only queries assigned to them, and only Admin sees everything. Public sign-up can only create Student Representative accounts; Admin promotes others.
2. **Data minimisation.** Only what is needed to help is stored: name, institution, email, optional mobile, and the request. No ID numbers or sensitive documents are required; guidelines tell reps not to attach anything unnecessary.
3. **No real data in demos.** The built-in demo loader creates clearly marked dummy records (`demo.studentN@example.com`) which can be removed in one click.
4. **Audit trail.** Every assignment, status change, note and reminder is time-stamped with who did it; history entries cannot be edited or deleted (except demo records).
5. **Secrets stay out of the app.** Firebase web config is public by design; email/SMS/WhatsApp keys live in Cloud Functions secrets, never in the browser or the repository.
6. **Notifications are minimal.** Emails/SMS contain the query title and a status message, never the full description or attachments.
7. **Retention & consent (policy to adopt).** Tell students their details are used only to resolve their request; archive or delete Closed queries after an agreed period (e.g. 12 months); review Admin accounts quarterly.
8. **Prototype limits (be honest in the demo).** Attachments are stored as compressed Firestore documents for the free plan — production should use Cloud Storage with signed URLs and virus scanning; enable Firebase App Check and email verification before public launch.
