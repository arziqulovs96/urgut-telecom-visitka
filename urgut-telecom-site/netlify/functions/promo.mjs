// Promokodni tekshirish (buyurtma berishdan oldin chegirmani ko‘rsatish uchun)
import { json, ready, siteContent, limited, ipOf, botKeyOk } from "../lib/fs.mjs";
import { checkPromo, num } from "../lib/shop.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!ready()) return json({ ok: false, err: "setup" }, 503);
  let b;
  try { b = await req.json(); } catch { return json({ ok: false, err: "bad" }, 400); }
  if (limited(botKeyOk(req) ? "promo:bot:" + String(b.tgId || "") : "promo:" + ipOf(req, context), 10)) return json({ ok: false, err: "rate" }, 429);
  const scope = ["shop", "services", "numbers"].includes(b.scope) ? b.scope : "services";
  const r = await checkPromo(await siteContent(), b.code, scope, num(b.subtotal));
  return json(r.ok ? { ok: true, code: r.code, type: r.type, value: r.value, discount: r.discount } : { ok: false, err: r.err, min: r.min });
};

export const config = { path: "/api/promo" };
