'use strict';
// ---- 調整用の値 ----
const MAX = 3;              // 魔法陣の枚数
const CHARGE_SEC = 0.55;    // かまえて 1 枚たまるまでの秒数
const HI = 0.5;             // 効果音の高さ（1 で元の高さ。小さいほど低い）
const SHAKE_G = 13;         // 振りと見なす加速度（m/s²、重力を除く）
const SHAKE_GAP = 320;      // 振りを続けて数えない時間（ms）
const READY_SEC = 0.3;      // 発射の合図から、最初の点火まで（回転が上がり、光が集まる）
const IGNITE_GAPS = [0.16, 0.10];       // 点火の間隔。だんだん詰まる（3 枚なら 0.16 → 0.10、2 枚なら 0.10 だけ）
const LAST_GAP = 0.09;      // 最後の点火から、絵が止まるまで
const PRE_HOLD = [0.07, 0.08, 0.10];    // 発射の直前に、絵を止める秒数（装填 1・2・3 枚）。音もここで一瞬とぎれる
const HIT_STOP = [0.035, 0.05, 0.07];   // 命中の瞬間に、絵を止める秒数
const FLY = [0.32, 0.42, 0.5];          // 弾が狙った先に届くまでの秒数
const COOL_SEC = [0.55, 0.8, 1.0];      // 着弾から、次の装填が始まるまでの秒数
const CAM_ZOOM = 1.05;      // カメラ映像を少し拡大しておく（反動で引いたときに、端が見えないように）
const TOL = [0, 0.04, 0.065, 0.095];    // 当たる範囲（照準の輪の半径、ラジアン）。装填 1・2・3 枚のとき
const TARGETS = 3;          // 同時に浮かぶ的の数
const VOICE_MIN = 0.07;     // 声と見なす最小の大きさ（0〜1）
const VOICE_RATIO = 4;      // まわりの音の何倍で声と見なすか
const DEPTH = [1.3, 2.3, 3.8];          // 魔法陣の奥行き（手前→奥）
const RADIUS = [0.56, 0.80, 1.08];      // 魔法陣の大きさ
const STAR = [[6,2],[5,2],[8,3]];       // 中の星形（頂点数, とばす数）
const HUE = [186, 212, 262];            // 色（水色 → 青 → 紫）
const SPIN = [0.55, 0.42, 0.32];        // ふだんの回転の速さ（rad/秒）
const Z0 = 0.6, Z1 = 40, Y0 = -0.5;     // 弾道（手元の下 → 画面中央の奥）
const Z_BEND = 4.2;         // これより奥は、狙った先（空間に固定した向き）へ向かって曲がる
const TAU = Math.PI * 2;

const cv = document.getElementById('fx'), g = cv.getContext('2d');
const hud = document.getElementById('hud'), fireBtn = document.getElementById('fire'), voiceBtn = document.getElementById('voice'), scoreEl = document.getElementById('score'), volBtn = document.getElementById('vol'), camEl = document.getElementById('cam');
let W = 0, H = 0, F = 0, DPR = 1, FC = 400;
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight; F = Math.min(W, H) * 0.92; FC = Math.min(W, H) * 1.07 * CAM_ZOOM;   // FC：カメラ映像の画角に合わせた倍率
  cv.width = W * DPR; cv.height = H * DPR;
}
addEventListener('resize', resize); resize();

// ---- 奥行き z の点が、画面のどこに来るか ----
// 手前（魔法陣のあたり）は端末についてくる。向きの変化には、少し遅れてついてくる。
// dir（空間に固定した向き）があるときは、奥ほどその向きへ寄る。撃ったあとにスマホを振っても、着弾の場所は動かない。
let ox = 0, oy = 0;
const pathY = z => Y0 * (1 - (z - Z0) / (Z1 - Z0));
function proj(z, dir = anchorDir){
  const par = Math.max(0, 0.55 - z / 9);
  let cx = W / 2, cy = H / 2;
  if (dir && z > Z_BEND){ const p = toScreen(dir), w = (1 - Z_BEND / z) / (1 - Z_BEND / Z1); cx += (p.sx - cx) * w; cy += (p.sy - cy) * w; }
  return [cx + ox * par, cy - pathY(z) / z * F + oy * par, F / z];
}
