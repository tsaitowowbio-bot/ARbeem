'use strict';
// ---- 魔法陣の形：外の帯・星・芯の 3 つを別々に回す（半径 1 で作っておく）----
function rnd(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const SHAPES = STAR.map(([p, q], i) => {
  const outer = new Path2D(), mid = new Path2D(), core = new Path2D(), r = rnd(1234 + i * 77);
  const ring = (P, R) => { P.moveTo(R, 0); P.arc(0, 0, R, 0, TAU); };
  ring(outer, 1); ring(outer, 0.94); ring(outer, 0.74);
  const n = 22 + i * 4;               // ルーン風の短い線
  for (let k = 0; k < n; k++){
    const a = k / n * TAU, c = Math.cos(a), s = Math.sin(a);
    const pt = (u, v) => { const R = 0.84 + v * 0.065, t = u * 0.05; return [c*R - s*t, s*R + c*t]; };
    outer.moveTo(...pt(r()*2-1, -1));
    for (let m = 0; m < 3; m++) outer.lineTo(...pt(r()*2-1, m - 1 + r()*0.5));
  }
  for (let k = 0; k < p * 2; k++){ const a = k / (p*2) * TAU, R1 = k % 2 ? 1.03 : 1.07;
    outer.moveTo(Math.cos(a), Math.sin(a)); outer.lineTo(Math.cos(a)*R1, Math.sin(a)*R1); }
  ring(mid, 0.70);
  const gcd = (a, b) => b ? gcd(b, a % b) : a, g2 = gcd(p, q);
  for (let j = 0; j < g2; j++) for (let k = 0; k <= p / g2; k++){
    const a = j / p * TAU + k * q / p * TAU; mid[k ? 'lineTo' : 'moveTo'](Math.cos(a)*0.70, Math.sin(a)*0.70); }
  for (let k = 0; k < p; k++){ const a = k / p * TAU, x = Math.cos(a)*0.70, y = Math.sin(a)*0.70;
    mid.moveTo(x + 0.05, y); mid.arc(x, y, 0.05, 0, TAU); }
  ring(core, 0.30); ring(core, 0.24);
  const m = 3 + i;
  for (let k = 0; k <= m; k++){ const a = k / m * TAU; core[k ? 'lineTo' : 'moveTo'](Math.cos(a)*0.24, Math.sin(a)*0.24); }
  for (let k = 0; k < m; k++){ const a = (k + 0.5) / m * TAU;
    core.moveTo(Math.cos(a)*0.30, Math.sin(a)*0.30); core.lineTo(Math.cos(a)*0.44, Math.sin(a)*0.44); }
  return [outer, mid, core];
});
const PART_SPIN = [1, -1.7, 3.1];   // 外・星・芯の回転の比（星は逆回り）

// heat：0＝ふだん、1＝白く燃える
function drawCircle(i, c, scale, alpha, heat, t){
  const [x, y, s] = proj(c.z || DEPTH[i]), R = (c.R != null ? c.R : RADIUS[i] * s) * scale, hue = HUE[i];
  const breath = 0.85 + 0.15 * Math.sin(t * 2.1 + i * 1.7);
  const lum = 72 + 24 * heat, sat = 95 - 45 * heat, A = alpha * (breath + heat * 0.6);
  g.save(); g.translate(x, y); g.scale(R, R * 0.9);
  // 輪に沿ったにじみ
  const gl = g.createRadialGradient(0, 0, 0.2, 0, 0, 1.3);
  gl.addColorStop(0, `hsla(${hue},90%,65%,${(0.05 + 0.30 * heat) * alpha})`);
  gl.addColorStop(0.68, `hsla(${hue},95%,62%,${(0.13 + 0.35 * heat) * A})`);
  gl.addColorStop(1, `hsla(${hue},95%,60%,0)`);
  g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 1.3, 0, TAU); g.fill();
  // 線：太く淡い → 中 → 細く明るい、の 3 度がき
  for (let k = 0; k < 3; k++){
    g.save(); g.rotate(c.ang[k]);
    const P = SHAPES[i][k];
    g.strokeStyle = `hsla(${hue},${sat}%,${lum - 8}%,${A * 0.10})`; g.lineWidth = (9 + heat * 10) / R; g.stroke(P);
    g.strokeStyle = `hsla(${hue},${sat}%,${lum}%,${A * 0.28})`;    g.lineWidth = (3.5 + heat * 3) / R; g.stroke(P);
    g.strokeStyle = `hsla(${hue},${sat}%,${lum + 12}%,${Math.min(1, A * 0.95)})`; g.lineWidth = 1.1 / R; g.stroke(P);
    g.restore();
  }
  // 外の輪を走る光と、輪の上を回る光の粒
  const sw = -c.ang[0] * 2.2 + i;
  g.strokeStyle = `rgba(255,255,255,${0.55 * alpha})`; g.lineWidth = 2.4 / R;
  g.beginPath(); g.arc(0, 0, 1, sw, sw + 0.7 + heat); g.stroke();
  g.beginPath(); g.arc(0, 0, 0.74, -sw, -sw + 0.5 + heat); g.stroke();
  for (let k = 0; k < 3; k++){
    const a = c.ang[0] * 1.6 + k * TAU / 3, px = Math.cos(a) * 0.97, py = Math.sin(a) * 0.97, pr = 0.07 + heat * 0.05;
    const pg = g.createRadialGradient(px, py, 0, px, py, pr);
    pg.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`); pg.addColorStop(1, `hsla(${hue},95%,70%,0)`);
    g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
  }
  g.restore();
}

// ---- 装填：1 枚ぶんたまったら、陣を 1 枚足す ----
const ghost = { ang: [0, 0, 0] };     // たまっていく途中の、次の 1 枚
function load(){
  if (phase !== 'load' || circles.length >= MAX) return;
  const i = circles.length, [x, y, s] = proj(DEPTH[i]);
  circles.push({ born: now(), ang: ghost.ang.slice(), w: SPIN[i] * 16, ignite: 0, burst: 0 });
  charge = 0;
  ring(DEPTH[i], RADIUS[i] * 0.6, RADIUS[i] * 1.6, 0.5, HUE[i], 0.35);
  flare(DEPTH[i], RADIUS[i] * s * 1.1, 0.45, HUE[i], 5);
  burstFromCircle(i, 30, 190, 9);
  circles.forEach(c => c.w += 1.2);                       // ほかの陣も、つられて一瞬速く回る
  sndLoad(i); lastOwn = now(); navigator.vibrate && navigator.vibrate(18);
  backdropEvent('load', circles.length);
}

// ---- 回転：装填直後は速く回って落ち着く／枚数が増えると速くなる／発射前に一気に上がる ----
function spinCircles(t, dt, spinUp){
  circles.forEach((c, i) => {
    let target = SPIN[i] * (1 + 0.5 * (circles.length - 1)) * (1 + 0.3 * Math.sin(t * 0.9 + i * 2));
    if (spinUp) target = SPIN[i] * (2 + 16 * spinUp);
    if (c.ignite) target = SPIN[i] * 30;
    c.w += (target - c.w) * (1 - Math.exp(-dt * (c.ignite ? 10 : 2.6)));
    const dir = i % 2 ? -1 : 1;
    for (let k = 0; k < 3; k++) c.ang[k] += c.w * PART_SPIN[k] * dir * dt;
  });
}

// ---- 次の 1 枚：光の粒が集まりながら、陣がうっすら現れてくる ----
function drawCharging(t, dt){
  if (!(phase === 'load' && circles.length < MAX && charge > 0.02)) return;
  const i = circles.length, [x, y, s] = proj(DEPTH[i]), R = RADIUS[i] * s;
  for (let k = 0; k < 3; k++) ghost.ang[k] += (2 + charge * 9) * PART_SPIN[k] * dt * (i % 2 ? -1 : 1);
  drawCircle(i, ghost, 1.35 - 0.35 * charge, charge * charge * 0.55, 0, t);
  if (dt > 0 && Math.random() < 0.3 + charge * 0.6){ const a = Math.random() * TAU, d = R * (1.5 + Math.random() * 0.6), life = 0.4;
    part(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, -Math.cos(a) * (d - R) / life, -Math.sin(a) * (d - R) * 0.9 / life, life, HUE[i], 5 + Math.random() * 5, 0); }
}

// ---- 装填ずみの魔法陣を描く（奥から手前へ）----
function drawCircles(t, spinUp){
  for (let i = circles.length - 1; i >= 0; i--){
    const c = circles[i], age = t - c.born;
    let scale = 1 + 0.6 * Math.exp(-age * 8), alpha = Math.min(1, age * 5);
    let heat = 0.9 * Math.exp(-age * 5) + spinUp * 0.25;
    if (c.ignite){ const x = t - c.ignite; heat = 0.38 + 0.5 * Math.exp(-x * 6); scale += 0.14 * Math.exp(-x * 12); }
    if (c.burst){ const b = (t - c.burst) / 0.45; if (b >= 1) continue; scale = 1 + b * 0.9; alpha = (1 - b) * (1 - b); heat = 1; }
    scale *= 1 - 0.1 * squeeze;                         // 発射直前の絞り（main.js が squeeze を決める）
    drawCircle(i, c, scale, alpha, heat, t);
  }
}
