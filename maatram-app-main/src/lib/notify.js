import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/** In-app notification. Silently skips pseudo-owners such as the email/webhook "inbox". */
export async function notifyUser(toUid, fromUid, payload) {
  if (!toUid || toUid === "inbox" || toUid.startsWith("demo-")) return;
  try {
    await addDoc(collection(db, "users", toUid, "notifications"), {
      type: payload.type, title: payload.title, message: String(payload.message || "").slice(0, 480),
      queryId: payload.queryId || "", ownerUid: payload.ownerUid || "",
      read: false, createdAt: serverTimestamp(), fromUid,
    });
  } catch (error) {
    console.warn("Notification skipped:", error.code || error.message);
  }
}
