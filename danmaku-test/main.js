'use strict';

const $ = id => document.getElementById(id);
const G = new Game($('screen'));
const ORIGINAL = SPELLS.map(sp => spellSource(sp));
G.spells = SPELLS;

// ── 입력 ──
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight',
  'Escape', 'KeyR', 'KeyI', 'KeyM', 'KeyD', 'BracketLeft', 'BracketRight', 'Period', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Enter', 'KeyC']);
const typing = e => e.target instanceof HTMLTextAreaElement;
addEventListener('pointerdown', () => SFX.unlock());
addEventListener('keydown', e => {
  SFX.unlock();
  if (typing(e) || !GAME_KEYS.has(e.code)) return;
  e.preventDefault();
  if (!e.repeat || ['stageclear', 'title', 'gameover'].includes(G.phase)) G.pressed.add(e.code);
  G.keys.add(e.code);
});
addEventListener('keyup', e => G.keys.delete(e.code));
addEventListener('blur', () => G.keys.clear());
// 탭이 가려지면 자동 일시정지
document.addEventListener('visibilitychange', () => { if (document.hidden) G.paused = true; });

// 터치: 화면(또는 모바일 이동 패널)을 누른 채 끌면 끈 만큼 기체가 움직이고 자동 사격. 두 손가락으로 누르면 폭탄.
// 게임 화면에서는 1:1, 이동 패널에서는 1.3배(엄지를 조금만 움직여도 되게)
const cv = $('screen');
let touch = null;
function attachDrag(el, gain, types) {
  el.addEventListener('pointerdown', e => {
    if (!types.includes(e.pointerType)) return;
    e.preventDefault();
    if (touch && touch.id !== e.pointerId) { G.pressed.add('KeyX'); return; }
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    G.keys.add('KeyZ');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 못 해도 이동은 됨 */ }
  });
  el.addEventListener('pointermove', e => {
    if (!touch || e.pointerId !== touch.id) return;
    const k = (G.mobile ? W : 640) / cv.getBoundingClientRect().width * gain;
    G.player.x = Math.max(8, Math.min(W - 8, G.player.x + (e.clientX - touch.x) * k));
    G.player.y = Math.max(16, Math.min(H - 16, G.player.y + (e.clientY - touch.y) * k));
    touch.x = e.clientX; touch.y = e.clientY;
  });
  const end = e => { if (touch && e.pointerId === touch.id) { touch = null; G.keys.delete('KeyZ'); } };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.style.touchAction = 'none';
}
attachDrag(cv, 1, ['touch']);
// 마우스 조작(켜고 끌 수 있음): 게임 화면을 클릭하면 커서가 게임에 잠기고(창 밖으로 나가지 않음) 기체가 마우스를 움직인 만큼
// 그대로 움직임. 감도 1이면 커서가 화면에서 움직였을 거리와 같음. Shift(저속)를 누르면 감도 절반.
// 잠긴 동안 왼쪽 버튼은 사격, 오른쪽 버튼은 집중 사격(누르는 동안 Shift와 같음: 저속 + 사격), 가운데 버튼(휠 클릭)은 폭탄.
// Esc로 잠금이 풀리면 일시정지, 다시 클릭하면 이어서
const MOUSE_PRESETS = [['정밀', 0.5], ['보통', 1], ['빠름', 1.5], ['아주 빠름', 2]];
const locked = () => document.pointerLockElement === cv;
let pausedByLock = false;
cv.addEventListener('mousedown', e => {
  if (!G.mouseMode || G.mobile) return;
  SFX.unlock();
  // 잠긴 채로 스테이지 클리어가 되면 왼쪽 클릭으로도 다음 스테이지로
  if (G.phase === 'stageclear' && e.button === 0) { G.continueStage(); return; }
  if (!locked()) {
    // 잠그고 시작(시작·클리어 화면처럼 겹침 화면이 떠 있을 때는 잠그지 않음)
    if (overlay.hidden) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* 못 잠가도 진행 */ } }
    return;
  }
  if (e.button === 0) mouseBtn.left = true;
  if (e.button === 2) mouseBtn.right = true;
  if (e.button === 1) { e.preventDefault(); G.pressed.add('KeyX'); }
  syncMouseButtons();
});
addEventListener('mouseup', e => {
  if (e.button === 0) mouseBtn.left = false;
  if (e.button === 2) mouseBtn.right = false;
  syncMouseButtons();
});
// 마우스 버튼 → 사격(Z)·저속(Shift). 키보드로 누른 것과 겹치지 않게 마우스가 켠 것만 끔
const mouseBtn = { left: false, right: false, z: false, shift: false };
function syncMouseButtons() {
  const z = locked() && (mouseBtn.left || mouseBtn.right), sh = locked() && mouseBtn.right;
  if (z !== mouseBtn.z) { if (z) G.keys.add('KeyZ'); else G.keys.delete('KeyZ'); mouseBtn.z = z; }
  if (sh !== mouseBtn.shift) { if (sh) G.keys.add('ShiftLeft'); else G.keys.delete('ShiftLeft'); mouseBtn.shift = sh; }
}
document.addEventListener('mousemove', e => {
  if (!locked()) return;
  const k = (G.mobile ? W : 640) / cv.getBoundingClientRect().width * G.mouseSens * (G.keys.has('ShiftLeft') || G.keys.has('ShiftRight') ? 0.5 : 1);
  const p = G.player;
  if (!p || G.phase === 'title') return;
  p.x = Math.max(8, Math.min(W - 8, p.x + e.movementX * k));
  p.y = Math.max(16, Math.min(H - 16, p.y + e.movementY * k));
});
document.addEventListener('pointerlockchange', () => {
  if (locked()) { if (pausedByLock) { G.paused = false; pausedByLock = false; } }
  else { mouseBtn.left = mouseBtn.right = false; syncMouseButtons(); if (!G.paused && ['active', 'intro'].includes(G.phase)) { G.paused = true; pausedByLock = true; } }
  syncMouseHint();
});
cv.addEventListener('contextmenu', e => e.preventDefault());
function syncMouseHint() {
  $('mouseHint').hidden = !(G.mouseMode && !G.mobile && !locked() && overlay.hidden);
}
function setMouseSens(v) {
  G.mouseSens = Math.max(0.25, Math.min(3, v));
  $('sensRange').value = G.mouseSens; $('sensVal').textContent = G.mouseSens.toFixed(2) + '×';
  for (const b of $('sensPresets').children) b.setAttribute('aria-pressed', Math.abs(+b.dataset.v - G.mouseSens) < 0.001);
  try { localStorage.setItem('danmaku.mouseSens', String(G.mouseSens)); } catch (err) { /* 저장 못 해도 진행 */ }
}
for (const [name, v] of MOUSE_PRESETS) {
  const b = document.createElement('button'); b.textContent = `${name} ${v}`; b.dataset.v = v;
  b.onclick = () => { setMouseSens(v); b.blur(); };
  $('sensPresets').append(b);
}
$('sensRange').oninput = e => setMouseSens(+e.target.value);
$('sensRange').onchange = e => e.target.blur();
$('mouseChk').onchange = e => {
  G.mouseMode = e.target.checked;
  if (!G.mouseMode && locked()) document.exitPointerLock();
  try { localStorage.setItem('danmaku.mouse', G.mouseMode ? '1' : ''); } catch (err) { /* 저장 못 해도 진행 */ }
  syncMouseHint(); e.target.blur();
};
try { G.mouseMode = localStorage.getItem('danmaku.mouse') !== ''; } catch (err) { G.mouseMode = true; }
{ let v = 1; try { v = +(localStorage.getItem('danmaku.mouseSens') || 1); } catch (err) { /* 기본 1 */ } setMouseSens(v || 1); }
$('mouseChk').checked = G.mouseMode;
attachDrag($('pad'), 1.3, ['touch', 'pen', 'mouse']);
// 모바일 이동 패널의 버튼: 폭탄, 저속(누를 때마다 켜고 끔)
$('bombBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); SFX.unlock(); G.pressed.add('KeyX'); });
$('slowBtn').addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  const on = !G.keys.has('ShiftLeft');
  if (on) G.keys.add('ShiftLeft'); else G.keys.delete('ShiftLeft');
  $('slowBtn').setAttribute('aria-pressed', on);
});
// 모바일: 좁은 화면이면 캔버스에 플레이 영역만(정보는 위쪽 얇은 줄), 설정은 오른쪽 위 ☰ 버튼으로 여는 패널
const narrow = matchMedia('(max-width: 760px)');
function applyLayout() {
  G.mobile = narrow.matches;
  cv.width = G.mobile ? W * SC : 1280; cv.height = G.mobile ? (H + MH) * SC : 960;
  document.body.classList.toggle('mobile', G.mobile);
  if (!G.mobile) setMenu(false);
}
let pausedByMenu = false;
function setMenu(open) {
  document.body.classList.toggle('menu-open', open);
  $('menuBtn').setAttribute('aria-expanded', open);
  if (open && !G.paused) { G.paused = true; pausedByMenu = true; }
  if (!open && pausedByMenu) { G.paused = false; pausedByMenu = false; }
}
$('menuBtn').onclick = e => { setMenu(!document.body.classList.contains('menu-open')); e.target.blur(); };
$('menuClose').onclick = () => setMenu(false);
narrow.addEventListener('change', applyLayout);
applyLayout();

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
  $('autoChk').checked = !!G.autoFire;
  try { localStorage.setItem('danmaku.autofire', G.autoFire ? '1' : ''); } catch (e) { /* 저장 못 해도 진행 */ }
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
// 난수 시드(개발용 재현): 칸 또는 주소 ?seed=숫자. 비우면 무작위
function setSeed(v) {
  const n = String(v ?? '').trim() === '' ? null : parseInt(v, 10);
  G.fixedSeed = Number.isFinite(n) ? n >>> 0 : null;
  $('seedIn').value = G.fixedSeed ?? '';
}
{ const q = new URLSearchParams(location.search).get('seed'); if (q !== null) setSeed(q); }
// 주소 ?perf=1: 필드 아래에 FPS·처리·그리기 시간·탄 수(모바일 성능 확인용)
G.perfHud = new URLSearchParams(location.search).has('perf');
$('seedIn').onchange = e => { setSeed(e.target.value); G.restart(); settle(e.target); };
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
$('autoChk').onchange = e => { G.autoFire = e.target.checked; syncPanel(); settle(e.target); };
try { G.autoFire = !!localStorage.getItem('danmaku.autofire'); } catch (e) { G.autoFire = false; }
$('shakeChk').onchange = e => { G.shakeOn = e.target.checked; if (!G.shakeOn) G.shakeMag = 0; settle(e.target); };
$('editor').addEventListener('toggle', () => { if ($('editor').open) $('code').value = spellSource(G.spell); });
$('prevBtn').onclick = e => { G.stepSingle(-1); syncPanel(); settle(e.target); };
$('nextBtn').onclick = e => { G.stepSingle(1); syncPanel(); settle(e.target); };

// ── 모드: 스테이지 모드(본게임만, 연습 도구 없음) / 패턴 테스트 룸(패턴·보스 하나씩, 연습 도구) ──
const STORY_INFO = { main: '1스테이지부터 · 8보스', extra: '진심 예로니모', extra2: '이즘', extra3: '티폰' };
const STORY_LOCK = { extra: '본편을 깨면 열림', extra2: '엑스트라를 깨면 열림', extra3: '엑스트라 2를 깨면 열림' };
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
  $('ironChk').disabled = G.difficulty < 2; if (G.difficulty < 2) $('ironChk').checked = false;
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
for (const b of $('starts').children) b.onclick = () => { overlay.hidden = true; G.startStory(b.dataset.story, $('ironChk').checked); syncPanel(); settle(b); };
$('ironChk').onchange = e => { title.iron = e.target.checked; if (G.phase === 'title') showTitle(); settle(e.target); };
$('stageRestart').onclick = e => { G.restart(); settle(e.target); };
// 테스트 도구: 본편 스테이지로 바로 가기
$('jumpSel').add(new Option('스테이지 고르기…', ''));
STORY.main.forEach((name, i) => { const r = BOSS_RUNS.find(x => x.name === name); if (r) $('jumpSel').add(new Option(r.title, i)); });
$('jumpSel').onchange = e => { const v = e.target.value; e.target.value = ''; if (v === '') return; overlay.hidden = true; G.jumpStage(+v); syncPanel(); settle(e.target); };
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
    // 스테이지 모드는 게임 속도를 1×로 되돌리고 시작 화면부터(무적·파워 고정은 테스트 도구로 그대로 씀)
    G.speed = 1;
    G.toTitle();
  } else G.startSingle(G.spellIndex);
  G.paused = false;
  syncPanel();
}
$('tabStage').onclick = e => { if (G.mode !== 'stage') setMode('stage'); settle(e.target); };
$('tabRoom').onclick = e => { if (G.mode !== 'room') setMode('room'); settle(e.target); };

// ── 스테이지 클리어·최종 채점 화면(게임 화면 위에 겹침) ──
// 가짜 순위표(시험판 연출). 점수는 적지 않고 기록에서 계산함: 클리어 판은 본게임 채점식(finalScore), 탈락 판은 failScore.
// 1등 이즘(헬 만점), 2등 김예나(헬 만점에서 15% 감점 + 183에 가장 가까운 기록), 그 아래 피트·시연,
// 마리(노말 4스테이지에서 탈락), 정나은(이지 3스테이지에서 탈락), 고태웅(베리하드 1스테이지에서 탈락).
// cleared: 탈락 전까지 깬 스테이지 수(본편 순서: 1, 2, 3-1, 3-2, 4, 5, 6, 7)
const BOARD = [
  { n: '이즘', diff: 4, miss: 0, bombs: 0, cont: 0, sec: 22 * 60 + 48, iron: true },
  { n: '김예나', diff: 4, miss: 4, bombs: 0, cont: 0, sec: 38 * 60 + 23 },
  { n: '피트', diff: 3, miss: 1, bombs: 0, cont: 0, sec: 31 * 60 },
  { n: '시연', diff: 2, miss: 2, bombs: 1, cont: 0, sec: 27 * 60 + 30 },
  { n: '마리', diff: 1, miss: 4, bombs: 7, cont: 0, sec: 18 * 60 + 42, fail: '4스테이지', cleared: 4 },
  { n: '정나은', diff: 0, miss: 4, bombs: 6, cont: 0, sec: 11 * 60 + 37, fail: '3스테이지', cleared: 2 },
  { n: '고태웅', diff: 3, miss: 3, bombs: 2, cont: 0, sec: 4 * 60 + 9, fail: '1스테이지', cleared: 0 },
].map(r => ({ ...r, v: r.fail ? failScore(r) : finalScore({ diff: r.diff, frames: r.sec * 60, miss: r.miss, bombs: r.bombs, continues: r.cont, iron: r.iron, list: { length: 8 } }).score }));
const recText = r => `${r.fail ? `FAIL(${r.fail})` : 'CLEAR'} / 미스 ${r.miss} / 봄 ${r.bombs} / ${Math.floor(r.sec / 60)}:${String(Math.floor(r.sec % 60)).padStart(2, '0')}`;
const overlay = $('overlay');
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = sec => `${Math.floor(sec / 60)}분 ${String(Math.floor(sec % 60)).padStart(2, '0')}초`;
function showOverlay(html, onBtn) {
  // 마우스 조작으로 커서가 잠겨 있으면 버튼을 누를 수 없으므로 풀어 줌
  if (document.pointerLockElement) document.exitPointerLock();
  overlay.innerHTML = html; overlay.hidden = false;
  for (const b of overlay.querySelectorAll('button[data-act]')) {
    let done = false;
    const go = e => { if (done || b.disabled) return; done = true; e.preventDefault(); onBtn(b.dataset.act); settle(b); };
    b.addEventListener('pointerdown', e => { if (e.button === 0) go(e); });
    b.addEventListener('click', go);
  }
}
G.onStageClear = (cur, next) => showOverlay(
  `<h3>${esc(cur.title.split(' · ')[0])} 클리어!</h3><div class="sub">다음: ${esc(next.title)}</div>` +
  `<button class="primary" data-act="next">다음 스테이지로 ▶ <small>(Z)</small></button>`,
  () => { overlay.hidden = true; G.continueStage(); });
G.onStoryClear = res => {
  const key = G.story && G.story.key;
  const MODE_NAME = { main: '본편', extra: '엑스트라', extra2: '엑스트라 2', extra3: '엑스트라 3' };
  const title = res.fail ? `탈락 · ${res.stage}` : `${MODE_NAME[key]} 클리어!`;
  // 테스트 도구를 쓴 판: 다음 모드를 열지 않고 순위표에도 올리지 않음(점수는 참고로만 보여 줌)
  const nextKey = res.fail || res.tools ? null : UNLOCK_NEXT[key];
  // 탈락 판은 탈락 점수 항목으로 보여 줌
  const parts = res.fail
    ? [['기본', 5000], [`진행도 (${res.cleared}/${res.total} 스테이지)`, Math.round(28500 * res.cleared / res.total)], ['미스', -300 * res.miss], ['폭탄', -150 * res.bombs]]
    : res.parts;
  const me = { n: '나', v: res.score, me: true, iron: !!(G.story && G.story.iron), diff: res.diff, miss: res.miss, bombs: res.bombs, cont: res.continues, sec: res.sec, fail: res.fail ? res.stage : undefined };
  const board = (res.tools ? BOARD : BOARD.concat(me)).sort((a, b) => b.v - a.v || (a.me ? 1 : -1));
  showOverlay(
    `<h3>${title}</h3>` +
    `<div class="sub">${DIFFS[res.diff]} · 플레이 시간 ${mmss(res.sec)}${res.fail ? '' : ` (기준 ${mmss(res.target)})`} · 미스 ${res.miss} · 폭탄 ${res.bombs} · 컨티뉴 ${res.continues}</div>` +
    `<table class="parts">${parts.filter(([, v]) => v).map(([k, v]) => `<tr><td>${k}</td><td>${v > 0 ? '+' : ''}${v.toLocaleString()}</td></tr>`).join('')}` +
    `<tr><td>난이도 배율</td><td>×${SCORE_DIFF[res.diff]}</td></tr>${res.iron ? `<tr><td>철인 모드</td><td>+${res.iron.toLocaleString()}</td></tr>` : ''}</table>` +
    `<div class="big">${res.score.toLocaleString()}점</div>` +
    (res.tools ? `<div class="note">테스트 도구(무적·파워 고정·건너뛰기·스테이지 바로 가기·게임 속도)를 쓴 판이라 정식 기록이 아니에요 · 순위표와 해금에서 빠짐</div>` : '') +
    `<table class="board">${board.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}위</td><td>${esc(r.n)}</td><td class="rec">${DIFFS[r.diff]}${r.iron ? '·철인' : ''}</td><td class="rec">${recText(r)}</td><td>${r.v.toLocaleString()}</td></tr>`).join('')}</table>` +
    (nextKey ? `<div class="sub">${MODE_NAME[nextKey]}${nextKey === 'extra3' ? '이' : '가'} 열렸습니다</div>` : '') +
    `<div class="row"><button class="primary" data-act="again">다시 도전</button><button data-act="title">시작 화면으로</button></div>`,
    act => { const iron = !!(G.story && G.story.iron); overlay.hidden = true; if (act === 'title') G.toTitle(); else G.startStory(key, iron); syncPanel(); });
};
// 본게임 게임 오버: 컨티뉴 카운트다운(10초). Z·Enter·R 또는 버튼으로 이어 하기
let contShown = false;
function syncContinue() {
  const on = G.phase === 'gameover' && G.story;
  if (!on) { contShown = false; return; }
  const st = G.story, sec = Math.ceil(G.phaseT / 60);
  if (!contShown) {
    contShown = true;
    showOverlay(st.contLeft > 0
      ? `<h3 style="color:#ff6b7a">게임 오버</h3><div class="sub">컨티뉴? 이 스테이지 처음부터 (점수는 0부터)</div><div class="big" id="contSec"></div>` +
        `<div class="sub">남은 컨티뉴 <b>${st.contLeft}</b> / ${MAX_CONTINUES} · 보스 ${CONTINUE_EVERY}명마다 1 보충</div><button class="primary" data-act="cont">컨티뉴 <small>(Z)</small></button>`
      : `<h3 style="color:#ff6b7a">게임 오버</h3><div class="sub">남은 컨티뉴가 없습니다</div>`,
      () => G.useContinue());
  }
  const el = document.getElementById('contSec'); if (el) el.textContent = String(Math.max(0, sec));
}

// ── 시작 화면(스테이지 모드 첫 화면): 모드·기체·난이도·철인 모드를 고르고 시작 ──
const ANGEL_DESC = { AR: '곧은 바늘 다발 + 유도 레이저', UR: '넓게 퍼지는 가시, 가까울수록 셈', LM: '느린 바늘, 유도탄 비중이 큼', RH: '바늘 + 옵션 둘의 관통 별' };
const title = { key: 'main', iron: false };
function showTitle() {
  if (!unlocked(title.key)) title.key = 'main';
  if (G.difficulty < 2) title.iron = false;
  const modes = [['main', '본편'], ['extra', '엑스트라'], ['extra2', '엑스트라 2'], ['extra3', '엑스트라 3']];
  showOverlay(
    '<h3>탄막 테스트</h3><div class="sub">스테이지 모드 · Z 또는 Enter로 시작</div>' +
    '<div class="tsec"><div class="tlabel">모드</div><div class="seg">' + modes.map(([k, n]) => `<button data-act="mode:${k}" aria-pressed="${title.key === k}" ${unlocked(k) ? '' : 'disabled'}>${n}${unlocked(k) ? '' : ' (잠김)'}</button>`).join('') + '</div></div>' +
    '<div class="tsec"><div class="tlabel">기체</div><div class="angels">' + Object.entries(ANGELS).map(([c, a]) => `<button data-act="angel:${c}" aria-pressed="${G.angel === c}"><img src="${IMG_BASE}${c}/D/01.webp" alt="" loading="lazy"><b>${a.name}</b><small>${ANGEL_DESC[c]}</small></button>`).join('') + '</div></div>' +
    '<div class="tsec"><div class="tlabel">난이도</div><div class="seg">' + DIFFS.map((d, i) => `<button data-act="diff:${i}" aria-pressed="${G.difficulty === i}">${d}</button>`).join('') + '</div></div>' +
    `<label class="check tiron"><input type="checkbox" id="tIron" ${title.iron ? 'checked' : ''} ${G.difficulty < 2 ? 'disabled' : ''}> 철인 모드 <small>${G.difficulty < 2 ? '하드부터 고를 수 있음' : `컨티뉴 없음 · 클리어하면 +${IRON_BONUS.toLocaleString()}점`}</small></label>` +
    '<div class="ttip">폭탄(X)은 아끼지 마세요. 죽으면 폭탄이 다시 3개로 채워집니다.</div>' +
    '<button class="primary tstart" data-act="start">시작 ▶</button>',
    act => {
      const [k, v] = act.split(':');
      if (k === 'mode') title.key = v;
      else if (k === 'angel') G.angel = v;
      else if (k === 'diff') G.difficulty = +v;
      else if (k === 'start') return startFromTitle();
      syncPanel(); showTitle();
    });
  const iron = document.getElementById('tIron');
  if (iron) iron.onchange = () => { title.iron = iron.checked; $('ironChk').checked = iron.checked; };
}
function startFromTitle() { overlay.hidden = true; G.startStory(title.key, title.iron); syncPanel(); }
G.onTitle = showTitle;
G.onTitleStart = startFromTitle;

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
  syncContinue();
  if (G.seedUsed !== undefined && G.fixedSeed == null) { const ph = `무작위 (지금 ${G.seedUsed})`; if ($('seedIn').placeholder !== ph) $('seedIn').placeholder = ph; }
  // 연습 파워 옆에 지금 실제로 적용 중인 파워(보스전은 그 보스전 기준값으로 시작하므로 고른 값과 다를 수 있음)
  if (G.player && G.player.power !== undefined) { const t = `지금 ${G.player.power.toFixed(2)}${G.powerLock ? ' 고정' : ''}`; if ($('powNow').textContent !== t) $('powNow').textContent = t; }
  syncMouseHint();
  if (!overlay.hidden && !['stageclear', 'storyclear', 'storyfail', 'gameover', 'title'].includes(G.phase)) overlay.hidden = true;
  // 일시정지 동안은 소리(배경음악 포함)를 멈췄다가 풀면 그 자리부터 이어 감.
  // 일시정지 중 다른 키로 소리가 다시 켜져도 여기서 다시 멈춤
  const ctx = SFX.ctx;
  if (ctx && !audioBusy && ctx.state !== 'closed' && (ctx.state === 'running') === G.paused) {
    audioBusy = true;
    (G.paused ? ctx.suspend() : ctx.resume()).finally(() => { audioBusy = false; });
  }
  requestAnimationFrame(tick);
});
