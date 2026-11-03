// Har 6 soatda: AI operatorlardan biri bo‘yicha yangiliklarni qidiradi (navbat bilan).
// Admin panelda “AI yangiliklari” yoqilgan bo‘lsagina ishlaydi.
import { ready, siteContent } from "../lib/fs.mjs";
import { newsForOperator } from "../lib/news.mjs";

export default async () => {
  if (!ready()) return;
  const c = await siteContent(0);
  if (!c?.newsCfg?.ai || c?.newsCfg?.enabled === false) return;
  const ops = (c.operators || []).filter((o) => !o.hidden && o.name);
  if (!ops.length) return;
  const slot = Math.floor(Date.now() / (6 * 3600e3));
  const op = ops[slot % ops.length];
  const r = await newsForOperator(c, op, { publish: !!c.newsCfg.autoPublish });
  console.log("news-cron", JSON.stringify(r));
};

export const config = { schedule: "15 */6 * * *" };
