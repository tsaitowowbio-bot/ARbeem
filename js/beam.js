'use strict';
// ---- ビーム：重ねた光の柱＋走る光のかたまり＋らせんの帯。先頭に透けた弾 ----
// 装填の枚数で別物になる。1 枚は細く速い一発、2 枚でらせんが 1 本、3 枚で全部入り。
const BR = 0.15;                    // 弾の太さ
const BEAM_W = [0.5, 0.78, 1];      // 装填 1・2・3 枚のときの太さ
const BEAM_Z0 = Z0 + 0.5;           // ビームの手前の端（手前の陣のすぐ前）
const BEAM_MAX = 13;                // 手前は遠近で極端に太くなるので、画面上の太さ（px）に上限をつける。淡さを保つため
const zAt = (za, zb, k) => 1 / (1/za + (1/zb - 1/za) * k);     // 画面の上で等間隔になる進み方

// 道すじに沿った帯を塗る。P は道すじの点（proj の結果）の並び。道すじは、狙った先へ向けて曲がることがある
function strip(P, k, style){
  const N = P.length - 1;
  g.fillStyle = style; g.beginPath();
  for (let pass = 0; pass < 2; pass++) for (let jj = 0; jj <= N; jj++){
    const j = pass ? N - jj : jj, a = P[Math.max(0, j - 1)], b = P[Math.min(N, j + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const w = Math.min(k * BEAM_MAX, Math.max(BR * k * P[j][2], k * 2.2)) * (pass ? -1 : 1), x = P[j][0] + nx * w, y = P[j][1] + ny * w;
    if (pass === 0 && jj === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.fill();
}
// zn：先頭の奥行き。a：残り具合（1 → 0）。n：装填の枚数。tail：手前から消えた割合（0 → 1）
function drawBeam(zn, a, t, n, tail){
  const wn = BEAM_W[n - 1], zs = tail > 0 ? zAt(BEAM_Z0, zn, Math.min(0.97, tail)) : BEAM_Z0;
  const N = 10, P = []; for (let j = 0; j <= N; j++) P.push(proj(zAt(zs, zn, j / N)));
  const [x0, y0] = P[0], [x1, y1] = P[N];
  // 幅を変えて何枚も重ね、芯ほど明るい、やわらかい柱にする
  const K = n === 1 ? [1.9, 1.2, 0.7, 0.38, 0.2] : [3.4, 2.6, 1.9, 1.35, 0.95, 0.62, 0.38, 0.2];
  K.forEach((k, i) => { const j = i + 8 - K.length, al = (0.02 + j * 0.009) * a, gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(160,220,255,0)'); gr.addColorStop(0.22, `rgba(${170 + j*10},${225 + j*4},255,${al})`);
    gr.addColorStop(1, `rgba(${200 + j*7},${238 + j*2},255,${al * 1.5})`);
    strip(P, k * wn * (0.25 + 0.75 * a), gr); });
  // 柱の中を先へ走る光のかたまり
  const cnt = [3, 5, 7][n - 1];
  for (let j = 0; j < cnt; j++){
    const u = (t * 2.6 + j / cnt) % 1, [x, y, s] = proj(zAt(zs, zn, u));
    glow(x, y, Math.min(24, Math.max(BR * 2.4 * s, 5)) * a * wn, 0.45 * a * Math.sin(u * Math.PI), 200, 1, 2.2);
  }
  // らせん：奥ほど細くなる光の帯（2 枚で 1 本、3 枚で 2 本）
  for (let sgn = 0; sgn < n - 1; sgn++){
    let px = 0, py = 0;
    for (let k = 0; k <= 70; k++){
      const z = zAt(zs, zn, k / 70), [x, y, s] = proj(z);
      const ph = z * 4.2 - t * 26 + sgn * Math.PI, rr = Math.min(46, BR * 1.7 * s) * (0.5 + 0.5 * a);
      const qx = x + Math.cos(ph) * rr, qy = y + Math.sin(ph) * rr * 0.55;
      if (k){ const w = Math.min(5, Math.max(0.6, BR * 0.5 * s)) * a, fade = Math.min(1, k / 10);
        g.strokeStyle = `hsla(${sgn ? 288 : 188},100%,74%,${0.13 * a * fade})`; g.lineWidth = w * 3.2; g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
        g.strokeStyle = `hsla(${sgn ? 288 : 188},100%,90%,${0.46 * a * fade})`; g.lineWidth = w; g.stroke(); }
      px = qx; py = qy;
    }
  }
  glow(x1, y1, 26 * a * wn, 0.8 * a, 200);          // 先端（狙った先）に届いている光
}
function drawBullet(zn, n){
  const wn = BEAM_W[n - 1], len = [1.4, 1.8, 2.2][n - 1], zt = Math.max(Z0, zn - len), zs = zt + (zn - zt) * 0.55;
  const [nx, ny] = proj(zn), [sx, sy, ss] = proj(zs), [tx, ty, ts] = proj(zt);
  const dx = nx - tx, dy = ny - ty, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
  const wt = Math.max(BR * wn * ts, 3), ws = Math.max(BR * wn * ss, 3);
  const body = new Path2D();
  body.moveTo(tx + px*wt, ty + py*wt); body.lineTo(sx + px*ws, sy + py*ws);
  body.quadraticCurveTo(sx + (nx-sx)*0.6 + px*ws*0.85, sy + (ny-sy)*0.6 + py*ws*0.85, nx, ny);
  body.quadraticCurveTo(sx + (nx-sx)*0.6 - px*ws*0.85, sy + (ny-sy)*0.6 - py*ws*0.85, sx - px*ws, sy - py*ws);
  body.lineTo(tx - px*wt, ty - py*wt); body.closePath();
  const gr = g.createLinearGradient(tx, ty, nx, ny);
  gr.addColorStop(0, 'rgba(190,240,255,0.04)'); gr.addColorStop(0.55, 'rgba(215,245,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0.5)');
  g.fillStyle = gr; g.fill(body);
  g.strokeStyle = 'rgba(190,235,255,0.25)'; g.lineWidth = 4; g.stroke(body);
  g.strokeStyle = 'rgba(240,252,255,0.8)'; g.lineWidth = 1.1; g.stroke(body);
  // 弾の先：にじむ光と、押しのけられた空気の帯
  const ang = Math.atan2(dy, dx);
  glow(nx, ny, ws * 3.2 + 10 * wn, 0.85, 200);
  glow(nx, ny, ws * 1.6 + 6 * wn, 0.7, 200, 5, 0.6, ang + Math.PI / 2);
  if (n >= 2) glow(sx, sy, ws * 2.6 + 6, 0.35, 200, 1.6, 2.6, ang + Math.PI / 2);
}
