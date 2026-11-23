'use strict';
// ---- 詠唱で出る生き物 ----
// いまは仮の姿（属性の色の光の玉が、道すじをまっすぐ飛ぶだけ）。
// main.js から呼ばれる入口：
//   spawnCreature(spec, n, rarity, t)：出す。spec＝{ element, form, motion, speed(-1/0/1), seed }（どれも必ず入っている）、
//                                      n＝装填の枚数（1〜3）、rarity＝0〜3（N・R・SR・SSR）。狙った先に着くまでの秒数を返す。
//   stepCreature(t, dt)：進める。狙った先に着いたコマで 1 回だけ true を返す。dt は 0 のことがある（絵が止まっている間）。
//   creatureZ()：頭の奥行き（main.js が、陣を通り抜ける判定と、カメラ映像の光の位置に使う）。
//   creatureEnd(hit, t)：着いたあとの知らせ。hit＝的に当たったか。当たれば砕けて散り、はずれなら遠くへ消えていく。
//   drawCreature(t)：描く（加算合成の状態で呼ばれる）。消え終わったら、自分で片づける。
//   clearCreature()：すぐ消す。
//   CREATURE_FORMS：描ける姿の一覧（ここにない姿は、main.js が「玉」に置きかえる）。
const CREATURE_FORMS = ['orb'];
let crt = null;
function spawnCreature(spec, n, rarity, t){
  crt = { spec, n, rarity, t0: t, dur: 1.0 - 0.2 * spec.speed, z: BEAM_Z0, arrived: false, end: 0, hit: false };
  return crt.dur;
}
function stepCreature(t, dt){
  if (!crt || crt.arrived) return false;
  const u = Math.min(1, (t - crt.t0) / crt.dur); crt.z = zAt(BEAM_Z0, Z1, u);
  if (u >= 1){ crt.arrived = true; return true; }
  return false;
}
function creatureZ(){ return crt ? crt.z : Z1; }
function creatureEnd(hit, t){ if (crt){ crt.end = t; crt.hit = hit; } }
function drawCreature(t){
  if (!crt) return;
  const hue = ELEMENT_HUE[crt.spec.element], [x, y, s] = proj(crt.z);
  let a = 1; if (crt.end){ a = 1 - (t - crt.end) / 0.4; if (a <= 0){ crt = null; return; } }
  const r = Math.min(40, Math.max(8, 0.3 * s)) * (1 + 0.15 * crt.rarity);
  glow(x, y, r * 1.8, 0.5 * a, hue); glow(x, y, r, 0.9 * a, hue);
}
function clearCreature(){ crt = null; }
