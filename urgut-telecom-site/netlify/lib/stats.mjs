// Arizalar statistikasi: ertalabki hisobot, admin panel va AI boshqaruv uchun
import { query } from "./fs.mjs";

export const STATUS = { new: "Yangi", work: "Jarayonda", onway: "Yo‘lda", done: "Bajarildi", cancel: "Bekor qilindi" };

// Toshkent vaqti bo‘yicha N kun oldingi kun boshlanishi
export function dayStart(daysAgo = 0) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() - daysAgo * 864e5));
  return new Date(`${ymd}T00:00:00+05:00`);
}

export async function requestsSince(from) {
  return query("requests", { where: [["createdAt", "GREATER_THAN_OR_EQUAL", from]], orderBy: "createdAt", limit: 1000 });
}

export function summarize(list) {
  const by = (f) => list.reduce((m, r) => ((m[f(r) || "—"] = (m[f(r) || "—"] || 0) + 1), m), {});
  const done = list.filter((r) => r.status === "done");
  const stars = list.filter((r) => r.stars);
  return {
    total: list.length,
    byStatus: by((r) => STATUS[r.status || "new"]),
    byService: by((r) => r.service),
    byOperator: by((r) => r.op),
    bySource: by((r) => ({ ai: "AI", offer: "Takliflar", bot: "Bot" })[r.src] || "Sayt"),
    byHandler: done.reduce((m, r) => ((m[r.handledBy || "—"] = (m[r.handledBy || "—"] || 0) + 1), m), {}),
    revenue: done.reduce((s, r) => s + (Number(r.total) || 0), 0),
    delivery: list.filter((r) => r.fulfil === "delivery").length,
    avgStars: stars.length ? +(stars.reduce((s, r) => s + r.stars, 0) / stars.length).toFixed(1) : null,
  };
}
