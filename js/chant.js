'use strict';
// ---- 詠唱の判定（仮）：詠唱の中のことばから、属性・姿・動きを決める ----
// interpretChant(text) → { ok, text, norm, seed, element, form, motion, speed, ordered, hits }
//   ok＝false は「外れ」（属性も姿も見つからない）。見つからなかった項目は null。
function interpretChant(text){
  const norm = String(text || '').normalize('NFKC').replace(/[\s、。，．,.!！?？「」『』・…ー〜~\-]/g, '').slice(0, 60);
  let seed = 2166136261; for (const ch of norm){ seed ^= ch.codePointAt(0); seed = Math.imul(seed, 16777619); }
  const r = { ok: false, text: String(text || ''), norm, seed: seed >>> 0, element: null, form: null, motion: null, speed: 0, ordered: true, hits: [] };
  for (const slot of ['element', 'form', 'motion']) for (const [value, words] of Object.entries(LEXICON[slot])) for (const w of words){
    const at = norm.indexOf(w); if (at < 0) continue;
    r.hits.push({ word: w, slot, value, at }); if (r[slot] == null) r[slot] = value;
  }
  r.ok = r.element != null || r.form != null;
  return r;
}
