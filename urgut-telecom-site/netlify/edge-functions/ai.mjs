// UrgutTelecom AI (mijozlar uchun): sayt bazasi + do‘kon + internet (operatorlarning rasmiy saytlari).
// Netlify environment variables: GEMINI_API_KEY (majburiy), FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID,
// GEMINI_MODEL (ixtiyoriy; admin paneldagi model ustun turadi)
import { env, json, ready, siteContent, listDocs, query, limited, ipOf, projectId, decFields, fmtSum, botKeyOk } from "../lib/fs.mjs";
import { generate, WEB_STEPS, extractText, sourcesOf, searchedOf, currentModel } from "../lib/gemini.mjs";
import { L as Lx } from "../lib/shop.mjs";

// Service account bo‘lmasa ham sayt ma’lumotini ochiq yo‘l bilan o‘qiydi
async function publicContent() {
  const pid = projectId();
  if (!pid) return null;
  const key = env("FIREBASE_API_KEY");
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/site/content${key ? `?key=${key}` : ""}`);
    if (!r.ok) return null;
    const raw = (await r.json())?.fields?.json?.stringValue;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function publicList(coll) {
  const pid = projectId();
  if (!pid) return [];
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${coll}?pageSize=300`);
    if (!r.ok) return [];
    return ((await r.json()).documents || []).map((d) => ({ id: d.name.split("/").pop(), ...decFields(d.fields) }));
  } catch {
    return [];
  }
}

let cat = { at: 0, v: null };
async function catalog() {
  if (cat.v && Date.now() - cat.at < 60_000) return cat.v;
  const v = { content: null, products: [], numbers: [], news: [] };
  try {
    if (ready()) {
      v.content = await siteContent();
      [v.products, v.numbers, v.news] = await Promise.all([
        listDocs("products").catch(() => []),
        listDocs("numbers").catch(() => []),
        query("news", { where: [["status", "EQUAL", "published"]], limit: 30 }).catch(() => []),
      ]);
    } else {
      v.content = await publicContent();
      [v.products, v.numbers] = await Promise.all([publicList("products"), publicList("numbers")]);
    }
  } catch (e) {
    console.error("catalog", e.message);
  }
  cat = { at: Date.now(), v };
  return v;
}

function compact({ content: d, products, numbers, news }, lang) {
  if (!d) return "Kompaniya ma’lumotlari hozircha mavjud emas.";
  const L = (o) => Lx(o, lang);
  const days = { all: "har kuni", monsat: "dushanba–shanba", monfri: "dushanba–juma" };
  const ops = (d.operators || []).filter((o) => !o.hidden);
  const opName = (id) => ops.find((o) => o.id === id)?.name || "";
  const out = [];
  out.push(`Kompaniya: ${d.brand?.name || ""}. ${L(d.brand?.tag)}`);
  out.push(`Umumiy ish vaqti: ${days[d.hours?.days] || "har kuni"} ${d.hours?.open}–${d.hours?.close} (Toshkent vaqti).`);
  out.push(`Aloqa markazi telefonlari: ${(d.phones || []).filter(Boolean).join(", ")}`);
  out.push(`Operatorlar (shu tartibda): ${ops.map((o) => o.name).join(", ")}`);
  out.push("Xizmatlar:");
  (d.services || []).forEach((s) => out.push(`- ${L(s.title)}: ${L(s.text)}${s.online ? " (saytda onlayn ariza mumkin)" : ""}${s.delivery && d.delivery?.enabled ? " (uyga yetkazib berish bor)" : ""}`));
  const gov = (d.gov || []).map(L).filter(Boolean);
  if (gov.length) out.push(`Davlat xizmatlari markazi: my.gov.uz va boshqa davlat portallaridagi barcha xizmatlarda yordam beramiz. Eng ko‘p so‘raladiganlari: ${gov.join(", ")}.`);
  if (d.delivery?.enabled) out.push(`Yetkazib berish: bor, ${d.delivery.paid ? `narxi ${fmtSum(d.delivery.price)} so‘m` : "bepul"}.`);
  if (d.nasiya?.enabled) out.push(`Muddatli to‘lov: bor (${d.nasiya.months} oy). Aniq shartlar ofisda.`);
  const offers = (d.offers || []).filter((o) => !o.hidden);
  if (offers.length) {
    out.push("SIM kartalar va takliflar:");
    offers.forEach((o) => out.push(`- ${L(o.title)}${o.op ? ` [${opName(o.op)}]` : ""}: ${L(o.text)}. Narxi: ${o.price || "ofisda aniqlanadi"}`));
  }
  const cats = Object.fromEntries((d.shopCats || []).map((c) => [c.id, L(c.name)]));
  const prods = (products || []).filter((p) => !p.hidden).slice(0, 120);
  if (prods.length && d.shop?.enabled !== false) {
    out.push("DO‘KON (saytdagi “Do‘kon” bo‘limi; narxlar so‘mda):");
    prods.forEach((p) => {
      const vars = (p.variants || []).filter((v) => v.status !== "out");
      const pr = vars.length ? vars.map((v) => `${[v.mem, v.color].filter(Boolean).join(" ") || "standart"}: ${fmtSum(v.price)}`).join("; ") : fmtSum(p.price);
      out.push(`- [${cats[p.cat] || "boshqa"}] ${[p.brand, p.name].filter(Boolean).join(" ")} — ${pr}${p.status === "out" || (!vars.length && (p.variants || []).length) ? " (hozir yo‘q)" : ""}${p.specs ? ` | ${String(p.specs).replace(/\s*\n\s*/g, ", ").slice(0, 200)}` : ""}${p.warranty ? ` | kafolat ${p.warranty}` : ""}`);
    });
  }
  const nums = (numbers || []).filter((n) => !n.status || n.status === "free").slice(0, 40);
  if (nums.length && d.nums?.enabled !== false) out.push(`Chiroyli raqamlar (bo‘sh): ${nums.map((n) => `${n.num} ${opName(n.op)} ${fmtSum(n.price)} so‘m`).join("; ")}`);
  if ((news || []).length) out.push(`So‘nggi yangiliklarimiz: ${news.slice(0, 6).map((n) => L(n.title)).join(" | ")}`);
  const brs = (d.branches || []).filter((b) => !b.hidden);
  out.push("Filiallar:");
  brs.forEach((b) => {
    const h = b.own ? `${days[b.days] || "har kuni"} ${b.open}–${b.close}` : "umumiy ish vaqti";
    out.push(`- ${L(b.name)}: manzil ${L(b.addr) || "tez orada"}${L(b.mark) ? `, mo‘ljal: ${L(b.mark)}` : ""}; tel ${b.phone || d.phones?.[0] || ""}; ish vaqti ${h}`);
  });
  if (d.about) out.push(`Kompaniya haqida: ${L(d.about.title)}. ${L(d.about.text)}`);
  if (d.founder?.name) out.push(`Asoschi va rahbar: ${d.founder.name}.`);
  if (d.ai?.notes) out.push(`Qo‘shimcha ma’lumot (admin yozgan):\n${String(d.ai.notes).slice(0, 6000)}`);
  return out.join("\n");
}

const nowTashkent = () =>
  new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());

function systemPrompt(cv, lang, web) {
  const d = cv.content;
  const nm = d?.ai?.name || "UrgutTelecom AI";
  const langLine = lang === "ru"
    ? "Отвечай на русском языке. Если клиент пишет на другом языке, отвечай на его языке."
    : "Javobni o‘zbek tilida, lotin yozuvida yoz. Agar mijoz boshqa tilda yozsa, o‘sha tilda javob ber.";
  return `Sen ${nm}san — ${d?.brand?.name || "URGUT TELECOM"} kompaniyasining aqlli yordamchisi. O‘zingni doim "${nm}" deb tanishtir.
${langLine}
Bugungi sana va vaqt: ${nowTashkent()} (Toshkent).

QOIDALAR:
1. Kompaniyaga oid savollarga (ish vaqti, filiallar, telefonlar, xizmatlar, do‘kondagi mahsulotlar va narxlar, chiroyli raqamlar, yetkazib berish) pastdagi KOMPANIYA MA’LUMOTLARI asosida javob ber. Mahsulot tavsiya qilsang, do‘kondagi aniq nom va narxni ayt.
2. ${web
    ? `Operatorlar (Ucell, Uzmobile/Uztelecom, Beeline, Mobiuz, Humans) tariflari, abonent to‘lovi, internet paketlari, daqiqa va SMS, USSD kodlar, aksiyalar, rouming va boshqa operator ma’lumotlari kompaniya bazasida YO‘Q. Bunday savollarda HAR DOIM avval Google Search bilan qidir va rasmiy saytlarni o‘qi: ucell.uz, uztelecom.uz (uzmobile), beeline.uz, mobi.uz, humans.uz. Hech qachon "bizning bazamizda yo‘q" deb to‘xtama — internetdan top.
   Davlat xizmatlari (my.gov.uz, soliq va h.k.) bo‘yicha savollarda ham qidir, tartibni tushuntir va kompaniyamiz bu ishda yordam berishini ayt.
   Javobda aniq raqamlarni (so‘m, GB, daqiqa, SMS) ko‘rsat. Oxirida bir gap bilan narxlar o‘zgarishi mumkinligini ayt.
   Tariflarni solishtirishni so‘rasa, har bir operatorni alohida qidirib, mijoz ehtiyojiga qarab eng mosini tavsiya qil.
   Kompaniyaga aloqasi yo‘q umumiy savollarga ham internetdan qidirib qisqa javob ber.`
    : "Internet qidiruvi hozir ishlamayapti. Operator tariflari kabi bazada yo‘q narsani aniq bilmasang, “hozir internetdan tekshira olmadim” deb ochiq ayt va aloqa markazi raqamlarini ber."}
3. Hech qachon narx, tarif, manzil yoki telefonni o‘ylab topma.
4. Javobni chiroyli tuz: qisqa kirish gap, "- " bilan ro‘yxat, muhim joylar **qalin**, kerak bo‘lsa "### Sarlavha". Jadval ishlatma.
5. Mijoz SIM karta, mahsulot, tarif ulash yoki xizmatga yozilmoqchi bo‘lsa, onlayn ariza qoldirishni taklif qil va eng oxirgi qatorga faqat [ARIZA] yoz.
6. Kompaniya va boshqa operatorlar haqida hurmat bilan gapir.

KOMPANIYA MA’LUMOTLARI:
${compact(cv, lang)}`;
}

const OPERATOR_Q = /(tarif|narx|internet|paket|ussd|\*\d|ucell|beeline|bilayn|mobiuz|uzmobile|uztelecom|humans|rouming|roaming|aksiya|daqiqa|minut|sms|\bgb\b|limit|abonent|тариф|цена|интернет|пакет|минут|роуминг|акци|my\.?gov|soliq|davlat xizmat|госуслуг|налог)/i;

export default async (req, context) => {
  if (req.method === "GET") {
    const cv = await catalog();
    return json({
      gemini: !!env("GEMINI_API_KEY"), firebase: !!projectId(), service: ready(),
      telegram: !!(env("TG_BOT_TOKEN") && env("TG_CHAT_ID")), bot: botKeyOk(req), model: currentModel(cv.content),
    });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!env("GEMINI_API_KEY")) return json({ error: "AI sozlanmagan (GEMINI_API_KEY yo‘q)" }, 503);
  let input;
  try { input = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (limited(botKeyOk(req) ? "ai:bot:" + String(input?.tgId || "") : "ai:" + ipOf(req, context), 15)) return json({ error: "Juda ko‘p so‘rov. Bir daqiqadan keyin urinib ko‘ring." }, 429);
  const q = String(input?.q || "").trim().slice(0, 600);
  if (!q) return json({ error: "empty" }, 400);
  const lang = input?.lang === "ru" ? "ru" : "uz";
  const hist = Array.isArray(input?.hist) ? input.hist.slice(-8) : [];

  const cv = await catalog();
  const d = cv.content;
  if (d?.ai && d.ai.enabled === false) return json({ error: "AI o‘chirilgan" }, 403);
  const web = d?.ai?.web !== false;
  const needWeb = web && OPERATOR_Q.test(q);

  const mk = (extra) => [
    ...hist
      .filter((m) => m && typeof m.text === "string" && m.text.trim())
      .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.slice(0, 4000) }] })),
    { role: "user", parts: [{ text: q + (extra || "") }] },
  ];
  const hint = "\n\n(Ichki ko‘rsatma: bu savol operatorlar yoki davlat xizmatlariga oid — javobdan oldin albatta Google Search bilan rasmiy saytlardan qidir.)";
  const steps = web ? WEB_STEPS(systemPrompt(cv, lang, true), systemPrompt(cv, lang, false)) : [{ tools: [], thinking: true, sys: systemPrompt(cv, lang, false) }];

  let res = await generate({ content: d, contents: mk(needWeb ? hint : ""), steps });
  // Operator savoliga qidiruvsiz javob bersa — bir marta qat’iyroq qayta so‘raladi
  if (res.ok && needWeb && res.step?.tools?.length && !searchedOf(res.j)) {
    const again = await generate({ content: d, contents: mk(hint + " Hozir Google Search ishlatmading — albatta ishlat."), steps: steps.slice(0, 2) });
    if (again.ok && searchedOf(again.j)) res = again;
  }
  if (!res.ok) return json({ error: res.error || "AI javob bermadi" }, 502);

  let text = extractText(res.j);
  const order = /\[ARIZA\]/i.test(text);
  text = text.replace(/\s*\[ARIZA\]\s*/gi, "\n").trim();
  return json({ text, sources: sourcesOf(res.j).slice(0, 5), order, model: res.model, web: searchedOf(res.j) });
};

export const config = { path: "/api/ai" };
