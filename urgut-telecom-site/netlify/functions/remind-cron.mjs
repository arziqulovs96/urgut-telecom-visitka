// Har 15 daqiqada: belgilangan vaqtdan beri qabul qilinmagan yangi arizalar haqida adminlarga eslatma.
import { ready, siteContent, query, patchDoc, tgSend, h, isOpen, adminChats } from "../lib/fs.mjs";

export default async () => {
  if (!ready()) return;
  const c = await siteContent(0);
  if (c?.remind?.enabled === false) return;
  if (!isOpen(c?.hours)) return;
  const mins = Math.max(5, Number(c?.remind?.minutes) || 30);
  const list = await query("requests", { where: [["status", "EQUAL", "new"]], limit: 200 });
  const late = list.filter((r) => !r.reminded && r.createdAt && Date.now() - Date.parse(r.createdAt) > mins * 60e3);
  if (!late.length) return;
  const lines = late.slice(0, 15).map((r) => `• #${r.code || r.id.slice(0, 6)} ${h(r.name)} — ${h(r.service || "")} (${Math.round((Date.now() - Date.parse(r.createdAt)) / 60e3)} daqiqa)`);
  await tgSend(`⏰ <b>${late.length} ta ariza ${mins} daqiqadan beri qabul qilinmagan</b>\n${lines.join("\n")}${late.length > 15 ? "\n…" : ""}`, { chats: await adminChats("requests") });
  await Promise.all(late.map((r) => patchDoc(`requests/${r.id}`, { reminded: true }).catch(() => {})));
};

export const config = { schedule: "*/15 * * * *" };
