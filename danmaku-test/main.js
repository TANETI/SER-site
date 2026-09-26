'use strict';

const $ = id => document.getElementById(id);
const G = new Game($('screen'));
const ORIGINAL = SPELLS.map(sp => spellSource(sp));
G.spells = SPELLS;

// ── 입력 ──
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight',
  'Escape', 'KeyR', 'KeyI', 'KeyM', 'KeyD', 'BracketLeft', 'BracketRight', 'Period', 'Digit1', 'Digit2', 'Digit3', 'Digit4']);
const typing = e => e.target instanceof HTMLTextAreaElement;
addEventListener('pointerdown', () => SFX.unlock());
addEventListener('keydown', e => {
  SFX.unlock();
  if (typing(e) || !GAME_KEYS.has(e.code)) return;
  e.preventDefault();
  if (!e.repeat) G.pressed.add(e.code);
  G.keys.add(e.code);
});
addEventListener('keyup', e => G.keys.delete(e.code));
addEventListener('blur', () => G.keys.clear());
// 탭이 가려지면 자동 일시정지
document.addEventListener('visibilitychange', () => { if (document.hidden) G.paused = true; });

// 터치: 화면을 누른 채 끌면 끈 만큼 기체가 움직이고(1:1) 자동 사격. 두 손가락으로 누르면 폭탄
const cv = $('screen');
let touch = null;
cv.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  e.preventDefault();
  if (touch && touch.id !== e.pointerId) { G.pressed.add('KeyX'); return; }
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
  G.keys.add('KeyZ');
});
cv.addEventListener('pointermove', e => {
  if (!touch || e.pointerId !== touch.id) return;
  const k = 640 / cv.getBoundingClientRect().width;
  G.player.x = Math.max(8, Math.min(W - 8, G.player.x + (e.clientX - touch.x) * k));
  G.player.y = Math.max(16, Math.min(H - 16, G.player.y + (e.clientY - touch.y) * k));
  touch.x = e.clientX; touch.y = e.clientY;
});
const endTouch = e => { if (touch && e.pointerId === touch.id) { touch = null; G.keys.delete('KeyZ'); } };
cv.addEventListener('pointerup', endTouch);
cv.addEventListener('pointercancel', endTouch);
cv.style.touchAction = 'none';

// ── 패널 ──
const spellSel = $('spellSel'), angelSel = $('angelSel');
// 보스전(여러 패턴 연속)은 r0, r1… 단일 패턴은 번호. 단일 패턴은 보스별로 묶어 보여 줌
function fillSpells() {
  spellSel.innerHTML = '';
  const group = label => { const g = document.createElement('optgroup'); g.label = label; spellSel.append(g); return g; };
  const runs = group('보스전 (패턴을 이어서, 목숨·파워 유지)');
  BOSS_RUNS.forEach((r, i) => runs.append(new Option(r.title, 'r' + i)));
  const groups = new Map();
  SPELLS.forEach((sp, i) => {
    const key = sp.boss || '시험 패턴';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(new Option(`${i + 1}. ${sp.name}`, i));
  });
  for (const [key, opts] of groups) group(key === '시험 패턴' ? key : `${key} 단일 패턴`).append(...opts);
}
fillSpells();
for (const [code, a] of Object.entries(ANGELS)) angelSel.add(new Option(a.name, code));
DIFFS.forEach((d, i) => $('diffSel').add(new Option(d, i)));
[0, 1, 2, 3, 4].forEach(v => $('powSel').add(new Option(v === 4 ? '4.00 (MAX)' : v.toFixed(2), v)));

function syncPanel() {
  spellSel.value = G.run ? 'r' + BOSS_RUNS.findIndex(r => r.title === G.run.title) : G.spellIndex;
  angelSel.value = G.angel;
  $('diffSel').value = G.difficulty;
  $('powSel').value = G.practicePower;
  $('lockChk').checked = G.powerLock;
  $('invChk').checked = G.invincible;
  $('sndChk').checked = !SFX.muted;
  $('shakeChk').checked = G.shakeOn;
  if ($('editor').open) $('code').value = spellSource(G.spell);
}
G.onChange = syncPanel;

// 선택 후 포커스를 빼서 방향키가 목록을 바꾸지 않게 함
const settle = el => el.blur();
spellSel.onchange = () => {
  const v = spellSel.value;
  if (v[0] === 'r') G.startRun(BOSS_RUNS[+v.slice(1)]); else G.startSingle(+v);
  syncPanel(); settle(spellSel);
};
angelSel.onchange = () => { G.angel = angelSel.value; settle(angelSel); };
$('diffSel').onchange = e => { G.difficulty = +e.target.value; G.restart(); settle(e.target); };
$('powSel').onchange = e => { G.practicePower = +e.target.value; if (!G.run || G.powerLock) G.restart(); settle(e.target); };
$('lockChk').onchange = e => { G.powerLock = e.target.checked; G.restart(); settle(e.target); };
$('speedSel').onchange = e => { G.speed = +e.target.value; settle(e.target); };
$('invChk').onchange = e => { G.invincible = e.target.checked; settle(e.target); };
$('loopChk').onchange = e => { G.loop = e.target.checked; settle(e.target); };
$('restartBtn').onclick = e => { G.restart(); settle(e.target); };
$('sndChk').onchange = e => { SFX.setMuted(!e.target.checked); settle(e.target); };
$('volRange').oninput = e => { SFX.unlock(); SFX.setVolume(+e.target.value); SFX.item(); };
$('volRange').onchange = e => settle(e.target);
$('shakeChk').onchange = e => { G.shakeOn = e.target.checked; if (!G.shakeOn) G.shakeMag = 0; settle(e.target); };
$('editor').addEventListener('toggle', () => { if ($('editor').open) $('code').value = spellSource(G.spell); });
$('prevBtn').onclick = e => { G.startSingle(G.spellIndex - 1); syncPanel(); settle(e.target); };
$('nextBtn').onclick = e => { G.startSingle(G.spellIndex + 1); syncPanel(); settle(e.target); };

// ── 코드 편집 ──
function spellSource(sp) {
  const { run, ...meta } = sp;
  const lines = Object.entries(meta).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`);
  return `{\n${lines.join('\n')}\n  ${reindent(run.toString())},\n}`;
}
// 함수 본문의 공통 들여쓰기를 두 칸으로 맞춤
function reindent(src) {
  const lines = src.split('\n');
  const rest = lines.slice(1).filter(l => l.trim());
  const min = Math.min(...rest.map(l => l.match(/^ */)[0].length));
  return [lines[0], ...lines.slice(1).map(l => l.trim() ? '  ' + l.slice(min) : '')].join('\n');
}
$('applyBtn').onclick = () => {
  try {
    const sp = (0, eval)('(' + $('code').value + ')');
    if (typeof sp.run !== 'function') throw new Error('run 제너레이터가 없음');
    // 보스전 순서에 들어 있던 옛 패턴도 새 것으로 바꿔 끼움
    const old = SPELLS[G.spellIndex];
    SPELLS[G.spellIndex] = sp;
    for (const r of BOSS_RUNS) r.seq = r.seq.map(x => x === old ? sp : x);
    if (G.run) G.run.seq = G.run.seq.map(x => x === old ? sp : x);
    fillSpells(); G.run ? G.start(G.spellIndex) : G.startSingle(); syncPanel();
    $('err').textContent = '';
  } catch (e) { $('err').textContent = String(e.message || e); }
};
$('resetBtn').onclick = () => { $('code').value = ORIGINAL[G.spellIndex] ?? ''; $('applyBtn').click(); };
$('code').addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('applyBtn').click(); }
});

// ── 루프 ──
G.startSingle(0); syncPanel();
let last = performance.now();
requestAnimationFrame(function tick(now) {
  G.frameTick(now - last); last = now;
  requestAnimationFrame(tick);
});
