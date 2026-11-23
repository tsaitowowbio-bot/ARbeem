'use strict';
// ---- カメラ映像の側の演出（暗くする・照らす・命中の一瞬）----
// main.js などから呼ばれる。いまは何もしない。
//   updateBackdrop(t, rdt)：毎フレーム。t は演出の時計、rdt は実際に過ぎた秒数（時計が止まっていても進む）。
//   backdropEvent(name, n)：できごとの知らせ。name は 'load'（n＝装填ずみの枚数）、'trigger'・'fire'・'impact'（n＝撃った枚数）、
//                           'hit'（n＝撃った枚数。的に当たった）、'reset'（次の装填へ）。
function updateBackdrop(t, rdt){}
function backdropEvent(name, n){}
