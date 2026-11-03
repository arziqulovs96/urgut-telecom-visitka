// Narx, promokod va buyurtma hisoblash — hammasi serverda, mijoz narxni o‘zgartira olmaydi.
import { getDoc } from "./fs.mjs";

export const L = (o, lang = "uz") => (o && typeof o === "object" ? o[lang] || o.uz || o.ru || "" : o || "");
export const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const cleanCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);

// Promokodni tekshiradi. scope: all | shop | services | numbers
export async function checkPromo(content, code, scope, subtotal) {
  if (!content?.promo?.enabled) return { ok: false, err: "off" };
  code = cleanCode(code);
  if (!code) return { ok: false, err: "empty" };
  const p = await getDoc(`promos/${code}`);
  if (!p || p.active === false) return { ok: false, err: "notfound" };
  if (p.expires && Date.parse(p.expires + "T23:59:59+05:00") < Date.now()) return { ok: false, err: "expired" };
  if (p.maxUses && (p.used || 0) >= p.maxUses) return { ok: false, err: "used" };
  if (p.scope && p.scope !== "all" && p.scope !== scope) return { ok: false, err: "scope" };
  if (p.minTotal && subtotal < p.minTotal) return { ok: false, err: "min", min: p.minTotal };
  const value = num(p.value);
  const discount = subtotal > 0 ? Math.min(subtotal, p.type === "sum" ? value : Math.round((subtotal * value) / 100)) : 0;
  return { ok: true, code, type: p.type === "sum" ? "sum" : "percent", value, discount };
}

export function deliveryFor(content, kind, svc) {
  const d = content?.delivery || {};
  const allowed = !!d.enabled && (kind !== "service" || !!svc?.delivery);
  return { allowed, fee: allowed && d.paid ? num(d.price) : 0, paid: !!d.paid };
}

export function nasiyaPlan(content, total, months) {
  const n = content?.nasiya;
  if (!n?.enabled || !total) return null;
  const allowed = String(n.months || "").split(/[^\d]+/).map(Number).filter((x) => x > 0 && x <= 60);
  months = Number(months);
  if (!allowed.includes(months)) return null;
  const full = Math.round(total * (1 + num(n.percent) / 100));
  return { months, full, monthly: Math.ceil(full / months / 1000) * 1000 };
}
