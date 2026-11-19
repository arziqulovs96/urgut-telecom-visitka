// Ochiq: ilova va sayt uchun operatorlarning amaldagi tariflari va arxivi.
import { json, ready } from "../lib/fs.mjs";
import { readAll, SEED_OPS } from "../lib/catalog-public.mjs";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" };
let cache = { at: 0, body: null };

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const full = new URL(req.url).searchParams.get("all") === "1";
  if (!full && cache.body && Date.now() - cache.at < 120_000) return new Response(cache.body, { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  if (!ready()) return json({ ops: SEED_OPS() }, 200);
  const all = await readAll();
  const ops = {};
  for (const [id, d] of Object.entries(all)) {
    ops[id] = { internet: d.internet, tariffs: d.tariffs, minutes: d.minutes, archive: d.archive, checked: d.checked, updatedAt: d.updatedAt || null };
    if (full) { ops[id].pending = Object.fromEntries(Object.entries(d.pending || {}).map(([s, p]) => [s, { text: p.text, src: p.src, at: p.at }])); ops[id].log = d.log || []; }
  }
  const body = JSON.stringify({ ops, at: new Date().toISOString() });
  if (!full) cache = { at: Date.now(), body };
  return new Response(body, { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": full ? "no-store" : "public, max-age=300" } });
};

export const config = { path: "/api/catalog" };
