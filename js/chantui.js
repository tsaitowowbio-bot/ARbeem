'use strict';
// ---- 詠唱の入力（文字で打つ／声で言う）----
// 詠唱 → chant.js の interpretChant() で、属性・姿・動きを決める → main.js の castSpell() で撃つ。
// 属性も姿も見つからない詠唱は「不発」（装填はそのまま、唱え直せる）。
let chantRec = null;
function chantSay(msg){ document.getElementById('chantOut').textContent = msg; }
function doChant(text){
  text = String(text || '').trim(); if (!text) return;
  if (phase !== 'load'){ chantSay('いまは唱えられません（撃ち終わるまで待ってください）'); return; }
  if (!circles.length){ chantSay('まだ装填されていません'); return; }
  const r = interpretChant(text);
  if (!r.ok){ fizzle(); chantSay('不発：属性か、姿のことばが見つかりません'); return; }
  if (!castSpell(r)) return;
  const s = spell.spec, parts = [ELEMENT_JA[s.element] + (r.element ? '' : '（おまかせ）'), FORM_JA[s.form] + (r.form === s.form ? '' : '（おまかせ）'), MOTION_JA[s.motion] + (r.motion ? '' : '（おまかせ）')];
  chantSay(`${parts.join('・')}　${RARITY_JA[spell.rarity]}`);
}
function initChantUI(){
  const form = document.getElementById('chant'), input = document.getElementById('chantText'), micBtn = document.getElementById('chantMic');
  form.addEventListener('submit', e => { e.preventDefault(); doChant(input.value); input.blur(); });
  // 声：ブラウザの音声認識を使う（1 回の発話を聞き取って、そのまま唱える）
  const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
  micBtn.addEventListener('click', () => {
    if (!SR){ chantSay('このブラウザでは、声の聞き取りが使えません。文字で入れてください'); return; }
    if (chanting){ chantRec && chantRec.stop(); return; }
    let final = '';
    const rec = chantRec = new SR(); rec.lang = 'ja-JP'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onresult = e => { let s = '', done = false; for (const r of e.results){ s += r[0].transcript; done = done || r.isFinal; }
      input.value = s; if (done) final = s; };
    rec.onerror = e => { chantSay(e.error === 'not-allowed' ? 'マイクが許可されていません' : e.error === 'no-speech' ? '声が聞こえませんでした' : `聞き取れませんでした（${e.error}）`); };
    rec.onend = () => { chanting = false; micBtn.textContent = '声'; micBtn.classList.remove('live'); if (final) doChant(final); };
    try { rec.start(); chanting = true; micBtn.textContent = '聞いています'; micBtn.classList.add('live'); chantSay('どうぞ（言い終わると、そのまま唱えます）'); }
    catch (err) { chanting = false; chantSay('声の聞き取りを始められませんでした'); }
  });
}
