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
// 패턴 테스트 룸 목록. 보스전(r0, r1…) 다음에 본게임 순서대로 스테이지마다 그 스테이지의 패턴, 그 뒤로 도중(잡몹 구간)·
// 본게임에서 빠진 패턴·시험 패턴. 단일 패턴 번호는 목록에 보이는 순서대로 1부터(이전·다음 버튼과 [ ] 키도 이 순서)
function fillSpells() {
  spellSel.innerHTML = '';
  const group = label => { const g = document.createElement('optgroup'); g.label = label; spellSel.append(g); return g; };
  const runs = group('보스전 (스테이지의 보스를 이어서)');
  BOSS_RUNS.forEach((r, i) => runs.append(new Option(r.title, 'r' + i)));
  const order = [], used = new Set();
  const add = (g, i, label) => { order.push(i); used.add(i); g.append(new Option(`${order.length}. ${label}`, i)); };
  for (const r of BOSS_RUNS) {
    const g = group(r.title);
    for (const sp of r.seq) { const i = SPELLS.indexOf(sp); if (!used.has(i)) add(g, i, (r.seq.some(x => x.boss !== sp.boss) ? sp.boss + ' · ' : '') + sp.name + (sp.strong ? ' ★' : '')); }
  }
  const stages = SPELLS.map((sp, i) => i).filter(i => SPELLS[i].type === 'stage' && SPELLS[i].bgm);
  if (stages.length) { const g = group('도중 · 잡몹 구간 (본게임에서 보스 앞)'); for (const i of stages) add(g, i, SPELLS[i].name); }
  // 본게임에서 빠진 보스 패턴: 보스의 스테이지 순서대로
  const bossOrder = [...new Set(BOSS_RUNS.flatMap(r => r.seq.map(sp => sp.boss)))];
  const cut = SPELLS.map((sp, i) => i).filter(i => !used.has(i) && SPELLS[i].boss)
    .sort((a, b) => (bossOrder.indexOf(SPELLS[a].boss) + 99) % 99 - (bossOrder.indexOf(SPELLS[b].boss) + 99) % 99 || a - b);
  if (cut.length) { const g = group('본게임에서 빠진 패턴'); for (const i of cut) add(g, i, `${SPELLS[i].boss} · ${SPELLS[i].name}`); }
  const rest = SPELLS.map((sp, i) => i).filter(i => !used.has(i));
  if (rest.length) { const g = group('시험 패턴'); for (const i of rest) add(g, i, SPELLS[i].name); }
  G.roomOrder = order;
}
fillSpells();
for (const [code, a] of Object.entries(ANGELS)) angelSel.add(new Option(a.name, code));
DIFFS.forEach((d, i) => $('diffSel').add(new Option(d, i)));
for (const id of ['powSel', 'stPowSel']) [0, 1, 2, 3, 4].forEach(v => $(id).add(new Option(v === 4 ? '4.00 (MAX)' : v.toFixed(2), v)));

function syncPanel() {
  spellSel.value = G.run ? 'r' + BOSS_RUNS.findIndex(r => r.title === G.run.title) : G.spellIndex;
  angelSel.value = G.angel;
  $('diffSel').value = G.difficulty;
  $('powSel').value = G.practicePower;
  $('lockChk').checked = $('stLockChk').checked = G.powerLock;
  $('invChk').checked = $('stInvChk').checked = G.invincible;
  $('stPowSel').value = G.practicePower;
  $('skipChk').checked = G.skipStage;
  $('sndChk').checked = !SFX.muted;
  $('shakeChk').checked = G.shakeOn;
  $('speedSel').value = G.speed;
  if ($('editor').open) $('code').value = spellSource(G.spell);
  syncStage();
}
G.onChange = syncPanel;
G.onUnlock = syncPanel;   // 엑스트라가 열리면 시작 버튼을 다시 그림

// 선택 후 포커스를 빼서 방향키가 목록을 바꾸지 않게 함
const settle = el => el.blur();
spellSel.onchange = () => {
  const v = spellSel.value;
  if (v[0] === 'r') { G.story = null; G.startRun(BOSS_RUNS[+v.slice(1)]); } else G.startSingle(+v);
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
$('bgmRange').oninput = e => { SFX.unlock(); BGM.setVolume(+e.target.value); };
$('bgmRange').onchange = e => settle(e.target);
$('shakeChk').onchange = e => { G.shakeOn = e.target.checked; if (!G.shakeOn) G.shakeMag = 0; settle(e.target); };
$('editor').addEventListener('toggle', () => { if ($('editor').open) $('code').value = spellSource(G.spell); });
$('prevBtn').onclick = e => { G.stepSingle(-1); syncPanel(); settle(e.target); };
$('nextBtn').onclick = e => { G.stepSingle(1); syncPanel(); settle(e.target); };

// ── 모드: 스테이지 모드(본게임만, 연습 도구 없음) / 패턴 테스트 룸(패턴·보스 하나씩, 연습 도구) ──
const STORY_INFO = { main: '1스테이지부터 · 8보스', extra: '진심 예로니모', extra2: '이즘' };
const STORY_LOCK = { extra: '본편을 깨면 열림', extra2: '엑스트라를 깨면 열림' };
function syncStage() {
  for (const b of $('angelSeg').children) b.setAttribute('aria-pressed', b.dataset.v === G.angel);
  for (const b of $('diffSeg').children) b.setAttribute('aria-pressed', +b.dataset.v === G.difficulty);
  for (const b of $('starts').children) {
    const key = b.dataset.story, open = unlocked(key);
    b.disabled = !open;
    b.querySelector('small').textContent = open ? STORY_INFO[key] : '잠김 · ' + STORY_LOCK[key];
    b.classList.toggle('on', !!(G.story && G.story.key === key));
  }
  $('stageSkip').disabled = !(G.story && G.story.idx < G.story.list.length - 1);
}
for (const [code, a] of Object.entries(ANGELS)) {
  const b = document.createElement('button'); b.textContent = a.name; b.dataset.v = code;
  b.onclick = () => { G.angel = code; syncPanel(); settle(b); };
  $('angelSeg').append(b);
}
DIFFS.forEach((d, i) => {
  const b = document.createElement('button'); b.textContent = d; b.dataset.v = i;
  b.onclick = () => { G.difficulty = i; G.restart(); syncPanel(); settle(b); };
  $('diffSeg').append(b);
});
for (const b of $('starts').children) b.onclick = () => { G.startStory(b.dataset.story); syncPanel(); settle(b); };
$('stageRestart').onclick = e => { G.restart(); settle(e.target); };
$('stageSkip').onclick = e => { G.nextStage(); syncPanel(); settle(e.target); };
// 테스트 도구(스테이지 모드): 판을 다시 시작하지 않고 바로 적용
$('stInvChk').onchange = e => { G.invincible = e.target.checked; settle(e.target); };
$('stLockChk').onchange = e => { G.powerLock = e.target.checked; if (G.powerLock) G.player.power = G.practicePower; settle(e.target); };
$('stPowSel').onchange = e => { G.practicePower = +e.target.value; if (G.powerLock) G.player.power = G.practicePower; settle(e.target); };
$('skipChk').onchange = e => {
  G.skipStage = e.target.checked;
  try { localStorage.setItem('danmaku.skipStage', G.skipStage ? '1' : ''); } catch (err) { /* 저장 못 해도 진행 */ }
  settle(e.target);
};
try { G.skipStage = !!localStorage.getItem('danmaku.skipStage'); } catch (e) { G.skipStage = false; }
function setMode(mode) {
  document.body.dataset.mode = G.mode = mode;
  $('tabStage').setAttribute('aria-selected', mode === 'stage');
  $('tabRoom').setAttribute('aria-selected', mode === 'room');
  try { localStorage.setItem('danmaku.mode', mode); } catch (e) { /* 저장 못 해도 진행 */ }
  if (mode === 'stage') {
    // 스테이지 모드는 게임 속도를 1×로 되돌리고 본편부터(무적·파워 고정은 테스트 도구로 그대로 씀)
    G.speed = 1;
    G.startStory('main');
  } else G.startSingle(G.spellIndex);
  G.paused = false;
  syncPanel();
}
$('tabStage').onclick = e => { if (G.mode !== 'stage') setMode('stage'); settle(e.target); };
$('tabRoom').onclick = e => { if (G.mode !== 'room') setMode('room'); settle(e.target); };

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
G.spellIndex = G.roomOrder[0] ?? 0;
let savedMode = 'stage';
try { savedMode = localStorage.getItem('danmaku.mode') === 'room' ? 'room' : 'stage'; } catch (e) { /* 기본은 스테이지 모드 */ }
setMode(savedMode);
let last = performance.now(), audioBusy = false;
requestAnimationFrame(function tick(now) {
  G.frameTick(now - last); last = now;
  // 일시정지 동안은 소리(배경음악 포함)를 멈췄다가 풀면 그 자리부터 이어 감.
  // 일시정지 중 다른 키로 소리가 다시 켜져도 여기서 다시 멈춤
  const ctx = SFX.ctx;
  if (ctx && !audioBusy && ctx.state !== 'closed' && (ctx.state === 'running') === G.paused) {
    audioBusy = true;
    (G.paused ? ctx.suspend() : ctx.resume()).finally(() => { audioBusy = false; });
  }
  requestAnimationFrame(tick);
});
