// Firestore va Telegram uchun umumiy yordamchi (qo‘shimcha kutubxonasiz).
// Netlify environment variables:
//   FIREBASE_SERVICE_ACCOUNT — Firebase → Project settings → Service accounts → "Generate new private key"
//                              faylining TO‘LIQ matni (JSON). Base64 ko‘rinishida ham bo‘ladi.
//   FIREBASE_API_KEY         — index.html dagi apiKey (admin kirishini tekshirish uchun)
//   TG_BOT_TOKEN, TG_CHAT_ID — Telegram xabarnomalari

export const env = (k) => String(globalThis.Netlify?.env?.get?.(k) ?? (typeof process !== "undefined" ? process.env?.[k] : "") ?? "").trim();
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/* ---------------- Service account ---------------- */
let SA = undefined;
export function serviceAccount() {
  if (SA !== undefined) return SA;
  let raw = env("FIREBASE_SERVICE_ACCOUNT");
  SA = null;
  if (!raw) return SA;
  try {
    if (!raw.startsWith("{")) raw = new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/\s+/g, "")), (c) => c.charCodeAt(0)));
    const j = JSON.parse(raw);
    if (j.client_email && j.private_key) {
      j.private_key = j.private_key.replace(/\\n/g, "\n");
      SA = j;
    }
  } catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT o‘qilmadi", e.message);
  }
  return SA;
}
export const projectId = () => env("FIREBASE_PROJECT_ID") || serviceAccount()?.project_id || "";
export const ready = () => !!(serviceAccount() && projectId());

// Universal kod: Netlify Functions (Node) va Edge Functions (Deno) da bir xil ishlaydi
const b64u = (input) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};
let keyObj = null;
async function signingKey(pem) {
  if (keyObj) return keyObj;
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  keyObj = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return keyObj;
}
let tok = { v: "", exp: 0 };
async function accessToken() {
  if (tok.v && Date.now() < tok.exp - 60_000) return tok.v;
  const sa = serviceAccount();
  if (!sa) throw new Error("FIREBASE_SERVICE_ACCOUNT sozlanmagan");
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email, aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore", iat: now, exp: now + 3600,
  }));
  const sig = b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(sa.private_key), new TextEncoder().encode(`${head}.${body}`)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${head}.${body}.${sig}`,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google token olinmadi: " + (j.error_description || j.error || r.status));
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tok.v;
}

export function randomId(n = 20, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789") {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => alphabet[x % alphabet.length]).join("");
}

/* ---------------- Qiymatlarni o‘girish ---------------- */
export function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === "object") return { mapValue: { fields: encFields(v) } };
  return { stringValue: String(v) };
}
export const encFields = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)]));
export function dec(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return decFields(v.mapValue.fields || {});
  return null;
}
export const decFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, x]) => [k, dec(x)]));
export const docOut = (d) => (d && d.name ? { id: d.name.split("/").pop(), ...decFields(d.fields), _ut: d.updateTime } : null);

/* ---------------- Firestore REST ---------------- */
const base = () => `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents`;
const docName = (p) => `projects/${projectId()}/databases/(default)/documents/${p}`;
async function call(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}`, ...(opt.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`Firestore ${r.status}: ${j?.error?.message || ""}`.slice(0, 300));
    e.status = r.status;
    throw e;
  }
  return j;
}
export async function getDoc(path) {
  try { return docOut(await call(`${base()}/${path}`)); } catch (e) { if (e.status === 404) return null; throw e; }
}
export async function listDocs(coll, pageSize = 300) {
  const j = await call(`${base()}/${coll}?pageSize=${pageSize}`);
  return (j.documents || []).map(docOut);
}
// where: [[field, op, value]]  op: EQUAL, LESS_THAN, GREATER_THAN_OR_EQUAL, ...
export async function query(coll, { where = [], orderBy, dir = "DESCENDING", limit } = {}) {
  const filters = where.map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: enc(v) } }));
  const sq = { from: [{ collectionId: coll }] };
  if (filters.length === 1) sq.where = filters[0];
  else if (filters.length > 1) sq.where = { compositeFilter: { op: "AND", filters } };
  if (orderBy) sq.orderBy = [{ field: { fieldPath: orderBy }, direction: dir }];
  if (limit) sq.limit = limit;
  const j = await call(`${base()}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: sq }) });
  return (Array.isArray(j) ? j : []).filter((x) => x.document).map((x) => docOut(x.document));
}
// Hujjat yaratish (bor bo‘lsa xato). serverTime: vaqt maydonlari nomlari
export async function createDoc(path, data, { serverTime = [] } = {}) {
  const w = { update: { name: docName(path), fields: encFields(data) }, currentDocument: { exists: false } };
  if (serverTime.length) w.updateTransforms = serverTime.map((f) => ({ fieldPath: f, setToServerValue: "REQUEST_TIME" }));
  await call(`${base()}:commit`, { method: "POST", body: JSON.stringify({ writes: [w] }) });
}
// Faqat berilgan maydonlarni yangilash. inc: {field: n} — atomik qo‘shish
export async function patchDoc(path, data = {}, { serverTime = [], inc = {}, mustExist = true, ifUpdateTime } = {}) {
  const keys = Object.keys(data);
  const w = { update: { name: docName(path), fields: encFields(data) }, updateMask: { fieldPaths: keys.map((k) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ? k : "`" + k + "`")) } };
  if (ifUpdateTime) w.currentDocument = { updateTime: ifUpdateTime };
  else if (mustExist) w.currentDocument = { exists: true };
  const tr = [
    ...serverTime.map((f) => ({ fieldPath: f, setToServerValue: "REQUEST_TIME" })),
    ...Object.entries(inc).map(([f, n]) => ({ fieldPath: f, increment: enc(n) })),
  ];
  if (tr.length) w.updateTransforms = tr;
  await call(`${base()}:commit`, { method: "POST", body: JSON.stringify({ writes: [w] }) });
}
export async function setDoc(path, data, opt = {}) {
  return patchDoc(path, data, { ...opt, mustExist: false });
}
export async function deleteDoc(path) {
  await call(`${base()}/${path}`, { method: "DELETE" });
}

/* ---------------- Sayt ma’lumotlari ---------------- */
let siteCache = { at: 0, data: null };
export async function siteContent(maxAgeMs = 30_000) {
  if (siteCache.data && Date.now() - siteCache.at < maxAgeMs) return siteCache.data;
  const d = await getDoc("site/content");
  const data = d?.json ? JSON.parse(d.json) : null;
  siteCache = { at: Date.now(), data };
  return data;
}
export async function saveSiteContent(data, by = "") {
  const cur = await getDoc("site/content");
  const ver = (cur?.ver || 0) + 1;
  await patchDoc("site/content", { json: JSON.stringify(data), ver, by }, { mustExist: false, serverTime: ["updatedAt"], ifUpdateTime: cur?._ut });
  siteCache = { at: Date.now(), data };
  return ver;
}

/* ---------------- Admin tekshiruvi ---------------- */
// Saytdagi admin panel Firebase ID token yuboradi; token Google orqali tekshiriladi
export async function verifyAdmin(idToken) {
  if (!idToken || typeof idToken !== "string") return null;
  const key = env("FIREBASE_API_KEY");
  if (!key) throw new Error("FIREBASE_API_KEY sozlanmagan");
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  const u = (await r.json())?.users?.[0];
  if (!u?.localId) return null;
  const a = await getDoc(`admins/${u.localId}`);
  if (!a) return null;
  return { uid: u.localId, email: u.email || "", role: a.role || "admin" };
}

/* ---------------- Telegram ---------------- */
export const h = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
export async function tgSend(text, { chats, buttons } = {}) {
  const token = env("TG_BOT_TOKEN");
  const ids = chats || env("TG_CHAT_ID").split(/[,\s]+/).filter(Boolean);
  if (!token || !ids.length) return false;
  const body = (chat_id) => ({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) });
  await Promise.all(ids.map((id) =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(id)) }).catch(() => null)
  ));
  return true;
}

/* ---------------- Bot bilan bog‘lanish ---------------- */
// Bot serverga so‘rov yuborganda X-Bot-Key sarlavhasini qo‘shadi (Netlify va botdagi BOT_API_KEY bir xil bo‘ladi)
export function botKeyOk(req) {
  const k = env("BOT_API_KEY"), g = req.headers.get("x-bot-key") || "";
  if (!k || k.length < 16 || g.length !== k.length) return false;
  let d = 0;
  for (let i = 0; i < k.length; i++) d |= k.charCodeAt(i) ^ g.charCodeAt(i);
  return d === 0;
}
// Xabar oladigan adminlar: TG_CHAT_ID + botdagi adminlar (ruxsatiga qarab)
export async function adminChats(perm) {
  const set = new Set(env("TG_CHAT_ID").split(/[,\s]+/).filter(Boolean));
  if (ready()) {
    try {
      for (const a of await listDocs("botAdmins")) {
        if (a.notify === false) continue;
        if (a.role === "super" || !perm || a.perms?.[perm]) set.add(String(a.id));
      }
    } catch (_) {}
  }
  return [...set];
}

/* ---------------- Vaqt ---------------- */
export function tashNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tashkent", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { d: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), m: (+p.hour % 24) * 60 + +p.minute };
}
export function isOpen(hours) {
  if (!hours?.open) return true;
  const toM = (s) => { const [a, b] = String(s).split(":").map(Number); return (a || 0) * 60 + (b || 0); };
  const n = tashNow(), o = toM(hours.open), c = toM(hours.close);
  const dayOk = (d) => (hours.days === "monsat" ? d >= 1 && d <= 6 : hours.days === "monfri" ? d >= 1 && d <= 5 : true);
  if (o === c) return dayOk(n.d);
  if (o < c) return dayOk(n.d) && n.m >= o && n.m < c;
  return (dayOk(n.d) && n.m >= o) || (dayOk((n.d + 6) % 7) && n.m < c);
}
export const fmtSum = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/* ---------------- So‘rovlar chegarasi ---------------- */
const hits = new Map();
export function limited(key, max = 15, winMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < winMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}
export const ipOf = (req, context) => context?.ip || req.headers.get("x-nf-client-connection-ip") || "x";
