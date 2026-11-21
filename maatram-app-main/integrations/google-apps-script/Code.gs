/**
 * Maatram — shared-inbox → query intake (bonus feature of MH26-04).
 * Free, no server: runs inside the office's Google account.
 *
 * SETUP (5 minutes)
 * 1. In Gmail create two labels:  Maatram/To-Log   and   Maatram/Logged
 *    Add a filter so mail to the shared support address gets the label Maatram/To-Log.
 * 2. Open https://script.google.com → New project → paste this file.
 * 3. Project Settings → Script properties: add
 *      WEBHOOK_URL = https://asia-south1-<your-project-id>.cloudfunctions.net/ingestQuery
 *      INGEST_TOKEN = <the same value you stored with: firebase functions:secrets:set INGEST_TOKEN>
 * 4. Triggers → Add trigger → pullInbox → Time-driven → Every 5 minutes.
 *
 * Each new thread becomes one query (channel "Email"). The category is guessed from keywords and
 * the coordinator assignment rules then run automatically.
 */
function pullInbox() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('WEBHOOK_URL');
  const token = props.getProperty('INGEST_TOKEN');
  const todo = GmailApp.getUserLabelByName('Maatram/To-Log');
  const done = GmailApp.getUserLabelByName('Maatram/Logged');
  if (!url || !token || !todo || !done) throw new Error('Missing WEBHOOK_URL / INGEST_TOKEN or Gmail labels.');

  todo.getThreads(0, 20).forEach(function (thread) {
    const msg = thread.getMessages()[0];
    const from = msg.getFrom();                       // "Name <a@b.com>"
    const m = from.match(/^(.*)<(.+)>$/);
    const payload = {
      channel: 'Email',
      title: msg.getSubject().substring(0, 140),
      description: msg.getPlainBody().substring(0, 3500),
      studentName: m ? m[1].replace(/"/g, '').trim() : from,
      studentEmail: m ? m[2].trim() : from,
    };
    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload),
      headers: { 'x-ingest-token': token }, muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 201) { thread.removeLabel(todo); thread.addLabel(done); }
    else Logger.log('Failed (' + res.getResponseCode() + '): ' + res.getContentText());
  });
}
