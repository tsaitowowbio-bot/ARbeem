'use strict';
// ---- 魔法陣（形・装填・回転・描画）----
// 流れ：かまえている間、次の 1 枚が線で「描かれて」いく（charge 0→1）
//       → 描き終わると、回転がカチッと止まり、一瞬明るくなる（装填）
//       → 3 枚そろうと、3 枚が同じ調子でゆっくり明滅する（撃てる合図）
//       → 点火では、白くせずに、色を濃くし、星を開き、速く回す。白に近づくのは、弾が通り抜ける一瞬だけ。

// ---- このファイルの中だけで使う調整用の値 ----
const MC_TOP = -Math.PI / 2;    // カチッと止まる向き（外の帯・星・芯の頂点が、真上にそろう）
const MC_WIND = 1.0;            // 描かれている間に回る量（外の帯。rad）
const MC_HOLD = 0.16;           // 装填の直後、回転が止まっている秒数
const MC_KICK = 0.06;           // 止まるときに、行きすぎて戻る量（rad）
const MC_FLASH = 9;             // 装填の瞬間の明るさが消える速さ（大きいほど短い）
const MC_PULSE_SEC = 1.7;       // 3 枚そろったあとの明滅の 1 周期（秒）
const MC_PULSE_WAIT = 0.25;     // 3 枚目が止まってから、明滅が始まるまで（秒）
const MC_SNAP = 0.05;           // 点火の瞬間、3 つの部品の向きが真上にそろったまま止まっている秒数
const MC_OPEN = 0.14;           // 点火で、星が開ききるまでの秒数
const MC_UNDER = 0.3;           // 明るい背景でも線が読めるように、下に敷く暗い線の濃さ（0 で敷かない）

const mcSeg = (x, a, b) => x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);                 // a〜b の間を 0〜1 に
const mcSm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);                        // なめらかに 0→1
const mcBack = x => { if (x <= 0) return 0; if (x >= 1) return 1; const y = x - 1; return 1 + y * y * (2.7 * y + 1.7); };   // 少し行きすぎて戻る 0→1

// ---- 形のもと：外の帯・星・芯の 3 つを別々に回す（半径 1 で作っておく）----
function rnd(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const mcGcd = (a, b) => b ? mcGcd(b, a % b) : a;
const MC_GEO = STAR.map(([p, q], i) => {
  const r = rnd(1234 + i * 77), n = 22 + i * 4, runes = new Float32Array(n * 8);     // ルーン風の短い線（1 つが 4 点）
  for (let k = 0; k < n; k++){
    const a = k / n * TAU, c = Math.cos(a), s = Math.sin(a);
    for (let m = 0; m < 4; m++){
      const u = r() * 2 - 1, v = m ? m - 2 + r() * 0.5 : -1, R = 0.84 + v * 0.065, w = u * 0.05;
      runes[k * 8 + m * 2] = c * R - s * w; runes[k * 8 + m * 2 + 1] = s * R + c * w;
    }
  }
  return { p, q, n, runes, m: 3 + i, cyc: p / mcGcd(p, q) };     // m：芯の多角形の頂点数、cyc：星を一筆で描ける辺の数
});
// 以下の mcAdd… は、形を経路に足す（Path2D にも、画面 g にも使える）。数や割合を小さく渡すと、描きかけになる。
function mcAddArc(P, R, u, dir){                 // 輪を u 周ぶん（dir＝1：時計回り、−1：逆回り）
  if (u <= 0) return; P.moveTo(R, 0); P.arc(0, 0, R, 0, TAU * Math.min(1, u) * dir, dir < 0); }
function mcAddRunes(P, geo, n){                    // 帯の中のルーンを n 個
  const d = geo.runes;
  for (let k = 0, o = 0; k < n; k++, o += 8){ P.moveTo(d[o], d[o + 1]); P.lineTo(d[o + 2], d[o + 3]); P.lineTo(d[o + 4], d[o + 5]); P.lineTo(d[o + 6], d[o + 7]); } }
function mcAddTicks(P, geo, n){                    // 帯の外の目盛りを n 本
  for (let k = 0; k < n; k++){ const a = k / (geo.p * 2) * TAU, R1 = k % 2 ? 1.03 : 1.07, c = Math.cos(a), s = Math.sin(a);
    P.moveTo(c, s); P.lineTo(c * R1, s * R1); } }
const mcVert = (geo, j) => ((j / geo.cyc | 0) + (j % geo.cyc) * geo.q) / geo.p * TAU;      // 星を描く順で j 番目の頂点の角度
function mcAddStar(P, geo, v, open){               // 星の辺を v 本（小数は、伸びている途中）。open（0〜1）で、星が多角形へ開く
  const phi = TAU / geo.p * (geo.q - (geo.q - 1) * open);
  for (let j = 0; j < geo.p && j < v; j++){
    const a = mcVert(geo, j), f = Math.min(1, v - j), x0 = Math.cos(a) * 0.70, y0 = Math.sin(a) * 0.70;
    P.moveTo(x0, y0); P.lineTo(x0 + (Math.cos(a + phi) * 0.70 - x0) * f, y0 + (Math.sin(a + phi) * 0.70 - y0) * f);
  } }
function mcAddDots(P, geo, n){                     // 星の頂点の小さな丸を n 個
  for (let j = 0; j < n; j++){ const a = mcVert(geo, j), x = Math.cos(a) * 0.70, y = Math.sin(a) * 0.70; P.moveTo(x + 0.05, y); P.arc(x, y, 0.05, 0, TAU); } }
function mcAddCore(P, geo, u, v, n){               // 芯：2 重の輪を u 周ぶん、多角形の辺を v 本、外へ出る短い線を n 本
  mcAddArc(P, 0.30, u, 1); mcAddArc(P, 0.24, u, -1);
  for (let k = 0; k < geo.m && k < v; k++){ const a = k / geo.m * TAU, b = (k + 1) / geo.m * TAU, f = Math.min(1, v - k), x0 = Math.cos(a) * 0.24, y0 = Math.sin(a) * 0.24;
    P.moveTo(x0, y0); P.lineTo(x0 + (Math.cos(b) * 0.24 - x0) * f, y0 + (Math.sin(b) * 0.24 - y0) * f); }
  for (let k = 0; k < n; k++){ const a = (k + 0.5) / geo.m * TAU, c = Math.cos(a), s = Math.sin(a); P.moveTo(c * 0.30, s * 0.30); P.lineTo(c * 0.44, s * 0.44); }
}
// 描き終わった形（先に作っておく）
const SHAPES = MC_GEO.map(geo => {
  const outer = new Path2D(), mid = new Path2D(), core = new Path2D();
  mcAddArc(outer, 1, 1, 1); mcAddArc(outer, 0.94, 1, 1); mcAddArc(outer, 0.74, 1, 1); mcAddRunes(outer, geo, geo.n); mcAddTicks(outer, geo, geo.p * 2);
  mcAddArc(mid, 0.70, 1, 1); mcAddStar(mid, geo, geo.p, 0); mcAddDots(mid, geo, geo.p);
  mcAddCore(core, geo, 1, geo.m, geo.m);
  return [outer, mid, core];
});
const PART_SPIN = [1, -1.7, 3.1];   // 外・星・芯の回転の比（星は逆回り）

// ---- 光の絵（先に作っておき、貼って使う）：輪に沿ったにじみと、小さな光の点。どちらも、まん中を白くしない ----
const MC_HALO = [], MC_DOT = [];
HUE.forEach((h, i) => {
  const mk = (size, stops) => { const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col)); x.fillStyle = gr; x.fillRect(0, 0, size, size); return c; };
  MC_HALO[i] = mk(192, [[0, `hsla(${h},90%,65%,0.1)`], [0.5, `hsla(${h},95%,63%,0.3)`], [0.68, `hsla(${h},95%,62%,1)`], [0.77, `hsla(${h},95%,62%,0.8)`], [1, `hsla(${h},95%,60%,0)`]]);
  MC_DOT[i] = mk(48, [[0, `hsla(${h},100%,90%,1)`], [0.3, `hsla(${h},100%,74%,0.55)`], [1, `hsla(${h},100%,65%,0)`]]);
});
function mcSpot(img, x, y, r, a){ if (a <= 0.004) return; g.globalAlpha = Math.min(1, a); g.drawImage(img, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; }

// ---- 線の描き方 ----
// 線は 2 度がき（中くらいの太さで淡く → 細く明るく）。明るい背景の上でも読めるように、その下に暗い線を 1 本敷く。
// 太くて淡いにじみは、輪（外の帯と、星の輪）にだけ重ねる。星や芯の線には重ねないので、まん中が白くこもらない。
let mcS0 = '', mcS1 = '', mcS2 = '', mcSU = '', mcW0 = 0, mcW1 = 0, mcW2 = 0, mcWU = 0;
function mcPen(hue, sat, lum, A, wide, R, under){        // 色と太さを決める（陣 1 枚につき 1 回）
  mcS0 = `hsla(${hue},${sat}%,${lum - 8}%,${A * 0.13})`; mcW0 = 11 * wide / R;
  mcS1 = `hsla(${hue},${sat}%,${lum}%,${A * 0.28})`;     mcW1 = (3.5 + 2.2 * (wide - 1)) / R;
  mcS2 = `hsla(${hue},${sat}%,${lum + 12}%,${Math.min(1, A * 0.95)})`; mcW2 = 1.1 / R;
  mcSU = under > 0.01 ? `rgba(2,8,20,${Math.min(0.6, under)})` : ''; mcWU = 3.2 / R;
}
function mcInk(P){                                       // 形 P（なければ、いま g に作ってある経路）をなぞる
  if (mcSU){ g.globalCompositeOperation = 'source-over'; g.strokeStyle = mcSU; g.lineWidth = mcWU; P ? g.stroke(P) : g.stroke(); g.globalCompositeOperation = 'lighter'; }
  g.strokeStyle = mcS1; g.lineWidth = mcW1; P ? g.stroke(P) : g.stroke();
  g.strokeStyle = mcS2; g.lineWidth = mcW2; P ? g.stroke(P) : g.stroke();
}
function mcSoft(u, v){                                   // 輪のにじみ（u・v：外の帯・星の輪が、何周ぶん描けているか）
  g.strokeStyle = mcS0; g.lineWidth = mcW0; g.beginPath(); mcAddArc(g, 0.97, u, 1); mcAddArc(g, 0.72, v, 1); g.stroke();
}

// ---- 描き終わった陣を 1 枚描く ----
// 見た目の値（1 枚ごとに書きかえて使い回す）
//   lum・sat：線の明るさ・あざやかさ／gain：濃さ／wide：にじみの太さ／halo：輪に沿ったにじみ
//   open：星の開き（0＝星、1＝多角形）／core：芯の大きさ／spark：芯の火花／under：下に敷く暗い線
//   pop：装填の瞬間に、外へ広がって消える色の輪（1 → 0）
const mcL = { lum: 72, sat: 95, gain: 1, wide: 1, halo: 0.13, open: 0, core: 1, spark: 0, under: 0, pop: 0 };
function mcBody(i, ang, x, y, R, alpha){
  const L = mcL, hue = HUE[i], geo = MC_GEO[i], sh = SHAPES[i], A = alpha * L.gain;
  g.save(); g.translate(x, y); g.scale(R, R * 0.9);
  mcSpot(MC_HALO[i], 0, 0, 1.3, L.halo * A);
  mcPen(hue, L.sat, L.lum, A, L.wide, R, L.under * alpha);
  mcSoft(1, 1);
  g.save(); g.rotate(ang[0]); mcInk(sh[0]); g.restore();                              // 外の帯
  g.save(); g.rotate(ang[1]);                                                         // 星（開いている間だけ、その場で形を作る）
  if (L.open > 0.001){ g.beginPath(); mcAddArc(g, 0.70, 1, 1); mcAddStar(g, geo, geo.p, L.open); mcAddDots(g, geo, geo.p); mcInk(null); }
  else mcInk(sh[1]);
  g.restore();
  g.save(); g.rotate(ang[2]); if (L.core !== 1) g.scale(L.core, L.core); mcInk(sh[2]); g.restore();   // 芯
  // 外の輪を走る光と、輪の上を回る光の粒
  const sw = -ang[0] * 2.2 + i, ex = (L.wide - 1) * 0.5;
  g.strokeStyle = `hsla(${hue},100%,90%,${0.55 * alpha})`; g.lineWidth = 2.4 / R;
  g.beginPath(); g.arc(0, 0, 1, sw, sw + 0.7 + ex); g.stroke();
  g.beginPath(); g.arc(0, 0, 0.74, -sw, -sw + 0.5 + ex); g.stroke();
  for (let k = 0; k < 3; k++){ const a = ang[0] * 1.6 + k * TAU / 3; mcSpot(MC_DOT[i], Math.cos(a) * 0.97, Math.sin(a) * 0.97, 0.08, 0.9 * alpha); }
  if (L.spark > 0.01) mcSpot(MC_DOT[i], 0, 0, 0.16 + 0.2 * (1 - L.spark), L.spark * alpha);       // 芯の火花（点火の一瞬）
  if (L.pop > 0.02){ g.strokeStyle = `hsla(${hue},100%,78%,${0.6 * L.pop * alpha})`; g.lineWidth = (1 + 5 * L.pop) / R;          // 装填の瞬間に広がる輪
    g.beginPath(); g.arc(0, 0, 1.08 + 0.3 * (1 - L.pop) * (1 - L.pop), 0, TAU); g.stroke(); }
  g.restore();
}

// ほかのファイルからも呼ぶ入口（fx.js の、広がっていく残像もこれで描く）。
// c は {ang:[3]} だけでよい。c.z があれば奥行き、c.R があれば半径（px）に、そちらを使う。
// heat：0＝ふだん、1＝いちばん明るい（それでも白にはしない）
function drawCircle(i, c, scale, alpha, heat, t){
  if (alpha <= 0.004) return;
  const [x, y, s] = proj(c.z || DEPTH[i]), R = (c.R != null ? c.R : RADIUS[i] * s) * scale, h = Math.max(0, Math.min(1, heat));
  const L = mcL; L.lum = 72 + 10 * h; L.sat = 95; L.gain = 0.85 + 0.15 * Math.sin(t * 2.1 + i * 1.7) + 0.6 * h; L.wide = 1 + h; L.halo = 0.13 + 0.2 * h;
  L.open = 0; L.core = 1; L.spark = 0; L.under = 0; L.pop = 0;
  mcBody(i, c.ang, x, y, R, alpha);
}

// ---- 装填：1 枚ぶんたまったら（または振ったら）、陣を 1 枚足す ----
const ghost = { ang: [0, 0, 0] };     // 描かれていく途中の、次の 1 枚（向きは charge から決まる）
function load(){
  if (phase !== 'load' || circles.length >= MAX) return;
  const i = circles.length, p0 = Math.max(0, Math.min(1, charge));                   // p0：どこまで描けていたか（振って装填すると 1 より小さい）
  circles.forEach(c => c.w += 1.2);                                                  // ほかの陣は、つられて一瞬速く回る
  // 新しい陣は、真上にそろった向きでカチッと止まる（rec・snapT は、止まるとき・点火のときの動きの記録）
  circles.push({ born: now(), ang: [MC_TOP, MC_TOP, MC_TOP], w: 0, ignite: 0, burst: 0, p0, rec: 0, snapT: 0 });
  charge = 0;
  burstFromCircle(i, 20, 170, 8);                                                    // 輪から散る光の粒（白い閃光は出さない。光るのは線そのもの）
  sndLoad(i); sndLock(i);                                                            // 止まる瞬間の音
  if (circles.length >= MAX) sndReady();                                             // 3 枚そろった合図
  lastOwn = now(); navigator.vibrate && navigator.vibrate(18);
  backdropEvent('load', circles.length);
}

// ---- 回転 ----
// 装填の直後は、少し行きすぎて戻り、止まっている → ゆっくり回りはじめる／枚数が増えると速くなる／
// 発射の合図で上がっていく／点火の瞬間は、3 つの部品の向きが真上にそろって一瞬止まり、そこから一気に速く回る
function spinCircles(t, dt, spinUp){
  const n = circles.length;
  for (let i = 0; i < n; i++){
    const c = circles[i], dir = i % 2 ? -1 : 1, age = t - c.born, geo = MC_GEO[i];
    let target = SPIN[i] * (1 + 0.5 * (n - 1)) * (1 + 0.3 * Math.sin(t * 0.9 + i * 2)), move = 1;
    if (spinUp) target = SPIN[i] * (2 + 16 * spinUp);
    if (c.ignite) target = SPIN[i] * 30;
    if (!c.ignite && !spinUp && age < MC_HOLD){ c.w = 0; move = 0; }               // カチッと止まっている間
    else c.w += (target - c.w) * (1 - Math.exp(-dt * (c.ignite ? 10 : 2.6)));
    // 止まるときの「行きすぎて戻る」動き（時間から決まるので、時計が止まっている間は動かない）
    const x = age / 0.11, rec = x < 1 ? MC_KICK * Math.sin(Math.PI * x) * (1 - x) * 1.7 : 0;
    if (rec !== c.rec){ const d = (rec - (c.rec || 0)) * dir; c.ang[0] += d; c.ang[1] -= d * 1.3; c.ang[2] += d * 1.8; c.rec = rec; }
    if (c.ignite){
      if (c.snapT !== c.ignite){                                                     // 点火した瞬間：いちばん近い「真上にそろう向き」へ、カチッと合わせる
        c.snapT = c.ignite;
        for (let k = 0; k < 3; k++){ const per = TAU / (k < 2 ? geo.p : geo.m); let d = (MC_TOP - c.ang[k]) % per; if (d > per / 2) d -= per; if (d < -per / 2) d += per; c.ang[k] += d; }
      }
      if (t - c.ignite < MC_SNAP) move = 0;                                          // そろったまま一瞬止まる（その間に、速さだけ上げておく）
    }
    if (move) for (let k = 0; k < 3; k++) c.ang[k] += c.w * PART_SPIN[k] * dir * dt;
  }
}

// ---- 次の 1 枚：charge（0→1）に合わせて、線で描かれていく。charge が下がれば、同じ道すじで消えていく ----
// 順番：外の輪がぐるりと引かれる → 星の辺が 1 本ずつ伸びる → 帯にルーンが並ぶ。帯の外の目盛りは、たまり具合そのもの。
function mcBuild(i, ch){
  const [x, y, s] = proj(DEPTH[i]), R = RADIUS[i] * s * (1.05 - 0.05 * ch), hue = HUE[i], geo = MC_GEO[i], dot = MC_DOT[i], ang = ghost.ang;
  const dir = i % 2 ? -1 : 1, back = MC_WIND * (1 - ch) * dir;
  for (let k = 0; k < 3; k++) ang[k] = MC_TOP - back * PART_SPIN[k];                // 回りながら描かれ、描き終わりに真上へ着く
  const A = 0.72 + 0.2 * ch;                                                        // 描きかけは、少しだけ淡い
  g.save(); g.translate(x, y); g.scale(R, R * 0.9);
  mcSpot(MC_HALO[i], 0, 0, 1.3, 0.11 * ch * ch * A);
  mcPen(hue, 95, 72, A, 1, R, MC_UNDER);
  // 外の帯：3 本の輪 → 目盛り（たまり具合）→ ルーン
  const u0 = mcSeg(ch, 0, 0.38), u2 = mcSeg(ch, 0.10, 0.48), nr = Math.floor(mcSeg(ch, 0.5, 0.97) * geo.n + 1e-6);
  g.save(); g.rotate(ang[0]); mcSoft(u0, u2); g.beginPath();
  mcAddArc(g, 1, u0, 1); mcAddArc(g, 0.94, mcSeg(ch, 0.05, 0.43), -1); mcAddArc(g, 0.74, u2, 1);
  mcAddTicks(g, geo, Math.floor(ch * geo.p * 2 + 1e-6)); mcAddRunes(g, geo, nr);
  mcInk(null);
  if (u0 > 0 && u0 < 1) mcSpot(dot, Math.cos(TAU * u0), Math.sin(TAU * u0), 0.11, 1);            // 輪を引いている筆先
  if (nr > 0 && nr < geo.n){ const a = (nr - 0.5) / geo.n * TAU; mcSpot(dot, Math.cos(a) * 0.84, Math.sin(a) * 0.84, 0.09, 0.9); }   // ルーンを書いている筆先
  g.restore();
  // 星：輪 → 辺が 1 本ずつ
  const v = mcSeg(ch, 0.28, 0.80) * geo.p;
  g.save(); g.rotate(ang[1]); g.beginPath();
  mcAddArc(g, 0.70, mcSeg(ch, 0.12, 0.45), -1); mcAddStar(g, geo, v, 0); mcAddDots(g, geo, Math.min(geo.p, Math.ceil(v)));
  mcInk(null);
  if (v > 0 && v < geo.p){ const j = Math.floor(v), f = v - j, a = mcVert(geo, j), b = a + TAU / geo.p * geo.q;      // 辺を伸ばしている筆先
    mcSpot(dot, (Math.cos(a) + (Math.cos(b) - Math.cos(a)) * f) * 0.70, (Math.sin(a) + (Math.sin(b) - Math.sin(a)) * f) * 0.70, 0.10, 1); }
  g.restore();
  // 芯：輪 → 多角形 → 外へ出る短い線
  g.save(); g.rotate(ang[2]); g.beginPath();
  mcAddCore(g, geo, mcSeg(ch, 0.20, 0.50), mcSeg(ch, 0.45, 0.78) * geo.m, Math.floor(mcSeg(ch, 0.70, 0.98) * geo.m + 1e-6));
  mcInk(null);
  g.restore();
  g.restore();
}
function drawCharging(t, dt){
  if (!(phase === 'load' && circles.length < MAX && charge > 0.02)) return;
  const i = circles.length, ch = Math.min(1, charge), [x, y, s] = proj(DEPTH[i]), R = RADIUS[i] * s;
  mcBuild(i, ch);
  // 集まってくる光の粒（かまえて、たまっている間だけ。時計が止まっている間は出さない）
  if (dt > 0 && steady && Math.random() < 0.3 + ch * 0.5){ const a = Math.random() * TAU, d = R * (1.5 + Math.random() * 0.6), life = 0.4;
    part(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, -Math.cos(a) * (d - R) / life, -Math.sin(a) * (d - R) * 0.9 / life, life, HUE[i], 5 + Math.random() * 5, 0); }
}

// ---- 装填ずみの魔法陣を描く（奥から手前へ）----
function drawCircles(t, spinUp){
  const n = circles.length, L = mcL;
  // 3 枚そろったあとの明滅：rdy＝そろった状態への移り具合、wave＝3 枚共通の波（0〜1）。合図が出たら、回転が上がるのに合わせて消える
  let rdy = 0, wave = 0;
  if (n >= MAX && (phase === 'load' || phase === 'ready')){ const x = t - circles[n - 1].born;
    rdy = mcSm(x / MC_PULSE_WAIT) * (1 - spinUp); if (x > MC_PULSE_WAIT) wave = 0.5 - 0.5 * Math.cos((x - MC_PULSE_WAIT) * TAU / MC_PULSE_SEC); }
  for (let i = n - 1; i >= 0; i--){
    const c = circles[i], age = t - c.born, fl = Math.exp(-age * MC_FLASH), p0 = c.p0 == null ? 1 : c.p0;      // fl：装填の瞬間の明るさ（1 → 0）
    let scale = 1 + 0.06 * Math.exp(-age * 16) + 0.3 * (1 - p0) * Math.exp(-age * 9), alpha = Math.min(1, p0 + age * 7);
    // ふだん：1 枚ずつ、ごくわずかにゆらぐ。そろったら：同じ波で明滅する。装填の瞬間：線が明るく太くなる
    const own = 0.9 + 0.05 * Math.sin(t * 2.1 + i * 1.7), sync = 0.72 + 0.36 * wave;
    L.gain = own + (sync - own) * rdy + 0.45 * fl + 0.12 * spinUp;
    L.lum = 70 + 5 * wave * rdy + 14 * fl + 2 * spinUp; L.sat = 95; L.wide = 1 + 0.9 * fl + 0.22 * wave * rdy;
    L.halo = 0.11 + (0.14 * wave - 0.03) * rdy + 0.22 * fl; L.open = 0; L.core = 1; L.spark = 0; L.under = MC_UNDER; L.pop = Math.exp(-age * 6);
    if (c.ignite){                                      // 点火：白くせず、色を濃く・星を開く・芯が縮んで火花を出す
      const x = t - c.ignite, k = Math.exp(-x * 10);
      L.lum = 61 + 9 * k; L.sat = 100; L.gain = 1.25 + 0.4 * k; L.wide = 1.3 + 0.9 * k; L.halo = 0.12 + 0.22 * k;
      L.open = mcBack(x / MC_OPEN); L.core = 1 - 0.38 * mcSm(x / 0.12); L.spark = Math.exp(-x * 13);
      scale += 0.05 * Math.exp(-x * 12);
    }
    if (c.burst){                                       // 弾が通り抜ける：ごく短い間だけ明るく、広がって消える
      const x = t - c.burst, b = x / 0.45; if (b >= 1) continue;
      const k = Math.exp(-x * 18);
      scale = 1 + b * 0.9; alpha = (1 - b) * (1 - b);
      L.lum = 66 + 14 * k; L.sat = 100 - 20 * k; L.gain = 1.2 + 0.4 * k; L.wide = 1.2 + 0.8 * k; L.halo = 0.12 + 0.16 * k;
      if (!c.ignite){ L.open = 1; L.core = 0.62; }
      L.spark = 0; L.under = 0; L.pop = 0;
    }
    scale *= 1 - 0.1 * squeeze;                         // 発射直前の絞り（main.js が squeeze を決める）
    const [px, py, ps] = proj(DEPTH[i]);
    mcBody(i, c.ang, px, py, RADIUS[i] * ps * scale, alpha);
  }
}
