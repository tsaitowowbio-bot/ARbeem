'use strict';
// ---- 音 ----
// 無機質に寄せている：旋律・和音・うなる音色は使わない。
// 材料は、純音（サイン波）、ごく短いクリック、白色雑音の切れ端、低い純音のパルスだけ。
// 音の出入りは、ふくらませずに、定規で切ったように入って切れる（gate）。
// 残響は控えめ。発射の直前に一瞬だけ無音にするのは残している。
let ac = null, bus, sat, rev, echo, nbuf, drone = null, curve, stair, swing = 0, tickT = 0, volG = null;
const VOLS = [['大', 1], ['中', 0.55], ['小', 0.25], ['切', 0]];
let volI = +(localStorage.getItem('arbeem-vol') || 1) % 4;
function setVol(){ if (volG) volG.gain.value = VOLS[volI][1]; volBtn.textContent = '音量：' + VOLS[volI][0]; }
const rv = () => 1 + (Math.random() - 0.5) * 0.07;      // 毎回少しだけ音程をずらす
function initAudio(){
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const sr = ac.sampleRate, comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.18;
  const shelf = ac.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3000; shelf.gain.value = -10;   // 高い帯を全体に抑える
  volG = ac.createGain(); setVol(); comp.connect(shelf).connect(volG).connect(ac.destination);
  curve = new Float32Array(2048); for (let i = 0; i < 2048; i++) curve[i] = Math.tanh((i / 1024 - 1) * 3);
  const soft = new Float32Array(2048); for (let i = 0; i < 2048; i++) soft[i] = Math.tanh((i / 1024 - 1) * 1.6) / Math.tanh(1.6);
  stair = new Float32Array(2048); for (let i = 0; i < 2048; i++) stair[i] = Math.round((i / 1024 - 1) * 3) / 3;   // 段々に荒らす
  sat = ac.createWaveShaper(); sat.curve = soft; sat.connect(comp);
  bus = ac.createGain(); bus.connect(sat);
  // 残響：はじめの反射＋だんだんこもっていく尾
  rev = ac.createConvolver(); const n = sr * 3.2 | 0, ib = ac.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++){ const d = ib.getChannelData(ch); let y = 0;
    for (let i = 0; i < n; i++){ const u = i / n, k = 0.9 * Math.pow(1 - u, 3) + 0.06;
      y += ((Math.random()*2-1) * Math.exp(-u * 6.5) - y) * k; d[i] = y * 1.6; }
    for (let j = 0; j < 9; j++) d[(0.004 + Math.random() * 0.08) * sr | 0] += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4); }
  rev.buffer = ib; const rg = ac.createGain(); rg.gain.value = 0.42; rev.connect(rg).connect(sat);
  // こだま：左右で長さのちがう跳ね返り
  echo = ac.createGain();
  [[0.137, -0.7], [0.211, 0.7]].forEach(([dt, pan]) => { const d = ac.createDelay(0.5), fb = ac.createGain(), lp = ac.createBiquadFilter(), p = ac.createStereoPanner();
    d.delayTime.value = dt; fb.gain.value = 0.3; lp.type = 'lowpass'; lp.frequency.value = 2400; p.pan.value = pan;
    echo.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(p); p.connect(sat); });
  nbuf = ac.createBuffer(1, sr * 2, sr); const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random()*2-1;
  // 鳴り続けるうなり
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator(), f = ac.createBiquadFilter(), v = ac.createGain(),
        lfo = ac.createOscillator(), lg = ac.createGain(), trem = ac.createGain(), g3 = ac.createGain();
  o1.type = o2.type = o3.type = 'sine'; o2.detune.value = 9; g3.gain.value = 0.1;
  f.type = 'lowpass'; f.Q.value = 5; v.gain.value = 0; lfo.frequency.value = 7; lg.gain.value = 0; trem.gain.value = 1; f.frequency.value = 14000; f.Q.value = 0.5;
  o1.connect(f); o2.connect(f); o3.connect(g3).connect(f); f.connect(trem); lfo.connect(lg).connect(trem.gain); trem.connect(v);
  out(v, { wet: 0.15 }); [o1, o2, o3, lfo].forEach(o => o.start());
  drone = { o1, o2, o3, f, v };
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
  else { const atk = Math.min(o.atk || 0.004, dur * 0.95);
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + atk); v.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
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
const STEP = [1, 1.5, 2.25];                                     // 1 枚ごとに上がる高さ（音階ではなく、一定の比）

function sndLoad(i){            // クリック → 読み込みのような 4 連の短い純音 → 確定の 1 音と低いパルス
  const k = STEP[i];
  tick(6000, 0.45, 0, 0);
  for (let j = 0; j < 4; j++) tone(2000 * k, 0.016, 0.16, { at: 0.03 + j * 0.032, pan: j % 2 ? 0.4 : -0.4 });
  tone(1000 * k, 0.11, 0.2, { at: 0.16, wet: 0.2 }); slice(0.028, 3000 * k, 0.28, { at: 0.16 });
  osc('sine', 62, 48, 0.17, 0.45, G({ at: 0.16 }));
}
function sndRiser(dur){         // 上がっていく純音と、間隔が詰まっていくクリック → 直前に一瞬の無音
  if (!ac) return; const d = dur - 0.075, T = ac.currentTime;
  osc('sine', 140, 1500, d, 0.1, { atk: d * 0.9 });
  for (let t = 0, iv = 0.11, j = 0; t < d; t += iv, iv = Math.max(0.012, iv * 0.9), j++) tick(7000, 0.08 + 0.2 * t / d, t, j % 2 ? 0.6 : -0.6);
  bus.gain.setValueAtTime(1, T + d - 0.02); bus.gain.linearRampToValueAtTime(0.02, T + d + 0.005);
  bus.gain.setValueAtTime(0.02, T + dur - 0.004); bus.gain.linearRampToValueAtTime(1, T + dur);
}
function sndIgnite(i){          // 固定の比で上がる、硬い純音の一打
  const k = STEP[i], pan = [-0.4, 0, 0.4][i];
  tick(5000, 0.5, 0, pan); tone(1320 * k, 0.07, 0.22, { pan, wet: 0.25 }); tone(1320 * k * 2.76, 0.035, 0.1, { pan });
  osc('sine', 70, 50, 0.1, 0.4, G({}));
  noise(0.09, 'bandpass', 1300, 1300, 1, 0.22, { comb: [220, 0.85], gate: true, pan, wet: 0.2 });           // 冷たい金属の筒の鳴り
}
function sndFire(){
  tick(3000, 1.0, 0, 0); noise(0.07, 'highpass', 400, 400, 0.5, 0.8, { gate: true });      // 一瞬の白色雑音の壁
  osc('sine', 82, 29, 1.5, 1.0, { atk: 0.008 });                                            // 沈んでいく低い純音
  osc('sine', 3800, 240, 0.4, 0.2, { wet: 0.35 });                                          // まっすぐ落ちる純音
  tone(3520, FLY_SEC - 0.02, 0.07, { at: 0.02, pan: -0.5, wet: 0.25 });                     // 飛んでいる間だけ鳴る、うなりのある 2 本の純音
  tone(3531, FLY_SEC - 0.02, 0.07, { at: 0.02, pan: 0.5, wet: 0.25 });                      // （着弾でぷつりと切れる）
  fm(620, 620, 1.414, 6, 0.2, 0.2, 0.22, { wet: 0.3 });                                   // 濁った冷たい金属音
  noise(1.1, 'bandpass', 700, 3800, 0.8, 0.3, { wet: 0.45 });                             // 上へ抜けていく空気
  for (let k = 0; k < 7; k++) slice(0.018, 800 + Math.random() * 7000, 0.28, { at: 0.09 + k * 0.034, pan: Math.random() * 1.6 - 0.8 });   // 信号が乱れるような切れ端
}
function sndPass(i){            // 陣を抜ける：一定の比で上がる、短い純音
  const f = 2000 * STEP[i], pan = [-0.5, 0.2, 0.5][i];
  tone(f, 0.045, 0.22, { pan, wet: 0.35 }); slice(0.025, f * 1.5, 0.2, { at: 0.045, pan });
}
function sndImpact(){           // 着弾：低い純音の一打と、長く残る 1 本の純音
  tick(4000, 0.6, 0, 0); osc('sine', 58, 27, 1.1, 0.9, { atk: 0.005, wet: 0.3 });
  noise(0.5, 'lowpass', 900, 80, 0.7, 0.45, { wet: 0.6 });
  osc('sine', 660, 660, 1.8, 0.09, { wet: 0.9, pan: -0.5 }); osc('sine', 665, 665, 1.8, 0.09, { wet: 0.9, pan: 0.5 });
  for (let k = 0; k < 8; k++) tick(9000, 0.25, Math.random() * 0.35, Math.random() * 1.6 - 0.8);
}
function sndHit(){              // 命中：砕ける手ごたえ（低い一打＋ざらついた破裂）→ 確定の 2 音 → 破片がぱらつく
  osc('sine', 95, 38, 0.3, 0.9, { atk: 0.004 });
  noise(0.14, 'bandpass', 900, 500, 1, 0.7, { crush: true, wet: 0.3 }); noise(0.05, 'lowpass', 2500, 2500, 0.7, 0.6, { gate: true });
  tone(2640, 0.05, 0.22, { at: 0.07, wet: 0.3 }); tone(3960, 0.1, 0.22, { at: 0.13, wet: 0.4 });
  for (let k = 0; k < 12; k++) tick(2500 + Math.random() * 3500, 0.12 + Math.random() * 0.15, 0.08 + Math.random() * 0.5, Math.random() * 1.6 - 0.8);
}
function sndLock(i){}            // 装填が終わった陣が「カチッ」と止まる合図（i＝何枚目か。0 から）。まだ音なし
function sndReady(){}            // 3 枚そろって「撃てる」の合図。まだ音なし
function sndMiss(){ tone(196, 0.12, 0.16, { at: 0.05 }); }      // はずれ：低い 1 音
function updateDrone(spinUp){
  if (!drone) return; const n = circles.length, on = (phase === 'load' || phase === 'ready') && n > 0, T = ac.currentTime;
  swing *= 0.93;
  // 待機中：低い純音 2 本（わずかにずらして、ゆっくりうなる）と、高く細い純音 1 本
  const f = 55 * (1 + 0.25 * n) * (1 + 1.2 * spinUp) * (1 + 0.15 * swing);
  drone.o1.frequency.setTargetAtTime(f * 2, T, 0.08); drone.o2.frequency.setTargetAtTime(f * 2, T, 0.08);
  drone.o3.frequency.setTargetAtTime(1300 + 320 * n + 1100 * spinUp + 250 * swing, T, 0.08);
  drone.v.gain.setTargetAtTime(on ? 0.07 + 0.025 * n + 0.07 * spinUp + 0.04 * swing : 0, T, on ? 0.1 : 0.02);
  // かざしてためている間：たまるほど間隔が詰まるクリック
  if (phase === 'load' && steady && charge > 0.02 && circles.length < MAX){
    if ((tickT -= 1 / 60) <= 0){ tickT = 0.15 - 0.11 * charge; tick(8000, 0.08 + 0.1 * charge, 0, Math.random() - 0.5); }
  }
}
