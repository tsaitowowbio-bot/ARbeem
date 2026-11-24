'use strict';
// ---- ポリゴンの生き物を描く ----
// 形は models.js のデータ（3D モデルから作った、動きつきのポリゴン）。ここでは、それを画面に置いて、面と稜線で描く。
// 置き方：体のまん中を、道すじの上の「頭」の位置に置く。体は地面に対してまっすぐ立ち、的へ向かって遠ざかっていく。
//         それを、うしろ斜め上から見る（実際にそこにいたら、こう見えるはず、という向き）。
//         横へ動けばそちらへ向きを変え、曲がるときは内側へ傾き、尾は遅れてついてくる。陣からは、頭から順に形になる。
// 描き方：カメラ側を向いた面だけを、光の当たり具合で 4 段の明るさに分けて、淡く塗る（加算）。
//         輪郭（表と裏のさかい目）を明るい線で、面の折れ目を細い線で描く。中は透けたままにする。
const CR_MV = 400, CR_MT = 800;                 // 頂点・面の数の上限
const CR_LIGHT = [-0.42, -0.62, 0.66];          // 光の向き（画面の左上・手前から）
const CR_FACE = [0.4, 0.9, 1.5, 2.2];           // 面の濃さ（暗い段 → 明るい段。属性ごとの fillA にかかる）
const CR_CREASE = 0.86;                         // 折れ目の線を引く角度（となりの面との向きの近さ。1 に近いほど、線が増える）
const CR_MESH = {};
const crMX = new Float32Array(CR_MV), crMY = new Float32Array(CR_MV), crMD = new Float32Array(CR_MV), crME = new Float32Array(CR_MV), crMK = new Uint8Array(CR_MV);   // 頂点：画面の位置・奥行き・出てきた度合い・かくす印
const crFB = new Int8Array(CR_MT), crFX = new Float32Array(CR_MT), crFY = new Float32Array(CR_MT), crFD = new Float32Array(CR_MT);      // 面：明るさの段（-1 かくす、-2 裏、4 線だけ）と、向き

// データを、使える形にほどく（はじめて使うときに 1 回）。稜線（面と面のさかい）も、ここで作る
function crMesh(form){
  if (form in CR_MESH) return CR_MESH[form];
  const d = typeof CR_MODEL_DATA === 'object' ? CR_MODEL_DATA[form] : null;
  if (!d || d.n > CR_MV || d.t.length / 3 > CR_MT) return CR_MESH[form] = null;
  const bin = atob(d.v), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const V = new Int16Array(u8.buffer), T = Uint16Array.from(d.t), nt = T.length / 3, seen = new Map(), E = [];
  for (let k = 0; k < nt; k++) for (let j = 0; j < 3; j++){
    const a = T[k * 3 + j], b = T[k * 3 + (j + 1) % 3], key = a < b ? a * 65536 + b : b * 65536 + a, e = seen.get(key);
    if (e === undefined){ seen.set(key, E.length); E.push(a, b, k, -1); } else if (E[e + 3] < 0) E[e + 3] = k;
  }
  return CR_MESH[form] = { f: d.f, n: d.n, nt, V, T, E: Int32Array.from(E), eye: d.e || [] };
}
const crWrap = a => a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;

// 体を描く。位置と大きさは、crBuild で並べた節の先頭（crX[0]・crY[0]・crQ[0]）を使う
function crDrawMesh(c, t, a, lw){
  const M = c.mesh, f = c.f, E = c.E, col = c.col, n = M.n, V = M.V, T = M.T, nt = M.nt, o = crO;
  // 動きのコマ（となりのコマとの間を、なめらかにつなぐ）
  const ph = (((t - c.t0) * f.rate * c.v.fq + c.v.ph / TAU) % 1) * M.f, kf = Math.floor(ph), k0 = kf % M.f, k1 = (k0 + 1) % M.f, w1 = ph - kf, w0 = 1 - w1;
  // 向き：体はいつも地面に対してまっすぐ（上＝画面の上）。的へ向かって遠ざかる姿を、うしろ斜め上から見る。
  //       横へ動くぶんだけ、そちらへ首を振る（yaw）。曲がるときは内側へ傾き（roll）、尾は遅れてついてくる。
  const tau = (t - c.t0) / c.dur, dtau = 0.03;
  crAt(c, tau < 1 ? tau : 1, o); const hx = o.sx; crAt(c, (tau < 1 ? tau : 1) - dtau, o);
  const vx = (hx - o.sx) / (dtau * c.dur), want = f.yaw * c.v.side + f.turn * Math.atan2(vx, c.L0 / c.dur);
  if (c.yaw == null) c.yaw = c.lag = want;
  c.yaw += (want - c.yaw) * Math.min(1, c.dt * 14); c.lag += (c.yaw - c.lag) * Math.min(1, c.dt * 5);
  const bend = Math.max(-1, Math.min(1, c.lag - c.yaw)), roll = Math.max(-0.8, Math.min(0.8, -f.bank * bend));
  const cr = Math.cos(roll), sr = Math.sin(roll), ce = Math.cos(f.elev), se = Math.sin(f.elev);
  const q0 = crQ[0], grow = crSm(tau / 0.16), S = f.len * c.U * c.sz * c.v.len * q0 * (0.25 + 0.75 * grow) / 16000, cx = crX[0], cy = crY[0];
  const bob = f.bob ? f.bob * 16000 * Math.abs(Math.sin(ph / M.f * TAU)) : 0;                            // 足の運びに合わせて、体がはずむ
  const cut = 0.62 - 1.3 * tau / 0.2;                                               // 出てくる途中：ここより前（頭のほう）だけが、形になっている
  const eat = c.hit && (c.end || tau > 0.8), ex = c.ex, ey = c.ey, tx = c.tx, ty = c.ty;      // 命中：的をこえた所から、吸いこまれて消える
  for (let i = 0, o0 = k0 * n * 3, o1 = k1 * n * 3; i < n; i++, o0 += 3, o1 += 3){
    const x = V[o0] * w0 + V[o1] * w1, y = V[o0 + 1] * w0 + V[o1 + 1] * w1, z = V[o0 + 2] * w0 + V[o1 + 2] * w1;
    const xn = x / 16000, y1 = y * cr - z * sr + bob, z1 = y * sr + z * cr;
    const wt = xn < f.flex ? crSm((f.flex - xn) / (f.flex + 0.5)) : 0, ya = c.yaw + bend * wt * f.tail, cyw = Math.cos(ya), syw = Math.sin(ya);     // 尾のほうほど、遅れた向きになる
    const wr = x * syw + z1 * cyw, wb = -x * cyw + z1 * syw, px = cx + wr * S, py = cy - (y1 * ce - wb * se) * S;
    crMX[i] = px; crMY[i] = py; crMD[i] = (wb * ce + y1 * se) * S;
    const em = crME[i] = crSm((xn - cut) / 0.3);
    crMK[i] = em <= 0 || eat && (px - tx) * ex + (py - ty) * ey > 0 ? 1 : 0;
  }
  // 面：向きと、光の当たり具合
  const X = crMX, Y = crMY, D = crMD, L = CR_LIGHT; let front = 0;
  for (let k = 0, p = 0; k < nt; k++, p += 3){
    const ia = T[p], ib = T[p + 1], ic = T[p + 2];
    if (crMK[ia] | crMK[ib] | crMK[ic]){ crFB[k] = -1; continue; }
    const x1 = X[ib] - X[ia], y1 = Y[ib] - Y[ia], d1 = D[ib] - D[ia], x2 = X[ic] - X[ia], y2 = Y[ic] - Y[ia], d2 = D[ic] - D[ia];
    const nd = x1 * y2 - y1 * x2;
    if (nd >= 0){ crFB[k] = -2; continue; }                                          // 裏を向いた面
    const nx = y1 * d2 - d1 * y2, ny = d1 * x2 - x1 * d2, l = -1 / (Math.sqrt(nx * nx + ny * ny + nd * nd) || 1);
    const fx = crFX[k] = nx * l, fy = crFY[k] = ny * l, fd = crFD[k] = nd * l, sh = 0.5 + 0.5 * (fx * L[0] + fy * L[1] + fd * L[2]);
    crFB[k] = crME[ia] + crME[ib] + crME[ic] < 1.5 ? 4 : sh < 0.34 ? 0 : sh < 0.56 ? 1 : sh < 0.78 ? 2 : 3;      // 出てきたばかりの所は、まだ線だけ
    front++;
  }
  if (!front) return;
  const tri = (k) => { const p = k * 3, ia = T[p], ib = T[p + 1], ic = T[p + 2]; g.moveTo(X[ia], Y[ia]); g.lineTo(X[ib], Y[ib]); g.lineTo(X[ic], Y[ic]); g.closePath(); };
  // 下に敷く暗い色：うしろの魔法陣の線や明るい景色から、形を浮かせる
  const ua = CR_UNDER * E.under * a;
  if (ua > 0.004){
    g.globalCompositeOperation = 'source-over'; g.beginPath();
    for (let k = 0; k < nt; k++) if (crFB[k] >= 0 && crFB[k] < 4) tri(k);
    g.fillStyle = col.under; g.globalAlpha = ua > 0.92 ? 0.92 : ua; g.fill(); g.globalCompositeOperation = 'lighter';
  }
  // 面：暗い段から明るい段へ
  g.fillStyle = col.fill;
  for (let b = 0; b < 4; b++){
    g.beginPath(); let any = false;
    for (let k = 0; k < nt; k++) if (crFB[k] === b){ tri(k); any = true; }
    if (!any) continue;
    if (b === 3) g.fillStyle = col.rim;
    g.globalAlpha = Math.min(1, Math.max(0.1, E.fillA) * CR_FILL * CR_FACE[b] * a); g.fill();      // 淡い属性（風）でも、面の向きは読めるようにする
  }
  // 稜線：輪郭（表と裏のさかい・出てきたふち）と、面の折れ目
  const ED = M.E, ra = Math.max(0.72, E.rimA) * CR_RIM * a;
  g.beginPath(); let creases = false;
  for (let e = 0; e < ED.length; e += 4){
    const fa = crFB[ED[e + 2]], f1 = ED[e + 3], fb = f1 < 0 ? -2 : crFB[f1];
    if (fa < 0 || fb < 0) continue;
    const ka = ED[e + 2];
    if (fa === 4 || fb === 4 || crFX[ka] * crFX[f1] + crFY[ka] * crFY[f1] + crFD[ka] * crFD[f1] < CR_CREASE){ g.moveTo(X[ED[e]], Y[ED[e]]); g.lineTo(X[ED[e + 1]], Y[ED[e + 1]]); creases = true; }
  }
  if (creases){ g.strokeStyle = c.rare >= 2 ? col.acc : col.rim; g.globalAlpha = Math.min(1, ra * 0.3); g.lineWidth = lw * 0.55; g.stroke(); }
  g.beginPath();
  for (let e = 0; e < ED.length; e += 4){
    const fa = crFB[ED[e + 2]], f1 = ED[e + 3], fb = f1 < 0 ? -2 : crFB[f1];
    if ((fa >= 0) === (fb >= 0)) continue;
    g.moveTo(X[ED[e]], Y[ED[e]]); g.lineTo(X[ED[e + 1]], Y[ED[e + 1]]);
  }
  g.strokeStyle = col.rim; g.globalAlpha = ra * 0.07; g.lineWidth = lw * 4.4; g.stroke();
  g.globalAlpha = ra * 0.2; g.lineWidth = lw * 2.1; g.stroke();
  g.globalAlpha = Math.min(1, ra * 0.65); g.lineWidth = lw; g.stroke();
  // 目
  for (let k = 0; k < M.eye.length; k++){ const i = M.eye[k]; if (!crMK[i]) crDot(c.spr.hot, X[i], Y[i], S * 16000 * f.eye * (D[i] > 0 || M.eye.length < 2 ? 1 : 0.6), (D[i] > -1 ? 1 : 0.45) * a * crME[i]); }
}
