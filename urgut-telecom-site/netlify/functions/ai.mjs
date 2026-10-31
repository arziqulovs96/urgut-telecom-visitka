// AI yordamchi: avval sayt bazasidan (Firestore), kerak bo‘lsa internetdan (Google Search) javob beradi.
// Netlify → Site configuration → Environment variables:
//   GEMINI_API_KEY       — Google AI Studio kaliti (majburiy)
//   FIREBASE_PROJECT_ID  — Firebase loyiha ID (majburiy)
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
    ? "Отвечай на русском языке."
    : "Javobni o‘zbek tilida, lotin yozuvida yoz. Agar mijoz boshqa tilda yozsa, o‘sha tilda javob ber.";
  return `Sen ${d?.ai?.name || "Urgut Telecom yordamchisi"}san — ${d?.brand?.name || "URGUT TELECOM"} kompaniyasi saytidagi AI yordamchi.
${langLine}
Hozirgi vaqt: ${nowTashkent()} (Toshkent).

QOIDALAR:
1. Avvalo pastdagi KOMPANIYA MA’LUMOTLARI dan foydalan. Kompaniyaga oid (ish vaqti, filial, telefon, xizmat, kompaniya takliflari va narxlari) savollarga faqat shu ma’lumot asosida javob ber.
2. ${web
    ? "Kompaniya ma’lumotida yo‘q umumiy savollarga (masalan operatorlarning hozirgi tariflari, USSD kodlar, yangiliklar) Google Search orqali internetdan qidirib javob ber va bu ma’lumot internetdan olinganini, aniq narxni ofisda tekshirish kerakligini qisqa ayt."
    : "Internet qidiruvi o‘chirilgan. Kompaniya ma’lumotida yo‘q narsani bilmasligingni ochiq ayt va telefon raqamlarini taklif qil."}
3. Hech qachon narx, manzil yoki telefonni o‘ylab topma. Bilmasang, aloqa markazi raqamlarini ber.
4. Javob qisqa va aniq bo‘lsin (odatda 2–6 gap yoki qisqa ro‘yxat). Markdown’dan faqat **qalin** va "- " ro‘yxatdan foydalan.
5. Mijoz SIM karta olmoqchi, xizmatga yozilmoqchi yoki buyurtma bermoqchi bo‘lsa, kerakli ma’lumotni ayt, onlayn ariza qoldirishni taklif qil va javob oxiriga alohida qatorda faqat [ARIZA] belgisini qo‘y.
6. Kompaniya va uning xizmatlariga aloqasi yo‘q mavzularda (siyosat, boshqa kompaniyalar reklamasi va h.k.) muloyimlik bilan rad et va kompaniya xizmatlariga qaytar.
7. SIM karta pasport bilan rasmiylashtiriladi; raqamni masofadan rasmiylashtirib bo‘lmasligini, ofisga kelish kerakligini eslat (agar ma’lumotda boshqacha yozilmagan bo‘lsa).

KOMPANIYA MA’LUMOTLARI:
${compact(d, lang)}`;
}

async function callGemini({ key, model, sys, contents, web }) {
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
  };
  if (web) body.tools = [{ google_search: {} }];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
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
    return json({ gemini: !!env("GEMINI_API_KEY"), firebase: !!env("FIREBASE_PROJECT_ID"), telegram: !!(env("TG_BOT_TOKEN") && env("TG_CHAT_ID")) });
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
  const model = /^gemini-[\w.-]{1,40}$/.test(d?.ai?.model || "") ? d.ai.model : "gemini-2.5-flash";

  const contents = [
    ...hist
      .filter((m) => m && typeof m.text === "string" && m.text.trim())
      .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.slice(0, 1500) }] })),
    { role: "user", parts: [{ text: q }] },
  ];
  const sys = systemPrompt(d, lang, web);

  let res = await callGemini({ key, model, sys, contents, web });
  // Internet qidiruvi limiti tugasa yoki model qo‘llamasa, qidiruvsiz qayta urinib ko‘riladi
  if (!res.ok && web && (res.status === 429 || res.status === 400)) {
    res = await callGemini({ key, model, sys: systemPrompt(d, lang, false), contents, web: false });
  }
  if (!res.ok) {
    console.error("gemini", res.status, JSON.stringify(res.j).slice(0, 500));
    return json({ error: res.status === 429 ? "AI limiti tugadi, birozdan keyin urinib ko‘ring." : "AI javob bermadi" }, 502);
  }

  const cand = res.j?.candidates?.[0];
  let text = (cand?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) return json({ error: "Bo‘sh javob" }, 502);
  const order = /\[ARIZA\]/i.test(text);
  text = text.replace(/\s*\[ARIZA\]\s*/gi, "\n").trim();

  const seen = new Set();
  const sources = (cand?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri && !seen.has(w.title || w.uri) && seen.add(w.title || w.uri))
    .slice(0, 4)
    .map((w) => ({ t: (w.title || new URL(w.uri).hostname).slice(0, 60), u: w.uri }));

  return json({ text, sources, order });
};

export const config = { path: "/api/ai" };
