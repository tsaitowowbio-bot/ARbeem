'use strict';
// ---- 発射の合図（ボタン・声・スペースキー）。1 枚でも装填されていれば撃てる ----
function trigger(){
  if (phase !== 'load' || !circles.length) return;
  shotN = circles.length; phase = 'ready'; tPhase = now(); ignited = 0; charge = 0;
  sndRiser(READY_SEC + IGNITE_GAP * shotN + 0.08); backdropEvent('trigger', shotN);
}

// ---- センサー ----
let grav = [0, 0, 9.8];
function onMotion(e){
  let a = e.acceleration, mag;
  if (a && a.x != null) mag = Math.hypot(a.x, a.y, a.z);
  else { const q = e.accelerationIncludingGravity; if (!q || q.x == null) return;
    grav = [grav[0]*0.9 + q.x*0.1, grav[1]*0.9 + q.y*0.1, grav[2]*0.9 + q.z*0.1];
    mag = Math.hypot(q.x - grav[0], q.y - grav[1], q.z - grav[2]); }
  const r = e.rotationRate || {}, dt = (e.interval > 1 ? e.interval / 1000 : e.interval) || 0.016;
  const k = F * Math.PI / 180;
  ox += (r.beta || 0) * dt * k; oy += (r.alpha || 0) * dt * k;
  steady = Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0) < 35 && mag < 2;
  swing = Math.max(swing, Math.min(1, Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0) / 300));
  const t = performance.now();
  if (mag > SHAKE_G && t - lastShake > SHAKE_GAP){ lastShake = t; load(); }
}

// ---- 段取り：装填 → 発射の合図 → 手前から順に点火 → 発射 → 着弾 → 余韻 ----
function stepLoad(t, dt){
  if (circles.length >= MAX) charge = 0;
  else if (steady) charge += dt / CHARGE_SEC; else charge = Math.max(0, charge - dt * 0.5);
  if (charge >= 1) load();
}
function igniteCircle(i, t){
  const s = proj(DEPTH[i])[2]; circles[i].ignite = t;
  ring(DEPTH[i], RADIUS[i] * 0.2, RADIUS[i] * 1.35, 0.4, HUE[i], 0.45);
  flare(DEPTH[i], RADIUS[i] * s * 1.5, 0.5, HUE[i], 7);
  burstFromCircle(i, 22, 300, 10); shake += 6;
  sndIgnite(i); navigator.vibrate && navigator.vibrate(25);
}
function stepReady(t){
  const k = Math.floor((t - tPhase - READY_SEC) / IGNITE_GAP);
  while (ignited <= k && ignited < shotN) igniteCircle(ignited++, t);
  if (t - tPhase > READY_SEC + IGNITE_GAP * shotN + 0.08) beginFire(t);
}
function beginFire(t){
  phase = 'fire'; tPhase = t; sndFire(shotN); shake = 30; flash = 1; backdropEvent('fire', shotN);
  ring(Z0 + 0.3, 0.1, 1.9, 0.45, 200, 0.5);
  flare(Z0 + 0.5, Math.min(W, H) * 0.3, 0.35, 200, 6);
  const m = Math.min(W, H); lightRays(DEPTH[0], m * 0.7, 18, 0.8, 200, 0.5);          // 放射する光と、開く大きな陣
  echoRing(2, DEPTH[0], m * 0.12, m * 0.62, 0.7, 5); echoRing(1, DEPTH[0], m * 0.06, m * 0.44, 0.8, -7, 0.06);
  const [vx, vy] = proj(Z1);                      // 画面の外へ流れる光（勢い）
  for (let k2 = 0; k2 < 34; k2++){ const a = Math.random() * TAU, d = m * (0.25 + Math.random() * 0.5), v = 1100 + Math.random() * 1100;
    part(vx + Math.cos(a) * d, vy + Math.sin(a) * d, Math.cos(a) * v, Math.sin(a) * v, 0.32, 200, 7 + Math.random() * 6, 0.5); }
  navigator.vibrate && navigator.vibrate([60, 20, 140]);
}
function passCircle(i, t){                        // 弾が陣を通り抜ける
  const c = circles[i], [cx, cy, s] = proj(DEPTH[i]), R = RADIUS[i] * s; c.burst = t; shake += 14;
  ring(DEPTH[i], 0.2, RADIUS[i] * 2.3, 0.55, HUE[i], 0.5); flare(DEPTH[i], R * 1.3, 0.4, HUE[i], 4);
  burstFromCircle(i, 46, 560, 12); sndPass(i);
  echoRing(i, DEPTH[i], R, R * 2.2, 0.7, 6); echoRing(i, DEPTH[i], R * 0.6, R * 1.7, 0.8, -5, 0.08);
  lightRays(DEPTH[i], R * 2.2, 12, 0.5, HUE[i], i % 2 ? -0.8 : 0.8); stars(cx, cy, 12, 420, 15);
}
let lastRing = 0;
function stepFire(t){
  const u = Math.min(1, (t - tPhase) / FLY_SEC);
  bulletZ = zAt(Z0 + 0.5, Z1, Math.pow(u, 1.25));       // 画面の上で、狙った先まで止まらずに進む
  circles.forEach((c, i) => { if (!c.burst && bulletZ > DEPTH[i]) passCircle(i, t); });
  if (t - lastRing > 0.04){ lastRing = t; ring(bulletZ, BR, BR * 6, 0.35, 200, 0.6, 0.7);   // 弾が残していく輪
    const [bx, by, bs] = proj(bulletZ), R0 = Math.max(BR * 3.5 * bs, 9);                 // 弾道に並んで開く小さな陣と、こぼれる星
    if (echoN++ % 2 === 0) echoRing((echoN >> 1) % 3, bulletZ, R0, R0 * 3, 0.6, echoN % 4 ? 8 : -8); stars(bx, by, 3, 160, 11, 30); }
  wake = 1;
  if (u >= 1) onImpact(t);
}
function onImpact(t){                             // 着弾
  phase = 'cool'; tPhase = t; bulletZ = Z1; flash = 0.7; shake += 16; sndImpact(shotN); backdropEvent('impact', shotN); judge(t);
  const m = Math.min(W, H), [x, y] = proj(Z1);
  flare(Z1, m * 0.6, 1.0, 200, 9); flare(Z1, m * 0.4, 1.5, 212, 0); flare(Z1, m * 0.3, 0.5, 200, 0);
  ring(Z1, 1, 30, 0.7, 200, 0.5); ring(Z1, 0.5, 16, 1.0, 262, 0.7, 0.7);
  echoRing(2, Z1, m * 0.05, m * 0.46, 1.3, 3); echoRing(0, Z1, m * 0.03, m * 0.30, 1.4, -4.5, 0.1); echoRing(1, Z1, m * 0.02, m * 0.17, 1.5, 6, 0.2);
  lightRays(Z1, m * 0.8, 22, 1.3, 200, 0.35); lightRays(Z1, m * 0.5, 14, 1.0, 320, -0.5);
  stars(x, y, 46, 520, 17, 60);
  for (let k2 = 0; k2 < 50; k2++){ const a = Math.random() * TAU, v = 80 + Math.random() * 420;
    part(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.8, k2 % 3 ? 200 : 262, 6 + Math.random() * 9, 3); }
}
function stepCool(t){
  wake = Math.max(0, 1 - (t - tPhase) / 0.8);
  if (t - tPhase > 1.0){ circles = []; charge = 0; ignited = 0; phase = 'load'; backdropEvent('reset', 0); }
}

// ---- 毎フレーム ----
let lastReal = performance.now() / 1000;
function frame(){
  // 時計を進める。rdt は実際に過ぎた秒数、dt は演出の秒数（hold の間は 0）
  const real = performance.now() / 1000; let rdt = Math.min(0.05, real - lastReal); lastReal = real;
  if (self.__step != null){ rdt = self.__step; self.__step = 0; }       // 自動テスト用：時計を手で進める
  let dt = rdt; if (holdLeft > 0){ holdLeft -= rdt; dt = 0; }
  clock += dt; const t = clock;

  const decay = Math.exp(-dt * 3.2); ox *= decay; oy *= decay;
  shake *= Math.exp(-dt * 7); flash *= Math.exp(-dt * 6); punch *= Math.exp(-dt * 9);
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  { const k = 1 + punch * 0.07; g.translate(W/2, H/2); g.scale(k, k); g.translate(-W/2, -H/2);        // 命中の瞬間、映像ごと一瞬ふくらむ
    if (camEl.isConnected) camEl.style.transform = punch > 0.01 ? `scale(${1 + punch * 0.05})` : ''; }
  g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  g.globalCompositeOperation = 'lighter';

  if (phase === 'load') stepLoad(t, dt);
  if (phase === 'ready') stepReady(t);
  if (phase === 'fire') stepFire(t);
  if (phase === 'cool') stepCool(t);

  const spinUp = phase === 'ready' ? Math.pow(Math.min(1, (t - tPhase) / READY_SEC), 2) : 0;
  spinCircles(t, dt, spinUp);
  updateDrone(spinUp);
  updateBackdrop(t, rdt);

  drawCharging(t, dt);
  drawCircles(t, spinUp);
  updateTargets(t); drawTargets(t); drawReticle(t); listenVoice(t);
  if (wake > 0) drawBeam(phase === 'fire' ? bulletZ : Z1, wake, t);
  drawMagic(t, dt); drawFx(t, dt);
  if (phase === 'fire') drawBullet(bulletZ);
  if (flash > 0.01){ g.fillStyle = `rgba(200,235,255,${flash * 0.22})`; g.fillRect(-40, -40, W + 80, H + 80); }

  if (phase !== 'idle'){
    const can = phase === 'load' && circles.length > 0;
    if (fireBtn.disabled === can) fireBtn.disabled = !can;
    hud.textContent = phase === 'load' ? `装填 ${circles.length} / ${MAX}` : '';
    scoreEl.textContent = `撃破 ${kills}　命中 ${hits} / ${shots}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- 開始（カメラ・センサーの許可はボタンを押したときに求める）----
document.getElementById('go').addEventListener('click', async () => {
  document.getElementById('start').remove();
  initAudio();
  try {
    if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission();
  } catch (e) {}
  try {
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission();
  } catch (e) {}
  addEventListener('devicemotion', onMotion); addEventListener('deviceorientation', onOri);
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    document.getElementById('cam').srcObject = s;
  } catch (e) { document.getElementById('cam').remove(); }
  phase = 'load'; document.body.classList.add('on');
  fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); trigger(); });
  voiceBtn.addEventListener('click', toggleVoice);
  volBtn.addEventListener('click', () => { volI = (volI + 1) % 4; localStorage.setItem('arbeem-vol', volI); setVol(); });
  addEventListener('keydown', e => { if (e.code === 'Space') trigger(); if (e.code === 'KeyL') load(); });
  addEventListener('pointermove', e => { if (hasOri) return;
    lookAz = (e.clientX / W - 0.5) * 2.2; lookEl = -(e.clientY / H - 0.5) * 1.2; lookBasis(); });
});
