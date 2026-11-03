// AI yangiliklar: operatorlarning rasmiy saytlaridan yangi tarif va aksiyalarni topib,
// “Urgut Telecom yangiliklari” sifatida o‘z so‘zi bilan yozadi.
import { query, createDoc, randomId, tgSend, h, adminChats } from "./fs.mjs";
import { generate, extractText } from "./gemini.mjs";

const DOMAINS = { ucell: "ucell.uz", uzmobile: "uztelecom.uz", uztelecom: "uztelecom.uz", beeline: "beeline.uz", mobiuz: "mobi.uz", humans: "humans.uz" };
const keyOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "").slice(0, 60);

function parseArr(text) {
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a < 0 || b <= a) return [];
  try {
    const v = JSON.parse(text.slice(a, b + 1));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function newsForOperator(content, op, { publish }) {
  const dom = DOMAINS[String(op.id || "").toLowerCase()] || DOMAINS[String(op.name || "").toLowerCase()] || "";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  const prompt = `Bugun ${today}. Google Search bilan ${op.name} mobil operatorining${dom ? ` rasmiy sayti ${dom} va` : ""} rasmiy kanallaridagi SO‘NGGI 14 KUNLIK yangiliklarini top: yangi tariflar, narx o‘zgarishlari, aksiyalar, yangi xizmatlar.
Har bir yangilikni URGUT TELECOM kompaniyasi saytidagi yangilik sifatida, O‘Z SO‘ZING BILAN, qisqa va aniq yoz (asl matnni ko‘chirma). Aniq raqamlarni (narx so‘mda, GB, daqiqa) saqla. O‘ylab topma — faqat haqiqatan topilgan ma’lumot.
Faqat JSON massiv qaytar, boshqa hech narsa yozma:
[{"title_uz":"…","title_ru":"…","body_uz":"2–4 gap","body_ru":"2–4 предложения","date":"YYYY-MM-DD","url":"manba havolasi"}]
Ko‘pi bilan 3 ta. Yangi narsa topilmasa: []`;
  const res = await generate({
    content,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    steps: [{ tools: [{ google_search: {} }], thinking: true }, { tools: [{ google_search: {} }], thinking: false }],
    accept: (r) => !!extractText(r.j),
  });
  if (!res.ok) return { op: op.name, added: 0, error: res.error };
  const items = parseArr(extractText(res.j)).filter((x) => x && x.title_uz && x.body_uz).slice(0, 3);
  const recent = await query("news", { orderBy: "createdAt", limit: 80 }).catch(() => []);
  const seen = new Set(recent.map((n) => n.key).filter(Boolean));
  let added = 0;
  for (const x of items) {
    const key = keyOf(x.title_uz);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    await createDoc(`news/${randomId(20)}`, {
      title: { uz: String(x.title_uz).slice(0, 160), ru: String(x.title_ru || x.title_uz).slice(0, 160) },
      body: { uz: String(x.body_uz).slice(0, 1500), ru: String(x.body_ru || x.body_uz).slice(0, 1500) },
      op: op.id || "", img: "", status: publish ? "published" : "draft", ai: true, key,
    }, { serverTime: ["createdAt"] });
    added++;
    await tgSend(`📰 <b>AI yangilik ${publish ? "chop etdi" : "tayyorladi (tasdiq kutilmoqda)"}</b>\n<b>${h(x.title_uz)}</b>\n${h(String(x.body_uz).slice(0, 400))}${x.url ? `\n🔗 Manba (faqat adminlar uchun): ${h(x.url)}` : ""}`, { chats: await adminChats("news") }).catch(() => {});
  }
  return { op: op.name, added };
}

export async function runNews(content, { opIds, publish } = {}) {
  const ops = (content?.operators || []).filter((o) => !o.hidden && o.name && (!opIds || opIds.includes(o.id)));
  const pub = publish ?? !!content?.newsCfg?.autoPublish;
  return Promise.all(ops.map((op) => newsForOperator(content, op, { publish: pub }).catch((e) => ({ op: op.name, added: 0, error: e.message }))));
}
