// AI boshqaruv (faqat adminlar uchun): oddiy so‘z bilan buyruq beriladi, AI har bir o‘zgarishni
// avval ko‘rsatadi, admin “Tasdiqlash”ni bosgandan keyingina bajaradi. Hamma amallar jurnalga yoziladi.
import {
  json, ready, verifyAdmin, botKeyOk, siteContent, saveSiteContent, listDocs, query, getDoc, createDoc, patchDoc, setDoc,
  deleteDoc, randomId, tgSend, fmtSum,
} from "../lib/fs.mjs";
import { generate, extractText, functionCalls, searchedOf, currentModel } from "../lib/gemini.mjs";
import { requestsSince, summarize, dayStart, STATUS } from "../lib/stats.mjs";
import { runNews } from "../lib/news.mjs";
// Chiroyli raqam: ariza bekor qilinsa yana sotuvga chiqadi, bajarilsa — sotilgan
const numStatus = (st) => (st === "cancel" ? "free" : st === "done" ? "sold" : "reserved");
import { buildReport } from "../lib/report.mjs";
import { num, cleanCode, memL } from "../lib/shop.mjs";

const S = (description) => ({ type: "string", description });
const N = (description) => ({ type: "number", description });
const fn = (name, description, props = {}, required = []) => ({ name, description, parameters: { type: "object", properties: props, required } });

const READ = {
  get_site: fn("get_site", "Sayt sozlamalari/matnlaridan bo‘limni o‘qish. key bo‘sh bo‘lsa bo‘limlar ro‘yxati.", { key: S("Bo‘lim nomi, masalan services, delivery, hours, operators, gov") }),
  list_requests: fn("list_requests", "Arizalar/buyurtmalar ro‘yxati (yangi birinchi).", { status: S("new|work|onway|done|cancel yoki bo‘sh"), search: S("Ism, telefon, kod yoki xizmat bo‘yicha qidiruv"), limit: N("Nechta (ko‘pi 50)") }),
  list_products: fn("list_products", "Do‘kon mahsulotlari ro‘yxati.", { search: S("Qidiruv so‘zi") }),
  list_news: fn("list_news", "Yangiliklar ro‘yxati.", { status: S("published|draft yoki bo‘sh") }),
  list_promos: fn("list_promos", "Promokodlar ro‘yxati."),
  list_numbers: fn("list_numbers", "Chiroyli raqamlar ro‘yxati.", { status: S("free|reserved|sold yoki bo‘sh") }),
  stats: fn("stats", "Arizalar statistikasi.", { days: N("Necha kunlik (1 = bugun)") }),
};
const WRITE = {
  update_site: fn("update_site", "Sayt sozlamasi yoki matnini o‘zgartirish. path nuqta bilan: masalan delivery.price, hours.close, services.2.text.uz, promo.enabled. op=push ro‘yxatga qo‘shadi, op=remove ro‘yxatdan o‘chiradi (path oxiri indeks).", { path: S("Yo‘l"), value: S("Yangi qiymat JSON ko‘rinishida: \"matn\", 25000, true, {\"uz\":\"..\",\"ru\":\"..\"}"), op: S("set|push|remove") }, ["path"]),
  set_request_status: fn("set_request_status", "Ariza holatini o‘zgartirish.", { code: S("Ariza kodi (6 belgi)"), status: S("new|work|onway|done|cancel"), note: S("Admin izohi (ixtiyoriy)") }, ["code", "status"]),
  save_product: fn("save_product", "Mahsulot qo‘shish yoki tahrirlash. data JSON: {cat, brand, name, desc:{uz,ru}, specs, warranty, status(in|out|order), hidden, variants:[{color,hex,ram,mem,price,old,status}] (ram — operativ xotira, masalan 8GB; mem — asosiy xotira, masalan 256GB), imgs:[]}. Tahrirda faqat o‘zgaradigan maydonlar.", { id: S("Mavjud mahsulot ID (yangi bo‘lsa bo‘sh)"), data: S("JSON") }, ["data"]),
  delete_product: fn("delete_product", "Mahsulotni o‘chirish.", { id: S("Mahsulot ID") }, ["id"]),
  save_news: fn("save_news", "Yangilik qo‘shish yoki tahrirlash. data JSON: {title:{uz,ru}, body:{uz,ru}, status(published|draft), op, img}.", { id: S("Mavjud yangilik ID (yangi bo‘lsa bo‘sh)"), data: S("JSON") }, ["data"]),
  delete_news: fn("delete_news", "Yangilikni o‘chirish.", { id: S("Yangilik ID") }, ["id"]),
  save_promo: fn("save_promo", "Promokod yaratish yoki tahrirlash. data JSON: {type(percent|sum), value, scope(all|shop|services|numbers), minTotal, expires(YYYY-MM-DD), maxUses, active}.", { code: S("Promokod"), data: S("JSON") }, ["code", "data"]),
  delete_promo: fn("delete_promo", "Promokodni o‘chirish.", { code: S("Promokod") }, ["code"]),
  save_number: fn("save_number", "Chiroyli raqam qo‘shish yoki tahrirlash. data JSON: {num:\"99 777 77 77\", op, price, tier, status(free|reserved|sold)}.", { id: S("Mavjud ID (yangi bo‘lsa bo‘sh)"), data: S("JSON") }, ["data"]),
  delete_number: fn("delete_number", "Chiroyli raqamni o‘chirish.", { id: S("ID") }, ["id"]),
  fetch_news_now: fn("fetch_news_now", "AI hozir operatorlarning rasmiy saytlaridan yangiliklar qidirsin.", { operator: S("Operator ID (bo‘sh = hammasi)") }),
  send_report_now: fn("send_report_now", "Kechagi kun hisobotini hozir Telegram’ga yuborish."),
  set_requests_status: fn("set_requests_status", "Bir nechta arizaning holatini birdaniga o‘zgartirish (masalan, hamma yangi arizalarni qabul qilish: from=new, to=work). Mijozga holat haqida bot orqali avtomatik xabar boradi.", { from: S("Qaysi holatdagilar: new|work|onway|done|cancel|all"), to: S("Yangi holat: work|onway|done|cancel"), codes: S("Faqat shu kodlar, vergul bilan (ixtiyoriy)"), days: N("Oxirgi necha kun (ixtiyoriy, standart 60)") }, ["from", "to"]),
  message_customers: fn("message_customers", "Ariza qoldirgan mijozlarga Telegram bot orqali xabar yuborish (masalan, “Tanlovingiz uchun rahmat”). Faqat bot orqali kelgan arizalar egalariga yetadi; saytdan kelganlarda faqat telefon bor.", { text: S("Xabar matni (mijoz tilida, xushmuomala)"), status: S("Qaysi holatdagi arizalar egalariga: new|work|onway|done|cancel|all"), codes: S("Faqat shu kodlar, vergul bilan (ixtiyoriy)"), days: N("Oxirgi necha kun (ixtiyoriy, standart 60)") }, ["text"]),
};

// Ariza tanlash (ommaviy amallar uchun)
async function pickRequests({ status, codes, days }) {
  const list = String(codes || "").split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const since = new Date(Date.now() - Math.min(365, Math.max(1, Number(days) || 60)) * 86400e3);
  let rows = await requestsSince(since);
  if (list.length) rows = rows.filter((r) => list.includes(String(r.code || "").toUpperCase()));
  if (status && status !== "all") rows = rows.filter((r) => (r.status || "new") === status);
  return rows;
}
async function tgOne(chat, text) {
  const token = (globalThis.Netlify?.env?.get?.("TG_BOT_TOKEN") ?? (typeof process !== "undefined" ? process.env?.TG_BOT_TOKEN : "")) || "";
  if (!token) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }) }).catch(() => null);
  return !!r?.ok;
}
const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const parse = (v) => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};
const short = (v, n = 160) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + "…" : s;
};
const stripMedia = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "string" && v.startsWith("data:") ? "[rasm]" : v)));

function pathGet(o, path) {
  return String(path).split(".").reduce((x, k) => (x == null ? undefined : x[/^\d+$/.test(k) ? +k : k]), o);
}
function pathApply(o, path, op, value) {
  const keys = String(path).split(".").filter(Boolean);
  if (!keys.length || keys.some((k) => k === "__proto__" || k === "constructor" || k === "prototype")) throw new Error("Noto‘g‘ri yo‘l");
  let cur = o;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = /^\d+$/.test(keys[i]) ? +keys[i] : keys[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    cur = cur[k];
  }
  const last = /^\d+$/.test(keys.at(-1)) ? +keys.at(-1) : keys.at(-1);
  if (op === "push") {
    if (!Array.isArray(cur[last])) cur[last] = [];
    cur[last].push(value);
  } else if (op === "remove") {
    if (!Array.isArray(cur) || typeof last !== "number") throw new Error("remove uchun ro‘yxat indeksi kerak");
    cur.splice(last, 1);
  } else cur[last] = value;
}

const reqShort = (r) => ({
  code: r.code, status: STATUS[r.status || "new"], name: r.name, phone: r.phone, service: r.service, op: r.op,
  items: (r.items || []).map((i) => `${i.name} ×${i.qty}`), total: r.total, fulfil: r.fulfil, createdAt: r.createdAt, handledBy: r.handledBy,
});

async function runRead(name, a) {
  if (name === "get_site") {
    const c = stripMedia((await siteContent(0)) || {});
    if (!a.key) return { sections: Object.keys(c) };
    return { [a.key]: pathGet(c, a.key) ?? null };
  }
  if (name === "list_requests") {
    let list = await query("requests", { orderBy: "createdAt", limit: 300 });
    if (a.status) list = list.filter((r) => (r.status || "new") === a.status);
    if (a.search) {
      const q = String(a.search).toLowerCase();
      list = list.filter((r) => [r.name, r.phone, r.code, r.service, r.op].join(" ").toLowerCase().includes(q));
    }
    return { count: list.length, items: list.slice(0, Math.min(50, Number(a.limit) || 20)).map(reqShort) };
  }
  if (name === "list_products") {
    let list = await listDocs("products");
    if (a.search) {
      const q = String(a.search).toLowerCase();
      list = list.filter((p) => [p.brand, p.name, p.cat].join(" ").toLowerCase().includes(q));
    }
    return list.slice(0, 80).map((p) => ({ id: p.id, cat: p.cat, brand: p.brand, name: p.name, status: p.status, hidden: !!p.hidden, variants: p.variants }));
  }
  if (name === "list_news") {
    let list = await query("news", { orderBy: "createdAt", limit: 60 });
    if (a.status) list = list.filter((x) => x.status === a.status);
    return list.map((x) => ({ id: x.id, title: x.title?.uz, status: x.status, ai: !!x.ai, createdAt: x.createdAt }));
  }
  if (name === "list_promos") return (await listDocs("promos")).map(({ _ut, ...p }) => p);
  if (name === "list_numbers") {
    let list = await listDocs("numbers");
    if (a.status) list = list.filter((x) => (x.status || "free") === a.status);
    return list.slice(0, 100).map(({ _ut, ...x }) => x);
  }
  if (name === "stats") {
    const days = Math.max(1, Math.min(90, Number(a.days) || 7));
    return { days, ...summarize(await requestsSince(dayStart(days - 1))) };
  }
  return { error: "noma’lum" };
}

// Tasdiqlash oynasida ko‘rinadigan tushuntirish
async function describe(name, a) {
  const d = parse(a.data);
  switch (name) {
    case "update_site": {
      const old = pathGet((await siteContent(0)) || {}, a.path);
      const op = a.op || "set";
      return op === "push" ? `“${a.path}” ro‘yxatiga qo‘shiladi: ${short(parse(a.value))}`
        : op === "remove" ? `“${a.path}” o‘chiriladi (hozir: ${short(stripMedia(old ?? null))})`
        : `Sozlama “${a.path}”: ${short(stripMedia(old ?? null), 80)} → ${short(parse(a.value))}`;
    }
    case "set_request_status": return `Ariza #${String(a.code).toUpperCase()} holati → ${STATUS[a.status] || a.status}${a.note ? ` (izoh: ${a.note})` : ""}`;
    case "set_requests_status": {
      const rows = (await pickRequests({ status: a.from, codes: a.codes, days: a.days })).filter((r) => r.status !== a.to);
      return `${rows.length} ta ariza holati → ${STATUS[a.to] || a.to}${a.from && a.from !== "all" ? ` (hozir: ${STATUS[a.from] || a.from})` : ""}`;
    }
    case "message_customers": {
      const rows = await pickRequests({ status: a.status || "all", codes: a.codes, days: a.days });
      const n = new Set(rows.filter((r) => r.tgId).map((r) => String(r.tgId))).size;
      return `${n} ta mijozga Telegram xabari: “${short(a.text, 200)}”` + (rows.length - rows.filter((r) => r.tgId).length ? ` (${rows.length - rows.filter((r) => r.tgId).length} ta saytdan kelgan arizada Telegram yo‘q)` : "");
    }
    case "save_product": return `${a.id ? "Mahsulot tahrirlanadi" : "Yangi mahsulot qo‘shiladi"}: ${short([d?.brand, d?.name].filter(Boolean).join(" ") || a.id)}${Array.isArray(d?.variants) ? ` — ${d.variants.map((v) => `${[memL(v), v.color].filter(Boolean).join(" ")} ${fmtSum(v.price)} so‘m`).join("; ")}` : ""}`;
    case "delete_product": return `Mahsulot o‘chiriladi: ${a.id}`;
    case "save_news": return `${a.id ? "Yangilik tahrirlanadi" : "Yangi yangilik"}: “${short(d?.title?.uz || a.id, 90)}” (${d?.status === "draft" ? "qoralama" : "chop etiladi"})`;
    case "delete_news": return `Yangilik o‘chiriladi: ${a.id}`;
    case "save_promo": return `Promokod ${cleanCode(a.code)}: ${d?.type === "sum" ? fmtSum(d?.value) + " so‘m" : (d?.value ?? "") + "%"} chegirma${d?.expires ? `, ${d.expires} gacha` : ""}${d?.maxUses ? `, ${d.maxUses} marta` : ""}`;
    case "delete_promo": return `Promokod o‘chiriladi: ${cleanCode(a.code)}`;
    case "save_number": return `${a.id ? "Raqam tahrirlanadi" : "Chiroyli raqam qo‘shiladi"}: ${d?.num || a.id}${d?.price ? ` — ${fmtSum(d.price)} so‘m` : ""}`;
    case "delete_number": return `Raqam o‘chiriladi: ${a.id}`;
    case "fetch_news_now": return `AI hozir ${a.operator || "barcha operatorlar"} bo‘yicha yangilik qidiradi`;
    case "send_report_now": return "Kechagi hisobot hozir Telegram’ga yuboriladi";
  }
  return name;
}

const cleanProduct = (d) => {
  const o = {};
  for (const k of ["cat", "brand", "name", "specs", "warranty", "status"]) if (d[k] !== undefined) o[k] = String(d[k]).slice(0, 2000);
  if (d.desc) o.desc = { uz: String(d.desc.uz || "").slice(0, 3000), ru: String(d.desc.ru || "").slice(0, 3000) };
  if (d.hidden !== undefined) o.hidden = !!d.hidden;
  if (Array.isArray(d.imgs)) o.imgs = d.imgs.filter((x) => typeof x === "string" && /^https:\/\//.test(x)).slice(0, 10);
  if (Array.isArray(d.variants)) o.variants = d.variants.slice(0, 30).map((v) => ({
    color: String(v.color || "").slice(0, 40), hex: /^#[0-9a-f]{6}$/i.test(v.hex || "") ? v.hex : "", ram: String(v.ram || "").slice(0, 20), mem: String(v.mem || "").slice(0, 40),
    price: num(v.price), old: num(v.old), status: ["in", "out", "order"].includes(v.status) ? v.status : "in",
  }));
  return o;
};

async function runWrite(name, a, who) {
  const d = parse(a.data) || {};
  switch (name) {
    case "update_site": {
      const c = (await siteContent(0)) || {};
      pathApply(c, a.path, a.op || "set", parse(a.value));
      if (JSON.stringify(c).length > 900_000) throw new Error("Ma’lumot juda katta bo‘lib ketadi");
      await saveSiteContent(c, who.email);
      return "Saqlandi";
    }
    case "set_request_status": {
      if (!STATUS[a.status]) throw new Error("Holat noto‘g‘ri");
      const [r] = await query("requests", { where: [["code", "EQUAL", String(a.code).toUpperCase()]], limit: 1 });
      if (!r) throw new Error("Ariza topilmadi");
      await patchDoc(`requests/${r.id}`, { status: a.status, handledBy: who.email, ...(a.note ? { anote: String(a.note).slice(0, 300) } : {}) }, { serverTime: ["statusAt"] });
      if (r.numId) await patchDoc(`numbers/${r.numId}`, { status: numStatus(a.status) }).catch(() => {});
      return `#${r.code} → ${STATUS[a.status]}`;
    }
    case "save_product": {
      const id = a.id || randomId(16);
      if (a.id && !(await getDoc(`products/${id}`))) throw new Error("Mahsulot topilmadi");
      await setDoc(`products/${id}`, { ...cleanProduct(d), ...(a.id ? {} : { createdAt: new Date() }) });
      return `Mahsulot saqlandi (ID ${id})`;
    }
    case "delete_product": await deleteDoc(`products/${a.id}`); return "O‘chirildi";
    case "save_news": {
      const id = a.id || randomId(20);
      const o = {};
      if (d.title) o.title = { uz: String(d.title.uz || "").slice(0, 160), ru: String(d.title.ru || d.title.uz || "").slice(0, 160) };
      if (d.body) o.body = { uz: String(d.body.uz || "").slice(0, 3000), ru: String(d.body.ru || d.body.uz || "").slice(0, 3000) };
      if (d.status) o.status = d.status === "draft" ? "draft" : "published";
      if (d.op !== undefined) o.op = String(d.op);
      if (d.img !== undefined) o.img = String(d.img);
      if (!a.id) { o.status = o.status || "published"; o.ai = false; o.createdAt = new Date(); }
      await setDoc(`news/${id}`, o);
      return `Yangilik saqlandi (ID ${id})`;
    }
    case "delete_news": await deleteDoc(`news/${a.id}`); return "O‘chirildi";
    case "save_promo": {
      const code = cleanCode(a.code);
      if (!code) throw new Error("Promokod bo‘sh");
      const o = {};
      if (d.type) o.type = d.type === "sum" ? "sum" : "percent";
      if (d.value !== undefined) o.value = num(d.value);
      if (d.scope) o.scope = ["all", "shop", "services", "numbers"].includes(d.scope) ? d.scope : "all";
      if (d.minTotal !== undefined) o.minTotal = num(d.minTotal);
      if (d.expires !== undefined) o.expires = /^\d{4}-\d{2}-\d{2}$/.test(d.expires) ? d.expires : "";
      if (d.maxUses !== undefined) o.maxUses = Math.floor(num(d.maxUses));
      if (d.active !== undefined) o.active = !!d.active;
      const ex = await getDoc(`promos/${code}`);
      await setDoc(`promos/${code}`, ex ? o : { type: "percent", value: 0, scope: "all", minTotal: 0, expires: "", maxUses: 0, active: true, used: 0, ...o });
      return `Promokod ${code} saqlandi`;
    }
    case "delete_promo": await deleteDoc(`promos/${cleanCode(a.code)}`); return "O‘chirildi";
    case "save_number": {
      const id = a.id || randomId(12);
      const o = {};
      if (d.num) o.num = String(d.num).slice(0, 30);
      if (d.op !== undefined) o.op = String(d.op);
      if (d.price !== undefined) o.price = num(d.price);
      if (d.tier !== undefined) o.tier = String(d.tier).slice(0, 30);
      if (d.status) o.status = ["free", "reserved", "sold"].includes(d.status) ? d.status : "free";
      if (!a.id) o.status = o.status || "free";
      await setDoc(`numbers/${id}`, o);
      return `Raqam saqlandi (ID ${id})`;
    }
    case "delete_number": await deleteDoc(`numbers/${a.id}`); return "O‘chirildi";
    case "fetch_news_now": {
      const r = await runNews(await siteContent(0), { opIds: a.operator ? [a.operator] : undefined });
      if (r.length && r.every((x) => x.error) && new Set(r.map((x) => x.error)).size === 1) throw new Error(r[0].error);
      const n = r.reduce((a, x) => a + (x.added || 0), 0);
      return `${n} ta yangi yangilik` + (n ? ": " + r.filter((x) => x.added).map((x) => `${x.op} — ${x.added}`).join(", ") : " topilmadi (operatorlarda so‘nggi 14 kunda yangilik yo‘q yoki hammasi avval qo‘shilgan)");
    }
    case "send_report_now": await tgSend(await buildReport(await siteContent(0))); return "Yuborildi";
    case "set_requests_status": {
      if (!STATUS[a.to]) throw new Error("Yangi holat noto‘g‘ri");
      const rows = (await pickRequests({ status: a.from, codes: a.codes, days: a.days })).filter((r) => r.status !== a.to).slice(0, 200);
      for (const r of rows) {
        await patchDoc(`requests/${r.id}`, { status: a.to, handledBy: who.email }, { serverTime: ["statusAt"] });
        if (r.numId) await patchDoc(`numbers/${r.numId}`, { status: numStatus(a.to) }).catch(() => {});
      }
      return rows.length ? `${rows.length} ta ariza → ${STATUS[a.to]} (${rows.map((r) => "#" + r.code).slice(0, 15).join(", ")}${rows.length > 15 ? "…" : ""})` : "Mos ariza topilmadi";
    }
    case "message_customers": {
      const text = String(a.text || "").trim().slice(0, 3000);
      if (text.length < 2) throw new Error("Xabar matni bo‘sh");
      const rows = await pickRequests({ status: a.status || "all", codes: a.codes, days: a.days });
      const chats = [...new Set(rows.filter((r) => r.tgId).map((r) => String(r.tgId)))].slice(0, 300);
      const noTg = rows.filter((r) => !r.tgId).length;
      let ok = 0;
      for (const c of chats) if (await tgOne(c, `📩 <b>URGUT TELECOM</b>\n\n${esc(text)}`)) ok++;
      return `${ok} ta mijozga yuborildi` + (chats.length - ok ? `, ${chats.length - ok} tasiga yetmadi (botni bloklagan)` : "") + (noTg ? `; ${noTg} ta ariza saytdan — ularda Telegram yo‘q, faqat telefon` : "");
    }
  }
  throw new Error("Noma’lum amal");
}

function systemPrompt(c, who) {
  const snap = stripMedia({
    services: (c?.services || []).map((s, i) => `${i}: ${s.title?.uz} [kind=${s.kind || "other"}, online=${!!s.online}, delivery=${!!s.delivery}]`),
    operators: (c?.operators || []).map((o) => `${o.id}: ${o.name}`),
    shopCats: (c?.shopCats || []).map((x) => `${x.id}: ${x.name?.uz}`),
    toggles: { shop: c?.shop, nums: c?.nums, newsCfg: c?.newsCfg, promo: c?.promo, ref: c?.ref, nasiya: c?.nasiya, delivery: c?.delivery, contact: c?.contact, remind: c?.remind, report: c?.report, channel: c?.channel },
    hours: c?.hours, phones: c?.phones, gov: (c?.gov || []).map((g) => g.uz),
  });
  return `Sen URGUT TELECOM sayti va botining AI boshqaruvchisisan. Admin (${who.email}) bilan o‘zbek tilida qisqa gaplash.
Admin buyurganda tegishli funksiyani chaqir. O‘zgartiradigan funksiyalarni chaqirganingda tizim adminga o‘zi tasdiqlash oynasini ko‘rsatadi — matnda “ishonchingiz komilmi” deb so‘rama, to‘g‘ridan-to‘g‘ri funksiyani chaqir.
Kerak bo‘lsa avval o‘qish funksiyalari (get_site, list_…) bilan aniq ma’lumot ol, taxmin qilma. Bir buyruqda bir nechta o‘zgarish kerak bo‘lsa, hammasini birdaniga chaqir.
Matnlar ikki tilda saqlanadi ({uz, ru}) — o‘zgartirsang ikkalasini ham yoz. Narxlar so‘mda, faqat raqam.
Sayt sozlamalari bo‘limlari: brand, phones, hours, socials, slides, services, operators, offers, about, founder, branches, gov, delivery{enabled,paid,price}, contact{address,location}, promo{enabled}, ref{enabled,bonusType,bonus}, nasiya{enabled,months,percent}, shop{enabled}, shopCats, nums{enabled}, newsCfg{enabled,ai,autoPublish}, reviewsCfg{enabled}, ai{enabled,name,greet,notes,web,model}, remind{enabled,minutes}, report{enabled}, channel{enabled,id,url}, afterHours{uz,ru}.
Hozirgi holat (qisqa): ${JSON.stringify(snap)}`;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!ready()) return json({ error: "Server sozlanmagan: Netlify’ga FIREBASE_SERVICE_ACCOUNT qo‘shing" }, 503);
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  let who = null;
  if (botKeyOk(req) && b.botAdmin && /^\d{4,15}$/.test(String(b.botAdmin.tgId || ""))) {
    // Botdagi admin: botAdmins ro‘yxatida bo‘lishi va AI ruxsati bo‘lishi kerak
    const a = await getDoc(`botAdmins/${b.botAdmin.tgId}`).catch(() => null);
    if (a && (a.role === "super" || a.perms?.ai)) who = { uid: "tg" + b.botAdmin.tgId, email: `tg:${String(a.name || b.botAdmin.name || b.botAdmin.tgId).slice(0, 40)}`, role: a.role || "admin" };
  } else {
    try { who = await verifyAdmin(b.idToken); } catch (e) { return json({ error: e.message }, 503); }
  }
  if (!who) return json({ error: "Ruxsat yo‘q. Qaytadan kiring." }, 401);
  const c = await siteContent(0);

  if (b.mode === "test") {
    const model = String(b.model || "").trim() || currentModel(c);
    const t0 = Date.now();
    const plain = await generate({ content: c, onlyModel: model, contents: [{ role: "user", parts: [{ text: "Faqat OK deb javob ber." }] }], steps: [{ tools: [], thinking: false }] });
    if (!plain.ok) return json({ ok: false, model, error: plain.error || `Xato ${plain.status}`, detail: plain.j?.error?.message || "" });
    const web = await generate({ content: c, onlyModel: model, contents: [{ role: "user", parts: [{ text: "Google Search bilan ucell.uz saytidan bitta tarif nomini top va faqat nomini yoz." }] }], steps: [{ tools: [{ google_search: {} }], thinking: false }] });
    return json({ ok: true, model, ms: Date.now() - t0, web: web.ok && searchedOf(web.j), webError: web.ok ? "" : web.error || `Xato ${web.status}`, sample: web.ok ? extractText(web.j).slice(0, 120) : "" });
  }

  if (b.mode === "exec") {
    const acts = Array.isArray(b.actions) ? b.actions.slice(0, 20) : [];
    const results = [];
    for (const x of acts) {
      if (!WRITE[x?.name]) { results.push({ name: x?.name, ok: false, msg: "Noma’lum amal" }); continue; }
      try {
        const msg = await runWrite(x.name, x.args || {}, who);
        results.push({ name: x.name, ok: true, msg });
      } catch (e) {
        results.push({ name: x.name, ok: false, msg: e.message });
      }
      createDoc(`ailog/${randomId(20)}`, { by: who.email, action: x.name, args: JSON.stringify(x.args || {}).slice(0, 3000), result: results.at(-1).msg, ok: results.at(-1).ok }, { serverTime: ["at"] }).catch(() => {});
    }
    return json({ ok: true, results });
  }

  // chat
  const hist = (Array.isArray(b.messages) ? b.messages : []).slice(-16)
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.slice(0, 4000) }] }));
  if (!hist.length || hist.at(-1).role !== "user") return json({ error: "Xabar bo‘sh" }, 400);
  const tools = [{ functionDeclarations: [...Object.values(READ), ...Object.values(WRITE)] }];
  const sys = systemPrompt(c, who);
  const contents = [...hist];
  const t0 = Date.now();
  let pinned = "";
  for (let i = 0; i < 6; i++) {
    if (i && Date.now() - t0 > 20000) return json({ text: "⏳ AI bu safar ulgurmadi (Gemini bepul rejasida daqiqasiga juda kam so‘rov ruxsat). Bir daqiqadan keyin buyruqni qayta yozing." });
    // Bir suhbat davomida bitta model: Gemini 3 “thought signature”lari boshqa modelga o‘tmaydi
    const res = await generate({ content: c, sys, contents, onlyModel: pinned || undefined, steps: [{ tools, thinking: true }, { tools, thinking: false }] });
    if (!res.ok) {
      const why = String(res.j?.error?.message || "").replace(/\s+/g, " ").slice(0, 220);
      return json({ error: (res.error || "AI javob bermadi") + (why ? ` — Google: ${why}` : "") }, 502);
    }
    pinned = res.model;
    const calls = functionCalls(res.j);
    const text = extractText(res.j);
    if (!calls.length) return json({ text: text || "Tushunmadim, aniqroq yozing." });
    const writes = calls.filter((x) => WRITE[x.name]);
    if (writes.length) {
      const pending = [];
      for (const w of writes) pending.push({ name: w.name, args: w.args || {}, summary: await describe(w.name, w.args || {}).catch(() => w.name) });
      return json({ text, pending });
    }
    contents.push(res.j.candidates[0].content);
    const responses = [];
    for (const x of calls) {
      let result;
      try { result = READ[x.name] ? await runRead(x.name, x.args || {}) : { error: "noma’lum funksiya" }; } catch (e) { result = { error: e.message }; }
      responses.push({ functionResponse: { name: x.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return json({ text: "Juda ko‘p qadam bo‘ldi. Buyruqni soddaroq yozing." });
};

export const config = { path: "/api/admin-ai" };
