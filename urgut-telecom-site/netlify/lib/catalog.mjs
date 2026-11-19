// AI tarif katalogi: operatorlarning internet paketlari, tariflari, daqiqa/SMS paketlari va ARXIV.
// AI har bir bo‘limni operatorning rasmiy saytidan tekshiradi. Hech narsa o‘chirilmaydi:
// narxi o‘zgargan yoki yopilgan tarif "Arxiv"ga o‘tadi. Shubhali natija qabul qilinmaydi.
import { getDoc, setDoc, tgSend, h, adminChats, fmtSum } from "./fs.mjs";
import { generate, extractText, sourcesOf } from "./gemini.mjs";
import { SEED } from "./catalog-seed.mjs";

export const OPS = [
  { id: "ucell", name: "Ucell", dom: "ucell.uz" },
  { id: "uztelecom", name: "Uztelecom (Uzmobile)", dom: "uztelecom.uz" },
  { id: "mobiuz", name: "Mobiuz", dom: "mobi.uz" },
  { id: "beeline", name: "Beeline", dom: "beeline.uz" },
];
export const SECS = ["tariffs", "internet", "minutes"];
export const SEC_UZ = { tariffs: "Tariflar", internet: "Internet paketlar", minutes: "Daqiqa va SMS paketlar" };
const ARCHIVE_MAX = 300;

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9а-яёʻ‘’']+/gi, "");
// Internet paketlari nomi takrorlanadi (5 GB — 7 kun / 30 kun), shuning uchun muddat ham kalitga kiradi
export const keyOf = (sec, x) => (sec === "tariffs" ? norm(x.n) : norm(x.n) + "|" + norm(x.d?.uz));
const okCode = (c) => /^\*[\d*]{1,24}#$/.test(String(c || "").trim());

function blank(id) {
  const s = SEED[id] || {};
  return { internet: s.internet || [], tariffs: s.tariffs || [], minutes: s.minutes || [], archive: [], checked: {}, pending: {}, log: [] };
}

export async function readOp(id) {
  const d = await getDoc(`catalog/${id}`).catch(() => null);
  if (!d?.json) return { ...blank(id), seeded: true };
  try { return { ...blank(id), ...JSON.parse(d.json), updatedAt: d._ut }; } catch { return blank(id); }
}
async function writeOp(id, data) {
  const { seeded, updatedAt, ...rest } = data;
  await setDoc(`catalog/${id}`, { json: JSON.stringify(rest) }, { serverTime: ["updatedAt"] });
}
export async function readAll() {
  const out = {};
  await Promise.all(OPS.map(async (o) => { out[o.id] = await readOp(o.id); }));
  return out;
}

function parseObj(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

const GUIDE = {
  tariffs: `TARIF REJALAR (oylik abonent to‘lovli). Har biri: "n" — tarif nomi (masalan "Bor 45"); "d_uz" — tarkibi shu formatda: "cheksiz daqiqa · 1000 SMS · 45 GB" (bo‘lmagan qismini yozma); "d_ru" — "безлимит минут · 1000 SMS · 45 GB"; "p" — oylik to‘lov so‘mda; "c" — o‘tish USSD kodi (rasmiy saytda bo‘lsa, aks holda "").`,
  internet: `INTERNET PAKETLAR (GB). Har biri: "n" — hajm, masalan "5 GB" yoki "Cheksiz"; "d_uz" — amal qilish muddati, masalan "30 kun", "7 kun", "24 soat"; "d_ru" — "30 дней", "7 дней", "24 часа"; "p" — narx so‘mda; "c" — ulash USSD kodi (rasmiy saytda bo‘lsa, aks holda "").`,
  minutes: `DAQIQA VA SMS PAKETLAR (tarifga qo‘shimcha sotiladigan). Har biri: "n" — masalan "500 daqiqa" yoki "100 SMS"; "d_uz" — muddat, masalan "30 kun"; "d_ru" — "30 дней"; "p" — narx so‘mda; "c" — ulash USSD kodi (bo‘lsa, aks holda "").`,
};

async function askAI(content, op, sec, cur) {
  const list = cur.map((x) => `${x.n} | ${x.d?.uz || ""} | ${x.p}`).join("\n") || "(bo‘sh)";
  const prompt = `Bugun ${today()}. Google Search bilan ${op.name} mobil operatorining RASMIY saytidan (${op.dom}) hozir SOTUVDA bo‘lgan ${GUIDE[sec]}
Faqat O‘ZBEKISTONDAGI jismoniy shaxslar uchun, hozir ulanish mumkin bo‘lganlari. Korporativ, arxiv yoki yopilganlarini qo‘shma.
Bizdagi hozirgi ro‘yxat (nom | tarkib | narx):
${list}
Qoidalar: faqat rasmiy saytda tasdiqlangan ma’lumot; O‘YLAB TOPMA; narx butun son (so‘m); topa olmagan narsangni qo‘shma.
Ro‘yxatni to‘liq topgan bo‘lsang "complete": true, aks holda false.
Faqat JSON qaytar: {"complete":true,"items":[{"n":"","d_uz":"","d_ru":"","p":0,"c":""}],"source":"rasmiy sahifa havolasi"}`;
  const res = await generate({
    content,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    steps: [{ tools: [{ google_search: {} }, { url_context: {} }], thinking: true }, { tools: [{ google_search: {} }], thinking: false }],
    accept: (r) => !!parseObj(extractText(r.j)),
    maxTokens: 6000,
  });
  if (!res.ok) return { error: res.error || "AI javob bermadi" };
  const j = parseObj(extractText(res.j));
  return { j, sources: sourcesOf(res.j) };
}

function clean(raw) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(raw) ? raw : []) {
    const n = String(x?.n || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const p = Math.round(Number(String(x?.p ?? "").replace(/[^\d.]/g, "")));
    if (!n || !(p >= 500 && p <= 5_000_000)) continue;
    const d = { uz: String(x.d_uz || "").trim().slice(0, 120), ru: String(x.d_ru || x.d_uz || "").trim().slice(0, 120) };
    const it = { n, d, p };
    if (okCode(x.c)) it.c = String(x.c).trim();
    const k = keyOf("x", it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/** Yangi ro‘yxatni hozirgisi bilan solishtiradi. Hech narsa o‘chirilmaydi. */
export function diff(sec, cur, fresh, date = today()) {
  const byKey = new Map(fresh.map((x) => [keyOf(sec, x), x]));
  const next = [], archiveAdd = [], ch = { added: [], price: [], closed: [], suspicious: [], changed: [] };
  for (const old of cur) {
    const k = keyOf(sec, old);
    const nw = byKey.get(k);
    if (!nw) {
      const miss = (old.miss || 0) + 1;
      if (miss >= 2) { archiveAdd.push({ ...old, miss: undefined, sec, from: date, why: "closed" }); ch.closed.push(old.n); }
      else next.push({ ...old, miss });
      continue;
    }
    byKey.delete(k);
    const it = { ...old, miss: undefined };
    if (nw.p !== old.p) {
      const r = nw.p / (old.p || 1);
      if (r > 3 || r < 1 / 3) { ch.suspicious.push(`${old.n}: ${fmtSum(old.p)} → ${fmtSum(nw.p)}`); next.push(it); continue; }
      archiveAdd.push({ ...old, miss: undefined, sec, from: date, why: "price", newP: nw.p });
      ch.price.push(`${old.n}${sec !== "tariffs" && old.d?.uz ? ` (${old.d.uz})` : ""}: ${fmtSum(old.p)} → ${fmtSum(nw.p)}`);
      it.p = nw.p; it.upd = date;
    }
    if (nw.d?.uz && norm(nw.d.uz) !== norm(old.d?.uz) && sec === "tariffs") { it.d = nw.d; it.upd = date; ch.changed.push(old.n); }
    if (nw.c && nw.c !== old.c) it.c = nw.c;
    next.push(it);
  }
  for (const nw of byKey.values()) { next.push({ ...nw, since: date }); ch.added.push(`${nw.n}${sec !== "tariffs" && nw.d?.uz ? ` (${nw.d.uz})` : ""} — ${fmtSum(nw.p)}`); }
  for (const x of next) if (x.miss === undefined) delete x.miss;
  return { next, archiveAdd, ch };
}

const anyChange = (ch) => ch.added.length || ch.price.length || ch.closed.length || ch.changed.length;
function summary(op, sec, ch) {
  const L = [];
  if (ch.added.length) L.push(`🆕 Yangi (${ch.added.length}):\n• ${ch.added.map(h).join("\n• ")}`);
  if (ch.price.length) L.push(`💱 Narx o‘zgardi (eskisi arxivda):\n• ${ch.price.map(h).join("\n• ")}`);
  if (ch.changed.length) L.push(`✏️ Tarkibi yangilandi: ${ch.changed.map(h).join(", ")}`);
  if (ch.closed.length) L.push(`🗄 Sotuvdan chiqdi → arxiv: ${ch.closed.map(h).join(", ")}`);
  if (ch.suspicious.length) L.push(`⚠️ Shubhali, qabul qilinmadi: ${ch.suspicious.map(h).join("; ")}`);
  return L.join("\n\n");
}

export function applyTo(data, sec, next, archiveAdd) {
  data[sec] = next;
  data.archive = [...archiveAdd, ...(data.archive || [])].slice(0, ARCHIVE_MAX);
}

/** Bitta operatorning bitta bo‘limini tekshiradi. */
export async function refresh(content, opId, sec, { publish = true, notify = true } = {}) {
  const op = OPS.find((o) => o.id === opId);
  if (!op || !SECS.includes(sec)) return { ok: false, msg: "Operator yoki bo‘lim noto‘g‘ri" };
  const data = await readOp(opId);
  const cur = data[sec] || [];
  const ai = await askAI(content, op, sec, cur);
  data.checked = { ...(data.checked || {}), [sec]: new Date().toISOString() };
  const label = `${op.name} · ${SEC_UZ[sec]}`;
  if (ai.error) return { ok: false, msg: `${label}: ${ai.error}` };
  const fresh = clean(ai.j?.items);
  const min = Math.max(cur.length >= 6 ? 3 : 1, Math.ceil(cur.length * 0.5));
  if (ai.j?.complete === false || fresh.length < min) {
    await writeOp(opId, data);
    return { ok: true, msg: `${label}: AI ro‘yxatni to‘liq topa olmadi (${fresh.length} ta) — hech narsa o‘zgartirilmadi` };
  }
  const { next, archiveAdd, ch } = diff(sec, cur, fresh);
  const src = ai.sources?.[0]?.u || String(ai.j?.source || "");
  const text = summary(op, sec, ch);
  if (!anyChange(ch)) {
    applyTo(data, sec, next, []); // "miss" hisoblagichlari yangilanadi
    await writeOp(opId, data);
    return { ok: true, msg: `${label}: o‘zgarish yo‘q (${fresh.length} ta tekshirildi)${ch.suspicious.length ? ". " + ch.suspicious.length + " ta shubhali narx qabul qilinmadi" : ""}` };
  }
  const logLine = { at: new Date().toISOString(), sec, text: text.slice(0, 1500), src, auto: publish };
  if (publish) {
    applyTo(data, sec, next, archiveAdd);
    if (data.pending) delete data.pending[sec];
  } else {
    data.pending = { ...(data.pending || {}), [sec]: { next, archiveAdd, text, src, at: logLine.at } };
  }
  data.log = [logLine, ...(data.log || [])].slice(0, 40);
  await writeOp(opId, data);
  if (notify) {
    await tgSend(`🤖 <b>AI tariflar · ${h(label)}</b>${publish ? "" : " — <b>tasdiq kutilmoqda</b> (admin panel → Tariflar)"}\n\n${text}${src ? `\n\n🔗 Manba: ${h(src)}` : ""}`, { chats: await adminChats("news") }).catch(() => {});
  }
  return { ok: true, msg: `${label}: ${publish ? "yangilandi" : "tasdiqqa yuborildi"} — ${[ch.added.length && `${ch.added.length} yangi`, ch.price.length && `${ch.price.length} narx`, ch.closed.length && `${ch.closed.length} arxivga`, ch.changed.length && `${ch.changed.length} tarkib`].filter(Boolean).join(", ")}` };
}

export async function decide(opId, sec, approve) {
  const data = await readOp(opId);
  const p = data.pending?.[sec];
  if (!p) return "Tasdiq kutayotgan o‘zgarish yo‘q";
  if (approve) applyTo(data, sec, p.next, p.archiveAdd || []);
  delete data.pending[sec];
  await writeOp(opId, data);
  return approve ? "Tasdiqlandi — ilova va saytda ko‘rinadi" : "Rad etildi";
}

// Admin qo‘lda: arxivdan qaytarish yoki qo‘lda arxivlash
export async function restore(opId, idx) {
  const data = await readOp(opId);
  const a = data.archive?.[idx];
  if (!a) return "Topilmadi";
  const { sec, from, why, newP, ...item } = a;
  const list = data[sec] || (data[sec] = []);
  if (!list.some((x) => keyOf(sec, x) === keyOf(sec, item))) list.push(item);
  data.archive.splice(idx, 1);
  await writeOp(opId, data);
  return `${item.n} arxivdan qaytarildi`;
}
export async function archiveItem(opId, sec, idx) {
  const data = await readOp(opId);
  const it = data[sec]?.[idx];
  if (!it) return "Topilmadi";
  data[sec].splice(idx, 1);
  data.archive = [{ ...it, sec, from: today(), why: "closed" }, ...(data.archive || [])].slice(0, ARCHIVE_MAX);
  await writeOp(opId, data);
  return `${it.n} arxivga o‘tkazildi`;
}

/** Jadval bo‘yicha navbatdagi bo‘lim (har 2 soatda bittasi → har biri kuniga 1 marta). */
export function slotNow(d = Date.now()) {
  const n = Math.floor(d / (2 * 3600e3)) % (OPS.length * SECS.length);
  return { op: OPS[n % OPS.length].id, sec: SECS[Math.floor(n / OPS.length) % SECS.length] };
}
