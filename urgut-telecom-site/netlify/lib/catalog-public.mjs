export { readAll } from "./catalog.mjs";
import { SEED } from "./catalog-seed.mjs";
export const SEED_OPS = () => Object.fromEntries(Object.entries(SEED).map(([id, s]) => [id, { internet: s.internet, tariffs: s.tariffs, minutes: s.minutes, archive: [], checked: {} }]));
