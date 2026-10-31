// UrgutTelecom AI: avval sayt bazasidan (Firestore), kerak bo‘lsa internetdan (Google Search) javob beradi.
// Netlify → Site configuration → Environment variables:
//   GEMINI_API_KEY       — Google AI Studio kaliti (majburiy)
//   FIREBASE_PROJECT_ID  — Firebase loyiha ID (majburiy)
//   GEMINI_MODEL         — ixtiyoriy, masalan gemini-3-flash-preview (admin paneldagidan ustun turadi)
//   FIREBASE_API_KEY     — ixtiyoriy (index.html dagi apiKey bilan bir xil)
//   TG_BOT_TOKEN, TG_CHAT_ID — faqat holatni ko‘rsatish uchun tekshiriladi

const env = (k) => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "").trim();
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

let cache = { at: 0, data: null };
async function siteData() {
  if (cache.data && Date.now() - cache.at < 60_000) return cache.data;
  const pid = env("FIREBASE_PROJECT_ID");
  if (!pid) return null;
  const key = env("FIREBASE_API_KEY");
  const url = `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/site/content${key ? `?key=${key}` : ""}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return cache.data;
    const j = await r.json();
    const raw = j?.fields?.json?.stringValue;
    if (!raw) return cache.data;
    cache = { at: Date.now(), data: JSON.parse(raw) };
    return cache.data;
  } catch {
    return cache.data;
  }
}

// Rasm/video havolalari va keraksiz maydonlarni olib tashlab, AI uchun ixcham matn yasaydi
function compact(d, lang) {
  if (!d) return "Kompaniya ma’lumotlari hozircha mavjud emas.";
  const L = (o) => (o && typeof o === "object" ? o[lang] || o.uz || o.ru || "" : o || "");
  const days = { all: "har kuni", monsat: "dushanba–shanba", monfri: "dushanba–juma" };
  const ops = (d.operators || []).filter((o) => !o.hidden);
  const opName = (id) => ops.find((o) => o.id === id)?.name || "";
  const out = [];
  out.push(`Kompaniya: ${d.brand?.name || ""}. ${L(d.brand?.tag)}`);
  out.push(`Umumiy ish vaqti: ${days[d.hours?.days] || "har kuni"} ${d.hours?.open}–${d.hours?.close} (Toshkent vaqti).`);
  out.push(`Aloqa markazi telefonlari: ${(d.phones || []).filter(Boolean).join(", ")}`);
  out.push(`Operatorlar (shu tartibda): ${ops.map((o) => o.name).join(", ")}`);
  out.push("Xizmatlar:");
  (d.services || []).forEach((s) => out.push(`- ${L(s.title)}: ${L(s.text)}${s.online ? " (saytda onlayn ariza mumkin)" : ""}`));
  const offers = (d.offers || []).filter((o) => !o.hidden);
  if (offers.length) {
    out.push("SIM kartalar va takliflar (kompaniya bazasidan):");
    offers.forEach((o) =>
      out.push(`- ${L(o.title)}${o.op ? ` [${opName(o.op)}]` : ""}: ${L(o.text)}. Narxi: ${o.price || "ofisda aniqlanadi"}`)
    );
  }
  const brs = (d.branches || []).filter((b) => !b.hidden);
  out.push("Filiallar:");
  brs.forEach((b) => {
    const h = b.own ? `${days[b.days] || "har kuni"} ${b.open}–${b.close}` : "umumiy ish vaqti";
    out.push(`- ${L(b.name)}: manzil ${L(b.addr) || "tez orada"}${L(b.mark) ? `, mo‘ljal: ${L(b.mark)}` : ""}; tel ${b.phone || d.phones?.[0] || ""}; ish vaqti ${h}${b.loc && !/^data:/.test(b.loc) ? `; xarita: ${b.loc}` : ""}`);
  });
  if (d.about) out.push(`Kompaniya haqida: ${L(d.about.title)}. ${L(d.about.text)}`);
  if (d.founder?.name) out.push(`Asoschi va rahbar: ${d.founder.name} (${L(d.founder.role)}).`);
  const soc = (d.socials || []).filter((s) => s.url).map((s) => `${s.type}: ${s.url}`);
  if (soc.length) out.push(`Ijtimoiy tarmoqlar: ${soc.join(", ")}`);
  if (d.ai?.notes) out.push(`Qo‘shimcha ma’lumot (admin yozgan):\n${String(d.ai.notes).slice(0, 6000)}`);
  return out.join("\n");
}

function nowTashkent() {
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}

function systemPrompt(d, lang, web) {
  const langLine = lang === "ru"
    ? "Отвечай на русском языке. Если клиент пишет на другом языке, отвечай на его языке."
    : "Javobni o‘zbek tilida, lotin yozuvida yoz. Agar mijoz boshqa tilda yozsa, o‘sha tilda javob ber.";
  return `Sen ${d?.ai?.name || "UrgutTelecom AI"}san — ${d?.brand?.name || "URGUT TELECOM"} kompaniyasining aqlli yordamchisi. O‘zingni doim "${d?.ai?.name || "UrgutTelecom AI"}" deb tanishtir.
${langLine}
Bugungi sana va vaqt: ${nowTashkent()} (Toshkent).

SENING VAZIFANG: mijozga har qanday savolda to‘liq, aniq va foydali javob berish. Ayniqsa O‘zbekiston mobil aloqasi bo‘yicha eng yaxshi mutaxassis bo‘lishing kerak.

QOIDALAR:
1. Kompaniyaga oid savollarga (ish vaqti, filiallar, telefonlar, xizmatlar, kompaniya takliflari va narxlari) pastdagi KOMPANIYA MA’LUMOTLARI asosida javob ber. Bu ma’lumot eng ishonchli manba.
2. ${web
    ? `Operatorlar (Ucell, Uzmobile/Uztelecom, Beeline, Mobiuz, Humans va boshqalar) tariflari, abonent to‘lovi, internet paketlari, daqiqa va SMS hajmi, USSD kodlar, aksiyalar, rouming va boshqa barcha ma’lumotlarni HAR DOIM Google Search orqali internetdan qidirib top. Avvalo rasmiy saytlardan foydalan: ucell.uz, uztelecom.uz, beeline.uz, mobi.uz. Javobda aniq raqamlarni (narx so‘mda, GB, daqiqa, SMS) ko‘rsat va ma’lumot qaysi saytdan olinganini qisqa ayt. Narxlar o‘zgarishi mumkinligini va oxirgi narxni ofisda tasdiqlash mumkinligini bir gap bilan eslat.
   Mijoz tariflarni solishtirishni so‘rasa, har bir operator bo‘yicha alohida qidirib, solishtirib ber va uning ehtiyojiga (ko‘p internet, ko‘p daqiqa, arzon narx) qarab eng mosini tavsiya qil.
   Kompaniyaga aloqasi bo‘lmagan umumiy savollarga ham internetdan qidirib, qisqa va to‘g‘ri javob ber.`
    : "Internet qidiruvi hozir o‘chiq. Kompaniya ma’lumotida yo‘q narsani aniq bilmasang, buni ochiq ayt va aloqa markazi raqamlarini ber."}
3. Hech qachon narx, tarif, manzil yoki telefonni o‘ylab topma. Topa olmasang, shuni ochiq ayt.
4. Javobni chiroyli tuz: qisqa kirish gap, keyin "- " bilan ro‘yxat, muhim joylarni **qalin** qil. Kerak bo‘lsa "### Sarlavha" ishlat. Jadval ishlatma. Oddiy savolga 2–4 gap, tariflar ro‘yxatiga batafsil javob.
5. Mijoz SIM karta, tarif ulash, xizmat yoki buyurtma bilan qiziqsa, javob oxirida onlayn ariza qoldirishni taklif qil va eng oxirgi qatorga faqat [ARIZA] belgisini yoz.
6. SIM karta pasport bilan ofisda rasmiylashtiriladi (agar kompaniya ma’lumotida boshqacha yozilmagan bo‘lsa).
7. Kompaniya va boshqa operatorlar haqida hurmat bilan gapir, hech kimni kamsitma.

KOMPANIYA MA’LUMOTLARI:
${compact(d, lang)}`;
}

// Standart model. Google eski modellarni o‘chirsa ham, funksiya o‘zi ishlaydigan modelni topadi.
const DEFAULT_MODEL = "gemini-3-flash-preview";
const FALLBACKS = ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-latest"];
let autoModel = null; // topilgan ishlaydigan model (issiq instansiyada eslab qolinadi)

async function callGemini({ key, model, sys, contents, tools, thinking }) {
  const g3 = /^gemini-3/.test(model);
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents,
    generationConfig: { maxOutputTokens: 4096, ...(g3 ? {} : { temperature: 0.3 }) },
  };
  if (thinking && g3) body.generationConfig.thinkingConfig = { thinkingLevel: "low" };
  if (tools?.length) body.tools = tools;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

// Google’dan hozir mavjud modellar ro‘yxatini olib, eng yangi "flash" modelni tanlaydi
async function discoverModel(key) {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
    const j = await r.json();
    const ids = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((id) => /^gemini-\d/.test(id) && /flash/.test(id) && !/(image|tts|live|audio|embedding|computer|thinking-exp)/.test(id));
    const ver = (id) => parseFloat((id.match(/^gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const score = (id) => ver(id) * 10 + (/lite/.test(id) ? 0 : 3) + (/preview/.test(id) ? 0 : 1);
    ids.sort((x, y) => score(y) - score(x));
    return ids[0] || null;
  } catch {
    return null;
  }
}

// Bitta model bilan: avval Google Search + sahifa o‘qish, keyin faqat Search, keyin internetsiz
async function askModel({ key, model, d, lang, web, contents }) {
  const steps = web
    ? [
        { tools: [{ google_search: {} }, { url_context: {} }], thinking: true, web: true },
        { tools: [{ google_search: {} }], thinking: false, web: true },
        { tools: [], thinking: false, web: false },
      ]
    : [{ tools: [], thinking: true, web: false }, { tools: [], thinking: false, web: false }];
  let res = null;
  for (const st of steps) {
    res = await callGemini({ key, model, sys: systemPrompt(d, lang, st.web), contents, tools: st.tools, thinking: st.thinking });
    if (res.ok && extractText(res.j)) return res;
    if (res.status === 404) return res; // model yo‘q — boshqa modelga o‘tiladi
    if (res.ok) res = { ok: false, status: 502, j: res.j }; // bo‘sh javob
  }
  return res;
}

function extractText(j) {
  const parts = j?.candidates?.[0]?.content?.parts || [];
  return parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
}

const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 60_000, max = 15;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

export default async (req, context) => {
  if (req.method === "GET") {
    return json({ gemini: !!env("GEMINI_API_KEY"), firebase: !!env("FIREBASE_PROJECT_ID"), telegram: !!(env("TG_BOT_TOKEN") && env("TG_CHAT_ID")), model: autoModel || env("GEMINI_MODEL") || DEFAULT_MODEL });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = env("GEMINI_API_KEY");
  if (!key) return json({ error: "AI sozlanmagan (GEMINI_API_KEY yo‘q)" }, 503);
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "x";
  if (limited(ip)) return json({ error: "Juda ko‘p so‘rov. Bir daqiqadan keyin urinib ko‘ring." }, 429);

  let input;
  try { input = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const q = String(input?.q || "").trim().slice(0, 600);
  if (!q) return json({ error: "empty" }, 400);
  const lang = input?.lang === "ru" ? "ru" : "uz";
  const hist = Array.isArray(input?.hist) ? input.hist.slice(-8) : [];

  const d = await siteData();
  if (d?.ai && d.ai.enabled === false) return json({ error: "AI o‘chirilgan" }, 403);
  const web = d?.ai?.web !== false;
  // Model tanlash tartibi: Netlify’dagi GEMINI_MODEL → admin paneldagi model → standart
  const ok = (m) => /^gemini-[\w.-]{1,60}$/.test(m || "");
  const envModel = env("GEMINI_MODEL");
  const wanted = ok(envModel) ? envModel : ok(d?.ai?.model) ? d.ai.model : DEFAULT_MODEL;

  const contents = [
    ...hist
      .filter((m) => m && typeof m.text === "string" && m.text.trim())
      .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.slice(0, 4000) }] })),
    { role: "user", parts: [{ text: q }] },
  ];

  // Avval admin tanlagan model, keyin zaxira modellar, oxirida Google ro‘yxatidan topilgan model
  const tried = new Set();
  const queue = [...new Set([autoModel, wanted, ...FALLBACKS].filter(Boolean))];
  let res = null, used = null, discovered = false;
  while (queue.length) {
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    res = await askModel({ key, model, d, lang, web, contents });
    if (res.ok) { used = model; break; }
    console.error("gemini", model, res.status, JSON.stringify(res.j).slice(0, 300));
    if (res.status === 401 || res.status === 403) break; // kalit noto‘g‘ri
    if (!queue.length && !discovered) {
      discovered = true;
      const m = await discoverModel(key);
      if (m && !tried.has(m)) queue.push(m);
    }
  }
  if (!res?.ok) {
    const st = res?.status;
    return json({ error: st === 429 ? "AI limiti tugadi, birozdan keyin urinib ko‘ring." : st === 401 || st === 403 ? "Gemini kaliti noto‘g‘ri yoki faol emas." : "AI javob bermadi" }, 502);
  }
  autoModel = used;

  const cand = res.j?.candidates?.[0];
  let text = extractText(res.j);
  const order = /\[ARIZA\]/i.test(text);
  text = text.replace(/\s*\[ARIZA\]\s*/gi, "\n").trim();

  const seen = new Set();
  const sources = (cand?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri && !seen.has(w.title || w.uri) && seen.add(w.title || w.uri))
    .slice(0, 5)
    .map((w) => ({ t: (w.title || new URL(w.uri).hostname).slice(0, 60), u: w.uri }));

  return json({ text, sources, order, model: used });
};

export const config = { path: "/api/ai" };
