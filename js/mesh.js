'use strict';
// ---- ポリゴンの生き物を描く ----
// 形は models.js のデータ（3D モデルから作った、動きつきのポリゴン）。ただし、これは「生き物の形をした魔法」なので、
// 実物のようには描かない。前のほう（頭・肩・つばさ）だけが形を保ち、うしろは破片にほどけて、光の尾になって流れる。
// 置き方：体のまん中を、道すじの上の「頭」の位置に置く。体は地面に対してまっすぐ立ち、それを斜め上から見る。
//         頭は、いつも、そのとき進んでいる向きへ向く（的へ遠ざかる間は後ろ姿。横へ動けば横顔）。曲がるときは内側へ傾く。
// 描き方：裏を向いた面を淡く（中が透けて見える）、表の面を光の当たり具合で 4 段に（加算）。頭から尾へ、光の帯が流れる。
//         輪郭を明るい線で描き、少し前の輪郭を残像として残す。属性ごとに、形がゆらぐ（炎・水）・はねる（雷）。
const CR_MV = 400, CR_MT = 800, CR_ME = 1300;   // 頂点・面・稜線の数の上限
const CR_LIGHT = [-0.42, -0.62, 0.66];          // 光の向き（画面の左上・手前から）
const CR_FACE = [0.4, 0.9, 1.5, 2.2];           // 面の濃さ（暗い段 → 明るい段。属性ごとの fillA にかかる）
const CR_INSIDE = 0.3;                          // 裏を向いた面の濃さ（中が透けて見える分）
const CR_CREASE = 0.86;                         // 折れ目の線を引く角度（となりの面との向きの近さ。1 に近いほど、線が増える）
const CR_FLOW = [16, 13];                       // 頭から尾へ流れる光の帯 [細かさ, 速さ]
const CR_SHED = 1.7;                            // うしろの面が、破片になって流れていく速さ（1 秒あたりの回数）
const CR_GHOSTS = 2, CR_GHOST_SEC = 0.05;       // 残像の数と、間隔（秒）
const CR_WARP = { fire: [1, 0.012], water: [1, 0.016], wind: [1, 0.012], dark: [1, 0.008], thunder: [2, 0.02] };      // 属性ごとの形のゆらぎ [1 ゆれる・2 はねる, 大きさ（体の長さの何倍）]
const CR_MESH = {};
const crMX = new Float32Array(CR_MV), crMY = new Float32Array(CR_MV), crMD = new Float32Array(CR_MV), crME = new Float32Array(CR_MV), crMK = new Uint8Array(CR_MV);   // 頂点：画面の位置・奥行き・出てきた度合い・かくす印
const crFB = new Int8Array(CR_MT), crFX = new Float32Array(CR_MT), crFY = new Float32Array(CR_MT), crFD = new Float32Array(CR_MT), crFU = new Float32Array(CR_MT);     // 面：種類（-1 かくす、0〜3 明るさの段、4 線だけ、5 裏、6 破片）、向き、ほどけ具合
const crSil = new Uint8Array(CR_ME), crGX = [], crGY = [], crGS = [];                        // 輪郭の印と、残像（少し前の頂点の位置と輪郭）
for (let k = 0; k < CR_GHOSTS; k++){ crGX.push(new Float32Array(CR_MV)); crGY.push(new Float32Array(CR_MV)); crGS.push(new Uint8Array(CR_ME)); }

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
  const cx = new Float32Array(nt), hs = new Float32Array(nt);                           // 面の前後の位置（頭 +0.5 〜 尾 −0.5）と、面ごとの決まった乱れ
  for (let k = 0; k < nt; k++){ cx[k] = (V[T[k * 3] * 3] + V[T[k * 3 + 1] * 3] + V[T[k * 3 + 2] * 3]) / 48000; hs[k] = crH(k, 7); }
  return CR_MESH[form] = { f: d.f, n: d.n, nt, V, T, E: Int32Array.from(E).subarray(0, CR_ME * 4), eye: d.e || [], cx, hs };
}
const crWrap = a => a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;

// 体を描く。位置と大きさは、crBuild で並べた節の先頭（crX[0]・crY[0]・crQ[0]）を使う
function crDrawMesh(c, t, a, lw){
  const M = c.mesh, f = c.f, E = c.E, col = c.col, n = M.n, V = M.V, T = M.T, nt = M.nt, o = crO, X = crMX, Y = crMY, D = crMD;
  // 動きのコマ（となりのコマとの間を、なめらかにつなぐ）
  const ph = (((t - c.t0) * f.rate * c.v.fq + c.v.ph / TAU) % 1) * M.f, kf = Math.floor(ph), k0 = kf % M.f, k1 = (k0 + 1) % M.f, w1 = ph - kf, w0 = 1 - w1;
  // 向き：体は地面に対してまっすぐ立ち（上＝画面の上）、それを斜め上から見る。
  //       頭は、そのとき進んでいる向きへ向ける：画面の上で、体の軸が、進む向きとぴったり重なるように回す（yaw）。
  //       画面の上へ進めば後ろ姿、横へ進めば横顔、手前へ戻ってくるときは、こちらを向く。
  //       曲がるときは内側へ傾き（roll）、尾は遅れてついてくる。
  const tau = (t - c.t0) / c.dur, tc = tau < 1 ? tau : 1, dtau = 0.012, ce = Math.cos(f.elev), se = Math.sin(f.elev);
  crAt(c, tc + dtau, o); const hx = o.sx, hy = o.sy; crAt(c, tc - dtau, o);                      // いまの前後 2 点から、進む向きを読む（遅れを出さない）
  let vx = hx - o.sx, vu = o.sy - hy;                                               // 画面の右・上への動き
  if (c.motion === 'charge' && tau < 0.36 || Math.hypot(vx, vu) < 0.3){ vx = c.tx - hx; vu = hy - c.ty; }      // 身を引いてためている間・止まっている間は、的のほうを向く
  const want = Math.atan2(vx, vu / se);
  if (c.yaw == null) c.yaw = c.lag = want;
  c.yaw = crWrap(c.yaw + crWrap(want - c.yaw) * Math.min(1, c.dt * 45)); c.lag = crWrap(c.lag + crWrap(c.yaw - c.lag) * Math.min(1, c.dt * 5));
  const bend = Math.max(-1, Math.min(1, crWrap(c.lag - c.yaw))), roll = Math.max(-0.8, Math.min(0.8, -f.bank * bend));
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const q0 = crQ[0], grow = crSm(tau / 0.16), S = f.len * c.U * c.sz * c.v.len * q0 * (0.25 + 0.75 * grow) / 16000, cx = crX[0], cy = crY[0], span = S * 16000;
  const bob = f.bob ? f.bob * 16000 * Math.abs(Math.sin(ph / M.f * TAU)) : 0;                            // 足の運びに合わせて、体がはずむ
  const cut = 0.62 - 1.3 * tau / 0.2;                                               // 出てくる途中：ここより前（頭のほう）だけが、形になっている
  const eat = c.hit && (c.end || tau > 0.8), ex = c.ex, ey = c.ey, tx = c.tx, ty = c.ty;      // 命中：的をこえた所から、吸いこまれて消える
  const wp = CR_WARP[c.el], wm = wp ? wp[0] : 0, wa = wp ? wp[1] * 16000 : 0, wf = Math.floor(t * 22);
  for (let i = 0, o0 = k0 * n * 3, o1 = k1 * n * 3; i < n; i++, o0 += 3, o1 += 3){
    let x = V[o0] * w0 + V[o1] * w1, y = V[o0 + 1] * w0 + V[o1 + 1] * w1, z = V[o0 + 2] * w0 + V[o1 + 2] * w1;
    if (wm === 1){ y += wa * Math.sin(t * 13 + i * 2.1 + x * 0.0009); z += wa * Math.sin(t * 11 + i * 1.3); }                // ゆれる
    else if (wm === 2){ y += wa * (crH(i, wf) - 0.5) * 2; z += wa * (crH(i + 50, wf) - 0.5) * 2; }                          // はねる
    const xn = x / 16000, y1 = y * cr - z * sr + bob, z1 = y * sr + z * cr;
    const wt = xn < f.flex ? crSm((f.flex - xn) / (f.flex + 0.5)) : 0, ya = c.yaw + bend * wt * f.tail, cyw = Math.cos(ya), syw = Math.sin(ya);     // 尾のほうほど、遅れた向きになる
    const wr = x * syw + z1 * cyw, wb = -x * cyw + z1 * syw, px = cx + wr * S, py = cy - (y1 * ce - wb * se) * S;
    X[i] = px; Y[i] = py; D[i] = (wb * ce + y1 * se) * S;
    const em = crME[i] = crSm((xn - cut) / 0.3);
    crMK[i] = em <= 0 || eat && (px - tx) * ex + (py - ty) * ey > 0 ? 1 : 0;
  }
  // 面：向きと、光の当たり具合。うしろのほうの面は、くり返し破片になって流れていく
  const L = CR_LIGHT, shed = t * CR_SHED, flow = t * CR_FLOW[1]; let front = 0, loose = 0;
  for (let k = 0, p = 0; k < nt; k++, p += 3){
    const ia = T[p], ib = T[p + 1], ic = T[p + 2];
    if (crMK[ia] | crMK[ib] | crMK[ic]){ crFB[k] = -1; continue; }
    const km = (f.melt - M.cx[k]) / (f.melt + 0.5);
    if (km > 0){ const u = ((M.hs[k] + shed) % 1) * (km * 1.3 < 1 ? km * 1.3 : 1); if (u > 0.1){ crFB[k] = 6; crFU[k] = u; loose++; continue; } }
    const x1 = X[ib] - X[ia], y1 = Y[ib] - Y[ia], d1 = D[ib] - D[ia], x2 = X[ic] - X[ia], y2 = Y[ic] - Y[ia], d2 = D[ic] - D[ia];
    const nd = x1 * y2 - y1 * x2;
    if (nd >= 0){ crFB[k] = 5; continue; }                                           // 裏を向いた面
    const nx = y1 * d2 - d1 * y2, ny = d1 * x2 - x1 * d2, l = -1 / (Math.sqrt(nx * nx + ny * ny + nd * nd) || 1);
    const fx = crFX[k] = nx * l, fy = crFY[k] = ny * l, fd = crFD[k] = nd * l;
    let sh = 0.5 + 0.5 * (fx * L[0] + fy * L[1] + fd * L[2]); if (Math.sin(M.cx[k] * CR_FLOW[0] + flow) > 0.72) sh += 0.24;      // 流れる光の帯
    crFB[k] = crME[ia] + crME[ib] + crME[ic] < 1.5 ? 4 : sh < 0.34 ? 0 : sh < 0.56 ? 1 : sh < 0.78 ? 2 : 3;      // 出てきたばかりの所は、まだ線だけ
    front++;
  }
  const ED = M.E, ne = ED.length / 4, ra = Math.max(0.72, E.rimA) * CR_RIM * a, fa0 = Math.max(0.1, E.fillA) * CR_FILL * a;
  // 残像：少し前の輪郭を、淡く残す（速さが見える）
  for (let j = 0; j < c.gn; j++){
    const gi = (c.gi - 1 - j + CR_GHOSTS * 2) % CR_GHOSTS, gx = crGX[gi], gy = crGY[gi], gs = crGS[gi];
    g.beginPath(); for (let e = 0; e < ne; e++) if (gs[e]){ g.moveTo(gx[ED[e * 4]], gy[ED[e * 4]]); g.lineTo(gx[ED[e * 4 + 1]], gy[ED[e * 4 + 1]]); }
    g.strokeStyle = col.rim; g.globalAlpha = ra * (j ? 0.07 : 0.15); g.lineWidth = lw * (1.6 + j); g.stroke();
  }
  if (!front && !loose) return;
  const tri = (k) => { const p = k * 3, ia = T[p], ib = T[p + 1], ic = T[p + 2]; g.moveTo(X[ia], Y[ia]); g.lineTo(X[ib], Y[ib]); g.lineTo(X[ic], Y[ic]); g.closePath(); };
  // 下に敷く暗い色：うしろの魔法陣の線や明るい景色から、形を浮かせる
  const ua = CR_UNDER * E.under * a;
  if (ua > 0.004){
    g.globalCompositeOperation = 'source-over'; g.beginPath();
    for (let k = 0; k < nt; k++) if (crFB[k] >= 0 && crFB[k] < 4) tri(k);
    g.fillStyle = col.under; g.globalAlpha = ua > 0.92 ? 0.92 : ua; g.fill(); g.globalCompositeOperation = 'lighter';
  }
  // 面：裏（中が透けて見える分）→ 暗い段 → 明るい段
  g.fillStyle = col.fill;
  for (let b = -1; b < 4; b++){
    const want2 = b < 0 ? 5 : b; g.beginPath(); let any = false;
    for (let k = 0; k < nt; k++) if (crFB[k] === want2){ tri(k); any = true; }
    if (!any) continue;
    if (b === 3) g.fillStyle = col.rim;
    g.globalAlpha = Math.min(1, fa0 * (b < 0 ? CR_INSIDE : CR_FACE[b])); g.fill();
  }
  // 破片：ちぢみながら、通ってきたほうへ流れる
  if (loose){
    const wn = Math.min(crI1 - 1, 5); let wx = crX[wn] - cx, wy = crY[wn] - cy; const wl = Math.hypot(wx, wy);
    if (wl > 1){ wx /= wl; wy /= wl; } else { wx = -ex; wy = -ey; }
    for (let grp = 0; grp < 2; grp++){
      g.beginPath();
      for (let k = 0, p = 0; k < nt; k++, p += 3){
        if (crFB[k] !== 6) continue; const u = crFU[k]; if ((u >= 0.45) !== (grp === 1)) continue;
        const ia = T[p], ib = T[p + 1], ic = T[p + 2], gx = (X[ia] + X[ib] + X[ic]) / 3, gy = (Y[ia] + Y[ib] + Y[ic]) / 3, sc = 1 - 0.75 * u;
        const off = u * u * span * f.drift, side = (M.hs[k] * 7.3 % 1 - 0.5) * u * span * 0.28, ox = gx + wx * off - wy * side, oy = gy + wy * off + wx * side;
        g.moveTo(ox + (X[ia] - gx) * sc, oy + (Y[ia] - gy) * sc); g.lineTo(ox + (X[ib] - gx) * sc, oy + (Y[ib] - gy) * sc); g.lineTo(ox + (X[ic] - gx) * sc, oy + (Y[ic] - gy) * sc); g.closePath();
      }
      g.fillStyle = col.fill; g.globalAlpha = Math.min(1, fa0 * (grp ? 0.7 : 1.5)); g.fill();
      g.strokeStyle = col.rim; g.globalAlpha = ra * (grp ? 0.14 : 0.34); g.lineWidth = lw * 0.55; g.stroke();
    }
  }
  // 稜線：面の折れ目と、輪郭（表と、そうでない所のさかい）
  g.beginPath(); let creases = false;
  for (let e = 0; e < ED.length; e += 4){
    const f1 = ED[e + 3]; if (f1 < 0) continue; const ka = ED[e + 2], fa = crFB[ka], fb = crFB[f1];
    if (fa < 0 || fa > 4 || fb < 0 || fb > 4) continue;
    if (fa === 4 || fb === 4 || crFX[ka] * crFX[f1] + crFY[ka] * crFY[f1] + crFD[ka] * crFD[f1] < CR_CREASE){ g.moveTo(X[ED[e]], Y[ED[e]]); g.lineTo(X[ED[e + 1]], Y[ED[e + 1]]); creases = true; }
  }
  if (creases){ g.strokeStyle = c.rare >= 2 ? col.acc : col.rim; g.globalAlpha = Math.min(1, ra * 0.3); g.lineWidth = lw * 0.55; g.stroke(); }
  g.beginPath();
  for (let e = 0, q = 0; e < ED.length; e += 4, q++){
    const fa = crFB[ED[e + 2]], f1 = ED[e + 3], fb = f1 < 0 ? -1 : crFB[f1], sa = fa >= 0 && fa <= 4, sb = fb >= 0 && fb <= 4;
    if (sa === sb){ crSil[q] = 0; continue; }
    crSil[q] = 1; g.moveTo(X[ED[e]], Y[ED[e]]); g.lineTo(X[ED[e + 1]], Y[ED[e + 1]]);
  }
  g.strokeStyle = col.rim; g.globalAlpha = ra * 0.1; g.lineWidth = lw * 3.6; g.stroke();
  g.globalAlpha = ra * 0.24; g.lineWidth = lw * 2; g.stroke();
  g.globalAlpha = Math.min(1, ra * 0.7); g.lineWidth = lw; g.stroke();
  // 目
  for (let k = 0; k < M.eye.length; k++){ const i = M.eye[k]; if (!crMK[i]) crDot(c.spr.hot, X[i], Y[i], span * f.eye * (D[i] > 0 ? 1 : 0.6), (D[i] > -1 ? 1 : 0.4) * a * crME[i]); }
  // 残像のために、いまの輪郭を覚えておく
  if (c.dt > 0 && t - c.gt >= CR_GHOST_SEC){ const gi = c.gi; crGX[gi].set(X.subarray(0, n)); crGY[gi].set(Y.subarray(0, n)); crGS[gi].set(crSil.subarray(0, ne)); c.gi = (gi + 1) % CR_GHOSTS; c.gt = t; if (c.gn < CR_GHOSTS) c.gn++; }
}
