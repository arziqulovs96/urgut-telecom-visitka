// Bir martalik: filiallar ro‘yxatini bazaga yozadi (sayt, bot va ilova o‘sha yerdan o‘qiydi).
// Yozilgach belgi qo‘yiladi — keyin admin paneldagi o‘zgarishlarga tegmaydi.
import { ready, siteContent, saveSiteContent } from "../lib/fs.mjs";
import { BRANCHES_2026_11 } from "../lib/branches.mjs";

const MARK = "branches_2026_11_19";

export default async () => {
  if (!ready()) return;
  const c = await siteContent(0);
  if (!c || c.seeds?.[MARK]) return;
  c.branches = BRANCHES_2026_11;
  c.seeds = { ...(c.seeds || {}), [MARK]: true };
  await saveSiteContent(c, "V57 (filiallar)");
  console.log("seed: filiallar yozildi", c.branches.length);
};

export const config = { schedule: "*/10 * * * *" };
