// Prototype attachment storage: files are compressed in the browser and stored as small
// documents in Firestore (works on the free Spark plan; production should use Cloud Storage).
import { MAX_ATTACHMENTS } from "./config.js";

const MAX_PDF_BYTES = 550 * 1024;
export const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const src = await readAsDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("Invalid image.")); i.src = src;
  });
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.75, 0.6, 0.45, 0.3]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length < 700000) return url;
  }
  throw new Error("Image is too large even after compression.");
}

/** @returns {Promise<{name,type,size,dataUrl}[]>} */
export async function prepareAttachments(files) {
  const list = Array.from(files || []).slice(0, MAX_ATTACHMENTS);
  const out = [];
  for (const file of list) {
    if (file.type === "application/pdf") {
      if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name}: PDF must be under 550 KB for this prototype.`);
      out.push({ name: file.name.slice(0, 120), type: file.type, size: file.size, dataUrl: await readAsDataUrl(file) });
    } else if (file.type.startsWith("image/")) {
      const dataUrl = await compressImage(file);
      out.push({ name: file.name.replace(/\.[^.]+$/, "").slice(0, 110) + ".jpg", type: "image/jpeg", size: Math.round(dataUrl.length * 0.75), dataUrl });
    } else {
      throw new Error(`${file.name}: only images and PDFs are supported.`);
    }
  }
  return out;
}
