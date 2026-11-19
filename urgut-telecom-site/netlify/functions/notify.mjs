// Ilova bildirishnomalari (Firebase'siz): ilova har ~30 daqiqada shu manzilni tekshiradi.
// Botdan yoki admin paneldan chop etilgan har bir yangilik telefonlarga bildirishnoma bo‘lib boradi.
import { json, ready, query } from "../lib/fs.mjs";

let cache = { at: 0, body: null };
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export default async () => {
  const head = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=120" };
  if (cache.body && Date.now() - cache.at < 120_000) return new Response(cache.body, { headers: head });
  if (!ready()) return json({ items: [] });
  const rows = await query("news", { orderBy: "createdAt", limit: 20 }).catch(() => []);
  const weekAgo = Date.now() - 7 * 864e5;
  const items = rows
    .filter((n) => n.status === "published" && Date.parse(n.createdAt || "") > weekAgo)
    .slice(0, 10)
    .map((n) => ({ id: "news-" + n.id, title: { uz: cut(n.title?.uz, 80), ru: cut(n.title?.ru || n.title?.uz, 80) }, body: { uz: cut(n.body?.uz, 200), ru: cut(n.body?.ru || n.body?.uz, 200) }, open: ({ uzmobile: "uztelecom" })[n.op] || n.op || "news" }));
  const body = JSON.stringify({ items });
  cache = { at: Date.now(), body };
  return new Response(body, { headers: head });
};

export const config = { path: "/api/notify" };
