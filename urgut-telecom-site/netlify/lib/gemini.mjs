// Gemini bilan ishlash: model tanlash, zaxira modellar, internet qidiruvi.
import { env } from "./fs.mjs";

export const DEFAULT_MODEL = "gemini-3-flash-preview";
const FALLBACKS = ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-latest"];
let autoModel = null;
const okModel = (m) => /^gemini-[\w.-]{1,60}$/.test(m || "");

// Tartib: admin paneldagi model → Netlify GEMINI_MODEL → standart
export function wantedModel(content) {
  if (okModel(content?.ai?.model)) return content.ai.model;
  if (okModel(env("GEMINI_MODEL"))) return env("GEMINI_MODEL");
  return DEFAULT_MODEL;
}
export const currentModel = (content) => autoModel || wantedModel(content);

async function call({ key, model, sys, contents, tools, thinking, jsonOut, maxTokens = 4096, temperature }) {
  const g3 = /^gemini-3/.test(model);
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (!g3) body.generationConfig.temperature = temperature ?? 0.3;
  if (thinking && g3) body.generationConfig.thinkingConfig = { thinkingLevel: "low" };
  if (jsonOut && !tools?.length) body.generationConfig.responseMimeType = "application/json";
  if (tools?.length) body.tools = tools;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

async function discoverModel(key) {
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
    const j = await r.json();
    const ids = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((id) => /^gemini-\d/.test(id) && /flash/.test(id) && !/(image|tts|live|audio|embedding|computer|thinking-exp)/.test(id));
    const ver = (id) => parseFloat((id.match(/^gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const score = (id) => ver(id) * 10 + (/lite/.test(id) ? 0 : 3) + (/preview/.test(id) ? 0 : 1);
    ids.sort((x, y) => score(y) - score(x));
    return ids[0] || null;
  } catch {
    return null;
  }
}

export function extractText(j) {
  const parts = j?.candidates?.[0]?.content?.parts || [];
  return parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
}
export function functionCalls(j) {
  return (j?.candidates?.[0]?.content?.parts || []).filter((p) => p.functionCall).map((p) => p.functionCall);
}
export function sourcesOf(j) {
  const seen = new Set();
  return (j?.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri && !seen.has(w.title || w.uri) && seen.add(w.title || w.uri))
    .map((w) => ({ t: String(w.title || "").slice(0, 80), u: w.uri }));
}
export const searchedOf = (j) => (j?.candidates?.[0]?.groundingMetadata?.webSearchQueries || []).length > 0;

/**
 * steps: [{tools, thinking, sys?}] — birinchisi ishlamasa keyingisi (masalan internetsiz) sinanadi.
 * accept(res) — javob qabul qilinadimi (masalan matn bor yoki functionCall bor)
 * Model topilmasa (404) keyingi zaxira modelga o‘tiladi.
 */
export async function generate({ content, sys, contents, steps, accept = (r) => !!extractText(r.j) || functionCalls(r.j).length > 0, jsonOut, maxTokens, onlyModel }) {
  const key = env("GEMINI_API_KEY");
  if (!key) return { ok: false, status: 503, error: "GEMINI_API_KEY sozlanmagan" };
  const tried = new Set();
  const queue = onlyModel ? [onlyModel] : [...new Set([autoModel, wantedModel(content), ...FALLBACKS].filter(Boolean))];
  let last = null, discovered = !!onlyModel, waited = false;
  while (queue.length) {
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    let notFound = false;
    for (const st of steps) {
      let res = await call({ key, model, sys: st.sys ?? sys, contents, tools: st.tools, thinking: st.thinking, jsonOut, maxTokens });
      if (res.status === 429 && !waited && !/per ?day|daily|PerDay/i.test(JSON.stringify(res.j))) {
        waited = true;
        // Daqiqalik limit: biroz kutib bir marta qayta urinamiz
        const sec = Number(String(JSON.stringify(res.j).match(/retryDelay"?:\s*"?(\d+)/)?.[1] || 4));
        await new Promise((ok) => setTimeout(ok, Math.min(8, Math.max(2, sec)) * 1000));
        res = await call({ key, model, sys: st.sys ?? sys, contents, tools: st.tools, thinking: st.thinking, jsonOut, maxTokens });
      }
      last = { ...res, model, step: st };
      if (res.ok && accept(res)) {
        if (!onlyModel) autoModel = model;
        return last;
      }
      if (res.status === 404) { notFound = true; break; }
      if (res.status === 429) break; // bu modelning limiti tugadi — keyingi zaxira modelga o‘tamiz
      if (res.status === 401 || res.status === 403) return { ...last, ok: false, error: "Gemini kaliti noto‘g‘ri yoki faol emas" };
    }
    if (!queue.length && !discovered) {
      discovered = true;
      const m = await discoverModel(key);
      if (m && !tried.has(m)) queue.push(m);
    }
  }
  const st = last?.status;
  const daily = /per ?day|daily|PerDay/i.test(JSON.stringify(last?.j || {}));
  return { ...(last || {}), ok: false, error: st === 429 ? (daily ? "Gemini’ning bepul kunlik limiti tugadi — ertaga yana ishlaydi (yoki Google AI Studio’da to‘lovli rejaga o‘ting)" : "AI limiti tugadi, birozdan keyin urinib ko‘ring") : "AI javob bermadi" };
}

export const WEB_STEPS = (sysWeb, sysNoWeb) => [
  { tools: [{ google_search: {} }, { url_context: {} }], thinking: true, sys: sysWeb },
  { tools: [{ google_search: {} }], thinking: false, sys: sysWeb },
  { tools: [], thinking: false, sys: sysNoWeb },
];
