'use strict';
// ---- 状態（どのファイルからも読み書きする）----
let phase = 'idle', tPhase = 0, charge = 0, ignited = 0, shotN = 0, lastOwn = 0;
let circles = [];       // {born, ang[3], w, ignite, burst}
let wake = 0;           // ビームの残り（1 → 0）
let bulletZ = Z1;       // 弾の先頭の奥行き
let squeeze = 0;        // 発射直前の「絞り」（0〜1）。main.js が決め、circles.js が半径に反映する
let steady = true, lastShake = 0;
let anchorDir = null;   // 撃った弾が向かう先（空間に固定した向き）。撃っていない間は null
let shotTargets = [];   // 発射の瞬間に、照準の輪に入っていた的
let recoil = 0, recV = 0;   // 発射の反動（ばねで戻る）
let spell = null;       // 詠唱で撃つ魔法 { spec, rarity }。ふつうのビームのときは null
let castHue = null;     // 詠唱で撃つ魔法の色（色相）。ふつうのビームのときは null
let chanting = false;   // 声で詠唱を聞き取っている間は true（声の大きさでの発射を止める）
// dir を向き先にして fn を実行する（その中で作った光は、その向きに固定される）
function withDir(dir, fn){ const keep = anchorDir; anchorDir = dir; try { fn(); } finally { anchorDir = keep; } }

// ---- 時計 ----
// 演出の時間は now() で読む。hold(秒) で一瞬止められる（音は止まらない）。
// performance.now() を直接使うと、止めたときにずれるので使わない。
let clock = 0, holdLeft = 0;
const now = () => clock;
function hold(sec){ holdLeft = Math.max(holdLeft, sec); }
