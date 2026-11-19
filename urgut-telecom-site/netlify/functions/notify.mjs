// Ilova bildirishnomalari (Firebase'siz): ilova shu manzildan oladi.
// Manbalar: Telegram admin panelidan yuborilgan bildirishnomalar (notices) va chop etilgan yangiliklar (news).
import { json, ready, query } from "../lib/fs.mjs";

let cache = { at: 0, body: null };
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const OPS = { uzmobile: "uztelecom" };

export default async () => {
  const head = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" };
  if (cache.body && Date.now() - cache.at < 60_000) return new Response(cache.body, { headers: head });
  if (!ready()) return json({ items: [] });
  const [notices, news] = await Promise.all([
    query("notices", { orderBy: "createdAt", limit: 20 }).catch(() => []),
    query("news", { orderBy: "createdAt", limit: 20 }).catch(() => []),
  ]);
  const monthAgo = Date.now() - 30 * 864e5;
  const items = [
    ...notices.filter((n) => n.hidden !== true).map((n) => ({ id: "n-" + n.id, kind: "notice", at: n.createdAt, title: { uz: cut(n.title?.uz, 90), ru: cut(n.title?.ru || n.title?.uz, 90) }, body: { uz: cut(n.body?.uz, 600), ru: cut(n.body?.ru || n.body?.uz, 600) }, open: n.open || "notif" })),
    ...news.filter((n) => n.status === "published").map((n) => ({ id: "news-" + n.id, kind: "news", at: n.createdAt, title: { uz: cut(n.title?.uz, 90), ru: cut(n.title?.ru || n.title?.uz, 90) }, body: { uz: cut(n.body?.uz, 600), ru: cut(n.body?.ru || n.body?.uz, 600) }, img: n.img || "", op: OPS[n.op] || n.op || "", open: "notif" })),
  ].filter((x) => Date.parse(x.at || "") > monthAgo).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 25);
  const body = JSON.stringify({ items });
  cache = { at: Date.now(), body };
  return new Response(body, { headers: head });
};

export const config = { path: "/api/notify" };
