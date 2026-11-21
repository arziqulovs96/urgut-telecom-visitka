// Bir martalik: filiallar ro‘yxatini bazaga yozadi (sayt, bot va ilova o‘sha yerdan o‘qiydi).
// Yozilgach belgi qo‘yiladi — keyin admin paneldagi o‘zgarishlarga tegmaydi.
import { ready, siteContent, saveSiteContent } from "../lib/fs.mjs";
import { BRANCHES } from "../lib/branches.mjs";

const MARK = "branches_2026_11_21"; // to‘liq ro‘yxat: 7 ta manzil

export default async () => {
  if (!ready()) return;
  const c = await siteContent(0);
  if (!c || c.seeds?.[MARK]) return;
  c.branches = BRANCHES;
  c.seeds = { ...(c.seeds || {}), [MARK]: true };
  await saveSiteContent(c, "V57 (filiallar)");
  console.log("seed: filiallar yozildi", c.branches.length);
};

export const config = { schedule: "*/10 * * * *" };
