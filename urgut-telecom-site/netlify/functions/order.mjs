// Onlayn ariza va buyurtmalarni qabul qiladi (sayt va bot uchun bitta joy).
import { botKeyOk, adminChats, randomId, json, ready, siteContent, getDoc, createDoc, patchDoc, tgSend, h, isOpen, fmtSum, limited, ipOf } from "../lib/fs.mjs";
import { L, num, cleanCode, checkPromo, deliveryFor, nasiyaPlan } from "../lib/shop.mjs";

const str = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const rid = () => randomId(20);
const code6 = () => randomId(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!ready()) return json({ error: "Server sozlanmagan (FIREBASE_SERVICE_ACCOUNT)", code: "setup" }, 503);
  const isBot = botKeyOk(req);
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const rateKey = isBot ? "order:bot:" + String(b.tgId || "") : "order:" + ipOf(req, context);
  if (limited(rateKey, isBot ? 10 : 6)) return json({ error: "Juda ko‘p urinish. Bir daqiqadan keyin qayta yuboring.", code: "rate" }, 429);
  const lang = b.lang === "ru" ? "ru" : "uz";
  const c = await siteContent();
  if (!c) return json({ error: "Sayt ma’lumotlari topilmadi", code: "setup" }, 503);

  // Mijoz ma’lumotlari
  const name = str(b.name, 80);
  let phone = String(b.phone || "").replace(/\D/g, "");
  if (phone.length === 9) phone = "998" + phone;
  if (name.length < 2) return json({ error: "name", code: "name" }, 400);
  if (!/^998\d{9}$/.test(phone)) return json({ error: "phone", code: "phone" }, 400);

  const kind = ["service", "shop", "number"].includes(b.kind) ? b.kind : "service";
  const r = {
    kind, name, phone: "+" + phone, lang, status: "new",
    src: isBot ? "bot" : ["site", "ai", "offer"].includes(b.src) ? b.src : "site",
    note: str(b.note, 600), details: {}, items: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0,
  };
  if (isBot && b.tgId && /^\d{4,15}$/.test(String(b.tgId))) { r.tgId = String(b.tgId); if (b.tgUser) r.tgUser = String(b.tgUser).replace(/[^\w]/g, "").slice(0, 40); }

  let svc = null, scope = "services";
  if (kind === "service") {
    const i = Number(b.svc);
    svc = Number.isInteger(i) ? (c.services || [])[i] : null;
    if (!svc) return json({ error: "service", code: "service" }, 400);
    r.service = L(svc.title, "uz");
    r.skind = svc.kind || "other";
    const op = (c.operators || []).find((o) => o.id === b.op);
    if (op) r.op = op.name;
    const d = b.details || {};
    if (r.skind === "sim") r.details.simType = d.simType === "esim" ? "eSIM" : "Oddiy SIM";
    if (r.skind === "gov") {
      const g = (c.gov || [])[Number(d.gov)];
      r.details.gov = g ? L(g, "uz") : str(d.govOther, 160);
      if (!r.details.gov) return json({ error: "gov", code: "gov" }, 400);
    }
    if (r.skind === "travel") {
      r.details.from = str(d.from, 60); r.details.to = str(d.to, 60); r.details.date = str(d.date, 20);
    }
  } else if (kind === "shop") {
    scope = "shop";
    if (c.shop?.enabled === false) return json({ error: "shop off", code: "off" }, 400);
    const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
    if (!items.length) return json({ error: "cart", code: "cart" }, 400);
    for (const it of items) {
      const pid = String(it.pid || "");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(pid)) return json({ error: "item", code: "item" }, 400);
      const p = await getDoc(`products/${pid}`);
      if (!p || p.hidden) return json({ error: "item", code: "item", pid }, 400);
      const vars = Array.isArray(p.variants) && p.variants.length ? p.variants : [{ price: p.price, status: p.status }];
      const v = vars[Math.max(0, Math.min(vars.length - 1, Number(it.v) || 0))];
      if ((v.status || p.status) === "out") return json({ error: "out", code: "out", pid }, 400);
      const qty = Math.max(1, Math.min(10, Math.floor(Number(it.qty) || 1)));
      const price = num(v.price ?? p.price);
      const label = [p.brand, p.name].filter(Boolean).join(" ") + ([v.mem, v.color].filter(Boolean).length ? ` (${[v.mem, v.color].filter(Boolean).join(", ")})` : "");
      r.items.push({ pid, name: label.slice(0, 160), qty, price });
      r.subtotal += price * qty;
    }
    r.service = "Do‘kon buyurtmasi";
  } else {
    scope = "numbers";
    const n = await getDoc(`numbers/${String(b.num || "").replace(/[^A-Za-z0-9_-]/g, "")}`);
    if (!n || n.status === "sold" || n.status === "reserved") return json({ error: "number", code: "number" }, 400);
    const op = (c.operators || []).find((o) => o.id === n.op);
    r.items.push({ pid: n.id, name: `${n.num}${op ? " · " + op.name : ""}`, qty: 1, price: num(n.price) });
    r.subtotal = num(n.price);
    r.op = op?.name || "";
    r.service = "Chiroyli raqam";
    r.numId = n.id;
  }

  // Yetkazib berish yoki ofis
  const dl = deliveryFor(c, kind, svc);
  if (b.fulfil === "delivery") {
    if (!dl.allowed) return json({ error: "delivery off", code: "delivery" }, 400);
    r.fulfil = "delivery";
    r.address = str(b.address, 300);
    const lat = Number(b.loc?.lat), lng = Number(b.loc?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) r.loc = { lat, lng };
    if (!r.address && !r.loc) return json({ error: "address", code: "address" }, 400);
    r.deliveryFee = dl.fee;
  } else {
    r.fulfil = "office";
    const br = (c.branches || []).filter((x) => !x.hidden);
    r.branch = str(b.branch, 120) || (br[0] ? L(br[0].name, "uz") : "");
  }

  // Promokod
  if (b.promo && c.promo?.enabled) {
    const pr = await checkPromo(c, b.promo, scope, r.subtotal);
    if (!pr.ok) return json({ error: "promo", code: "promo", reason: pr.err, min: pr.min }, 400);
    r.promo = pr.code;
    r.discount = pr.discount;
  }
  if (b.ref && c.ref?.enabled) r.ref = cleanCode(b.ref);
  r.total = Math.max(0, r.subtotal - r.discount) + r.deliveryFee;

  // Muddatli to‘lov
  if (b.pay === "nasiya" && kind === "shop") {
    const plan = nasiyaPlan(c, r.total, b.months);
    if (!plan) return json({ error: "nasiya", code: "nasiya" }, 400);
    r.pay = "nasiya"; r.nasiya = plan;
  } else r.pay = "cash";

  r.code = code6();
  r.afterHours = !isOpen(c.hours);
  const id = rid();
  await createDoc(`requests/${id}`, r, { serverTime: ["createdAt"] });
  if (r.promo) patchDoc(`promos/${r.promo}`, {}, { inc: { used: 1 } }).catch(() => {});
  if (r.numId) patchDoc(`numbers/${r.numId}`, { status: "reserved" }).catch(() => {});

  // Telegram xabari
  const srcTxt = { ai: "UrgutTelecom AI orqali", offer: "Takliflardan", bot: "Bot orqali" }[r.src] || "Saytdan";
  const lines = [
    `🆕 <b>${kind === "shop" ? "Yangi buyurtma" : "Yangi ariza"}</b> #${r.code}`,
    `👤 ${h(r.name)}  📞 ${h(r.phone)}`,
    `🛎 ${h(r.service)}${r.op ? " · " + h(r.op) : ""}`,
    ...Object.entries(r.details).filter(([, v]) => v).map(([k, v]) => `• ${({ simType: "SIM turi", gov: "Davlat xizmati", from: "Qayerdan", to: "Qayerga", date: "Sana" })[k] || k}: ${h(v)}`),
    ...r.items.map((it) => `• ${h(it.name)} × ${it.qty} = ${fmtSum(it.price * it.qty)} so‘m`),
    r.fulfil === "delivery" ? `🚚 Yetkazib berish${r.address ? ": " + h(r.address) : ""}${r.loc ? `\n📍 https://maps.google.com/?q=${r.loc.lat},${r.loc.lng}` : ""}` : `🏢 Ofisda: ${h(r.branch)}`,
    r.promo ? `🎟 Promokod: ${h(r.promo)} (−${fmtSum(r.discount)} so‘m)` : "",
    r.total ? `💰 Jami: <b>${fmtSum(r.total)} so‘m</b>${r.deliveryFee ? ` (yetkazish ${fmtSum(r.deliveryFee)})` : ""}` : "",
    r.pay === "nasiya" ? `📆 Muddatli to‘lov: ${r.nasiya.months} oy × ${fmtSum(r.nasiya.monthly)} so‘m` : "",
    r.note ? `💬 ${h(r.note)}` : "",
    `🌐 ${srcTxt}${lang === "ru" ? " · RU" : ""}${r.afterHours ? " · ish vaqtidan tashqari" : ""}`,
  ].filter(Boolean);
  const btn = (t, s) => ({ text: t, callback_data: `rq:${id}:${s}` });
  const buttons = [[btn("✅ Qabul qildim", "work"), ...(r.fulfil === "delivery" ? [btn("🚚 Yo‘lda", "onway")] : [])], [btn("✔️ Bajarildi", "done"), btn("❌ Bekor", "cancel")]];
  if (r.tgUser) lines.push(`💬 Telegram: @${r.tgUser}`);
  await tgSend(lines.join("\n"), { chats: await adminChats("requests"), buttons }).catch(() => {});

  return json({ ok: true, code: r.code, total: r.total, afterHours: r.afterHours });
};

export const config = { path: "/api/order" };
