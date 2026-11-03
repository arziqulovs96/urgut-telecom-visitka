// Ariza holatini kuzatish va bajarilgan arizaga baho qoldirish
import { json, ready, query, createDoc, patchDoc, tgSend, h, limited, ipOf, adminChats } from "../lib/fs.mjs";

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

async function find(code, phone4) {
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  phone4 = String(phone4 || "").replace(/\D/g, "").slice(-4);
  if (code.length !== 6 || phone4.length !== 4) return null;
  const [r] = await query("requests", { where: [["code", "EQUAL", code]], limit: 1 });
  if (!r || !String(r.phone || "").endsWith(phone4)) return null;
  return r;
}

export default async (req, context) => {
  if (!ready()) return json({ ok: false, err: "setup" }, 503);
  if (limited("track:" + ipOf(req, context), 12)) return json({ ok: false, err: "rate" }, 429);
  if (req.method === "GET") {
    const u = new URL(req.url);
    const r = await find(u.searchParams.get("code"), u.searchParams.get("phone"));
    if (!r) return json({ ok: false, err: "notfound" }, 404);
    return json({
      ok: true, code: r.code, status: r.status || "new", service: r.service, op: r.op || "", kind: r.kind,
      items: (r.items || []).map((i) => ({ name: i.name, qty: i.qty })), total: r.total || 0,
      fulfil: r.fulfil, createdAt: r.createdAt, reviewed: !!r.reviewed,
    });
  }
  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ ok: false, err: "bad" }, 400); }
    const r = await find(b.code, b.phone);
    if (!r) return json({ ok: false, err: "notfound" }, 404);
    if (r.status !== "done") return json({ ok: false, err: "notdone" }, 400);
    if (r.reviewed) return json({ ok: false, err: "already" }, 400);
    const stars = Math.max(1, Math.min(5, Math.round(Number(b.stars) || 0)));
    const text = clean(b.text, 500);
    await createDoc(`reviews/${r.id}`, { name: clean(r.name, 40), stars, text, code: r.code, service: r.service || "", status: "pending", lang: r.lang || "uz" }, { serverTime: ["createdAt"] });
    await patchDoc(`requests/${r.id}`, { reviewed: true, stars });
    await tgSend(`⭐ <b>Yangi baho</b> #${r.code}: ${"★".repeat(stars)}${"☆".repeat(5 - stars)}\n👤 ${h(r.name)}${text ? `\n💬 ${h(text)}` : ""}\nAdmin panel → Sharhlar bo‘limida tasdiqlang.`, { chats: await adminChats("requests") }).catch(() => {});
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
};

export const config = { path: "/api/track" };
