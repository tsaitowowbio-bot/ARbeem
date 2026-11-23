'use strict';
// ---- 光のにじみ（先に絵を作っておき、貼って使う）----
const SPR = {};
[186, 212, 262, 200, 45, 320].forEach(h => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, `hsla(${h},100%,82%,0.75)`);
  gr.addColorStop(0.5, `hsla(${h},100%,65%,0.22)`); gr.addColorStop(1, `hsla(${h},100%,60%,0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); SPR[h] = c;
});
function glow(x, y, r, a, hue, sx, sy, rot){
  if (a <= 0.003 || r <= 0.2) return;
  g.globalAlpha = Math.min(1, a);
  if (sx){ g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(sx, sy || 1); g.drawImage(SPR[hue], -r, -r, r*2, r*2); g.restore(); }
  else g.drawImage(SPR[hue], x - r, y - r, r*2, r*2);
  g.globalAlpha = 1;
}

// ---- 光の粒・衝撃波の帯・閃光 ----
let parts = [], rings = [], flares = [], shards = [], shake = 0, flash = 0, punch = 0;
function part(x, y, vx, vy, life, hue, size, drag){ const p = { x, y, vx, vy, life, max: life, hue, size, drag: drag == null ? 2.5 : drag }; parts.push(p); return p; }
const STAR_HUE = [200, 45, 320, 262, 186];
function stars(x, y, n, speed, size, lift){        // またたく十字の星
  for (let k = 0; k < n; k++){ const a = Math.random() * TAU, v = speed * Math.random();
    const p = part(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 0.9, STAR_HUE[Math.random() * 5 | 0], size * (0.5 + Math.random()), 2.2);
    p.star = Math.random() * 9; p.lift = lift || 0; } }
function burstFromCircle(i, n, speed, size){
  const [x, y, s] = proj(DEPTH[i]), R = RADIUS[i] * s;
  for (let k = 0; k < n; k++){ const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
    part(x + Math.cos(a)*R, y + Math.sin(a)*R*0.9, Math.cos(a)*v, Math.sin(a)*v*0.9, 0.35 + Math.random()*0.5, HUE[i], size * (0.5 + Math.random())); }
}
// 作った瞬間の向き先（anchorDir）を覚えておく。あとでスマホを振っても、その場所に残る
function ring(z, r0, r1, dur, hue, thick, a){ rings.push({ z, r0, r1, dur, hue, thick: thick || 0.3, a: a || 1, born: now(), dir: anchorDir }); }
function flare(z, size, dur, hue, streak, a){ flares.push({ z, size, dur, hue, streak, a: a || 1, born: now(), dir: anchorDir }); }
function drawFx(t, dt){
  for (const r of rings){                         // 衝撃波：外へ広がる、やわらかい光の帯
    const u = Math.max(0, (t - r.born) / r.dur); if (u >= 1) continue;
    const [x, y, s] = proj(r.z, r.dir), e = 1 - Math.pow(1 - u, 3), R = (r.r0 + (r.r1 - r.r0) * e) * s, a = Math.pow(1 - u, 1.5) * r.a;
    g.save(); g.translate(x, y); g.scale(1, 0.9);
    const gr = g.createRadialGradient(0, 0, Math.max(0, R * (1 - r.thick)), 0, 0, R * 1.1);
    gr.addColorStop(0, `hsla(${r.hue},95%,70%,0)`); gr.addColorStop(0.7, `hsla(${r.hue},95%,75%,${a * 0.3})`);
    gr.addColorStop(0.88, `hsla(${r.hue},95%,90%,${a * 0.6})`); gr.addColorStop(1, `hsla(${r.hue},95%,75%,0)`);      // 帯は白くしない（白は命中の一瞬だけ）
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R * 1.1, 0, TAU); g.fill(); g.restore();
  }
  rings = rings.filter(r => t - r.born < r.dur);
  for (const f of flares){                        // 閃光：丸いにじみ＋横に走る光
    const u = Math.max(0, (t - f.born) / f.dur); if (u >= 1) continue;
    const [x, y] = proj(f.z, f.dir), a = (1 - u) * (1 - u) * 0.6 * f.a;
    glow(x, y, f.size * (0.5 + 0.9 * u), a, f.hue);
    glow(x, y, f.size * 0.35, a, f.hue);
    if (f.streak){ glow(x, y, f.size * 0.16, a * 0.9, f.hue, f.streak * (1 + u), 1 - u * 0.6);
                   glow(x, y, f.size * 0.10, a * 0.5, f.hue, 1 - u * 0.5, f.streak * 0.45); }
  }
  flares = flares.filter(f => t - f.born < f.dur);
  for (const p of parts){                         // 光の粒：速いほど進む向きに伸びる
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; const d = Math.exp(-dt * p.drag); p.vx *= d; p.vy *= d;
    const a = Math.max(0, p.life / p.max), v = Math.hypot(p.vx, p.vy);
    if (p.star != null){ p.vy -= p.lift * dt; const tw = 0.55 + 0.45 * Math.sin(t * 17 + p.star * 3), r = p.size * Math.sin(Math.min(1, a * 1.6) * Math.PI / 2) * tw;
      glow(p.x, p.y, r * 0.8, a, p.hue); glow(p.x, p.y, r * 0.45, a, p.hue, 4.2, 0.3); glow(p.x, p.y, r * 0.45, a, p.hue, 0.3, 4.2); continue; }
    glow(p.x, p.y, p.size * (0.35 + 0.65 * a), a, p.hue, 1 + v * 0.011, 1, Math.atan2(p.vy, p.vx));
  }
  parts = parts.filter(p => p.life > 0);
  for (const q of shards){                        // 破片：回りながら飛び散り、重さで落ちていく
    q.life -= dt; q.vy += (q.g == null ? 900 : q.g) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    const d = Math.exp(-dt * 1.2); q.vx *= d; q.vy *= d;
    const a = Math.min(1, q.life / q.max * 2.2) * (q.a || 1);
    g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
    if (q.arc){ g.strokeStyle = `hsla(${q.hue},100%,85%,${a})`; g.lineWidth = 2.2; g.beginPath(); g.arc(0, q.size, q.size, -Math.PI/2 - q.arc, -Math.PI/2 + q.arc); g.stroke(); }
    else { const f = 0.35 + 0.65 * Math.abs(Math.cos(q.rot * 1.7));          // 回るたびに面が光る
      g.fillStyle = `hsla(${q.hue},100%,${70 + 25 * f}%,${a * (0.25 + 0.6 * f)})`; g.strokeStyle = `hsla(${q.hue},100%,92%,${a * 0.9})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-q.size, q.size * q.sk); g.lineTo(q.size * 0.9, q.size * 0.25); g.lineTo(-q.size * 0.15, -q.size * 0.8); g.closePath(); g.fill(); g.stroke(); }
    g.restore();
  }
  shards = shards.filter(q => q.life > 0);
}
function shatter(x, y, R, hue){                  // 的が砕ける：三角の破片と、割れた輪のかけら
  for (let k = 0; k < 34; k++){ const a = Math.random() * TAU, v = 180 + Math.random() * 760, life = 0.7 + Math.random() * 0.8;
    shards.push({ x: x + Math.cos(a) * R * 0.5, y: y + Math.sin(a) * R * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 220, rot: Math.random() * TAU,
      vr: (Math.random() * 2 - 1) * 16, size: R * (0.14 + Math.random() * 0.3), sk: 0.3 + Math.random() * 0.6, life, max: life, hue: k % 4 ? hue : 200 }); }
  for (let k = 0; k < 7; k++){ const a = k / 7 * TAU + Math.random() * 0.4, v = 260 + Math.random() * 380, life = 0.8 + Math.random() * 0.5;
    shards.push({ x: x + Math.cos(a) * R, y: y + Math.sin(a) * R, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, rot: a + Math.PI / 2,
      vr: (Math.random() * 2 - 1) * 9, size: R, arc: 0.32, life, max: life, hue }); }
}

function debris(x, y, R, hue, n){                // 割れた魔法陣のかけら：淡く、ゆっくり漂って消える
  for (let k = 0; k < n; k++){ const a = (k + Math.random() * 0.6) / n * TAU, v = 40 + Math.random() * 90, life = 0.8 + Math.random() * 0.8;
    shards.push({ x: x + Math.cos(a) * R, y: y + Math.sin(a) * R * 0.9, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: a + Math.PI / 2,
      vr: (Math.random() * 2 - 1) * 1.6, size: R, arc: 0.18 + Math.random() * 0.2, life, max: life, hue, g: 50, a: 0.4 }); }
}

// ---- 集束：まわりの光が、手前の陣の芯へ吸いこまれる（発射の合図から、発射の瞬間まで）----
let gathers = [];
function gather(n, dur, hues){
  const m = Math.min(W, H), t = now();
  for (let k = 0; k < n; k++){ const delay = Math.random() * dur * 0.55;          // 出る時刻はばらばら、着く時刻は同じ
    gathers.push({ a: Math.random() * TAU, r0: m * (0.4 + Math.random() * 0.6), born: t + delay, dur: dur - delay, hue: hues[k % hues.length], size: 5 + Math.random() * 7 }); }
}
function drawGather(t){
  if (!gathers.length) return;
  const [cx, cy] = proj(DEPTH[0]);
  for (const q of gathers){
    const u = (t - q.born) / q.dur; if (u < 0 || u > 1) continue;
    const r = q.r0 * (1 - Math.pow(u, 2.2)), v = q.r0 * 2.2 * Math.pow(u, 1.2) / q.dur;     // だんだん速くなる
    glow(cx + Math.cos(q.a) * r, cy + Math.sin(q.a) * r * 0.9, q.size, Math.min(1, u * 5) * (0.3 + 0.7 * u), q.hue, 1 + v * 0.012, 1, q.a);
  }
  if (phase !== 'ready') gathers = [];
}

// ---- 広がっていく魔法陣の残像と、放射する光の筋 ----
let echoes = [], rays = [], echoN = 0;
function echoRing(i, z, R0, R1, dur, w, delay){ echoes.push({ i, z, R0, R1, dur, w, born: now() + (delay || 0), dir: anchorDir,
  c: { z, R: R0, ang: [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU] } }); }
function lightRays(z, len, n, dur, hue, spin, at){ rays.push({ z, len, n, dur, hue, spin, at, seed: Math.random() * 99, born: now(), dir: anchorDir }); }
function drawMagic(t, dt){
  for (const e of echoes){
    const u = (t - e.born) / e.dur; if (u < 0 || u >= 1) continue;
    const k = 1 - Math.pow(1 - u, 2.5); e.c.R = e.R0 + (e.R1 - e.R0) * k;
    for (let j = 0; j < 3; j++) e.c.ang[j] += e.w * PART_SPIN[j] * dt * (1 - u * 0.7);
    withDir(e.dir, () => drawCircle(e.i, e.c, 1, Math.pow(1 - u, 1.4) * Math.min(1, u * 12) * 0.7, 0, t));
  }
  echoes = echoes.filter(e => t - e.born < e.dur);
  for (const r of rays){
    const u = Math.max(0, (t - r.born) / r.dur); if (u >= 1) continue;
    const [x, y] = r.at || proj(r.z, r.dir), a = Math.pow(1 - u, 1.6) * Math.min(1, 0.2 + u * 14), L = r.len * (0.45 + 0.75 * (1 - Math.pow(1 - u, 3)));
    const gr = g.createRadialGradient(x, y, 0, x, y, L);
    gr.addColorStop(0, `hsla(${r.hue},100%,92%,${a * 0.2})`); gr.addColorStop(0.3, `hsla(${r.hue},100%,80%,${a * 0.16})`); gr.addColorStop(1, `hsla(${r.hue},100%,70%,0)`);
    g.fillStyle = gr; g.beginPath();
    for (let k = 0; k < r.n; k++){
      const h = Math.abs(Math.sin(k * 12.9898 + r.seed) * 43758.5453) % 1, h2 = Math.abs(Math.sin(k * 78.233 + r.seed) * 12543.123) % 1;
      const ang = (k + h * 0.7) / r.n * TAU + r.spin * (t - r.born), l = L * (0.45 + 0.55 * h2), w = 0.018 + 0.05 * h;
      g.moveTo(x, y); g.lineTo(x + Math.cos(ang - w) * l, y + Math.sin(ang - w) * l); g.lineTo(x + Math.cos(ang + w) * l, y + Math.sin(ang + w) * l);
    }
    g.fill();
  }
  rays = rays.filter(r => t - r.born < r.dur);
}
