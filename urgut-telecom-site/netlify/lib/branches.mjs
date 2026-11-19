// Urgut Telecom filiallari (2026-11-19, Sardor bergan koordinatalar). Ish vaqti — umumiy (har kuni 08:00–22:00).
const B = (uz, ru, addrUz, addrRu, loc) => ({
  name: { uz, ru }, addr: { uz: addrUz, ru: addrRu }, mark: { uz: "", ru: "" },
  phone: "+998 93 722 00 45", loc, own: false, days: "all", open: "08:00", close: "22:00", hidden: false,
});
export const BRANCHES_2026_11 = [
  B("Bosh ofis", "Главный офис", "Urgut tumani", "Ургутский район", "39.427852, 67.242615"),
  B("Urgut savdo kompleksidagi filial", "Филиал в торговом комплексе Ургута", "Urgut savdo kompleksi", "Торговый комплекс Ургута", "39.430015, 67.181938"),
  B("Ispanza, «Paxmob» filiali", "Филиал «Paxmob», Испанза", "Ispanza, Urgut tumani", "Испанза, Ургутский район", "39.408083, 67.275347"),
  B("«Hasan telefon» filiali", "Филиал «Hasan telefon»", "Urgut tumani", "Ургутский район", "39.428248, 67.242494"),
];
