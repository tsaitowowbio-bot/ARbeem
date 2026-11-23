'use strict';
// ---- ビーム：重ねた光の柱＋走る光のかたまり＋らせんの帯。先頭に透けた弾 ----
const BR = 0.15;   // 弾の太さ
const zAt = (za, zb, k) => 1 / (1/za + (1/zb - 1/za) * k);     // 画面の上で等間隔になる進み方
function quad(za, zb, k, style){
  const [ax, ay, as] = proj(za), [bx, by, bs] = proj(zb), wa = BR * k * as, wb = Math.max(BR * k * bs, k * 2.2);
  g.fillStyle = style; g.beginPath();
  g.moveTo(ax - wa, ay); g.lineTo(bx - wb, by); g.lineTo(bx + wb, by); g.lineTo(ax + wa, ay); g.fill();
}
function drawBeam(zn, a, t){
  const [x0, y0] = proj(Z0), [x1, y1] = proj(zn);
  // 幅を変えて何枚も重ね、芯ほど明るい、やわらかい柱にする
  const K = [3.4, 2.6, 1.9, 1.35, 0.95, 0.62, 0.38, 0.2];
  K.forEach((k, j) => { const al = (0.028 + j * 0.012) * a, gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(160,220,255,0)'); gr.addColorStop(0.22, `rgba(${170 + j*10},${225 + j*4},255,${al})`);
    gr.addColorStop(1, `rgba(${200 + j*7},${238 + j*2},255,${al * 1.5})`);
    quad(Z0, zn, k * (0.25 + 0.75 * a), gr); });
  // 柱の中を先へ走る光のかたまり
  for (let j = 0; j < 7; j++){
    const u = (t * 2.6 + j / 7) % 1, [x, y, s] = proj(zAt(Z0, zn, u));
    glow(x, y, Math.max(BR * 2.4 * s, 5) * a, 0.5 * a * Math.sin(u * Math.PI), 200, 1, 2.2);
  }
  // らせん：奥ほど細くなる光の帯
  for (let sgn = 0; sgn < 2; sgn++){
    let px = 0, py = 0;
    for (let k = 0; k <= 70; k++){
      const z = zAt(Z0, zn, k / 70), [x, y, s] = proj(z);
      const ph = z * 4.2 - t * 26 + sgn * Math.PI, rr = BR * 1.7 * s * (0.5 + 0.5 * a);
      const qx = x + Math.cos(ph) * rr, qy = y + Math.sin(ph) * rr * 0.55;
      if (k){ const w = Math.max(0.6, BR * 0.5 * s) * a, fade = Math.min(1, k / 10);
        g.strokeStyle = `hsla(${sgn ? 288 : 188},100%,74%,${0.13 * a * fade})`; g.lineWidth = w * 3.2; g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
        g.strokeStyle = `hsla(${sgn ? 288 : 188},100%,90%,${0.46 * a * fade})`; g.lineWidth = w; g.stroke(); }
      px = qx; py = qy;
    }
  }
  glow(x1, y1, 26 * a, 0.8 * a, 200);          // 先端（狙った先）に届いている光
}
function drawBullet(zn){
  const len = 2.2, zt = Math.max(Z0, zn - len), zs = zt + (zn - zt) * 0.55;
  const [nx, ny] = proj(zn), [sx, sy, ss] = proj(zs), [tx, ty, ts] = proj(zt);
  const dx = nx - tx, dy = ny - ty, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
  const wt = Math.max(BR * ts, 3), ws = Math.max(BR * ss, 3);
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
  glow(nx, ny, ws * 3.2 + 10, 0.85, 200);
  glow(nx, ny, ws * 1.6 + 6, 0.7, 200, 5, 0.6, ang + Math.PI / 2);
  glow(sx, sy, ws * 2.6 + 6, 0.35, 200, 1.6, 2.6, ang + Math.PI / 2);
}
