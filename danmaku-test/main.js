'use strict';

const $ = id => document.getElementById(id);
const G = new Game($('screen'));
const ORIGINAL = SPELLS.map(sp => spellSource(sp));
G.spells = SPELLS;

// ── 입력 ──
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight',
  'Escape', 'KeyR', 'KeyI', 'BracketLeft', 'BracketRight', 'Period', 'Digit1', 'Digit2', 'Digit3', 'Digit4']);
const typing = e => e.target instanceof HTMLTextAreaElement;
addEventListener('keydown', e => {
  if (typing(e) || !GAME_KEYS.has(e.code)) return;
  e.preventDefault();
  if (!e.repeat) G.pressed.add(e.code);
  G.keys.add(e.code);
});
addEventListener('keyup', e => G.keys.delete(e.code));
addEventListener('blur', () => G.keys.clear());

// ── 패널 ──
const spellSel = $('spellSel'), angelSel = $('angelSel');
function fillSpells() {
  spellSel.innerHTML = '';
  SPELLS.forEach((sp, i) => spellSel.add(new Option(`${i + 1}. ${sp.name}`, i)));
}
fillSpells();
for (const [code, a] of Object.entries(ANGELS)) angelSel.add(new Option(a.name, code));

function syncPanel() {
  spellSel.value = G.spellIndex;
  angelSel.value = G.angel;
  $('invChk').checked = G.invincible;
  if (!$('editor').hidden) $('code').value = spellSource(G.spell);
}
G.onChange = syncPanel;

// 선택 후 포커스를 빼서 방향키가 목록을 바꾸지 않게 함
const settle = el => el.blur();
spellSel.onchange = () => { G.start(+spellSel.value); syncPanel(); settle(spellSel); };
angelSel.onchange = () => { G.angel = angelSel.value; settle(angelSel); };
$('speedSel').onchange = e => { G.speed = +e.target.value; settle(e.target); };
$('invChk').onchange = e => { G.invincible = e.target.checked; settle(e.target); };
$('loopChk').onchange = e => { G.loop = e.target.checked; settle(e.target); };
$('restartBtn').onclick = e => { G.start(); settle(e.target); };
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
    SPELLS[G.spellIndex] = sp;
    fillSpells(); G.start(); syncPanel();
    $('err').textContent = '';
  } catch (e) { $('err').textContent = String(e.message || e); }
};
$('resetBtn').onclick = () => { $('code').value = ORIGINAL[G.spellIndex] ?? ''; $('applyBtn').click(); };
$('code').addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('applyBtn').click(); }
});

// ── 루프 ──
G.start(0); syncPanel();
let last = performance.now();
requestAnimationFrame(function tick(now) {
  G.frameTick(now - last); last = now;
  requestAnimationFrame(tick);
});
