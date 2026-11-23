'use strict';
// ---- 詠唱で出る生き物 ----
// 絵（画像）は使わない。部品（頭・節をつないだ体・つばさ・角・尾）と、属性の気配（粒・ゆらぎ）を組み合わせて描く。
// 見せ方：中は淡く透かし、ふちを明るくして形を読ませる（白く塗りつぶさない）。白は、命中の一瞬だけ。
// 位置：道すじ（proj）の上を進む「頭」に、横へのずれ（動きの型）を足す。体の節は、頭が通ったあとをたどる。
//       どの節も、毎フレーム proj() を通して置く（撃ったあとにスマホを振っても、先は的についていく）。
//       遠近はそのまま使うと手前が巨大になるので、大きさは「出てきたときを 1、着くときを CR_FAR」としてゆるく縮める。
// 時間：すべて演出の時計（引数の t）で動く。時計が止まっている間は、何も動かず、何も生まれない。
// main.js から呼ばれる入口：
//   spawnCreature(spec, n, rarity, t)：出す。spec＝{ element, form, motion, speed(-1/0/1), seed }（どれも必ず入っている）、
//                                      n＝装填の枚数（1〜3）、rarity＝0〜3（N・R・SR・SSR）。狙った先に着くまでの秒数を返す。
//   stepCreature(t, dt)：進める。狙った先に着いたコマで 1 回だけ true を返す。dt は 0 のことがある（絵が止まっている間）。
//   creatureZ()：頭の奥行き（main.js が、陣を通り抜ける判定と、カメラ映像の光の位置に使う）。
//   creatureEnd(hit, t)：着いたあとの知らせ。hit＝的に当たったか。当たれば属性の粒になって散り、はずれなら遠くへ消えていく。
//   drawCreature(t)：描く（加算合成の状態で呼ばれる）。消え終わったら、自分で片づける。
//   clearCreature()：すぐ消す。
//   CREATURE_FORMS：描ける姿の一覧（ここにない姿は、main.js が「玉」に置きかえる）。

// ---- 調整用の値 ----
const CR_FLY = { homing: 1.15, serpentine: 1.25, spiral: 1.3, orbit: 1.4, zigzag: 1.2, charge: 0.95 };   // 着くまでの秒数（動きごと。速さがふつうのとき）
const CR_SPEED = [1.22, 1, 0.8];            // 速さが −1（ゆっくり）・0・+1（速い）のときの、秒数の倍率
const CR_FLY_MIN = 0.8, CR_FLY_MAX = 1.7;   // 着くまでの秒数の下限・上限
const CR_FAR = 0.36;                        // 狙った先に着くときの大きさ（出てきたときを 1 として）
const CR_SIZE_RARE = [0.88, 1, 1.1, 1.2];   // レア度ごとの大きさ（N・R・SR・SSR）
const CR_SIZE_N = [0.74, 0.88, 1];          // 装填の枚数ごとの大きさ（1・2・3 枚）
const CR_AURA_RARE = [0.55, 1, 1.4, 1.8];   // レア度ごとの、気配（粒）の多さ
const CR_AURA_N = [0.6, 0.8, 1];            // 装填の枚数ごとの、気配の多さ
const CR_FILL = 1;                          // 体の中の濃さの倍率（小さいほど透ける）
const CR_RIM = 1;                           // ふちの明るさの倍率
const CR_UNDER = 0.45;                      // 体の下に敷く暗い色の濃さ（明るい背景でも形が読めるように。0 で敷かない）
const CR_GOLD = 45;                         // SR・SSR の差し色（金）の色相
const CR_END_SEC = 0.45;                    // 着いたあと、消えきるまでの秒数
const CR_PMAX = 160;                        // 粒の数の上限
const CR_NMAX = 56;                         // 体の節の数の上限

// ---- 姿ごとの値（長さは、幅 390px の画面で、出てきたときの px）----
// nodes：節の数、gap：節の間隔、wide：体の太さ（半分）、head：頭の長さ、swim：体のくねりの大きさ、swimK：くねりの細かさ、wing：つばさの長さ
const CR_FORM = {
  dragon:  { nodes: 30, gap: 6.2, wide: 14,  head: 52, swim: 6,   swimK: 0.5,  wing: 80 },
  serpent: { nodes: 46, gap: 5.4, wide: 9,   head: 34, swim: 11,  swimK: 0.42, wing: 0 },
  orb:     { nodes: 9,  gap: 6,   wide: 14,  head: 20, swim: 3,   swimK: 0.7,  wing: 0 },
};
const CREATURE_FORMS = Object.keys(CR_FORM);

// ---- 属性ごとの値 ----
// rim・fill・hot：ふち・中・強い所の色 [色相のずれ, あざやかさ%, 明るさ%]。fillA・rimA：中とふちの濃さ。under：下に敷く暗さの倍率。rate：1 秒に出す粒の数
const CR_ELEM = {
  fire:    { rim: [16, 100, 68], fill: [-6, 100, 50], hot: [28, 100, 76],  fillA: 0.16,  rimA: 0.85, under: 1,   rate: 44 },
  ice:     { rim: [0, 90, 80],   fill: [8, 80, 64],   hot: [-6, 100, 92],  fillA: 0.10,  rimA: 0.85, under: 1,   rate: 26 },
  thunder: { rim: [0, 100, 70],  fill: [-6, 100, 55], hot: [4, 100, 88],   fillA: 0.09,  rimA: 0.85, under: 1,   rate: 30 },
  wind:    { rim: [0, 65, 74],   fill: [4, 55, 58],   hot: [-6, 80, 86],   fillA: 0.035, rimA: 0.3,  under: 0.2, rate: 26 },
  water:   { rim: [-6, 95, 72],  fill: [4, 90, 56],   hot: [-22, 100, 86], fillA: 0.14,  rimA: 0.75, under: 1,   rate: 24 },
  earth:   { rim: [-2, 46, 60],  fill: [-6, 42, 42],  hot: [6, 55, 74],    fillA: 0.22,  rimA: 0.7,  under: 1.5, rate: 20 },
  light:   { rim: [2, 90, 84],   fill: [0, 80, 72],   hot: [4, 100, 93],   fillA: 0.08,  rimA: 0.8,  under: 0.7, rate: 16 },
  dark:    { rim: [0, 95, 68],   fill: [-6, 80, 42],  hot: [26, 100, 80],  fillA: 0.07,  rimA: 0.85, under: 1.9, rate: 24 },
};

// ---- 小さな道具 ----
const crHsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360 | 0},${s}%,${l}%)`;
const crSm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);                           // なめらかに 0→1
const crH = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };   // 決まった乱れ（0〜1）
function crRng(seed){            // 種から決まる乱数。同じ種なら、同じ並び
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
// 光の絵（先に作っておき、貼って使う）。まん中を白くしない
const CR_SPR = {};
function crSpr(kind, h, s, l){
  h = ((Math.round(h) % 360) + 360) % 360; const key = kind + '_' + h + '_' + s + '_' + l; if (CR_SPR[key]) return CR_SPR[key];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32), col = a => `hsla(${h},${s}%,${l}%,${a})`;
  if (kind === 'soft'){ gr.addColorStop(0, `hsla(${h},${s}%,${Math.min(95, l + 10)}%,0.9)`); gr.addColorStop(0.3, col(0.5)); gr.addColorStop(0.65, col(0.14)); gr.addColorStop(1, col(0)); }
  else if (kind === 'ring'){ gr.addColorStop(0, col(0.05)); gr.addColorStop(0.55, col(0.1)); gr.addColorStop(0.78, col(0.95)); gr.addColorStop(0.88, col(0.55)); gr.addColorStop(1, col(0)); }
  else { gr.addColorStop(0, 'rgba(6,2,14,0.9)'); gr.addColorStop(0.5, 'rgba(6,2,14,0.5)'); gr.addColorStop(1, 'rgba(6,2,14,0)'); }      // dark：暗いにじみ（ふつうの重ね方で使う）
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return CR_SPR[key] = c;
}
function crDot(img, x, y, r, a){ if (a <= 0.004 || r <= 0.2) return; g.globalAlpha = a > 1 ? 1 : a; g.drawImage(img, x - r, y - r, r * 2, r * 2); }
function crDot2(img, x, y, rx, ry, a){ if (a <= 0.004) return; g.globalAlpha = a > 1 ? 1 : a; g.drawImage(img, x - rx, y - ry, rx * 2, ry * 2); }

// ---- 状態 ----
let crt = null;
const crX = new Float32Array(CR_NMAX), crY = new Float32Array(CR_NMAX), crQ = new Float32Array(CR_NMAX), crW = new Float32Array(CR_NMAX),
      crT = new Float32Array(CR_NMAX), crNx = new Float32Array(CR_NMAX), crNy = new Float32Array(CR_NMAX);      // 節：位置・大きさ・太さ・通った時刻・体に直角な向き
let crI0 = 0, crI1 = 0;          // 見えている節の範囲（crI0 以上、crI1 未満）
const crO = { k: 0, x: 0, y: 0, sx: 0, sy: 0, q: 1 };
const crP = []; let crPN = 0;    // 粒（使い回す）
for (let i = 0; i < CR_PMAX; i++) crP.push({ kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, grav: 0, drag: 0, al: 1, sd: 0, img: null });

// ---- 動きの型：u（0＝出る → 1＝着く）での、道すじの上の進み具合 k と、横へのずれ x・y（px。右と上が正）----
// どの型も、u＝1 でずれが 0 になり、頭は狙った先にぴったり着く。
function crPath(c, u, o){
  const v = c.v, r0 = u < 0.14 ? u / 0.14 : 1, inn = r0 * r0 * (3 - 2 * r0);     // 出はじめは、陣の芯から
  let k = u * (0.75 + 0.25 * u), x = 0, y = 0;
  switch (c.motion){
    case 'serpentine': {         // 蛇行：左右に大きくうねりながら進む
      const e = inn * Math.pow(1 - u, 0.8), ph = v.ph + TAU * 1.7 * v.fq * u;
      x = 88 * e * Math.sin(ph); y = 20 * e * Math.sin(ph * 2 + 0.6); break; }
    case 'spiral': {             // らせん：道すじのまわりを巻きながら進む
      const e = inn * Math.pow(1 - u, 0.7), th = v.ph + v.side * TAU * 2.1 * v.fq * u;
      x = 76 * e * Math.cos(th); y = 52 * e * Math.sin(th); break; }
    case 'orbit': {              // 旋回：道すじのまわりを大きく 1 周してから、まっすぐ襲いかかる
      const T1 = 0.64; let r, th;
      if (u < T1){ const w = u / T1; k = 0.4 * w * (0.6 + 0.4 * w); r = 78 * inn; th = v.ph + v.side * TAU * w; }
      else { const w = (u - T1) / (1 - T1); k = 0.4 + 0.6 * w * w * (3 - 2 * w) * (0.5 + 0.5 * w) / 1; r = 78 * Math.pow(1 - w, 1.6); th = v.ph + v.side * (TAU + 1.3 * w); k = 0.4 + 0.6 * (w * (0.35 + 0.65 * w)); }
      x = r * Math.cos(th); y = r * 0.72 * Math.sin(th); break; }
    case 'zigzag': {             // ジグザグ：鋭く折れながら進む
      const e = inn * Math.pow(1 - u, 0.6), s = u * 4.6 * v.fq + 0.25, tri = Math.abs((s - Math.floor(s)) * 2 - 1) * 2 - 1;
      k = u * (0.7 + 0.3 * u); x = 62 * e * tri * v.side; y = 10 * e * Math.sin(u * 20 + v.ph); break; }
    case 'charge': {             // 突進：少し身を引いてためてから、まっすぐ速く
      const T0 = 0.34;
      if (u < T0){ const w = u / T0; k = 0.075 * Math.sin(Math.PI * Math.pow(w, 0.8)) + 0.03 * w; x = 3.5 * Math.sin(w * 26 + v.ph) * w; }
      else { const w = (u - T0) / (1 - T0); k = 0.03 + 0.97 * Math.pow(w, 1.5); x = 7 * Math.sin(w * 9 + v.ph) * (1 - w) * (1 - w); }
      break; }
    default: {                   // 追尾：横へふくらんで出て、弧をえがいて的へ切れこむ
      const b = Math.sin(Math.PI * Math.pow(u, 0.72));
      k = Math.pow(u, 1.3); x = v.side * 90 * b; y = 34 * Math.sin(Math.PI * u) * (1 - u) * 2 + 8 * b * Math.sin(u * 13 + v.ph); }
  }
  o.k = k < 0 ? 0 : k > 1 ? 1 : k; o.x = x; o.y = y;
}
// 時刻 tau（0〜1。1 を超えると、着いたあと）に頭がいた場所 → o.sx・o.sy（画面）、o.q（大きさ）
function crAt(c, tau, o){
  crPath(c, tau < 0 ? 0 : tau > 1 ? 1 : tau, o);
  const q = CR_FAR + (1 - CR_FAR) * Math.pow(1 - o.k, 1.15), p = proj(zAt(BEAM_Z0, Z1, o.k), c.dir);
  o.sx = p[0] + o.x * q * c.U; o.sy = p[1] - o.y * q * c.U; o.q = q;
  if (tau > 1){
    if (c.hit){ const d = (tau - 1) * c.vEnd; o.sx += c.ex * d; o.sy += c.ey * d; }        // 命中：そのままの速さで的へ流れこむ（届いた節は描かない）
    else { const w = Math.min(1, (tau - 1) * c.dur / CR_END_SEC), e = 1 - (1 - w) * (1 - w);      // はずれ：通りすぎて、遠ざかりながら小さくなる
      o.sx += c.ex * e * 30 * c.U; o.sy += c.ey * e * 30 * c.U; o.q = q * (1 - 0.8 * e); }
  }
}
// 姿ごとの、体の太さ（s：0＝頭 → 1＝尾の先）
function crWide(form, s){
  if (form === 'dragon') return s < 0.2 ? 0.62 + 0.38 * crSm(s / 0.2) : 0.08 + 0.92 * Math.pow(1 - (s - 0.2) / 0.8, 0.9);
  if (form === 'serpent') return s < 0.12 ? 0.78 + 0.22 * (s / 0.12) : 0.05 + 0.95 * Math.pow(1 - (s - 0.12) / 0.88, 0.7);
  return Math.pow(1 - s, 1.25);
}
// 節を並べる：頭から順に、頭が通ったあとを一定の間隔でさかのぼる
function crBuild(c, t, tau){
  const f = c.f, N = c.N, o = crO, mul = c.U * c.sz;
  { const a = proj(zAt(BEAM_Z0, Z1, 0.86), c.dir), b = proj(Z1, c.dir); const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    if (l > 0.5){ c.ex = dx / l; c.ey = dy / l; } else { c.ex = 0; c.ey = -1; }
    c.tx = b[0]; c.ty = b[1]; c.vEnd = Math.max(c.L0 * 0.6, l / 0.14 * 1.4); }
  crAt(c, tau - 0.012, o); let px = o.sx, py = o.sy;
  crAt(c, tau, o);
  let sp = Math.hypot(o.sx - px, o.sy - py) / 0.012, tu = tau; const spMin = c.L0 * 0.3;
  crI0 = 0; crI1 = N;
  for (let i = 0; i < N; i++){
    if (i){
      const d = f.gap * mul * c.v.len * crQ[i - 1]; if (sp < spMin) sp = spMin;
      let dtau = d / sp; if (dtau > 0.06) dtau = 0.06;
      tu -= dtau; crAt(c, tu, o); sp = Math.hypot(o.sx - px, o.sy - py) / dtau;
    }
    crT[i] = tu; crX[i] = px = o.sx; crY[i] = py = o.sy; crQ[i] = o.q;
    if (tu > 1 && c.hit) crI0 = i;              // 的に届いた節は、吸いこまれて消える
    if (tu <= 0){ crI1 = i + 1; break; }        // まだ陣から出ていない節
  }
  const n1 = crI1, sw = f.swim * mul;
  for (let pass = 0; pass < 2; pass++){         // 1 回目：くねりを足す。2 回目：体に直角な向きを求め直す
    for (let i = 0; i < n1; i++){
      const a = i ? i - 1 : 0, b = i < n1 - 1 ? i + 1 : n1 - 1; let tx = crX[a] - crX[b], ty = crY[a] - crY[b]; const l = Math.hypot(tx, ty);
      if (l > 0.01){ crNx[i] = -ty / l; crNy[i] = tx / l; } else if (i){ crNx[i] = crNx[i - 1]; crNy[i] = crNy[i - 1]; } else { crNx[i] = 1; crNy[i] = 0; }
    }
    if (pass) break;
    for (let i = 1; i < n1; i++){ const s = i / (N - 1), d = sw * crQ[i] * Math.pow(s, 1.1) * Math.sin(t * c.v.sw - i * f.swimK + c.v.ph); crX[i] += crNx[i] * d; crY[i] += crNy[i] * d; }
  }
  const wob = c.el === 'water' ? 0.2 : 0;
  for (let i = 0; i < n1; i++){
    const s = i / (N - 1), em = crT[i] < 0.07 ? Math.max(0, crT[i] / 0.07) : 1;
    crW[i] = crWide(c.form, s) * f.wide * mul * c.slim * crQ[i] * (0.3 + 0.7 * em) * (1 + wob * Math.sin(i * 0.85 - t * 10));
  }
}

// ---- 粒 ----
// kind：1 火の粉、2 氷のかけら、3 もや、4 稲妻の枝、5 火花、6 風の筋、7 しずく、8 岩のかけら、9 またたく光、10 闇のもや
function crEmit(kind, x, y, vx, vy, life, size, img){
  if (crPN >= CR_PMAX) return null;
  const p = crP[crPN++]; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.size = size; p.img = img;
  p.rot = Math.random() * TAU; p.vr = 0; p.grav = 0; p.drag = 1.5; p.al = 1; p.sd = Math.random() * 100; return p;
}
function crStepParts(dt){
  for (let i = crPN - 1; i >= 0; i--){
    const p = crP[i]; p.life -= dt;
    if (p.life <= 0){ crP[i] = crP[--crPN]; crP[crPN] = p; continue; }
    p.vy += p.grav * dt; const d = Math.exp(-dt * p.drag); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.kind === 6){ const cs = Math.cos(p.vr * dt), sn = Math.sin(p.vr * dt), vx = p.vx; p.vx = vx * cs - p.vy * sn; p.vy = vx * sn + p.vy * cs; }      // 風の筋は、曲がりながら進む
  }
}
function crDrawParts(c, t, pass){              // pass 0：暗いもの（ふつうの重ね方）。pass 1：光るもの
  const col = c.col;
  for (let i = 0; i < crPN; i++){
    const p = crP[i], a = p.life / p.max, K = p.kind;
    if ((K === 10) !== (pass === 0)) continue;
    switch (K){
      case 1: crDot(p.img, p.x, p.y, p.size * (0.45 + 0.55 * a), p.al * Math.min(1, a * 2.2) * (0.7 + 0.3 * Math.sin(t * 31 + p.sd))); break;
      case 3: crDot(p.img, p.x, p.y, p.size * (1.7 - 0.7 * a), p.al * 4 * a * (1 - a)); break;
      case 5: crDot(p.img, p.x, p.y, p.size * (0.4 + 0.6 * a), p.al * a); break;
      case 10: crDot(p.img, p.x, p.y, p.size * (1.6 - 0.6 * a), p.al * Math.min(1, a * 1.6) * Math.min(1, (1 - a) * 6)); break;
      case 9: { const tw = 0.55 + 0.45 * Math.sin(t * 19 + p.sd), r = p.size * Math.sin(Math.min(1, a * 1.6) * Math.PI / 2) * tw, al = p.al * Math.min(1, a * 2);
        crDot(p.img, p.x, p.y, r * 0.7, al); crDot2(p.img, p.x, p.y, r * 1.9, r * 0.22, al * 0.8); crDot2(p.img, p.x, p.y, r * 0.22, r * 1.9, al * 0.8); break; }
      case 7: { const r = p.size * (0.7 + 0.3 * a), al = p.al * Math.min(1, a * 3);
        crDot(p.img, p.x, p.y, r, al); crDot(c.spr.hot, p.x - r * 0.3, p.y - r * 0.3, r * 0.4, al * 0.9); break; }
      case 2: case 8: {          // かけら：回りながら漂う。面が光る
        const al = p.al * Math.min(1, a * 2.5), cs = Math.cos(p.rot), sn = Math.sin(p.rot), L = p.size, Wd = K === 2 ? p.size * 0.34 : p.size * (0.6 + 0.3 * crH(p.sd, 1));
        const gl = 0.4 + 0.6 * Math.abs(Math.cos(p.rot * 1.7 + p.sd));
        g.beginPath(); g.moveTo(p.x + cs * L, p.y + sn * L);
        if (K === 2){ g.lineTo(p.x - sn * Wd, p.y + cs * Wd); g.lineTo(p.x - cs * L, p.y - sn * L); g.lineTo(p.x + sn * Wd, p.y - cs * Wd); }
        else { const j = 0.5 + 0.5 * crH(p.sd, 2); g.lineTo(p.x - sn * Wd * j + cs * L * 0.2, p.y + cs * Wd * j + sn * L * 0.2); g.lineTo(p.x - cs * L * 0.8 - sn * Wd * 0.5, p.y - sn * L * 0.8 + cs * Wd * 0.5); g.lineTo(p.x - cs * L * 0.5 + sn * Wd, p.y - sn * L * 0.5 - cs * Wd); g.lineTo(p.x + cs * L * 0.4 + sn * Wd * 0.8, p.y + sn * L * 0.4 - cs * Wd * 0.8); }
        g.closePath(); g.globalAlpha = al * (K === 2 ? 0.12 + 0.3 * gl : 0.3 + 0.2 * gl); g.fillStyle = K === 2 ? col.rim : col.fill; g.fill();
        g.globalAlpha = al * (0.45 + 0.5 * gl); g.strokeStyle = K === 2 ? col.hot : col.rim; g.lineWidth = K === 2 ? 1 : 1.3; g.stroke(); break; }
      case 4: {                  // 稲妻の枝：折れ線。太く淡い線と、細く明るい線を重ねる
        const cs = Math.cos(p.rot), sn = Math.sin(p.rot), L = p.size, al = p.al * Math.min(1, a * 3), fl = Math.floor(t * 30);
        g.beginPath(); g.moveTo(p.x, p.y);
        for (let j = 1; j <= 5; j++){ const d = j / 5 * L, w = (crH(p.sd + j, fl * 0.37) - 0.5) * L * (j < 5 ? 0.42 : 0.2); g.lineTo(p.x + cs * d - sn * w, p.y + sn * d + cs * w); }
        g.strokeStyle = col.rim; g.globalAlpha = al * 0.22; g.lineWidth = 5; g.stroke();
        g.strokeStyle = col.hot; g.globalAlpha = al * 0.9; g.lineWidth = 1.4; g.stroke(); break; }
      case 6: {                  // 風の筋：先の細い、曲がった帯
        const v = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / v, uy = p.vy / v, L = p.size * (0.4 + 0.6 * Math.sin(Math.PI * a)), bend = L * 0.3 * (p.vr > 0 ? 1 : -1), th = Math.max(0.8, p.size * 0.07);
        const x0 = p.x - ux * L, y0 = p.y - uy * L, mx = p.x - ux * L * 0.5 - uy * bend, my = p.y - uy * L * 0.5 + ux * bend;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx - uy * th, my + ux * th, p.x, p.y); g.quadraticCurveTo(mx + uy * th, my - ux * th, x0, y0);
        g.globalAlpha = p.al * Math.sin(Math.PI * a) * 0.55; g.fillStyle = col.rim; g.fill(); break; }
    }
  }
}
// 体のどこかから、属性の粒を出す
function crAura(c, t, dt){
  const n = crI1 - crI0; if (n < 1) return;
  c.em += c.E.rate * c.aura * dt;
  const S = c.spr, m = c.U * c.sz;
  while (c.em >= 1){
    c.em -= 1;
    const r = Math.random(), i = crI0 + Math.min(n - 1, r * r * n | 0), sd = Math.random() < 0.5 ? -1 : 1, q = crQ[i], w = crW[i] + 2 * q;
    const x = crX[i] + crNx[i] * w * sd * Math.random(), y = crY[i] + crNy[i] * w * sd * Math.random(), ox = crNx[i] * sd, oy = crNy[i] * sd, rv = Math.random();
    let p;
    switch (c.el){
      case 'fire': p = crEmit(1, x, y, ox * 22 + (Math.random() - 0.5) * 26, oy * 22 - 34 - Math.random() * 70, 0.35 + Math.random() * 0.5, (3 + Math.random() * 4.5) * q * m, rv < 0.3 ? S.hot : S.soft);
        if (p){ p.grav = -60; p.al = 0.75; } break;
      case 'ice': if (rv < 0.55){ p = crEmit(2, x + ox * w, y + oy * w, ox * 26 + (Math.random() - 0.5) * 24, oy * 26 + (Math.random() - 0.5) * 24, 0.45 + Math.random() * 0.45, (3.5 + Math.random() * 5) * q * m, null); if (p){ p.vr = (Math.random() - 0.5) * 6; p.grav = 50; p.al = 0.9; } }
        else { p = crEmit(3, x, y, (Math.random() - 0.5) * 16, 6 + Math.random() * 14, 0.6 + Math.random() * 0.4, (12 + Math.random() * 10) * q * m, S.soft); if (p) p.al = 0.1; } break;
      case 'thunder': if (rv < 0.5){ p = crEmit(4, x, y, 0, 0, 0.06 + Math.random() * 0.07, (16 + Math.random() * 26) * q * m, null); if (p){ p.rot = Math.atan2(oy, ox) + (Math.random() - 0.5) * 1.6; p.drag = 0; } }
        else { p = crEmit(5, x, y, ox * (60 + Math.random() * 120) + (Math.random() - 0.5) * 80, oy * (60 + Math.random() * 120) + (Math.random() - 0.5) * 80, 0.12 + Math.random() * 0.16, (2.5 + Math.random() * 3) * q * m, S.hot); if (p){ p.drag = 5; p.al = 0.9; } } break;
      case 'wind': { const tx = crNy[i], ty = -crNx[i], vv = 70 + Math.random() * 90;      // 体に沿って、うしろへ流れながら巻く
        p = crEmit(6, x + ox * w * 1.4, y + oy * w * 1.4, (-tx * 0.6 + ox * 0.5) * vv, (-ty * 0.6 + oy * 0.5) * vv, 0.3 + Math.random() * 0.3, (16 + Math.random() * 20) * q * m, null);
        if (p){ p.vr = -sd * (4 + Math.random() * 5); p.drag = 1; p.al = 0.9; } break; }
      case 'water': p = crEmit(7, x + ox * w, y + oy * w, ox * (20 + Math.random() * 70), oy * (20 + Math.random() * 70) - 20, 0.35 + Math.random() * 0.35, (2 + Math.random() * 3) * q * m, S.ring);
        if (p){ p.grav = 260; p.drag = 0.8; p.al = 0.9; } break;
      case 'earth': if (rv < 0.6){ p = crEmit(8, x + ox * w, y + oy * w, ox * 24 + (Math.random() - 0.5) * 20, oy * 14 - Math.random() * 16, 0.45 + Math.random() * 0.4, (3 + Math.random() * 4.5) * q * m, null); if (p){ p.vr = (Math.random() - 0.5) * 4; p.grav = 330; p.drag = 0.6; p.al = 0.9; } }
        else { p = crEmit(3, x, y, (Math.random() - 0.5) * 14, 8 + Math.random() * 20, 0.6 + Math.random() * 0.4, (10 + Math.random() * 9) * q * m, S.soft); if (p){ p.grav = 40; p.al = 0.13; } } break;
      case 'light': p = crEmit(9, x + ox * w * 1.5, y + oy * w * 1.5, (Math.random() - 0.5) * 20, -10 - Math.random() * 28, 0.45 + Math.random() * 0.45, (5 + Math.random() * 6) * q * m, S.hot);
        if (p) p.al = 0.8; break;
      default: if (rv < 0.7){ p = crEmit(10, x, y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20 + 10, 0.5 + Math.random() * 0.35, (9 + Math.random() * 9) * q * m, S.dark); if (p) p.al = 0.5; }
        else { p = crEmit(5, x + ox * w * 2, y + oy * w * 2, -ox * 30, -oy * 30, 0.3 + Math.random() * 0.3, (2.5 + Math.random() * 2.5) * q * m, S.hot); if (p){ p.drag = 0.5; p.al = 0.8; } }
    }
    if (c.rare >= 2 && Math.random() < 0.12){ p = crEmit(9, x, y, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, 0.4 + Math.random() * 0.4, (4 + Math.random() * 4) * q * m, S.gold); if (p) p.al = 0.8; }     // SR 以上：金のまたたき
  }
}
// 命中：属性の粒になって、的の場所で散る
function crBurst(c, x, y){
  const S = c.spr, m = c.U * c.sz, n = Math.round(34 * c.aura), q = CR_FAR + 0.25;
  for (let j = 0; j < n; j++){
    const a = Math.random() * TAU, cs = Math.cos(a), sn = Math.sin(a), v = 60 + Math.random() * 240, life = 0.22 + Math.random() * 0.26, rv = Math.random(); let p;
    switch (c.el){
      case 'fire': p = crEmit(1, x, y, cs * v, sn * v - 40, life, (4 + Math.random() * 6) * q * m, rv < 0.4 ? S.hot : S.soft); if (p){ p.grav = -160; p.drag = 3.5; p.al = 0.8; } break;
      case 'ice': p = crEmit(2, x + cs * 4, y + sn * 4, cs * v * 1.1, sn * v * 1.1, life, (4 + Math.random() * 7) * q * m, null); if (p){ p.rot = a; p.vr = (Math.random() - 0.5) * 5; p.drag = 3; p.grav = 80; } break;
      case 'thunder': if (rv < 0.4){ p = crEmit(4, x, y, 0, 0, 0.07 + Math.random() * 0.16, (22 + Math.random() * 44) * q * m, null); if (p){ p.rot = a; p.drag = 0; } }
        else { p = crEmit(5, x, y, cs * v * 1.4, sn * v * 1.4, life * 0.7, (3 + Math.random() * 3) * q * m, S.hot); if (p) p.drag = 5; } break;
      case 'wind': p = crEmit(6, x + cs * 5, y + sn * 5, (cs * 0.5 - sn) * v, (sn * 0.5 + cs) * v, life, (18 + Math.random() * 22) * q * m, null); if (p){ p.vr = 7; p.drag = 2; } break;
      case 'water': p = crEmit(7, x, y, cs * v * 0.8, sn * v * 0.8 - 90, life, (2.5 + Math.random() * 3.5) * q * m, S.ring); if (p){ p.grav = 620; p.drag = 1.2; } break;
      case 'earth': if (rv < 0.75){ p = crEmit(8, x, y, cs * v * 0.8, sn * v * 0.8 - 70, life, (3.5 + Math.random() * 5.5) * q * m, null); if (p){ p.vr = (Math.random() - 0.5) * 9; p.grav = 760; p.drag = 1; } }
        else { p = crEmit(3, x, y, cs * v * 0.25, sn * v * 0.25, life * 1.5, (14 + Math.random() * 12) * q * m, S.soft); if (p) p.al = 0.14; } break;
      case 'light': p = crEmit(9, x, y, cs * v * 0.9, sn * v * 0.9, life, (5 + Math.random() * 7) * q * m, S.hot); if (p) p.drag = 4; break;
      default: if (rv < 0.6){ p = crEmit(10, x, y, cs * v * 0.4, sn * v * 0.4, life * 1.4, (12 + Math.random() * 12) * q * m, S.dark); if (p){ p.drag = 4; p.al = 0.6; } }
        else { p = crEmit(5, x, y, cs * v, sn * v, life, (3 + Math.random() * 3) * q * m, S.hot); if (p) p.drag = 4; }
    }
  }
  if (c.rare >= 2) for (let j = 0; j < 4 + c.rare * 2; j++){ const a = Math.random() * TAU, v = 50 + Math.random() * 160, p = crEmit(9, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.2, (5 + Math.random() * 5) * q * m, S.gold); if (p) p.drag = 4; }
}

// ---- 入口 ----
function spawnCreature(spec, n, rarity, t){
  const R = crRng(spec.seed), form = CR_FORM[spec.form] ? spec.form : 'orb', f = CR_FORM[form], el = CR_ELEM[spec.element] ? spec.element : 'light', E = CR_ELEM[el];
  const motion = CR_FLY[spec.motion] ? spec.motion : 'homing';
  const dur = Math.min(CR_FLY_MAX, Math.max(CR_FLY_MIN, CR_FLY[motion] * CR_SPEED[spec.speed > 0 ? 2 : spec.speed < 0 ? 0 : 1]));
  rarity = Math.max(0, Math.min(3, rarity | 0)); n = Math.max(1, Math.min(3, n | 0));
  // 種で決まる、小さな違い（同じ詠唱なら、いつも同じ）
  const v = { side: R() < 0.5 ? -1 : 1, ph: R() * TAU, fq: 0.9 + R() * 0.2, len: 0.88 + R() * 0.24, horns: R() < 0.4 ? 2 : 1, hornLen: 0.8 + R() * 0.4,
              wing: 0.9 + R() * 0.2, sw: 9 + R() * 4, every: R() < 0.5 ? 2 : 3, snout: 0.9 + R() * 0.2, flap: 13 + R() * 4 };
  const hue = (ELEMENT_HUE[el] != null ? ELEMENT_HUE[el] : 48) + (R() * 2 - 1) * 5, U = F / 358.8;
  const a = proj(BEAM_Z0), b = proj(Z1), hc = E.hot, gold = rarity >= 2;
  crt = { spec, n, rare: rarity, t0: t, last: t, dur, z: BEAM_Z0, arrived: false, end: 0, hit: false, dir: anchorDir,
    form, f, el, E, motion, v, hue, U, sz: CR_SIZE_RARE[rarity] * CR_SIZE_N[n - 1], slim: n === 1 ? 0.8 : 1, aura: CR_AURA_RARE[rarity] * CR_AURA_N[n - 1],
    N: Math.min(CR_NMAX, Math.round(f.nodes * (n === 1 ? 0.85 : 1)) + rarity * 2), L0: Math.max(60, Math.hypot(b[0] - a[0], b[1] - a[1])),
    ex: 0, ey: -1, tx: 0, ty: 0, vEnd: 200, em: 0, hs: 1,
    col: { rim: crHsl(hue + E.rim[0], E.rim[1], E.rim[2]), fill: crHsl(hue + E.fill[0], E.fill[1], E.fill[2]), hot: crHsl(hue + hc[0], hc[1], hc[2]),
           acc: gold ? crHsl(CR_GOLD, 100, 70) : crHsl(hue + hc[0], hc[1], hc[2]), under: el === 'dark' ? 'rgb(5,1,12)' : el === 'earth' ? 'rgb(22,14,6)' : 'rgb(3,5,12)' },
    spr: { soft: crSpr('soft', hue + E.fill[0], E.fill[1], Math.min(70, E.fill[2] + 8)), hot: crSpr('soft', hue + hc[0], hc[1], hc[2]), ring: crSpr('ring', hue + E.rim[0], E.rim[1], E.rim[2]),
           gold: crSpr('soft', CR_GOLD, 100, 72), goldRing: crSpr('ring', CR_GOLD, 100, 70), dark: crSpr('dark', 0, 0, 0) } };
  crPN = 0;
  return dur;
}
function stepCreature(t, dt){
  const c = crt; if (!c || c.arrived) return false;
  const tau = (t - c.t0) / c.dur;
  if (tau >= 1){ c.arrived = true; c.z = Z1; return true; }
  crPath(c, tau < 0 ? 0 : tau, crO); c.z = zAt(BEAM_Z0, Z1, crO.k);
  return false;
}
function creatureZ(){ return crt ? crt.z : Z1; }
function creatureEnd(hit, t){
  const c = crt; if (!c || c.end) return;
  c.end = t; c.hit = !!hit; c.arrived = true;
  for (let i = 0; i < crPN; i++){ const p = crP[i]; if (p.life > CR_END_SEC * 0.8){ p.max *= CR_END_SEC * 0.8 / p.life; p.life = CR_END_SEC * 0.8; } }     // 残っている粒も、いっしょに消えていく
  if (hit){ const p = proj(Z1, c.dir); crBurst(c, p[0], p[1]); }
}
function clearCreature(){ crt = null; crPN = 0; }

// ---- 描く ----
function drawCreature(t){
  const c = crt; if (!c) return;
  const dt = Math.min(0.05, Math.max(0, t - c.last)); c.last = t;
  let a = 1, el = 0;
  if (c.end){ el = t - c.end; a = 1 - el / CR_END_SEC; if (a <= 0 && (crPN === 0 || el > CR_END_SEC + 0.15)){ clearCreature(); return; } if (a < 0) a = 0; }
  const tau = (t - c.t0) / c.dur;
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = g.lineCap = 'round';
  if (dt > 0) crStepParts(dt);
  if (a > 0){ crBuild(c, t, tau); if (dt > 0 && !c.end) crAura(c, t, dt); }
  if (c.el === 'dark'){ g.globalCompositeOperation = 'source-over'; crDrawParts(c, t, 0); g.globalCompositeOperation = 'lighter'; }
  if (a > 0) crDrawBody(c, t, c.hit ? a * a : a, el);
  crDrawParts(c, t, 1);
  g.restore();
}
// 体の帯の輪郭を、経路にする
function crRibbon(c, t, i0, i1){
  const jit = c.el === 'thunder' ? 0.55 : 0, fl = Math.floor(t * 24);
  g.beginPath();
  for (let i = i0; i < i1; i++){ const w = crW[i] * (1 + jit * (crH(i, fl) - 0.5)), x = crX[i] + crNx[i] * w, y = crY[i] + crNy[i] * w; if (i === i0) g.moveTo(x, y); else g.lineTo(x, y); }
  for (let i = i1 - 1; i >= i0; i--){ const w = crW[i] * (1 + jit * (crH(i + 60, fl) - 0.5)); g.lineTo(crX[i] - crNx[i] * w, crY[i] - crNy[i] * w); }
  g.closePath();
}
// いまの経路を塗る：下に敷く暗い色（うしろの線をかくして、形を読ませる）→ 淡い中身 → にじむふち → 明るいふち
// px：1px にあたる長さ（拡大した中で呼ぶとき用）。fillK・underK：中身と、下の暗さの倍率
function crPaint(c, a, px, fillK, underK){
  const E = c.E, col = c.col, ua = CR_UNDER * E.under * underK * a;
  if (ua > 0.004){ g.globalCompositeOperation = 'source-over'; g.fillStyle = col.under; g.globalAlpha = ua > 0.92 ? 0.92 : ua; g.fill(); g.globalCompositeOperation = 'lighter'; }
  g.fillStyle = col.fill; g.globalAlpha = Math.min(1, E.fillA * CR_FILL * fillK * a); g.fill();
  g.strokeStyle = col.rim; g.globalAlpha = E.rimA * CR_RIM * 0.16 * a; g.lineWidth = 8 * px; g.stroke();
  g.globalAlpha = Math.min(1, E.rimA * CR_RIM * a); g.lineWidth = 2 * px; g.stroke();
}
function crDrawBody(c, t, a, el){
  const i0 = crI0, i1 = crI1, n = i1 - i0, E = c.E, col = c.col, S = c.spr, f = c.f, m = c.U * c.sz;
  if (n < 1) return;
  const headOn = !(c.hit && c.end && el > 0.1), ha = c.hit && c.end ? a * Math.max(0, 1 - el / 0.1) : a;     // 命中のあと、頭はすぐ消える（体は的へ流れこむ）
  // 頭の向き
  const j = Math.min(i1 - 1, i0 + 2); let hx = crX[i0] - crX[j], hy = crY[i0] - crY[j]; const hl = Math.hypot(hx, hy);
  if (hl > 0.3){ hx /= hl; hy /= hl; } else { hx = c.ex; hy = c.ey; }
  const ang = Math.atan2(hy, hx), q0 = crQ[i0], em0 = crSm(crT[0] / 0.1), HS = f.head * m * q0 * (0.35 + 0.65 * em0); c.hs = HS;
  // つばさ（体より先に描く）
  if (f.wing && n > 3) crWings(c, t, a, i0, i1);
  // 体：下に敷く暗い色 → 淡い中身 → 明るいふち
  if (n > 1){
    crRibbon(c, t, i0, i1); crPaint(c, a, 1, 1, 1);
    if (c.el === 'dark') for (let i = i0; i < i1; i += 2) crDot(S.dark, crX[i], crY[i], crW[i] * 1.2, 0.4 * a);
    // 背すじの光の点
    if (c.form !== 'orb') for (let i = i0 + 3; i < i1 - 1; i += c.v.every){ const s = i / (c.N - 1); if (s > 0.9) break; crDot(c.rare >= 2 ? S.gold : S.hot, crX[i], crY[i], crW[i] * 0.5 + 1, 0.55 * a); }
  }
  // 頭
  if (headOn && ha > 0.01){
    g.save(); g.translate(crX[i0], crY[i0]); g.rotate(ang); g.scale(HS, HS);
    if (c.form === 'dragon') crHeadDragon(c, t, ha, HS); else if (c.form === 'serpent') crHeadSerpent(c, t, ha, HS); else crHeadOrb(c, t, ha, HS);
    g.restore();
  }
}
// 竜の頭（上から見た形）。向きは +x、長さが 1
function crHeadDragon(c, t, a, HS){
  const col = c.col, v = c.v, px = 1 / HS;
  // 角：うしろへ流れる
  g.beginPath();
  for (let sd = -1; sd <= 1; sd += 2) for (let h = 0; h < v.horns + (c.rare >= 3 ? 1 : 0); h++){
    const L = v.hornLen * (h ? 0.6 : 1) * 0.95, bx = -0.1 - h * 0.12, by = 0.24 + h * 0.07, sp = 0.36 + h * 0.3;
    g.moveTo(bx + 0.09, by * sd); g.quadraticCurveTo(bx - L * 0.4, (by + L * sp * 0.9) * sd, bx - L, (by + L * sp) * sd); g.quadraticCurveTo(bx - L * 0.5, (by + L * sp * 0.35) * sd, bx - 0.1, (by - 0.05) * sd); g.closePath();
  }
  g.fillStyle = col.acc; g.globalAlpha = 0.3 * a; g.fill(); g.strokeStyle = col.acc; g.globalAlpha = 0.9 * a; g.lineWidth = 1.8 * px; g.stroke();
  // 頭の輪郭
  const sn = v.snout;
  g.beginPath(); g.moveTo(0.62 * sn, 0);
  for (let sd = 1; sd >= -1; sd -= 2){
    const P = [0.57 * sn, 0.10, 0.42 * sn, 0.135, 0.24, 0.125, 0.06, 0.24, -0.12, 0.33, -0.28, 0.29, -0.4, 0.17];
    if (sd === 1) for (let k = 0; k < P.length; k += 2) g.lineTo(P[k], P[k + 1]); else for (let k = P.length - 2; k >= 0; k -= 2) g.lineTo(P[k], -P[k + 1]);
  }
  g.closePath();
  crPaint(c, a, px, 1.5, 1.2);
  // 目
  crDot(c.spr.hot, 0.1, 0.17, 0.085, 0.95 * a); crDot(c.spr.hot, 0.1, -0.17, 0.085, 0.95 * a);
}
function crHeadSerpent(c, t, a, HS){
  const col = c.col, px = 1 / HS;
  g.beginPath(); g.moveTo(0.6, 0);
  for (let sd = 1; sd >= -1; sd -= 2){
    const P = [0.5, 0.13, 0.3, 0.25, 0.05, 0.33, -0.2, 0.31, -0.42, 0.2];
    if (sd === 1) for (let k = 0; k < P.length; k += 2) g.lineTo(P[k], P[k + 1]); else for (let k = P.length - 2; k >= 0; k -= 2) g.lineTo(P[k], -P[k + 1]);
  }
  g.closePath();
  crPaint(c, a, px, 1.5, 1.2);
  // 舌：ときどき、ちろりと出る
  const fk = Math.sin(t * 9 + c.v.ph); if (fk > 0.2){ const L = 0.3 * (fk - 0.2) / 0.8;
    g.beginPath(); g.moveTo(0.6, 0); g.lineTo(0.6 + L, 0); g.lineTo(0.6 + L * 1.6, 0.08); g.moveTo(0.6 + L, 0); g.lineTo(0.6 + L * 1.6, -0.08);
    g.strokeStyle = col.acc; g.globalAlpha = 0.8 * a; g.lineWidth = 1.6 * px; g.stroke(); }
  crDot(c.spr.hot, 0.24, 0.17, 0.085, 0.95 * a); crDot(c.spr.hot, 0.24, -0.17, 0.085, 0.95 * a);
}
function crHeadOrb(c, t, a, HS){
  const S = c.spr;
  if (CR_UNDER * c.E.under > 0.004){ g.globalCompositeOperation = 'source-over'; crDot(S.dark, 0, 0, 1.05, Math.min(0.9, CR_UNDER * c.E.under * 1.6 * a)); g.globalCompositeOperation = 'lighter'; }
  crDot(S.soft, 0, 0, 1.5, 0.3 * a); crDot(S.ring, 0, 0, 1.0, 0.9 * a); crDot(S.hot, 0, 0, 0.42, 0.55 * a);
  for (let k = 0; k < 2 + c.rare; k++){ const ph = t * (7 + k * 1.3) + k * 2.4 + c.v.ph, tl = k * 1.1 + c.v.ph, ox = Math.cos(ph) * 1.5, oy = Math.sin(ph) * 0.55, cs = Math.cos(tl), sn = Math.sin(tl);
    crDot(k === 0 && c.rare >= 2 ? S.gold : S.hot, ox * cs - oy * sn, ox * sn + oy * cs, 0.3, 0.8 * a); }
}
// つばさ：肩の節から左右へ。はばたきで、長さと向きが変わる
function crWings(c, t, a, i0, i1){
  const col = c.col, f = c.f, m = c.U * c.sz, pairs = c.rare >= 2 ? 2 : 1;
  for (let pr = 0; pr < pairs; pr++){
    const i = Math.round(c.N * (0.2 + pr * 0.2)); if (i < i0 + 1 || i >= i1 - 1) continue;
    const tx = crNy[i], ty = -crNx[i], ang = Math.atan2(ty, tx), ph = t * c.v.flap - pr * 0.9, fl = Math.cos(ph);
    const S = f.wing * c.v.wing * m * crQ[i] * (pr ? 0.62 : 1) * crSm(crT[i] / 0.12), span = 0.72 + 0.28 * fl, sweep = 0.3 * (0.5 - 0.5 * fl) + 0.12;
    if (S < 1) continue;
    for (let sd = -1; sd <= 1; sd += 2){
      g.save(); g.translate(crX[i], crY[i]); g.rotate(ang); g.scale(1, sd); g.translate(0, crW[i] * 0.5); g.rotate(-sweep); g.scale(S, S * span);
      // 骨（腕と指）と、指の間の膜
      g.beginPath(); g.moveTo(0.12, 0); g.lineTo(0.34, 0.44); g.lineTo(-0.08, 1.0);
      g.quadraticCurveTo(-0.2, 0.72, -0.5, 0.76); g.quadraticCurveTo(-0.46, 0.5, -0.72, 0.42); g.quadraticCurveTo(-0.5, 0.2, -0.42, 0); g.closePath();
      g.restore();
      crPaint(c, a * 0.85, 1, 0.8, 0.6);
      g.save(); g.translate(crX[i], crY[i]); g.rotate(ang); g.scale(1, sd); g.translate(0, crW[i] * 0.5); g.rotate(-sweep); g.scale(S, S * span);
      g.beginPath(); g.moveTo(0.34, 0.44); g.lineTo(-0.5, 0.76); g.moveTo(0.34, 0.44); g.lineTo(-0.72, 0.42);
      g.restore();
      g.strokeStyle = col.acc; g.globalAlpha = 0.4 * a; g.lineWidth = 2; g.stroke();
    }
  }
}
