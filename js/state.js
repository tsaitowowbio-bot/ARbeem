'use strict';
// ---- 状態（どのファイルからも読み書きする）----
let phase = 'idle', tPhase = 0, charge = 0, ignited = 0, shotN = 0, lastOwn = 0;
let circles = [];       // {born, ang[3], w, ignite, burst}
let wake = 0;           // ビームの残り（1 → 0）
let bulletZ = Z1;       // 弾の先頭の奥行き
let squeeze = 0;        // 発射直前の「絞り」（0〜1）。main.js が決め、circles.js が半径に反映する
let steady = true, lastShake = 0;

// ---- 時計 ----
// 演出の時間は now() で読む。hold(秒) で一瞬止められる（音は止まらない）。
// performance.now() を直接使うと、止めたときにずれるので使わない。
let clock = 0, holdLeft = 0;
const now = () => clock;
function hold(sec){ holdLeft = Math.max(holdLeft, sec); }
