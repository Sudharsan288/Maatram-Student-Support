import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// Demo credentials. Change the password after the first successful login.
const DEFAULT_EMAIL = 'admin@maatram-demo.com';
const DEFAULT_PASSWORD = 'Maatram@Admin2026!';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('\nMissing GOOGLE_APPLICATION_CREDENTIALS. Set it to your Firebase service-account JSON file path.');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();
const rl = readline.createInterface({ input, output });

try {
  console.log('\nMAATRAM — First Admin setup');
  console.log(`Default email: ${DEFAULT_EMAIL}`);
  const emailInput = (await rl.question('Admin email (press Enter to use default): ')).trim();
  const email = emailInput || DEFAULT_EMAIL;
  const passwordInput = await rl.question('Admin password (press Enter to use demo password): ');
  const password = passwordInput || DEFAULT_PASSWORD;
  const displayInput = (await rl.question('Display name (press Enter for Maatram Admin): ')).trim();
  const displayName = displayInput || 'Maatram Admin';

  let user;
  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, { password, displayName, disabled: false });
    console.log(`\nExisting Auth account found; password/profile updated for ${email}.`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    user = await auth.createUser({ email, password, displayName, emailVerified: false, disabled: false });
    console.log(`\nCreated Firebase Auth account for ${email}.`);
  }

  const batch = db.batch();
  batch.set(db.collection('roles').doc(user.uid), {
    role: 'admin', createdAt: FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(db.collection('users').doc(user.uid), {
    uid: user.uid,
    email: user.email,
    role: 'admin',
    displayName,
    institution: 'Maatram Demo',
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();

  console.log('\nSUCCESS — Admin account and Firestore documents are ready.');
  console.log(`Email: ${email}`);
  console.log(`UID: ${user.uid}`);
  console.log('Firestore: roles/{UID} and users/{UID}');
  console.log('\nSign in through the Maatram app. Change this demo password before real use.');
} catch (error) {
  console.error('\nAdmin setup failed:', error.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
