// Har 2 soatda: AI navbatdagi operatorning bitta bo‘limini (tariflar / internet / daqiqa) rasmiy saytdan tekshiradi.
// Admin panelda “AI tariflarni kuzatsin” yoqilgan bo‘lsagina ishlaydi.
import { ready, siteContent } from "../lib/fs.mjs";
import { refresh, slotNow } from "../lib/catalog.mjs";

export default async () => {
  if (!ready()) return;
  const c = await siteContent(0);
  if (!c?.catalogCfg?.ai) return;
  const { op, sec } = slotNow();
  const r = await refresh(c, op, sec, { publish: c.catalogCfg.autoPublish !== false });
  console.log("catalog-cron", JSON.stringify(r));
};

export const config = { schedule: "20 */2 * * *" };
