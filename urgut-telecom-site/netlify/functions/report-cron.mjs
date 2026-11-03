// Har kuni 09:00 (Toshkent): kechagi kun bo‘yicha hisobot va AI xulosasi
import { ready, siteContent, tgSend, adminChats } from "../lib/fs.mjs";
import { buildReport } from "../lib/report.mjs";

export default async () => {
  if (!ready()) return;
  const c = await siteContent(0);
  if (c?.report?.enabled === false) return;
  await tgSend(await buildReport(c), { chats: await adminChats("stats") });
};

export const config = { schedule: "0 4 * * *" };
