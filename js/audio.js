'use strict';
// ---- 音 ----
// 無機質に寄せている：旋律・和音・うなる音色は使わない。
// 材料は、純音（サイン波）、ごく短いクリック、白色雑音の切れ端、低い純音のパルスだけ。
// 音の出入りは、ふくらませずに、定規で切ったように入って切れる（gate）。
// 残響は控えめ。発射の直前に一瞬だけ、完全な無音にする。
//
// 帯の分け方（スマホのスピーカーは 300 Hz あたりから下がほとんど出ない、という前提）
//   待機：300〜700 Hz の純音を、装填した枚数ぶんだけ重ねる（1 枚＝1 本）。小さく鳴らす
//   発射：中〜高い帯の、短く乾いた音（雑音の壁・落ちる純音）と、100 Hz あたりの押し出し
//   着弾：低い帯の、こもって長く残る音（50 Hz から沈む純音・こもった雑音）。高い帯のクリックは入れない
//   命中：中の帯のざらついた破裂と、確定の 2 音（着弾に重ねて鳴る）。はずれは低い 1 音だけ
//   低い一打には、どれも小さな「胴」を足して、低い音の出ない端末でも聞こえるようにしてある（thud）
let ac = null, bus, sat, sndGate, rev, echo, nbuf, drone = null, curve, stair, swing = 0, volG = null;
let chargeTickAt = 0, loadSndEnd = 0, lockSndAt = -1, hushAt = Infinity;
const VOLS = [['大', 1], ['中', 0.55], ['小', 0.25], ['切', 0]];
let volI = +(localStorage.getItem('arbeem-vol') || 1) % 4;
function setVol(){ if (volG) volG.gain.value = VOLS[volI][1]; volBtn.textContent = '音量：' + VOLS[volI][0]; }
const rv = () => 1 + (Math.random() - 0.5) * 0.07;      // 毎回少しだけ音程をずらす

// ---- 調整用の値（音）----
const STEP = [1, 1.5, 2.25];              // 装填・点火・通過の音が、1 枚ごとに上がる高さ（一定の比）
const HUM_HZ = 600;                       // 待機の純音の、いちばん下の高さ（HI を掛けて使う。HI = 0.5 なら 300 Hz）
const HUM_STACK = [1, 1.45, 2.36];        // 待機の純音の高さの比。和音に聞こえないよう、きれいな整数の比（1.5 や 2 など）を外してある
const HUM_VOL = [0.052, 0.034, 0.023];    // 待機の純音の大きさ（下から）。高い音ほど耳につくので小さくする
const HUSH_SEC = 0.075;                   // 発射の直前の無音（秒）
const THUD_KNOCK = [400, 150, 0.05];      // 低い一打に足す「胴」：この高さ（Hz）から、この高さまで、この秒数で落ちる純音

function initAudio(){
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const sr = ac.sampleRate, comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.18;
  const shelf = ac.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3000; shelf.gain.value = -10;   // 高い帯を全体に抑える
  volG = ac.createGain(); setVol(); comp.connect(shelf).connect(volG).connect(ac.destination);
  curve = new Float32Array(2048); for (let i = 0; i < 2048; i++) curve[i] = Math.tanh((i / 1024 - 1) * 3);
  const soft = new Float32Array(2049); for (let i = 0; i < 2049; i++) soft[i] = Math.tanh((i / 1024 - 1) * 1.6) / Math.tanh(1.6);   // 点の数を奇数にして、無音が正確に 0 になるようにする
  stair = new Float32Array(2048); for (let i = 0; i < 2048; i++) stair[i] = Math.round((i / 1024 - 1) * 3) / 3;   // 段々に荒らす
  sat = ac.createWaveShaper(); sat.curve = soft; sat.connect(comp);
  // sndGate：発射の直前の無音を作る栓。じかの音も、残響も、こだまも、すべてここを通る
  sndGate = ac.createGain(); sndGate.connect(sat);
  bus = ac.createGain(); bus.connect(sndGate);
  // 残響：はじめの反射＋だんだんこもっていく尾
  rev = ac.createConvolver(); const n = sr * 3.2 | 0, ib = ac.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++){ const d = ib.getChannelData(ch); let y = 0;
    for (let i = 0; i < n; i++){ const u = i / n, k = 0.9 * Math.pow(1 - u, 3) + 0.06;
      y += ((Math.random()*2-1) * Math.exp(-u * 6.5) - y) * k; d[i] = y * 1.6; }
    for (let j = 0; j < 9; j++) d[(0.004 + Math.random() * 0.08) * sr | 0] += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4); }
  rev.buffer = ib; const rg = ac.createGain(); rg.gain.value = 0.42; rev.connect(rg).connect(sndGate);
  // こだま：左右で長さのちがう跳ね返り
  echo = ac.createGain();
  [[0.137, -0.7], [0.211, 0.7]].forEach(([dt, pan]) => { const d = ac.createDelay(0.5), fb = ac.createGain(), lp = ac.createBiquadFilter(), p = ac.createStereoPanner();
    d.delayTime.value = dt; fb.gain.value = 0.3; lp.type = 'lowpass'; lp.frequency.value = 2400; p.pan.value = pan;
    echo.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(p); p.connect(sndGate); });
  nbuf = ac.createBuffer(1, sr * 2, sr); const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random()*2-1;
  // 待機の純音：1 枚につき 1 本。揺らさず、まっすぐ鳴らす（左右に少しだけ振り分ける）
  const v = ac.createGain(); v.gain.value = 1; out(v, {});
  drone = { v, o: [], g: [], want: [], from: [], bend: 1, lvl: 1 };
  HUM_STACK.forEach((k, i) => { const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner();
    o.type = 'sine'; o.frequency.value = HUM_HZ * HI * k; g.gain.value = 0; p.pan.value = [-0.3, 0.3, 0][i] || 0;
    o.connect(g).connect(p).connect(v); o.start(); drone.o.push(o); drone.g.push(g); drone.want.push(0); drone.from.push(0); });
  chargeTickAt = 0; loadSndEnd = 0; lockSndAt = -1; hushAt = Infinity;
}
function out(node, o){
  let n = node; if (o.pan){ const p = ac.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
  n.connect(bus);
  if (o.wet){ const s = ac.createGain(); s.gain.value = o.wet; n.connect(s).connect(rev); }
  if (o.echo){ const s = ac.createGain(); s.gain.value = o.echo; n.connect(s).connect(echo); }
}
// 音色づけ：歪み／こもらせる／帯だけ通す／金属の筒の共鳴
function chain(n, t, dur, o){
  if (o.shape){ const w = ac.createWaveShaper(); w.curve = curve; n.connect(w); n = w; }
  if (o.lp){ const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.lp[2] || 3;
    f.frequency.setValueAtTime(o.lp[0], t); f.frequency.exponentialRampToValueAtTime(o.lp[1], t + dur); n.connect(f); n = f; }
  if (o.bp){ const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = o.bp[2] || 2;
    f.frequency.setValueAtTime(o.bp[0], t); f.frequency.exponentialRampToValueAtTime(o.bp[1], t + dur); n.connect(f); n = f; }
  if (o.crush){ const w = ac.createWaveShaper(); w.curve = stair; n.connect(w); n = w; }
  if (o.comb){ const d = ac.createDelay(0.05), fb = ac.createGain(), m = ac.createGain();
    d.delayTime.value = 1 / o.comb[0]; fb.gain.value = o.comb[1]; n.connect(m); n.connect(d); d.connect(fb); fb.connect(d); d.connect(m); n = m; }
  return n;
}
function fin(n, t, dur, vol, o){ const v = ac.createGain();
  if (o.gate){ v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(vol, t + 0.001);        // 定規で切ったような出入り
    v.gain.setValueAtTime(vol, t + Math.max(0.0015, dur - 0.003)); v.gain.linearRampToValueAtTime(0, t + dur); }
  else { const atk = Math.min(o.atk || 0.004, dur * 0.95), keep = Math.min(o.hold || 0, dur * 0.5);   // o.hold：はじめの大きさを保つ秒数
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + atk);
    if (keep) v.gain.setValueAtTime(vol, t + atk + keep);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  chain(n, t, dur, o).connect(v); out(v, o); }
function osc(type, f0, f1, dur, vol, o){
  if (!ac) return; o = o || {}; const t = ac.currentTime + (o.at || 0), s = ac.createOscillator();
  s.type = type; s.detune.value = o.detune || 0; s.frequency.setValueAtTime(f0, t); s.frequency.exponentialRampToValueAtTime(f1, t + dur);
  fin(s, t, dur, vol, o); s.start(t); s.stop(t + dur + 0.05);
}
function fm(f0, f1, ratio, i0, i1, dur, vol, o){        // 金属的な音（周波数変調）
  if (!ac) return; o = o || {}; const t = ac.currentTime + (o.at || 0), c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain();
  c.frequency.setValueAtTime(f0, t); c.frequency.exponentialRampToValueAtTime(f1, t + dur);
  m.frequency.setValueAtTime(f0 * ratio, t); m.frequency.exponentialRampToValueAtTime(f1 * ratio, t + dur);
  mg.gain.setValueAtTime(Math.max(0.01, i0 * f0), t); mg.gain.exponentialRampToValueAtTime(Math.max(0.01, i1 * f1), t + dur);
  m.connect(mg).connect(c.frequency); fin(c, t, dur, vol, o);
  c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
}
function noise(dur, type, f0, f1, q, vol, o){
  if (!ac) return; o = o || {}; const t = ac.currentTime + (o.at || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(); let n = f;
  s.buffer = nbuf; s.loop = true; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); s.connect(f);
  if (o.am){ const a = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();     // ビリビリ震わせる
    a.gain.value = 0.5; l.type = 'square'; l.frequency.value = o.am; lg.gain.value = 0.5; l.connect(lg).connect(a.gain);
    f.connect(a); n = a; l.start(t); l.stop(t + dur + 0.05); }
  fin(n, t, dur, vol, o); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const G = o => Object.assign({ gate: true }, o);
const tick = (f, vol, at, pan) => noise(0.005, 'bandpass', f * HI * 0.8, f * HI * 0.8, 1.1, vol * 0.8, { at, pan, gate: true });       // 針の先のようなクリック
const tone = (f, dur, vol, o) => osc('sine', f * HI, f * HI, dur, vol, G(o));                                         // 切り口のまっすぐな純音
const slice = (dur, f, vol, o) => noise(dur, 'bandpass', f * HI, f * HI, 8, vol, Object.assign({ gate: true, crush: true }, o));   // 雑音の切れ端
// 低い一打：低い純音（f0 → f1）に、小さな「胴」を足す。
// 胴は、同じ瞬間に 400 Hz から 150 Hz へ一気に落ちる、ごく短い純音。低い音の出ないスピーカーでも「トッ」と聞こえ、
// 低い音の出るイヤホンでは、低い純音の出だしに溶けて 1 つの打音に聞こえる。o.body＝胴の大きさ（低い純音に対する比）、o.knock＝胴の形
function thud(f0, f1, dur, vol, o){
  o = o || {}; osc('sine', f0, f1, dur, vol, o);
  const b = o.body == null ? 0.3 : o.body, k = o.knock || THUD_KNOCK;
  if (b) osc('sine', k[0], k[1], k[2], vol * b, { at: o.at, pan: o.pan, gate: true });
}
const shotIdx = n => Math.max(1, Math.min(3, Math.round(n) || 3)) - 1;      // 撃った枚数（1〜3）→ 0〜2。数がなければ 3 枚あつかい

function sndLoad(i){            // クリック → 読み込みのような 4 連の短い純音 → 確定の 1 音と低いパルス（ここで、待機の純音が 1 本増える）
  const k = STEP[i];
  tick(6000, 0.45, 0, 0);
  for (let j = 0; j < 4; j++) tone(2000 * k, 0.016, 0.16, { at: 0.03 + j * 0.032, pan: j % 2 ? 0.4 : -0.4 });
  tone(1000 * k, 0.11, 0.2, { at: 0.16, wet: 0.2 }); slice(0.028, 3000 * k, 0.28, { at: 0.16 });
  thud(62, 48, 0.17, 0.45, G({ at: 0.16, body: 0.25 }));
  if (drone){ drone.from[i] = ac.currentTime + 0.16; loadSndEnd = ac.currentTime + 0.34; }
}
function sndLock(i){            // 装填が終わった陣が「カチッ」と止まる：小さなクリック 2 つ（高い → 低い）と、止まった重みの、ごく短い低い打音
  if (!ac || ac.currentTime - lockSndAt < 0.04) return; lockSndAt = ac.currentTime;      // 続けて呼ばれても重ねない
  tick(3600, 0.42, 0, 0); noise(0.009, 'bandpass', 800, 800, 1.5, 0.42, { at: 0.024, gate: true });
  osc('sine', 330, 200, 0.026, 0.14, G({ at: 0.024 }));
}
function sndReady(){            // 3 枚そろって「撃てる」：待機の 3 本と同じ高さの純音を、同時に 2 回だけ短く（高さを動かさないので、旋律にならない）
  if (!ac) return;
  Promise.resolve().then(() => {                                                     // 同じ瞬間に sndLoad が呼ばれても、その後で段取りする
    const at = Math.max(0, loadSndEnd - ac.currentTime) + 0.03;                      // 装填の音が鳴り終わってから鳴らす
    for (let j = 0; j < 2; j++) HUM_STACK.forEach((k, i) => tone(HUM_HZ * k, 0.04, HUM_VOL[i] * 2.2, { at: at + j * 0.11 }));
    thud(60, 46, 0.1, 0.16, G({ at: at + 0.11 }));                                  // 2 回目に、小さな低い一打を添える
  });
}
function sndRiser(dur){         // 上がっていく純音と、間隔が詰まっていくクリック → 直前に一瞬の無音。dur＝合図から発射までの秒数
  if (!ac) return; const d = Math.max(0.05, dur - HUSH_SEC - 0.008), T = ac.currentTime;      // 発射は 1 コマぶんまで早く来ることがあるので、少し早めに閉じる
  osc('sine', 140, 1500, d, 0.1, { atk: d * 0.9 });
  for (let t = 0, j = 0; t < d - 0.012; j++){ const u = t / d; tick(7000, 0.08 + 0.2 * u, t, j % 2 ? 0.6 : -0.6); t += 0.11 - 0.07 * u; }   // 長さが変わっても、同じ詰まり方をする
  // 無音：鳴っているものすべて（残響も）を閉じる。開けるのは sndFire。発射が遅れても、無音のまま待つ
  hushAt = T + d;
  sndGate.gain.cancelScheduledValues(T); sndGate.gain.setValueAtTime(1, T); sndGate.gain.setValueAtTime(1, T + d - 0.01); sndGate.gain.linearRampToValueAtTime(0, T + d);
  sndGate.gain.setValueAtTime(0, T + dur + 0.5); sndGate.gain.linearRampToValueAtTime(1, T + dur + 0.55);      // 発射の音が来なかったときの保険
}
function openGate(){ const T = ac.currentTime; sndGate.gain.cancelScheduledValues(T); sndGate.gain.setValueAtTime(1, T); hushAt = Infinity; }
function sndIgnite(i){          // 固定の比で上がる、硬い純音の一打
  const k = STEP[i], pan = [-0.4, 0, 0.4][i];
  tick(5000, 0.5, 0, pan); tone(1320 * k, 0.07, 0.22, { pan, wet: 0.25 }); tone(1320 * k * 2.76, 0.035, 0.1, { pan });
  thud(70, 50, 0.1, 0.4, G({ body: 0.25 }));
  noise(0.09, 'bandpass', 1300, 1300, 1, 0.22, { comb: [220, 0.85], gate: true, pan, wet: 0.2 });           // 冷たい金属の筒の鳴り
}
function sndFire(n){            // 発射：中〜高い帯の、短く乾いた音。n＝撃った枚数。少ないほど、小さく、短く、こもらせる（3 枚でいちばん大きい）
  if (!ac) return; openGate();
  const m = shotIdx(n), A = [0.46, 0.68, 1][m], B = [0.48, 0.68, 1][m], D = [0.5, 0.72, 1][m], DL = [0.6, 0.8, 1][m];     // A＝低い帯の大きさ、B＝中〜高い帯の大きさ、D＝中〜高い帯の長さ、DL＝低い帯の長さ
  tick(3000, B, 0, 0); noise(0.07 * D, 'highpass', 400, 400, 0.5, 0.8 * B, { gate: true });      // 一瞬の白色雑音の壁
  thud(108, 38, 1.1 * DL, A, { atk: 0.006, hold: 0.05 * DL });                                 // 押し出す低い純音（着弾より高く、短い）
  osc('sine', [2200, 3000, 3800][m], 240, 0.4 * D, 0.2 * Math.sqrt(B), { wet: 0.35 });         // まっすぐ落ちる純音
  tone(3520, FLY[m] - 0.02, 0.07 * Math.sqrt(B), { at: 0.02, pan: -0.5, wet: 0.25 });         // 飛んでいる間だけ鳴る、うなりのある 2 本の純音
  tone(3531, FLY[m] - 0.02, 0.07 * Math.sqrt(B), { at: 0.02, pan: 0.5, wet: 0.25 });          // （着弾でぷつりと切れる）
  if (m > 0){ fm(620, 620, 1.414, 6, 0.2, 0.2, 0.22 * B, { wet: 0.3 });                         // 濁った冷たい金属音（2 枚から）
    noise(1.1 * D, 'bandpass', 700, 3800, 0.8, 0.3 * B, { wet: 0.45 }); }                      // 上へ抜けていく空気（2 枚から）
  for (let k = 0; k < [2, 4, 7][m]; k++) slice(0.018, 800 + Math.random() * [2500, 5000, 7000][m], 0.28 * Math.sqrt(B), { at: 0.09 + k * 0.034, pan: Math.random() * 1.6 - 0.8 });   // 信号が乱れるような切れ端
}
function sndPass(i){            // 陣を抜ける：一定の比で上がる、短い純音
  const f = 2000 * STEP[i], pan = [-0.5, 0.2, 0.5][i];
  tone(f, 0.045, 0.22, { pan, wet: 0.35 }); slice(0.025, f * 1.5, 0.2, { at: 0.045, pan });
}
function sndImpact(n){          // 着弾：低い帯の、こもって長く残る音。n＝撃った枚数。少ないほど、小さく短い
  const m = shotIdx(n), A = [0.55, 0.75, 1][m], D = [0.45, 0.7, 1][m];
  tick(1500, 0.4 * A, 0, 0);                                                                // こもったクリック（600 Hz あたり）
  thud(52, 26, 1.2 * D, 0.7 * A, { atk: 0.005, wet: 0.3, body: 0.45, knock: [320, 110, 0.075] });   // 深く沈んでいく低い純音。胴は低く、長め
  noise(0.7 * D, 'lowpass', 520, 90, 0.7, 0.42 * A, { wet: 0.6 });                           // こもった雑音が、さらにこもりながら消える
  if (m > 0){ osc('sine', 660, 660, 1.8 * D, 0.09 * A, { wet: 0.9, pan: -0.5 });              // 長く残る 1 本の純音（わずかにずらした 2 本。2 枚から）
    osc('sine', 665, 665, 1.8 * D, 0.09 * A, { wet: 0.9, pan: 0.5 }); }
}
function sndHit(){              // 命中：砕ける手ごたえ（低い一打＋ざらついた破裂）→ 確定の 2 音 → 破片がぱらつく
  thud(95, 38, 0.3, 0.8, { atk: 0.004, body: 0.15 });
  noise(0.14, 'bandpass', 900, 500, 1, 0.64, { crush: true, wet: 0.3 }); noise(0.05, 'lowpass', 2500, 2500, 0.7, 0.55, { gate: true });
  tone(2640, 0.05, 0.2, { at: 0.07, wet: 0.3 }); tone(3960, 0.1, 0.2, { at: 0.13, wet: 0.4 });
  for (let k = 0; k < 12; k++) tick(2500 + Math.random() * 3500, 0.12 + Math.random() * 0.15, 0.08 + Math.random() * 0.5, Math.random() * 1.6 - 0.8);
}
function sndMiss(){             // はずれ：着弾のあとに、低い 1 音。3 倍・4 倍の高さの純音をごく小さく重ねて、小さなスピーカーでも低い音として聞こえるようにする
  tone(196, 0.14, 0.18, { at: 0.16 }); tone(196 * 3, 0.14, 0.06, { at: 0.16 }); tone(196 * 4, 0.14, 0.045, { at: 0.16 });
}
// 毎フレーム呼ばれる。待機の純音（装填した枚数ぶん）と、ためている間のクリック
function updateDrone(spinUp){
  if (!drone) return; const n = circles.length, T = ac.currentTime;
  if (T > hushAt + 1) hushAt = Infinity;
  const on = (phase === 'load' || phase === 'ready') && T < hushAt;          // 発射の直前の無音からは鳴らさない
  swing *= 0.93; const sw = swing < 0.01 ? 0 : swing;
  // 発射の合図で回転が上がるあいだは、3 本そろって上がる。端末を振ると、わずかに上がって大きくなる
  const bend = (1 + 0.5 * spinUp) * (1 + 0.04 * sw), lvl = 1 + 0.5 * spinUp + 0.25 * sw;
  if (bend !== drone.bend){ drone.bend = bend; drone.o.forEach((o, i) => o.frequency.setTargetAtTime(HUM_HZ * HI * HUM_STACK[i] * bend, T, 0.05)); }
  if (lvl !== drone.lvl){ drone.lvl = lvl; drone.v.gain.setTargetAtTime(lvl, T, 0.05); }
  // 1 枚につき 1 本。装填の音の「確定の 1 音」と同時に、すっと入る
  drone.g.forEach((g, i) => { const want = on && i < n && T >= drone.from[i] ? HUM_VOL[i] : 0;
    if (want !== drone.want[i]){ drone.want[i] = want; g.gain.setTargetAtTime(want, T, want ? 0.005 : 0.012); } });
  // かざしてためている間：たまるほど間隔が詰まるクリック
  if (phase === 'load' && steady && charge > 0.02 && n < MAX && T >= chargeTickAt){
    chargeTickAt = T + 0.15 - 0.11 * charge; tick(8000, 0.08 + 0.1 * charge, 0, Math.random() - 0.5); }
}
