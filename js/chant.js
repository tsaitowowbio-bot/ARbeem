'use strict';
// ---- 詠唱の判定：詠唱の文から、属性・姿・動き・速さを決める ----
// 通信も、言語モデルも使わない。ことばの表（lexicon.js の LEXICON）を引くだけで決める。
// このファイルと lexicon.js は、ほかのファイルにたよらない（画面なしの Node でも動く）。
//
// interpretChant(text) → { ok, text, norm, seed, element, form, motion, speed, ordered, hits }
//   ok       false は「外れ」（属性も姿も見つからない）。動きのことばだけでは外れ。
//   norm     そろえた文（全角半角をそろえ、空白と記号をのぞく。80 字まで）。
//   seed     norm から作る 0〜2^32-1 の数（同じ詠唱なら同じ数）。
//   element  fire / ice / thunder / wind / water / earth / light / dark、見つからなければ null。
//   form     dragon / serpent / bird / wolf / fish / swarm / blade / orb、見つからなければ null。
//   motion   homing / serpentine / spiral / orbit / zigzag / charge、見つからなければ null。
//   speed    -1（ゆっくり）／0／1（速い）。
//   ordered  「姿・属性のことば」が、すべて「動き・速さのことば」より前にあれば true（動き・速さのことばがなければ true）。
//   hits     決め手になったことばの一覧 [{ word, slot, value, at, w, used }]。at は norm の中の位置、w は効いた重み、
//            used はその項目で選ばれた値かどうか。speed の value は 1 か -1。
//
// ---- 決め方 ----
// 1) そろえる：全角半角をそろえ、記号と空白は「区切り」として覚えてから取りのぞく。
//    表を引くときだけ、カタカナをひらがなに、数字を 0 に、英字を小文字にそろえる（文字の数は変えない）。
// 2) 区切る：文を、表のことば・助詞・知らない字に分ける。分け方は「知らない字がいちばん少なく、ことばの数も少ない」ものを選ぶ。
//    長いことばが勝つので、「竜巻」は竜にならず、「火曜日」「光熱費」「鳥肌」は何も指さないことばとして消える。
//    ・「~」の付いた漢字（火・水・風・光 など）は、知らない漢字と隣り合うと無視する（水準・風景・電話 など）。
//    ・かなだけの短いことば（とり・たま・かぜ など）は、前後が区切りのときだけ当てる（ひとり・たまご・とりあえず を避ける）。
//      区切り＝文の端、記号のあった所、助詞（の・よ・を…）、表にあることば、ひらがなとカタカナの変わり目、
//      漢字のあとの送りがな（白い・燃える・聖なる など）。
//      カタカナの入力では、長いことばも同じように確かめる。となりが 3 字以上の知らないカタカナのかたまりならよい
//      （アイスブレス・スーパードラゴン は当て、ハーバード・サファイア は当てない）。
// 3) 重みを直す：
//    ・「〜のように」「〜のごとく」と続くことばは、たとえなので 0.3 倍（蛇のように → 姿ではなく、動き「蛇行」の手がかりにする）。
//    ・「〜を」と続くことばは、相手や道具のことが多いので 0.6 倍（闇を切り裂く光 → 光）。
//    ・属性のことばが、姿のことばに直接かかっているとき（氷の竜・ファイアドラゴン・燃える鳥）は 0.5 を足す。
//    ・「?」の付いた手がかり（黒い・熱い・犬 など）は、ほかに属性か姿のことばがあるときだけ数える。
// 4) 選ぶ：項目ごとに、値ごとの点＝「いちばん重いことば ＋ 残りのことばの 0.2 倍」。点の高い値を選ぶ。
//    同点のとき、属性と動きは先に出たほう、姿はあとに出たほう（日本語は、あとのことばが中心になる：狼の群れ → 群れ）。
//    速さは、「速い」の重みの合計 − 「ゆっくり」の重みの合計が 0.5 以上なら 1、-0.5 以下なら -1。

const CH_MAX = 80;                                // 判定する長さ（字）
const CH_TAIL_END = 'いきなるうくぐすつぬぶむただし';    // 漢字のあとの送りがなとして認める、終わりの字
const CH_SIMILE = ['のように', 'のような', 'のよう', 'のごとく', 'のごとき', 'のごとし', 'の如く', 'の如き', 'の如し', 'の様に', 'の様な',
  'みたいに', 'みたいな', 'みたい', 'さながら', 'がごとく', 'が如く', 'に似た', 'めいた', 'じみた'];
const CH_BIND_GLUE = ['の', 'なる', 'たる', '之', 'き', 'い'];   // 属性と姿のあいだに入ってよい、つなぎ
const CH_SLOTS = ['element', 'form', 'motion', 'speed'];

// ---- 文字の種類：0＝その他（区切り）、1＝ひらがな、2＝カタカナ、3＝漢字、4＝英字、5＝数字、6＝長音「ー」 ----
function chCls(c){
  if (c >= 0x3041 && c <= 0x3096) return 1;
  if (c >= 0x30a1 && c <= 0x30fa) return 2;
  if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0x3005 && c <= 0x3007)) return 3;
  if ((c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a)) return 4;
  if (c >= 0x30 && c <= 0x39) return 5;
  if (c === 0x30fc) return 6;
  return 0;
}
// 表を引くための字にそろえる（1 字 → 1 字）
function chFoldCode(c){
  if (c >= 0x30a1 && c <= 0x30f6) return c - 0x60;        // カタカナ → ひらがな
  if (c >= 0x41 && c <= 0x5a) return c + 0x20;            // 英大文字 → 小文字
  if (c >= 0x30 && c <= 0x39) return 0x30;                // 数字 → 0
  return c;
}
function chFoldStr(s){ let r = ''; for (let i = 0; i < s.length; i++) r += String.fromCharCode(chFoldCode(s.charCodeAt(i))); return r; }

// ---- 表を、引ける形に直す（読みこんだときに 1 回だけ）----
// chTable：そろえたことば → { key, len, cost, c:[{ slot, value, w, hint }], isoL, isoR, anch, kata }
const chTable = new Map();
let chMaxLen = 1;
const CH_FOREIGN = { key: '', len: 0, c: [] }, CH_TAIL = { key: '', len: 0, c: [] };   // 目印（知らないカタカナのかたまり／送りがな）
function chAdd(raw, slot, value, cost){
  const m = /^(.+?)([~<>!_?^=]*)(?::(\d))?$/.exec(raw); if (!m) return;
  const key = chFoldStr(m[1].normalize('NFKC')), fl = m[2], w = m[3] ? +m[3] / 10 : 1;
  let e = chTable.get(key);
  if (!e){
    e = { key, len: key.length, cost, c: [], isoL: false, isoR: false, anch: false, kata: false, fixed: false, kana: /^[\u3041-\u3096\u30fc]+$/.test(key) };
    chTable.set(key, e); if (key.length > chMaxLen) chMaxLen = key.length;
  }
  if (cost < e.cost) e.cost = cost;
  // カタカナで書いたことばは、入力もカタカナのときだけ当てる（「美しくない」のクナイ、「〜でいるかも」のイルカを避ける）
  if (/^[\u30a1-\u30fa\u30fc]+$/.test(m[1])){ if (!e.hira) e.kata = true; } else { e.hira = true; e.kata = false; }
  if (!slot) return;
  e.c.push({ slot, value, w, hint: fl.includes('?') });
  if (fl.includes('~') || fl.includes('<')) e.isoL = true;
  if (fl.includes('~') || fl.includes('>')) e.isoR = true;
  if (fl.includes('^') && !e.hira) e.kata = true;
  if (fl.includes('=')) e.strict = true;
  // かな（か英字）だけの短いことばは、前後を確かめる
  if (fl.includes('!')){ e.anch = false; e.fixed = true; }
  else if (fl.includes('_')){ e.anch = true; e.fixed = true; }
  else if (!e.fixed) e.anch = /^[a-z]+$/.test(key) || (/^[ぁ-ゖー]+$/.test(key) && key.length <= 3);
}
(function chCompile(){
  if (typeof LEXICON === 'undefined') return;
  const words = s => String(s || '').split(/\s+/).filter(Boolean);
  for (const slot of CH_SLOTS) for (const [value, list] of Object.entries(LEXICON[slot] || {}))
    for (const raw of words(list)) chAdd(raw, slot, slot === 'speed' ? (value === 'fast' ? 1 : -1) : value, 1);
  for (const raw of words(LEXICON.neutral)) chAdd(raw, null, null, 1);
  for (const raw of words(LEXICON.known)) chAdd(raw, null, null, 1);
  // つなぎのことば（助詞など）は、入力がカタカナのときは当てない（「ガリバー」の ガ を助詞にしない）
  for (const raw of words(LEXICON.glue).concat(CH_SIMILE)){ chAdd(raw, null, null, 2); const e = chTable.get(chFoldStr(raw)); if (e && !e.c.length) e.nokata = true; }
})();

// ---- 区切る：いちばん「知らない字が少ない」分け方を探す ----
// 状態：0＝直前は知らない字、1＝直前は知らないカタカナのかたまり、2＝直前は知っていることば、
//       3＝直前のことばが「次はかたまりか、知っていることば」を求めている、4＝「次は知っていることば」を求めている
function chSegment(key, cls, brk, n){
  const allKata = cls.every(k => k === 2);
  const S = 5, INF = 1e9, N = (n + 1) * S;
  const cost = new Float64Array(N).fill(INF), bi = new Int32Array(N), bs = new Int8Array(N), be = new Array(N).fill(null);
  cost[2] = 0;
  const run = new Int32Array(n + 1);                 // 同じ種類の字が、どこまで続くか
  for (let i = n - 1; i >= 0; i--) run[i] = (i + 1 < n && !brk[i + 1] && cls[i + 1] === cls[i]) ? run[i + 1] : i + 1;
  const relax = (j, s2, c, i, s, e) => { const k = j * S + s2; if (c < cost[k]){ cost[k] = c; bi[k] = i; bs[k] = s; be[k] = e; } };
  for (let i = 0; i < n; i++){
    const edge = i === 0 || brk[i], pc = edge ? 0 : cls[i - 1], mc = cls[i];
    for (let s = 0; s < S; s++){
      const c = cost[i * S + s]; if (c >= INF) continue;
      // 知らない字（「次は知っていることば」を求められているときは置けない）
      if (s < 3) relax(i + 1, 0, c + 10, i, s, null);
      // 知らないカタカナのかたまり（3 字以上）
      if (mc === 2 && s !== 4) for (let j = i + 3; j <= run[i]; j++) relax(j, 1, c + 10 * (j - i) - 0.5, i, s, CH_FOREIGN);
      // 漢字のあとの送りがな（1〜3 字）
      if (mc === 1 && pc === 3) for (let j = i + 1; j <= i + 3 && j <= run[i]; j++) if (CH_TAIL_END.includes(key[j - 1])) relax(j, 2, c + 10 * (j - i) - 0.5, i, s, CH_TAIL);
      // 表のことば
      for (let L = 1; L <= chMaxLen && i + L <= n; L++){
        if (L > 1 && brk[i + L - 1]) break;
        const e = chTable.get(key.substr(i, L)); if (!e) continue;
        const j = i + L;
        if (e.kata){ let all = true; for (let q = i; q < j; q++) if (cls[q] !== 2) all = false; if (!all) continue; }
        if (e.nokata && mc === 2 && !(allKata && e.key === 'の')) continue;      // 全部カタカナの文（ホノオノリュウ）では「ノ」だけ助詞とみなす
        // カタカナの入力では、かなのことばは長くても前後を確かめる（サファイア の ファイア、フリーランス の ランス を避ける）
        const hard = L <= 2 || e.strict;               // 短いことばと「=」のことばは、となりが本当に知っていることばでないといけない
        if (!edge){                                    // 左どなり
          if (mc === 2 && e.kana){ if (pc === 2 && s < (hard ? 2 : 1)) continue; }
          else if (e.anch){
            if (mc === 1){ if ((pc === 1 || pc === 3) && s < 2) continue; }
            else if (pc === mc && s < 2) continue;
          } else if (e.isoL && pc === 3 && s === 0) continue;
        }
        let s2 = 2;                                    // 右どなり
        if (j < n && !brk[j]){
          const lc = cls[j - 1], nc = cls[j];
          if (lc === 2 && e.kana){ if (nc === 2 && !(key[j] === 'ー' && !e.anch && L >= 4)) s2 = hard ? 4 : 3; }
          else if (e.anch){
            if (lc === 1){ if (nc === 1 || nc === 3) s2 = 4; }
            else if (nc === lc) s2 = 4;
          } else if (e.isoR && nc === 3) s2 = 4;
        }
        relax(j, s2, c + e.cost, i, s, e);
        // 長いカタカナ語は、うしろに長音が付いていても同じことばとみなす（ファイヤー・ドラゴーン）
        if (e.kana && !e.anch && L >= 4 && j < n && !brk[j] && key[j] === 'ー' && key[j - 1] !== 'ー'){
          relax(j + 1, 2, c + e.cost + 0.1, i, s, e);
        }
      }
    }
  }
  let s = 0; for (let q = 1; q < S; q++) if (cost[n * S + q] < cost[n * S + s]) s = q;
  const toks = [];
  for (let j = n; j > 0;){ const k = j * S + s, i = bi[k]; toks.push({ at: i, len: j - i, e: be[k] }); s = bs[k]; j = i; }
  return toks.reverse();
}

function interpretChant(text, debug){
  const src = String(text == null ? '' : text);
  // 1) そろえる
  let norm = '', key = ''; const cls = [], brk = []; let pend = true;
  for (const ch of src.normalize('NFKC')){
    if (norm.length >= CH_MAX) break;
    const code = ch.codePointAt(0); let k = code > 0xffff ? 0 : chCls(code);
    if (k === 0){ pend = true; continue; }
    if (k === 6) k = (!pend && cls.length && cls[cls.length - 1] === 1) ? 1 : 2;     // 長音は、前の字と同じ種類として扱う
    norm += k === 4 ? ch.toLowerCase() : ch; key += String.fromCharCode(chFoldCode(code)); cls.push(k); brk.push(pend); pend = false;
  }
  const n = norm.length;
  let seed = 2166136261; for (const ch of norm){ seed ^= ch.codePointAt(0); seed = Math.imul(seed, 16777619); }
  const r = { ok: false, text: src, norm, seed: seed >>> 0, element: null, form: null, motion: null, speed: 0, ordered: true, hits: [] };
  if (!n) return r;

  // 2) 区切る
  const toks = chSegment(key, cls, brk, n);
  if (debug) r.tokens = toks.map(t => norm.substr(t.at, t.len) + (t.e ? (t.e.c.length ? '*' : t.e === CH_FOREIGN ? '#' : '') : '?'));

  // 3) 当たったことばを集めて、重みを直す
  const hasForm = t => !!(t && t.e && t.e.c.some(c => c.slot === 'form'));
  let hits = [];
  toks.forEach((t, ti) => {
    if (!t.e || !t.e.c.length) return;
    const end = t.at + t.len, word = norm.substr(t.at, t.len);
    const simile = end < n && !brk[end] && CH_SIMILE.some(p => key.startsWith(p, end));
    const obj = end < n && !brk[end] && key[end] === 'を';
    const shape = t.e.c.some(c => c.slot === 'element' || c.slot === 'form');
    for (const c of t.e.c){
      let w = c.w; const isShape = c.slot === 'element' || c.slot === 'form';
      if (isShape && simile) w *= 0.3;
      if (isShape && obj) w *= 0.6;
      if (c.slot === 'element' && !simile){             // 姿のことばに、直接かかっているか
        let u = ti + 1;
        if (toks[u] && !brk[toks[u].at] && toks[u].e && (toks[u].e === CH_TAIL || CH_BIND_GLUE.includes(toks[u].e.key))) u++;
        for (let q = 0; q < 2 && toks[u] && !brk[toks[u].at] && toks[u].e && !toks[u].e.c.length && toks[u].len === 1 && cls[toks[u].at] === 3; q++) u++;
        if (toks[u] && !brk[toks[u].at] && hasForm(toks[u])) w += 0.5;
      }
      // 動き・速さのことばでも、属性か姿を兼ねていれば「姿の側のことば」として並び順を見る（例：電光石火）
      hits.push({ word, slot: c.slot, value: c.value, at: t.at, w, hint: c.hint, shape: isShape || shape, simile });
    }
    if (simile) for (const c of t.e.c){                 // たとえから、動き・速さの手がかりを作る
      if (c.slot === 'form' && c.value === 'serpent') hits.push({ word, slot: 'motion', value: 'serpentine', at: t.at, w: 0.8, hint: false, shape: false, simile });
      if (c.slot === 'element' && (c.value === 'wind' || c.value === 'thunder' || c.value === 'light')) hits.push({ word, slot: 'speed', value: 1, at: t.at, w: 0.6, hint: false, shape: false, simile });
    }
  });
  // 手がかり止まりのことばは、ほかに属性か姿のことばがあるときだけ数える
  const solid = hits.some(h => (h.slot === 'element' || h.slot === 'form') && !h.hint);
  hits = hits.filter(h => solid ? true : !(h.hint && (h.slot === 'element' || h.slot === 'form')));

  // 4) 選ぶ
  const pick = (slot, later) => {
    const by = new Map();
    for (const h of hits){ if (h.slot !== slot) continue; let g = by.get(h.value); if (!g){ g = { ws: [], first: h.at, last: h.at }; by.set(h.value, g); } g.ws.push(h.w); g.last = h.at; }
    let best = null, bestScore = 0, bestPos = 0;
    for (const [value, g] of by){
      g.ws.sort((a, b) => b - a); let score = g.ws[0]; for (let i = 1; i < g.ws.length; i++) score += 0.2 * g.ws[i];
      const pos = later ? g.last : -g.first;
      if (best == null || score > bestScore + 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && pos > bestPos)){ best = value; bestScore = score; bestPos = pos; }
    }
    return best;
  };
  r.element = pick('element', false); r.form = pick('form', true); r.motion = pick('motion', false);
  let sp = 0; for (const h of hits) if (h.slot === 'speed') sp += h.value * h.w;
  r.speed = sp >= 0.5 ? 1 : sp <= -0.5 ? -1 : 0;
  r.ok = r.element != null || r.form != null;

  // 並び順：姿・属性のことばが、すべて動き・速さのことばより前か（たとえに使ったことばは、動きの側とみなす）
  let lastShape = -1, firstMove = n;
  for (const h of hits){
    if ((h.slot === 'element' || h.slot === 'form') && !h.simile) lastShape = Math.max(lastShape, h.at);
    else if ((h.slot === 'motion' || h.slot === 'speed') && !h.shape) firstMove = Math.min(firstMove, h.at);
  }
  r.ordered = lastShape <= firstMove;
  r.hits = hits.map(h => ({ word: h.word, slot: h.slot, value: h.value, at: h.at, w: Math.round(h.w * 100) / 100,
    used: h.slot === 'speed' ? h.value === r.speed : h.value === r[h.slot] }));
  return r;
}
