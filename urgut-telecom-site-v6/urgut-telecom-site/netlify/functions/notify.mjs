// Yangi onlayn ariza haqida Telegram’ga xabar yuboradi.
// Netlify environment variables:
//   TG_BOT_TOKEN — @BotFather’dan olingan bot tokeni
//   TG_CHAT_ID   — xabar boradigan chat ID (bir nechta bo‘lsa vergul bilan: 123,456)
//   FIREBASE_PROJECT_ID — Firebase loyiha ID
// Xavfsizlik: funksiya mijozdan kelgan matnni emas, faqat ariza ID sini oladi va arizani
// Firestore’dan o‘zi o‘qiydi. Ariza faqat yaratilganidan keyin 10 daqiqa ichida o‘qiladi.

const env = (k) => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "").trim();
const ok = (b = { ok: true }, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const h = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const sent = new Set();

export default async (req) => {
  if (req.method !== "POST") return ok({ error: "method" }, 405);
  const token = env("TG_BOT_TOKEN"), chats = env("TG_CHAT_ID").split(/[,\s]+/).filter(Boolean), pid = env("FIREBASE_PROJECT_ID");
  if (!token || !chats.length || !pid) return ok({ ok: false, reason: "not configured" });

  let id = "";
  try { id = String((await req.json())?.id || ""); } catch {}
  if (!/^[A-Za-z0-9]{20}$/.test(id) || sent.has(id)) return ok({ ok: false });

  const key = env("FIREBASE_API_KEY");
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/requests/${id}${key ? `?key=${key}` : ""}`);
  if (!r.ok) return ok({ ok: false, reason: "not found" });
  const doc = await r.json();
  const f = doc.fields || {};
  const v = (k) => f[k]?.stringValue || "";
  const created = Date.parse(f.createdAt?.timestampValue || "");
  if (!created || Date.now() - created > 10 * 60_000) return ok({ ok: false, reason: "old" });
  sent.add(id);
  if (sent.size > 2000) sent.clear();

  const src = { ai: "AI yordamchi orqali", offer: "Takliflar bo‘limidan" }[v("src")] || "Saytdan";
  const lines = [
    `🆕 <b>Yangi onlayn ariza</b> #${h(id.slice(0, 6).toUpperCase())}`,
    `👤 ${h(v("name"))}`,
    `📞 ${h(v("phone"))}`,
    `🛎 ${h(v("service"))}${v("op") ? ` · ${h(v("op"))}` : ""}`,
    v("branch") ? `🏢 ${h(v("branch"))}` : "",
    v("note") ? `💬 ${h(v("note"))}` : "",
    `🌐 ${src}${v("lang") === "ru" ? " · RU" : ""}`,
  ].filter(Boolean);

  await Promise.all(
    chats.map((chat_id) =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text: lines.join("\n"), parse_mode: "HTML", disable_web_page_preview: true }),
      }).catch(() => null)
    )
  );
  return ok();
};

export const config = { path: "/api/notify" };
