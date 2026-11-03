// Kunlik hisobot matni (cron va AI boshqaruv uchun)
import { h, fmtSum } from "./fs.mjs";
import { requestsSince, summarize, dayStart } from "./stats.mjs";
import { generate, extractText } from "./gemini.mjs";

const top = (o, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}: ${v}`).join(", ") || "—";

export async function buildReport(c) {
  const from = dayStart(1), to = dayStart(0);
  const list = (await requestsSince(from)).filter((r) => Date.parse(r.createdAt) < to.getTime());
  const s = summarize(list);
  const date = new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", day: "numeric", month: "long" }).format(from);
  let ai = "";
  if (list.length) {
    const res = await generate({
      content: c,
      contents: [{ role: "user", parts: [{ text: `URGUT TELECOM kompaniyasi rahbari uchun kechagi arizalar statistikasiga 2–3 gaplik qisqa o‘zbekcha xulosa va bitta amaliy maslahat yoz. Raqamlarni o‘ylab topma.\n${JSON.stringify(s)}` }] }],
      steps: [{ tools: [], thinking: false }],
    }).catch(() => null);
    ai = res?.ok ? extractText(res.j) : "";
  }
  return [
    `☀️ <b>Hisobot: ${date}</b>`,
    `📥 Jami arizalar: <b>${s.total}</b>`,
    `📊 Holati: ${top(s.byStatus)}`,
    `🛎 Xizmatlar: ${top(s.byService)}`,
    `📱 Operatorlar: ${top(s.byOperator)}`,
    `🌐 Manba: ${top(s.bySource)}`,
    `🚚 Yetkazib berish: ${s.delivery}`,
    s.revenue ? `💰 Bajarilgan buyurtmalar: ${fmtSum(s.revenue)} so‘m` : "",
    Object.keys(s.byHandler).length ? `👥 Xodimlar (bajarildi): ${top(s.byHandler, 10)}` : "",
    s.avgStars ? `⭐ O‘rtacha baho: ${s.avgStars}` : "",
    ai ? `\n🤖 <i>${h(ai)}</i>` : "",
  ].filter(Boolean).join("\n");
}

