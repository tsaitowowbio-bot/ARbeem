'use strict';
// ---- 向き：端末の傾きから、カメラが向いている方向を求める ----
// cam.X・Y・Z は、画面の右・上・手前が、まわりの空間でどちらを向いているか。カメラの向きは −Z。
let cam = { X: [1, 0, 0], Y: [0, 0, 1], Z: [0, -1, 0] }, hasOri = false, lookAz = 0, lookEl = 0;
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const fwd = () => [-cam.Z[0], -cam.Z[1], -cam.Z[2]];
function onOri(e){
  if (e.alpha == null) return; hasOri = true;
  const D = Math.PI / 180, cZ = Math.cos(e.alpha*D), sZ = Math.sin(e.alpha*D), cX = Math.cos(e.beta*D), sX = Math.sin(e.beta*D),
        cY = Math.cos(e.gamma*D), sY = Math.sin(e.gamma*D);
  cam.X = [cZ*cY - sZ*sX*sY, cY*sZ + cZ*sX*sY, -cX*sY];
  cam.Y = [-cX*sZ, cZ*cX, sX];
  cam.Z = [cY*sZ*sX + cZ*sY, sZ*sY - cZ*cY*sX, cX*cY];
}
function lookBasis(){            // センサーがないとき（パソコン）：マウスで向きを変える
  const ca = Math.cos(lookAz), sa = Math.sin(lookAz), ce = Math.cos(lookEl), se = Math.sin(lookEl);
  cam.X = [ca, -sa, 0]; cam.Y = [-sa*se, -ca*se, ce]; cam.Z = [-sa*ce, -ca*ce, -se];
}
function toScreen(d){            // 空間の向き → 画面の位置。z ≤ 0 は後ろ側
  const x = dot(d, cam.X), y = dot(d, cam.Y), z = -dot(d, cam.Z);
  return { x, y, z, sx: W/2 + x / Math.max(z, 0.01) * FC, sy: H/2 - y / Math.max(z, 0.01) * FC };
}
const aimAngle = d => Math.acos(Math.max(-1, Math.min(1, dot(d, fwd()))));

// ---- 的と当たり判定 ----
// 的は、はじめに向いていた方向のまわりに浮かぶ。発射の瞬間に、照準の輪（装填が多いほど大きい）に入っていた的に当たる。
let targets = [], home = null, nextSpawn = 0, kills = 0, hits = 0, shots = 0, popups = [];
const T_HUE = [45, 320, 186];
function spawnTarget(t){
  for (let tries = 0; tries < 30; tries++){
    const az = home[0] + (Math.random() * 2 - 1) * 0.95, el = Math.max(-0.5, Math.min(0.9, home[1] + (Math.random() * 2 - 1) * 0.32));
    const d = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
    if (aimAngle(d) < 0.3 || targets.some(q => !q.dead && Math.acos(Math.min(1, dot(q.d, d))) < 0.4)) continue;
    targets.push({ d, size: 0.05 + Math.random() * 0.025, born: t, dead: 0, hue: T_HUE[Math.random() * 3 | 0], spin: Math.random() * TAU }); return;
  }
}
function updateTargets(t){
  if (phase === 'idle') return;
  if (!home){ const f = fwd(); home = [Math.atan2(f[0], f[1]), Math.max(-0.2, Math.min(0.5, Math.asin(f[2])))]; }
  targets = targets.filter(q => !q.dead || t - q.dead < 0.8);
  if (targets.filter(q => !q.dead).length < TARGETS && t > nextSpawn){ spawnTarget(t); nextSpawn = t + 0.5; }
}
function lockedTargets(n){ return n ? targets.filter(q => !q.dead && aimAngle(q.d) < TOL[n] + q.size * 0.6) : []; }
function judge(t){               // 着弾：発射の瞬間に照準の輪に入っていた的すべてに当たる。当たった的を返す
  shots++; const n = shotN, k = n - 1, got = shotTargets.filter(q => !q.dead);
  if (!got.length){ sndMiss(); const [x, y] = proj(Z1); popups.push({ x, y: y - 40, text: 'はずれ', born: t, hue: 200 }); return got; }
  hits++; sndHit(); navigator.vibrate && navigator.vibrate([[30, 10, 60], [40, 15, 110], [50, 20, 160]][k]); nextSpawn = t + 0.9;
  punch = [0.5, 0.75, 1][k]; shake += [20, 30, 38][k]; flash = [0.45, 0.6, 0.35][k];   // 画面ごと、どんと揺らす（3 枚は、映像が白黒になる一瞬を見せるため、閃光は弱く）
  hold(HIT_STOP[k]);                                   // 当たった瞬間、絵を一瞬止める
  backdropEvent('hit', n);
  const amt = [0.5, 0.75, 1][k];
  for (const q of got){ q.dead = t; kills++; const p = toScreen(q.d), R = FC * q.size;
    stars(p.sx, p.sy, 30 * amt | 0, 620, 19, -260); shatter(p.sx, p.sy, R, q.hue);
    withDir(q.d, () => { lightRays(Z1, R * (4 + 3 * amt), 16 * amt | 0, 0.6, q.hue, 0.6); lightRays(Z1, R * 4, 10 * amt | 0, 0.4, 200, -0.9); });
    for (let j = 0; j < 36 * amt; j++){ const a = Math.random() * TAU, v = 150 + Math.random() * 500;
      part(p.sx + Math.cos(a) * R, p.sy + Math.sin(a) * R, Math.cos(a) * v, Math.sin(a) * v, 0.4 + Math.random() * 0.5, q.hue, 6 + Math.random() * 8, 3); }
    popups.push({ x: p.sx, y: p.sy - R - 14, text: '命中', born: t, hue: q.hue }); }
  return got;
}
function drawTargets(t){
  const n = phase === 'load' ? circles.length : shotN;
  const lock = (phase === 'fire' || phase === 'cool') ? shotTargets : lockedTargets(n);      // 撃ったあとは、当たる的が決まっている
  for (const q of targets){
    const p = toScreen(q.d), R = FC * q.size, hue = q.hue;
    if (q.dead){                                     // 砕ける：閃光と、広がる帯
      const u = (t - q.dead) / 0.8, a = (1 - u) * (1 - u);
      glow(p.sx, p.sy, R * (2 + 5 * u), a, hue); glow(p.sx, p.sy, R * 1.2, a, hue, 7 * (1 + u), 0.5);
      g.strokeStyle = `hsla(${hue},100%,85%,${a})`; g.lineWidth = 7 * (1 - u) + 1;
      g.beginPath(); g.arc(p.sx, p.sy, R * (1 + 4 * (1 - Math.pow(1 - u, 3))), 0, TAU); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${a * 0.8})`; g.lineWidth = 12 * (1 - u) + 1;
      g.beginPath(); g.arc(p.sx, p.sy, R * (1 + 8 * (1 - Math.pow(1 - u, 4))), 0, TAU); g.stroke();
      glow(p.sx, p.sy, R * 0.9, a, hue, 0.4, 9 * (1 + u));
      continue;
    }
    const onScreen = p.z > 0 && p.sx > -R && p.sx < W + R && p.sy > -R && p.sy < H + R;
    if (!onScreen){                                  // 画面の外：そちらの端に、向きを示す光
      const L = Math.hypot(p.x, p.y) || 1, ux = p.x / L, uy = -p.y / L, k = Math.min((W/2 - 22) / Math.abs(ux || 1e-6), (H/2 - 60) / Math.abs(uy || 1e-6));
      const ex = W/2 + ux * k, ey = H/2 + uy * k, an = Math.atan2(uy, ux), pu = 0.6 + 0.4 * Math.sin(t * 6);
      glow(ex, ey, 20, 0.7 * pu, hue);
      g.fillStyle = `hsla(${hue},100%,80%,${0.85 * pu})`; g.beginPath();
      g.moveTo(ex + Math.cos(an) * 11, ey + Math.sin(an) * 11); g.lineTo(ex + Math.cos(an + 2.5) * 9, ey + Math.sin(an + 2.5) * 9);
      g.lineTo(ex + Math.cos(an - 2.5) * 9, ey + Math.sin(an - 2.5) * 9); g.fill();
      continue;
    }
    const grow = Math.min(1, (t - q.born) / 0.4), r = R * (0.3 + 0.7 * grow) * (1 + 0.05 * Math.sin(t * 3 + q.spin)), isLock = lock.includes(q);
    glow(p.sx, p.sy, r * 2.6, 0.4 * grow, hue); glow(p.sx, p.sy, r * 0.75, 0.9 * grow, hue);
    g.strokeStyle = `hsla(${hue},100%,82%,${0.9 * grow})`; g.lineWidth = 1.6;
    g.beginPath(); g.arc(p.sx, p.sy, r, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(p.sx, p.sy - r * 0.55); g.lineTo(p.sx + r * 0.4, p.sy); g.lineTo(p.sx, p.sy + r * 0.55); g.lineTo(p.sx - r * 0.4, p.sy); g.closePath(); g.stroke();
    g.lineWidth = 2.4; const a0 = q.spin + t * 1.4;
    for (let k = 0; k < 3; k++){ g.beginPath(); g.arc(p.sx, p.sy, r * 1.3, a0 + k * TAU / 3, a0 + k * TAU / 3 + 1.1); g.stroke(); }
    if (isLock){                                     // 照準に入っている：金色の枠
      const b = r * (1.75 + 0.12 * Math.sin(t * 14)), c = b * 0.38; g.strokeStyle = 'rgba(255,220,130,0.95)'; g.lineWidth = 2.2;
      for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){ g.beginPath();
        g.moveTo(p.sx + sx * b, p.sy + sy * (b - c)); g.lineTo(p.sx + sx * b, p.sy + sy * b); g.lineTo(p.sx + sx * (b - c), p.sy + sy * b); g.stroke(); }
    }
  }
  g.font = '700 22px system-ui,sans-serif'; g.textAlign = 'center';
  for (const q of popups){ const u = (t - q.born) / 0.9;
    g.fillStyle = `hsla(${q.hue},100%,88%,${Math.max(0, 1 - u)})`; g.fillText(q.text, q.x, q.y - u * 26); }
  popups = popups.filter(q => t - q.born < 0.9);
}
function drawReticle(t){         // 照準：輪の大きさが、いま当たる範囲
  if (phase === 'idle') return;
  const n = phase === 'load' ? circles.length : shotN, lock = lockedTargets(n).length > 0, x = W/2, y = H/2;
  const r = n ? FC * TOL[n] : 11, col = a => lock ? `rgba(255,220,130,${a})` : `rgba(215,245,255,${a})`;
  g.fillStyle = col(0.95); g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
  g.strokeStyle = col(n ? 0.8 : 0.35); g.lineWidth = n ? 1.6 : 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.lineWidth = 1.6; const rot = lock ? t * 2.5 : 0;
  for (let k = 0; k < 4; k++){ const a = rot + k * Math.PI / 2; g.beginPath();
    g.moveTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4)); g.lineTo(x + Math.cos(a) * (r + 13), y + Math.sin(a) * (r + 13)); g.stroke(); }
  if (lock) glow(x, y, r * 1.6, 0.25 + 0.1 * Math.sin(t * 14), 45);
}

// ---- 声で発射：マイクの音の大きさだけを見る（言葉は聞き分けない。音声はどこにも送らない）----
let mic = null, micBuf = null, micFloor = 0.02, micHot = 0, micStream = null;
async function toggleVoice(){
  if (mic){ micStream.getTracks().forEach(tr => tr.stop()); mic = null; voiceBtn.textContent = '声で発射：切'; voiceBtn.style.background = ''; return; }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
    const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(micStream).connect(an);
    micBuf = new Float32Array(1024); mic = an; voiceBtn.textContent = '声で発射：入';
  } catch (e) { voiceBtn.textContent = '声：使えません'; }
}
function listenVoice(t){
  if (!mic) return;
  mic.getFloatTimeDomainData(micBuf); let sum = 0; for (const v of micBuf) sum += v * v;
  const rms = Math.sqrt(sum / micBuf.length), th = Math.max(VOICE_MIN, micFloor * VOICE_RATIO);
  if (rms > th) micHot++; else { micHot = 0; micFloor += (rms - micFloor) * 0.03; }
  const lv = Math.min(100, rms / th * 100 | 0);       // ボタンの地色で、いまの声の大きさを見せる（右端まで届くと発射）
  voiceBtn.style.background = `linear-gradient(90deg, rgba(150,225,255,.45) ${lv}%, rgba(10,20,34,.5) ${lv}%)`;
  if (micHot >= 3 && t - lastOwn > 0.3){ micHot = 0; trigger(); }   // 自分の装填音を拾った直後は無視する
}
