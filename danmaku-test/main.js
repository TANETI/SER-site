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

// ── 패널 ──
const spellSel = $('spellSel'), angelSel = $('angelSel');
// 보스전(여러 패턴 연속)은 r0, r1… 단일 패턴은 번호
function fillSpells() {
  spellSel.innerHTML = '';
  BOSS_RUNS.forEach((r, i) => spellSel.add(new Option(`▶ 보스전: ${r.title}`, 'r' + i)));
  SPELLS.forEach((sp, i) => spellSel.add(new Option(`${i + 1}. ${sp.name}${sp.boss ? ` (${sp.boss})` : ''}`, i)));
}
fillSpells();
for (const [code, a] of Object.entries(ANGELS)) angelSel.add(new Option(a.name, code));
DIFFS.forEach((d, i) => $('diffSel').add(new Option(d, i)));

function syncPanel() {
  spellSel.value = G.run ? 'r' + BOSS_RUNS.findIndex(r => r.title === G.run.title) : G.spellIndex;
  angelSel.value = G.angel;
  $('diffSel').value = G.difficulty;
  $('invChk').checked = G.invincible;
  $('sndChk').checked = !SFX.muted;
  if (!$('editor').hidden) $('code').value = spellSource(G.spell);
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
$('speedSel').onchange = e => { G.speed = +e.target.value; settle(e.target); };
$('invChk').onchange = e => { G.invincible = e.target.checked; settle(e.target); };
$('loopChk').onchange = e => { G.loop = e.target.checked; settle(e.target); };
$('restartBtn').onclick = e => { G.restart(); settle(e.target); };
$('sndChk').onchange = e => { SFX.setMuted(!e.target.checked); settle(e.target); };
$('editBtn').onclick = e => {
  const ed = $('editor'); ed.hidden = !ed.hidden;
  if (!ed.hidden) $('code').value = spellSource(G.spell);
  settle(e.target);
};

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
