// Ilova (va kerak bo‘lsa sayt) foydalanuvchilarining fikr-mulohazasi: bazaga yoziladi va adminlarga Telegram’da boradi.
import { json, ready, createDoc, randomId, tgSend, h, adminChats, limited, ipOf } from "../lib/fs.mjs";

const APP_ORIGINS = new Set(["https://urgut-ussd.netlify.app", "https://appassets.androidplatform.net"]);
const str = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);

export default async (req, context) => {
  const origin = req.headers.get("origin") || "";
  const cors = APP_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" } : {};
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const res = await handle(req, context);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
};

async function handle(req, context) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (limited("fb:" + ipOf(req, context), 4)) return json({ error: "rate" }, 429);
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const stars = Math.max(0, Math.min(5, Math.round(Number(b.stars) || 0)));
  const text = str(b.text, 1000);
  const phone = str(b.phone, 30).replace(/[^\d+ ]/g, "");
  if (!stars && text.length < 3) return json({ error: "empty" }, 400);
  const src = b.src === "app" ? "📱 Mobil ilova" : "🌐 Sayt";
  const doc = { stars, text, phone, lang: b.lang === "ru" ? "ru" : "uz", src: b.src === "app" ? "app" : "site", app: str(b.app, 20), status: "new" };
  if (ready()) await createDoc(`feedback/${randomId(20)}`, doc, { serverTime: ["createdAt"] }).catch(() => {});
  const msg = `💬 <b>Yangi fikr</b> · ${src}\n${stars ? "⭐".repeat(stars) + "☆".repeat(5 - stars) + "\n" : ""}${text ? h(text) + "\n" : ""}${phone ? `📞 ${h(phone)}` : "📞 telefon qoldirilmagan"}`;
  const sent = await tgSend(msg, { chats: await adminChats("requests") }).catch(() => false);
  return json({ ok: true, sent: !!sent });
}

export const config = { path: "/api/feedback" };
