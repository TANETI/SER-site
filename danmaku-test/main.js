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
  // 단일 패턴은 스테이지 순서로 묶고, 보스전에 쓰지 않는 시험 패턴은 맨 아래
  const STAGE_OF = { '윤도연': '1스테이지', '고현성': '1스테이지', '마리': '2스테이지', '마르코': '2스테이지', '김예나': '3스테이지-1', '차서린': '3스테이지-2', '고태웅': '3스테이지-3', '아즈라엘': '5스테이지', '예로니모': '6스테이지',
    '리크니스': '7스테이지', '예로니모(진심)': '엑스트라', '이즘': '엑스트라 2' };
  const order = ['윤도연', '고현성', '마리', '마르코', '김예나', '차서린', '고태웅', '아즈라엘', '예로니모', '리크니스', '예로니모(진심)', '이즘', ''];
  const groups = new Map([['도중', []], ...order.map(k => [k, []])]);
  SPELLS.forEach((sp, i) => {
    const key = sp.type === 'stage' && sp.bgm ? '도중' : sp.boss && groups.has(sp.boss) ? sp.boss : '';
    groups.get(key).push(new Option(`${i + 1}. ${sp.name}`, i));
  });
  for (const [key, opts] of groups) {
    if (!opts.length) continue;
    group(key === '도중' ? '도중 · 잡몹 구간 (본게임에서 보스 앞)' : key ? `${STAGE_OF[key]} · ${key}${key === '윤도연' || key === '마리' ? ' (중간 보스)' : key === '마르코' ? ' (합류 · 폭주)' : ''}` : '시험 패턴 (보스전에 쓰지 않음)').append(...opts);
  }
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
$('prevBtn').onclick = e => { G.startSingle(G.spellIndex - 1); syncPanel(); settle(e.target); };
$('nextBtn').onclick = e => { G.startSingle(G.spellIndex + 1); syncPanel(); settle(e.target); };

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
function setMode(mode) {
  document.body.dataset.mode = G.mode = mode;
  $('tabStage').setAttribute('aria-selected', mode === 'stage');
  $('tabRoom').setAttribute('aria-selected', mode === 'room');
  try { localStorage.setItem('danmaku.mode', mode); } catch (e) { /* 저장 못 해도 진행 */ }
  if (mode === 'stage') {
    // 스테이지 모드는 연습 도구 없이: 무적·파워 고정·속도를 되돌리고 본편부터
    G.invincible = false; G.powerLock = false; G.speed = 1;
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
G.spellIndex = 0;
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
