# MAATRAM — Student Support & Follow-up System

React + Vite + Firebase prototype for **MH26-04 · Maatram HackForge 2026–27**. One platform to record every student query, assign it (manually or by rules), track it through a visible history, remind and escalate automatically, and show the team where help is needed.

> Requirement-by-requirement proof: [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md) · Privacy & rollout note: [`docs/MIGRATION_AND_PRIVACY_NOTE.md`](docs/MIGRATION_AND_PRIVACY_NOTE.md) · Demo flow: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)

## Highlights

- **Three roles** enforced by Firestore Security Rules: Student Representative (logs + sees own), Coordinator (works assigned queries), Admin (everything + users, categories, rules, reports).
- **Fast intake**: any channel, category suggestion, priority, screenshots/PDF attachments, optional student mobile.
- **Assignment**: manual with workload shown, or **rules** (category / institution → coordinator, least-loaded fallback). Reassignment keeps full history.
- **Workflow**: New → Assigned → In Progress → Waiting for Student → Resolved → Closed, with a note on every change and an append-only timeline. Students can reply in-app.
- **Follow-up engine**: per-priority timings, overdue flags, coordinator reminders, escalation to Admin / senior coordinators, student reminders, resolution notices — in-app, email, SMS, WhatsApp.
- **Dashboard & reports**: open, overdue, unassigned, per-coordinator workload, average resolution time, most common categories, 14-day trend, CSV export.
- **Inbox intake (bonus)**: Gmail shared inbox / Twilio WhatsApp → query via the `ingestQuery` webhook.
- **Demo mode**: one-click dummy data (no real student records).

## 1. Requirements

- Node.js 24.12.0 or newer (the bundled Firebase JS SDK release requires Node 24.12+ for the build environment)
- npm
- A Firebase project that you own or are authorised to use
- Firebase Authentication (Email/Password) and Cloud Firestore enabled
- Firebase CLI only if deploying scheduled Cloud Functions

## 2. Install and run locally

1. Extract this ZIP into a new folder. It is independent of your teammate's original folder.
2. Open the extracted `maatram-app-main` folder in VS Code.
3. In the VS Code terminal run:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env.local`.
5. In Firebase Console → Project settings → Your apps → Web app, copy your Firebase config values into `.env.local`.
6. Start the app:

   ```bash
   npm run dev
   ```

7. Open the local URL printed by Vite (normally `http://localhost:5173`).

Do not paste your Firebase private service-account JSON into this frontend project. The Firebase web config is intended for client apps; Firestore Security Rules are the security boundary.

## 3. Firebase setup

1. Create/select your own Firebase project.
2. Authentication → Sign-in method → enable **Email/Password**.
3. Firestore Database → create a database.
4. Publish the included `firestore.rules` (Firestore → Rules) **and** `firestore.indexes.json` (`firebase deploy --only firestore:rules,firestore:indexes`). Both are required — the Admin/Coordinator views use collection-group queries.
5. Copy `.env.example` to `.env.local` and fill in the Web App config.
6. Restart Vite after changing `.env.local`.

### First Admin bootstrap

Public signup creates Student Representative accounts only. For the first Admin in a fresh Firebase project:

1. Register your own trusted account through the app.
2. Firebase Authentication → Users: copy that user's UID.
3. Firestore → create/update `roles/{UID}` with `role` = `admin` and a `createdAt` timestamp.
4. Firestore → create/update `users/{UID}` with `role` = `admin` (retain the profile fields).
5. Sign out and sign back in.

This one-time bootstrap must be performed by the project owner in Firebase Console. Never let a public signup choose Admin or Coordinator.

### Add Coordinators

1. The person registers normally through public signup.
2. Admin opens User Management and changes that account's role to Coordinator.
3. The person signs out and signs back in so the role is reloaded.

## 4. Cloud Functions: automation + email / SMS / WhatsApp (optional, Blaze plan)

Everything works without this step (the Admin's browser runs a follow-up checker every 5 minutes and via **Rules → Run follow-up check now**). Deploy Functions for unattended operation and external channels:

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc        # put your project id inside
cd functions && npm install && cd ..
cp functions/.env.example functions/.env.YOUR_PROJECT_ID   # edit: MAIL_FROM, Twilio numbers (optional)
firebase functions:secrets:set RESEND_API_KEY      # or the text: unset
firebase functions:secrets:set TWILIO_AUTH_TOKEN   # or the text: unset
firebase functions:secrets:set INGEST_TOKEN        # any long random string
firebase deploy --only firestore:rules,firestore:indexes,functions
```

| Function | What it does |
|---|---|
| `onQueryCreated` | Auto-assigns by rules, acknowledges the student |
| `onQueryUpdated` | Email/SMS/WhatsApp when assigned, "need info", and resolved |
| `processQueryFollowUps` | Hourly: reminders, unassigned alerts, escalation, student reminders |
| `ingestQuery` | HTTPS webhook that turns an email / WhatsApp / form message into a query |

Channels are skipped automatically when not configured, and the outcome (`email:sent`, `whatsapp:not-configured`, …) is written to the query history. **Publish `firestore.indexes.json`** — the collection-group queries need it.

### Shared-inbox intake
Follow the 5-minute setup in `integrations/google-apps-script/Code.gs`. For Twilio WhatsApp/SMS, point the number's incoming-message webhook to `https://asia-south1-YOUR_PROJECT.cloudfunctions.net/ingestQuery?token=YOUR_INGEST_TOKEN`.

### Hosting (optional)
`npm run build && firebase deploy --only hosting`

## 5. Demo data and privacy

- Use **Reports → Load demo data** for a populated dummy dataset, plus test email accounts, for the HackForge demo.
- Do not upload real student records without institutional approval and an appropriate privacy/security review.
- Do not commit `.env.local`, service-account keys, API tokens or student data.
- Review Firebase Authentication authorized domains and Firestore Rules before any public deployment.

## 6. Useful commands

```bash
npm run dev      # local development
npm run build    # production build
npm run lint     # ESLint (clean)
npm test         # unit tests: assignment rules, metrics, helpers
npm run smoke    # renders every page for each role with sample data
```

## 7. Notes and limits

- Attachments are compressed and stored in Firestore (free-plan friendly, ≤3 per query). Use Cloud Storage for production.
- Notification documents can be created by any signed-in team member (size-limited, stamped with sender) — a prototype trade-off documented in `firestore.rules`.
- Queries are stored at `users/{ownerUid}/queries/{id}`; Admin/Coordinator dashboards use a collection-group query, which is why the recursive rule and index overrides are required.
