'use strict';
// ---- 発射の合図（ボタン・声・スペースキー）。1 枚でも装填されていれば撃てる ----
let igniteAt = [], fireAt = 0, held = false;      // 点火の時刻・絵を止める時刻（どちらも合図からの秒数）・止めたかどうか
function trigger(){
  if (phase !== 'load' || !circles.length) return;
  shotN = circles.length; phase = 'ready'; tPhase = now(); ignited = 0; charge = 0; held = false;
  // 点火の間隔は、だんだん詰まる。枚数が少ないときは、詰まった側の間隔だけを使う
  igniteAt = [READY_SEC];
  for (let i = 1; i < shotN; i++) igniteAt.push(igniteAt[i - 1] + IGNITE_GAPS[IGNITE_GAPS.length - shotN + i]);
  fireAt = igniteAt[shotN - 1] + LAST_GAP;
  sndRiser(fireAt + PRE_HOLD[shotN - 1]); backdropEvent('trigger', shotN);
  gather(8 + shotN * 10, fireAt, spell ? [castHue] : circles.map((c, i) => HUE[i]));       // まわりの光が、芯へ集まりはじめる
}

// ---- 詠唱で撃つ ----
// spec：chant.js の interpretChant() の結果（ok のもの）。rarity：0〜3（省くと抽選する）。撃てたら true を返す
let pity = 0;                                    // SR 以上が出ていない回数（続くと、少しずつ出やすくなる）
function rollRarity(spec){
  // そろっていることばが多く、「姿 → 動き」の順で唱えているほど、少し出やすい
  const bonus = (spec.element ? 1 : 0) + (spec.form ? 1 : 0) + (spec.motion ? 1 : 0) - 1 + (spec.ordered && spec.motion ? 1 : 0);
  const luck = Math.max(0, pity - 8) * 0.012, x = Math.random();
  const p3 = RARITY_P[2] * (1 + bonus * 0.5) + luck, p2 = RARITY_P[1] * (1 + bonus * 0.3) + luck * 2, p1 = RARITY_P[0] * (1 + bonus * 0.1);
  const r = pity >= 30 ? 2 : x < p3 ? 3 : x < p3 + p2 ? 2 : x < p3 + p2 + p1 ? 1 : 0;
  pity = r >= 2 ? 0 : pity + 1;
  return r;
}
function castSpell(spec, rarity){
  if (phase !== 'load' || !circles.length) return false;
  const s = Object.assign({}, spec);
  s.element = s.element || 'light'; s.form = s.form || 'orb'; s.speed = s.speed || 0; s.seed = (s.seed || 1) >>> 0;
  s.motion = s.motion || DEFAULT_MOTION[s.form];
  if (!CREATURE_FORMS.includes(s.form)) s.form = 'orb';          // まだ描けない姿は、玉にする
  spell = { spec: s, rarity: rarity == null ? rollRarity(spec) : rarity };
  castHue = ELEMENT_HUE[s.element];
  trigger();
  return true;
}
const spellName = () => spell ? `${ELEMENT_JA[spell.spec.element]}の${FORM_JA[spell.spec.form]}` : '';
function fizzle(){                               // 不発：陣がゆらいで、光がこぼれるだけ。装填はそのまま
  if (phase !== 'load') return;
  circles.forEach((c, i) => { c.w -= 5; burstFromCircle(i, 8, 70, 6); });
  popups.push({ x: W / 2, y: H * 0.4, text: '不発', born: now(), hue: 200 });
  sndFizzle(); navigator.vibrate && navigator.vibrate([15, 40, 15]);
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

// ---- 段取り：装填 → 発射の合図 → 手前から順に点火 → 一瞬止まる → 発射 → 着弾 → 余韻 ----
// 白く強い光は、的に当たった瞬間のためにとっておく。点火と発射は、色と形と動きで見せる。
function stepLoad(t, dt){
  if (circles.length >= MAX) charge = 0;
  else if (steady) charge += dt / CHARGE_SEC; else charge = Math.max(0, charge - dt * 0.5);
  if (charge >= 1) load();
}
function igniteCircle(i, t){
  circles[i].ignite = t;
  if (spell) circles[i].hue = castHue;                         // 詠唱の魔法：陣が属性の色に変わる（何が出るかの兆し）
  const hue = spell ? (spell.rarity >= 2 ? 45 : castHue) : HUE[i];      // SR 以上は、金色の輪が出る
  ring(DEPTH[i], RADIUS[i] * 0.3, RADIUS[i] * (spell && spell.rarity >= 2 ? 1.6 : 1.25), 0.35, hue, 0.4, 0.5);
  burstFromCircle(i, 10, 240, 8); shake += 2;
  sndIgnite(i); navigator.vibrate && navigator.vibrate(20);
}
function stepReady(t){
  const el = t - tPhase;
  while (ignited < shotN && el >= igniteAt[ignited]) igniteCircle(ignited++, t);
  squeeze = Math.pow(Math.min(1, el / fireAt), 2);             // 陣が少し絞られていく
  if (!held && el >= fireAt){ held = true; hold(PRE_HOLD[shotN - 1]); }      // 発射の直前に、絵を一瞬止める
  else if (held && holdLeft <= 0) beginFire(t);
}
function drawCore(t){                             // 集まった光の芯：大きく淡い形から、小さく強い形へ
  const u = Math.min(1, (t - tPhase) / fireAt), [x, y, s] = proj(DEPTH[0]), R = RADIUS[0] * s;
  const hue = spell ? castHue : 200;
  glow(x, y, R * (0.9 - 0.6 * u), 0.08 + 0.22 * u, hue);
  glow(x, y, R * (0.36 - 0.22 * u), 0.2 + 0.7 * u * u, hue);
}
function beginFire(t){
  const n = shotN, k = n - 1, m = Math.min(W, H);
  // 当たる的は、この瞬間に決まる。照準の輪に的が入っていれば、弾はその的へ向かう
  shotTargets = lockedTargets(n);
  anchorDir = shotTargets.length ? shotTargets.reduce((a, b) => aimAngle(a.d) <= aimAngle(b.d) ? a : b).d : fwd();
  phase = 'fire'; tPhase = t; squeeze = -0.6; sndFire(n); backdropEvent('fire', n);
  shake = [8, 16, 26][k]; flash = [0.08, 0.16, 0.28][k]; recoil = [0.35, 0.7, 1][k]; recV = 0;
  if (spell){                                     // 詠唱の魔法：ビームの代わりに、生き物が出る
    flyDur = spawnCreature(spell.spec, n, spell.rarity, t);
    ring(Z0 + 0.3, 0.1, [0.5, 0.7, 0.9][k], 0.4, castHue, 0.5, 0.5);
    if (n >= 2) lightRays(DEPTH[0], m * [0, 0.4, 0.65][k], [0, 10, 18][k], 0.7, castHue, 0.5);
    popups.push({ x: W / 2, y: H * 0.3, text: `${RARITY_JA[spell.rarity]}　${spellName()}`, born: t, hue: spell.rarity >= 2 ? 45 : castHue, dur: 1.6 });
    navigator.vibrate && navigator.vibrate([[30], [45, 15, 80], [60, 20, 140]][k]);
    return;
  }
  flyDur = FLY[k];
  ring(Z0 + 0.3, 0.1, [0.5, 0.7, 0.9][k], 0.4, 200, 0.5, 0.5);
  flare(Z0 + 0.5, m * [0.07, 0.11, 0.16][k], 0.3, 200, n === 3 ? 6 : 0, 0.8);
  if (n >= 2) lightRays(DEPTH[0], m * [0, 0.4, 0.65][k], [0, 10, 18][k], 0.7, 200, 0.5);
  if (n === 3) echoRing(2, DEPTH[0], m * 0.12, m * 0.62, 0.7, 5);                 // 開く大きな陣
  const [vx, vy] = proj(Z1);                      // 画面の外へ流れる光（勢い）
  for (let j = 0; j < [6, 16, 34][k]; j++){ const a = Math.random() * TAU, d = m * (0.25 + Math.random() * 0.5), v = 1100 + Math.random() * 1100;
    part(vx + Math.cos(a) * d, vy + Math.sin(a) * d, Math.cos(a) * v, Math.sin(a) * v, 0.32, 200, 7 + Math.random() * 6, 0.5); }
  navigator.vibrate && navigator.vibrate([[30], [45, 15, 80], [60, 20, 140]][k]);
}
function passCircle(i, t){                        // 弾が陣を通り抜ける：陣は割れて、かけらが漂う
  const n = shotN, c = circles[i], [cx, cy, s] = proj(DEPTH[i]), R = RADIUS[i] * s, hue = c.hue != null ? c.hue : HUE[i]; c.burst = t; shake += 5;
  ring(DEPTH[i], 0.2, RADIUS[i] * (n === 1 ? 1.5 : 2.2), 0.5, hue, 0.5, 0.6);
  burstFromCircle(i, [14, 26, 40][n - 1], 480, 11); debris(cx, cy, R, hue, [4, 6, 8][n - 1]); sndPass(i);
  if (n === 3){ echoRing(i, DEPTH[i], R, R * 2.0, 0.6, 6); lightRays(DEPTH[i], R * 1.8, 10, 0.45, hue, i % 2 ? -0.8 : 0.8); stars(cx, cy, 8, 420, 14); }
}
let lastRing = 0, beamTail = 0, flyDur = 0.5;
function stepFire(t, dt){
  if (spell){                                     // 詠唱の魔法：生き物が飛んでいく
    const arrived = stepCreature(t, dt); bulletZ = creatureZ();
    circles.forEach((c, i) => { if (!c.burst && bulletZ > DEPTH[i]) passCircle(i, t); });
    wake = 0;
    if (arrived) onImpact(t);
    return;
  }
  const n = shotN, u = Math.min(1, (t - tPhase) / flyDur);
  bulletZ = zAt(Z0 + 0.5, Z1, Math.pow(u, 0.9));        // 画面の上で、狙った先まで止まらずに進む
  circles.forEach((c, i) => { if (!c.burst && bulletZ > DEPTH[i]) passCircle(i, t); });
  if (n >= 2 && t - lastRing > 0.045){ lastRing = t; ring(bulletZ, BR, BR * 6, 0.35, 200, 0.6, 0.45);   // 弾が残していく輪
    const [bx, by, bs] = proj(bulletZ), R0 = Math.max(BR * 3.5 * bs, 9);
    if (n === 3 && echoN++ % 2 === 0) echoRing((echoN >> 1) % 3, bulletZ, R0, R0 * 3, 0.6, echoN % 4 ? 8 : -8);          // 弾道に並んで開く小さな陣
    stars(bx, by, n === 3 ? 3 : 1, 160, 11, 30); }
  wake = 1; beamTail = 0;
  if (u >= 1) onImpact(t);
}
function onImpact(t){                             // 着弾
  const n = shotN, k = n - 1, m = Math.min(W, H);
  phase = 'cool'; tPhase = t; bulletZ = Z1; sndImpact(n); backdropEvent('impact', n);
  const got = judge(t), hue = spell ? castHue : 200;
  if (spell) creatureEnd(got.length > 0, t);
  if (!got.length){                               // はずれ：遠くで、小さく消える
    const [x, y] = proj(Z1); ring(Z1, 0.5, 5 + 2 * n, 0.5, hue, 0.5, 0.5); flare(Z1, m * 0.06, 0.4, hue, 0, 0.7); stars(x, y, 3 + 2 * n, 140, 10, 20);
    return;
  }
  for (const q of got) withDir(q.d, () => {       // 命中：的の場所で咲く
    flare(Z1, m * [0.2, 0.28, 0.34][k], [0.3, 0.35, 0.4][k], hue, [0, 5, 9][k]);         // 白い光は短く
    ring(Z1, 1, [12, 20, 30][k], 0.7, hue, 0.5);
    if (n >= 2){ ring(Z1, 0.5, 14, 1.0, q.hue, 0.7, 0.7); lightRays(Z1, m * [0, 0.5, 0.8][k], [0, 14, 22][k], 1.1, hue, 0.35); }
    if (n === 3){ echoRing(2, Z1, m * 0.05, m * 0.46, 1.3, 3); echoRing(0, Z1, m * 0.03, m * 0.30, 1.4, -4.5, 0.1); echoRing(1, Z1, m * 0.02, m * 0.17, 1.5, 6, 0.2);
      lightRays(Z1, m * 0.5, 14, 1.0, 320, -0.5); flare(Z1, m * 0.3, 0.9, 212, 0, 0.5); }
  });
}
function stepCool(t, dt){                         // 余韻：ビームは手前から消えていき、消えた所に光の粒が残って漂う
  const n = shotN, el = t - tPhase, T = COOL_SEC[n - 1];
  wake = spell ? 0 : Math.max(0, 1 - el / (T * 0.85));        // 詠唱の魔法では、ビームの残りは出さない
  beamTail = Math.pow(Math.min(1, el / (T * 0.7)), 1.5);
  if (n >= 2 && dt > 0 && wake > 0.05) for (let j = 0; j < n - 1; j++){
    const [x, y, s] = proj(zAt(BEAM_Z0, Z1, Math.min(0.97, beamTail * Math.random()))), r = Math.min(30, BR * 3 * s) + 3;
    part(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40 - 12, 0.5 + Math.random() * 0.6, j ? 262 : 200, 3 + Math.random() * 5, 1.2); }
  if (el > T){ circles = []; charge = 0; ignited = 0; phase = 'load'; anchorDir = null; shotTargets = []; spell = null; castHue = null; backdropEvent('reset', 0); }
}

// ---- 毎フレーム ----
let lastReal = performance.now() / 1000, lastCamZoom = '', slowFrames = 0;
function frame(){
  // 時計を進める。rdt は実際に過ぎた秒数、dt は演出の秒数（hold の間は 0）
  const real = performance.now() / 1000; let rdt = Math.min(0.05, real - lastReal), wall = Math.min(0.25, real - lastReal); lastReal = real;
  if (self.__step != null){ rdt = wall = self.__step; self.__step = 0; }       // 自動テスト用：時計を手で進める
  let dt = rdt; if (holdLeft > 0){ holdLeft -= rdt; dt = 0; }
  // コマ落ちが続いたら、描く細かさを 1 段下げる（重い端末でも、なめらかさを優先する）
  if (self.__step == null && phase !== 'idle'){ slowFrames = wall > 0.024 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
    if (slowFrames > 45 && dprCap > 1){ dprCap = Math.max(1, dprCap - 0.5); slowFrames = 0; resize(); } }
  clock += dt; const t = clock;

  const decay = Math.exp(-dt * 3.2); ox *= decay; oy *= decay;
  shake *= Math.exp(-dt * 7); flash *= Math.exp(-dt * 6); punch *= Math.exp(-dt * 9);
  recV += (-620 * recoil - 30 * recV) * dt; recoil += recV * dt;       // 反動は、ばねで戻る
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  // 命中の瞬間は映像ごと一瞬ふくらみ、発射の瞬間は逆に一瞬引く
  { const k = (1 + punch * 0.07) * (1 - recoil * 0.04); g.translate(W/2, H/2); g.scale(k, k); g.translate(-W/2, -H/2);
    const cz = (CAM_ZOOM * (1 + punch * 0.05) * (1 - recoil * 0.03)).toFixed(4);
    if (cz !== lastCamZoom && camEl.isConnected){ camEl.style.transform = `scale(${cz})`; lastCamZoom = cz; } }
  g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  g.globalCompositeOperation = 'lighter';

  if (phase === 'load') stepLoad(t, dt);
  if (phase === 'ready') stepReady(t);
  if (phase === 'fire') stepFire(t, dt);
  if (phase === 'cool') stepCool(t, dt);
  if (phase !== 'ready') squeeze += (0 - squeeze) * (1 - Math.exp(-dt * 14));      // 絞りは、発射で一気に戻る

  const spinUp = phase === 'ready' ? Math.pow(Math.min(1, (t - tPhase) / READY_SEC), 2) : 0;
  spinCircles(t, dt, spinUp);
  updateDrone(spinUp);
  updateBackdrop(t, wall);       // カメラ映像の側は実時間で進める（コマが遅くても、命中の一瞬がのびないように）

  drawCharging(t, dt);
  drawCircles(t, spinUp);
  if (phase === 'ready') drawCore(t);
  updateTargets(t); drawTargets(t); drawReticle(t); listenVoice(t);
  if (wake > 0) drawBeam(phase === 'fire' ? bulletZ : Z1, wake, t, shotN, beamTail);
  drawCreature(t);
  drawGather(t); drawMagic(t, dt); drawFx(t, dt);
  if (phase === 'fire' && !spell) drawBullet(bulletZ, shotN);
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
  addEventListener('keydown', e => { if (e.target.closest && e.target.closest('#chant')) return;      // 詠唱を打っている間は、発射のキーにしない
    if (e.code === 'Space') trigger(); if (e.code === 'KeyL') load(); });
  initChantUI();
  addEventListener('pointermove', e => { if (hasOri || (e.target.closest && e.target.closest('button, #chant'))) return;      // ボタンや入力欄の上では、向きを変えない
    lookAz = (e.clientX / W - 0.5) * 2.2; lookEl = -(e.clientY / H - 0.5) * 1.2; lookBasis(); });
});
