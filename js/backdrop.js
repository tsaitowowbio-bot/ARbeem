'use strict';
// ---- カメラ映像の側の演出（暗くする・照らす・命中の一瞬）----
// 光の演出は、明るい映像の上では見えにくい。そこで、映像のほうを暗くし、魔法の色で照らす。
//   1. 暗くする　：装填が進むほど、画面の端から暗くする。発射の直前がいちばん暗く、撃つとゆるみ、余韻のあいだに元へ戻る。
//   2. 照らす　　：魔法の色のやわらかい光を映像に重ねる（装填中は手元、発射後は弾、着弾後は当たった先）。
//   3. 命中の一瞬：3 枚で的に当てたとき、映像だけがごく短いあいだ、白黒の強い明暗になる（描画面の光は色のまま）。
// しくみ：映像（video）と描画面（canvas）のあいだに、画面に固定した板を 2 枚はさむ（暗くする板と、光の板）。
//   毎フレーム変えるのは、板の transform と opacity だけ。値が変わったときだけ書きこむ。
//   映像そのものに触るのは filter だけ（transform は main.js が使う）。使わないときは filter を外す。
//   カメラが使えないとき（video がない）は、下の #bg に同じ板が重なる。filter は何もしない。
// 時間はすべて rdt（実際に過ぎた秒数）で進める。演出の時計が止まっているあいだも、こちらは進む。
// 白い閃光は出さない。明るさが行ったり来たりをくり返す動きも作らない（光に敏感な人への配慮）。
// main.js などから呼ばれる。
//   updateBackdrop(t, rdt)：毎フレーム。t は演出の時計、rdt は実際に過ぎた秒数。
//   backdropEvent(name, n)：できごとの知らせ。name は 'load'（n＝装填ずみの枚数）、'trigger'・'fire'・'impact'（n＝撃った枚数）、
//                           'hit'（n＝撃った枚数。的に当たった）、'reset'（次の装填へ）。

// ---- 調整用の値 ----
// （blend・dimCenter・dimColor は、読みこんだときに 1 度だけ使う。ほかは動いているあいだも読む）
const BACKDROP = {
  // 光の重ね方（CSS の mix-blend-mode）。'soft-light' は映像の明暗を残したまま色をのせる（ひかえめ）。
  // 'overlay' は少し強い。'screen' は白っぽく光る。
  // '' にすると重ね合わせを使わず、ただの半透明にする（動きが重い端末では '' にする）。
  blend: 'soft-light',

  // 暗さ（0＝そのまま、1＝真っ黒）。どれも画面の端での値で、中央はそれより明るく残る
  dimLoad: 0.45,        // 3 枚装填したとき
  dimReady: 0.68,       // 発射の直前（いちばん暗い）
  dimCenter: 0.5,       // 画面の中央の暗さは、端の何倍か（小さいほど中央が明るく残る。1 で全体が同じ暗さ）
  dimFly: 0.75,         // 弾が飛んでいるあいだの暗さ（発射直前の何倍か）
  dimColor: '3,6,16',   // 暗くする色（赤,緑,青）。真っ黒より少し青い
  irisOpen: 1.3,        // 暗い縁の広がり。暗さが浅いときの倍率（発射の直前に 1 までせばまる）
  fireLift: 0.5,        // 発射の瞬間に、暗さをどれだけゆるめるか（0＝ゆるめない、1＝いったん全部晴らす）
  liftSec: 0.14,        // ゆるみが引いていく速さ（秒）
  coolHold: 0.1,        // 着弾のあと、暗さを保つ時間（秒）
  coolSec: 0.8,         // そのあと、元の明るさに戻るまでの時間（秒）

  // 光の強さ（0〜1）。3 枚のときの値で、枚数が少ないと弱くなる
  lightLoad: 0.55,      // 装填中（手元）
  lightReady: 0.8,      // 発射の直前（手元）
  lightFire: 0.8,       // 弾が飛んでいるあいだ（弾の位置）
  lightImpact: 0.85,    // 着弾（当たった先）。ここから消えていく
  lightSat: 95,         // 光の色の濃さ（％）
  lightLum: 66,         // 光の色の明るさ（％）。50 より上で映像を明るくする
  hueFire: 200,         // 発射から後の光の色（ビームの色）
  kick: 0.35,           // 装填・発射・着弾の瞬間に、光を一瞬強める割合
  plainGain: 0.4,       // blend が '' のときに光を弱める倍率（半透明は映像を白っぽく覆うので、控えめにする）

  // 命中の一瞬（映像が白黒の強い明暗になる）
  impactHold: 0.08,     // 保つ時間（秒）
  impactEase: 0.15,     // そのあと、元の色に戻るまでの時間（秒）
  impactContrast: 2.2,  // 明暗の強さ（1＝そのまま）
  impactBright: 0.85,   // 明るさ（1＝そのまま）。1 より下げると、明るい場所でも真っ白にならない
  impactSmall: 0.3,     // 1 枚たりない（2 枚）で当てたときの効き（3 枚のときを 1 として。0 で何もしない）。1 枚では何もしない

  // 端末の「アニメーションを減らす」設定（prefers-reduced-motion）が入っているとき。命中の一瞬と、瞬間的な変化は出さない
  calmAmount: 0.6,      // 暗さ・光を何倍に抑えるか
  calmSlow: 2.5,        // 変化を何倍ゆっくりにするか
};

const backdropFx = (() => {
  const C = BACKDROP;
  const SIZE = 320;                       // 光の板の大きさ（px）。これを拡大して使う
  const blend = C.blend && self.CSS && CSS.supports('mix-blend-mode', C.blend) ? C.blend : '';
  const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = u => u * u * (3 - 2 * u);
  const calmMq = matchMedia('(prefers-reduced-motion: reduce)');
  let calm = calmMq.matches;
  if (calmMq.addEventListener) calmMq.addEventListener('change', e => { calm = e.matches; });

  // ---- 板を作る（canvas のすぐ下、video のすぐ上）。はじめは隠しておく ----
  function plate(css){
    const e = document.createElement('div'); e.setAttribute('aria-hidden', 'true');
    e.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;visibility:hidden;opacity:0;will-change:opacity,transform;' + css;
    cv.parentNode.insertBefore(e, cv); return e;
  }
  // 暗くする板：中央が薄く、端ほど濃い。濃さの形は変えず、全体の opacity と拡大率だけを動かす
  const dimStop = v => `rgba(${C.dimColor},${(C.dimCenter + (1 - C.dimCenter) * v).toFixed(3)})`;
  const dimEl = plate('width:100%;height:100%;background:radial-gradient(ellipse farthest-corner at 50% 50%,' +
    `${dimStop(0)} 0%,${dimStop(0)} 18%,${dimStop(0.3)} 44%,${dimStop(0.72)} 68%,${dimStop(0.95)} 88%,${dimStop(1)} 100%)`);
  // 光の板：小さく作って拡大する（色が変わったときの描き直しが軽い）。中心が濃く、外へなだらかに消える
  const lightEl = plate(`width:${SIZE}px;height:${SIZE}px;` + (blend ? `mix-blend-mode:${blend};` : ''));
  const lightBg = h => { const c = a => `hsla(${h},${C.lightSat}%,${C.lightLum}%,${a})`;
    return `radial-gradient(circle closest-side,${c(1)} 0%,${c(0.92)} 20%,${c(0.7)} 40%,${c(0.4)} 60%,${c(0.13)} 80%,${c(0)} 100%)`; };

  // ---- いまの値 ----
  let prevPhase = 'idle', phaseT = 0;     // 前のコマの段階、いまの段階に入ってからの実時間
  let dim = 0, dimFrom = 0, lift = 0;     // 暗さ、いまの段階に入ったときの暗さ、発射のゆるみ（1 → 0）
  let light = 0, lightFrom = 0, hue = HUE[0], rad = 0, kick = 0;   // 光の強さ、段階に入ったときの強さ、色、半径（px）、瞬間の強まり（1 → 0）
  let wasHit = false, fxT = -1, fxK = 0, fxDone = false;           // 命中の一瞬：経過（負は休み）、効き、この 1 発でもう出したか
  // 書きこんだ値（きざみに丸めた整数。同じなら書かない）
  let wDim = 0, wIris = 0, wLight = 0, wHue = -1, wX = -1, wY = -1, wScale = 0, wFx = 0;

  // 合図から発射までの長さ（main.js の stepReady と同じ式）。発射の直前に時計が止まっても、そのあいだは暗いまま待つ
  const readyDur = () => fireAt || 0.5;      // 発射の合図から、発射の直前に絵が止まるまでの秒数（main.js が決める）
  const loadDim = k => C.dimLoad * Math.pow(clamp(k), 0.8);                        // k：装填の進み（0〜1）
  const peakDim = k => loadDim(k) + (C.dimReady - C.dimLoad) * (0.4 + 0.6 * k);    // 発射直前の暗さ（枚数が少ないと浅い）
  // 光の色：装填ずみの陣の色をまぜる（いちばん新しい陣を 2 倍に数える）。1 枚＝水色、2 枚＝青、3 枚＝青紫
  const loadHue = n => { let sum = 0; for (let i = 0; i < n; i++) sum += HUE[i] * (i === n - 1 ? 2 : 1); return n ? sum / (n + 1) : HUE[0]; };

  function update(t, rdt){
    const dt = Math.min(Math.max(rdt || 0, 0), 0.1);
    if (phase !== prevPhase){ prevPhase = phase; phaseT = 0; dimFrom = dim; lightFrom = light; }
    else phaseT += dt;
    const slow = calm ? C.calmSlow : 1, amount = calm ? C.calmAmount : 1;
    const follow = tau => 1 - Math.exp(-dt / (tau * slow));          // tau 秒ほどかけて追いつく
    const n = circles.length, m = Math.min(W, H), kShot = shotN / MAX;

    // ---- 暗さ ----
    if (phase === 'load'){                // 1 枚もないあいだは暗くしない（まわりを見られるように）。次の 1 枚がたまるぶんも足す
      dim += (loadDim(n ? (n + (n < MAX ? charge : 0)) / MAX : 0) - dim) * follow(0.22);
    } else if (phase === 'ready'){        // 発射に向けて深くする。終わりぎわほど速く、直前がいちばん暗い
      const u = clamp(phaseT / readyDur());
      dim = dimFrom + (Math.max(peakDim(kShot), dimFrom) - dimFrom) * (calm ? u : u * u);
    } else if (phase === 'fire'){         // 弾が飛んでいるあいだ。ビームが見えるよう、暗さは残す
      dim += (peakDim(kShot) * C.dimFly - dim) * follow(0.15);
    } else if (phase === 'cool'){         // 少し保ってから、なめらかに元へ
      dim = dimFrom * (1 - smooth(clamp((phaseT - C.coolHold) / (C.coolSec * (calm ? 1.5 : 1)))));
    } else dim += (0 - dim) * follow(0.22);
    lift *= Math.exp(-dt / C.liftSec);
    const dimOut = dim * amount * (1 - C.fireLift * lift);
    const iris = C.irisOpen - (C.irisOpen - 1) * clamp(dim / C.dimReady) + 0.25 * lift;

    // ---- 光（lt：めざす強さ、lr：半径、lx・ly：位置、lh：色）----
    let lt = 0, lr = m * 0.6, lx = W / 2, ly = H / 2, lh = hue, tau = 0.15;
    if (phase === 'load' && n){           // 手元。枚数が増えるほど強く、広く
      const k = clamp((n + 0.5 * charge) / MAX);
      [lx, ly] = proj(DEPTH[0]); lt = C.lightLoad * (0.3 + 0.7 * k); lr = m * (0.55 + 0.27 * k); lh = loadHue(n);
    } else if (phase === 'ready'){        // 強まりながら、手元に集まる
      const u = clamp(phaseT / readyDur());
      [lx, ly] = proj(DEPTH[0]); lt = lightFrom + (Math.max(C.lightReady * (0.5 + 0.5 * kShot), lightFrom) - lightFrom) * (calm ? u : u * u);
      lr = m * (0.55 + 0.27 * kShot) * (1 - 0.12 * u * u); lh = loadHue(shotN); tau = 0.03;
    } else if (phase === 'fire'){         // 弾についていく
      const u = clamp(phaseT / (spell ? flyDur : FLY[Math.max(1, shotN) - 1]));      // 詠唱の魔法は、生き物が飛ぶ時間に合わせる
      [lx, ly] = proj(bulletZ); lt = C.lightFire * (0.5 + 0.5 * kShot); lr = m * (0.95 - 0.35 * u); lh = castHue != null ? castHue : C.hueFire; tau = 0.05;
    } else if (phase === 'cool'){         // 当たった先で、広がりながら消える
      const u = clamp(phaseT / (C.coolHold + C.coolSec));
      [lx, ly] = proj(Z1); lt = C.lightImpact * (0.5 + 0.5 * kShot) * (wasHit ? 1 : 0.7) * (1 - u) * (1 - u);
      lr = m * (0.6 + 0.55 * (1 - Math.pow(1 - u, 3))); lh = castHue != null ? castHue : C.hueFire; tau = 0.04;
    }
    if (light < 0.01){ hue = lh; rad = lr; }                // 消えているあいだに、色と大きさを次の出番に合わせておく
    else { hue += (lh - hue) * follow(0.18); rad += (lr - rad) * follow(0.07); }
    light += (lt - light) * follow(tau);
    kick *= Math.exp(-dt / 0.16);
    const lightOut = clamp(light * amount * (1 + C.kick * kick) * (blend ? 1 : C.plainGain));
    lr = rad * (1 + 0.1 * kick);

    // ---- 命中の一瞬：保つ → なめらかに戻す（行って、戻るだけ）----
    let fx = 0;
    if (fxT >= 0){
      const u = (fxT - C.impactHold) / C.impactEase;
      if (u >= 1) fxT = -1; else { fx = fxK * (u <= 0 ? 1 : 1 - smooth(u)); fxT += dt; }
    }

    // ---- 書きこむ（きざみに丸めて、値が変わったときだけ）----
    const d = Math.round(dimOut * 100);                     // 暗さ：1 ％きざみ
    if (d !== wDim){
      if (!d !== !wDim) dimEl.style.visibility = d ? 'visible' : 'hidden';
      dimEl.style.opacity = d / 100; wDim = d;
    }
    if (d){ const s = Math.round(iris * 100); if (s !== wIris){ dimEl.style.transform = `scale(${s / 100})`; wIris = s; } }

    const l = Math.round(lightOut * 100);                   // 光：1 ％きざみ
    if (l !== wLight){
      if (!l !== !wLight) lightEl.style.visibility = l ? 'visible' : 'hidden';
      lightEl.style.opacity = l / 100; wLight = l;
    }
    if (l){
      const h = Math.round(hue / 4) * 4, x = Math.round(lx), y = Math.round(ly), s = Math.round(lr / (SIZE / 2) * 50);
      if (h !== wHue){ lightEl.style.background = lightBg(h); wHue = h; }
      if (x !== wX || y !== wY || s !== wScale){
        lightEl.style.transform = `translate3d(${x - SIZE / 2}px,${y - SIZE / 2}px,0) scale(${s / 50})`; wX = x; wY = y; wScale = s; }
    }

    const f = Math.round(fx * 20);                          // 映像の filter：5 ％きざみ。0 になったら filter ごと外す
    if (f !== wFx){
      wFx = f; const k = f / 20;
      if (camEl.isConnected) camEl.style.filter = !f ? '' :
        `grayscale(${k}) contrast(${(1 + (C.impactContrast - 1) * k).toFixed(2)}) brightness(${(1 + (C.impactBright - 1) * k).toFixed(2)})`;
    }
  }

  function event(name, n){
    if (name === 'trigger'){ wasHit = false; fxDone = false; }
    else if (name === 'load'){ if (!calm) kick = Math.max(kick, 0.7); }
    else if (name === 'fire'){ if (!calm){ lift = 1; kick = 1; } }
    else if (name === 'impact'){ if (!calm) kick = Math.max(kick, 0.6); }
    else if (name === 'hit'){
      wasHit = true; if (!calm) kick = 1;
      const k = n >= MAX ? 1 : n === MAX - 1 ? C.impactSmall : 0;
      if (!calm && !fxDone && k > 0){ fxDone = true; fxT = 0; fxK = k; }   // 1 発につき 1 回だけ
    }
  }
  return { update, event };
})();

function updateBackdrop(t, rdt){ backdropFx.update(t, rdt); }
function backdropEvent(name, n){ backdropFx.event(name, n); }
