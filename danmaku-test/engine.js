'use strict';
// 탄막 테스트 엔진. 좌표는 플레이 영역(384×448) 기준이며 60틱 고정.

const TAU = Math.PI * 2;
const W = 384, H = 448;          // 플레이 영역
const FX = 32, FY = 16;          // 화면(640×480) 안 플레이 영역 위치
const SC = 2;                    // 캔버스 내부 배율
const HIT_R = 2.4, GRAZE_R = 18;
const START_LIVES = 3, START_BOMBS = 3;
// 파워 0.00~4.00. 정수 부분이 탄 단계. 작은 P +0.02, 큰 P +0.25, 죽으면 -0.5
const MAX_POWER = 4, P_SMALL = 0.02, P_BIG = 0.25, DEATH_POWER_LOSS = 0.5;
// 난이도별 보스 체력 배율. 엑스트라는 한 단계 위(4번째 값=엑스트라 하드)
const HP_MUL = [0.6, 0.8, 1, 1.15];
// 난이도: 0=이지, 1=노말, 2=하드(잠정 최고). 패턴은 s.lv·s.cnt·s.wait·s.sp로 난이도를 반영한다
const DIFFS = ['이지', '노말', '하드(잠정 최고)'];
// 엑스트라 패턴(extra: true)은 고른 난이도보다 한 단계 위로 계산한다. 4번째 값은 하드 위(엑스트라 하드)
const DENSITY = [0.45, 0.7, 1, 1.2], INTERVAL = [1.8, 1.35, 1, 0.88], SPEED = [0.75, 0.88, 1, 1.06];

// ── 탄 스프라이트 ──────────────────────────────────────────
const COLORS = {
  ivy: '#3fae5a', red: '#ff3b4a', orange: '#ff8a2a', yellow: '#ffd23a', green: '#3ddc6a', cyan: '#35d6ff',
  blue: '#3a6bff', purple: '#a64dff', pink: '#ff5ec8', white: '#e8e8f4', gold: '#f5c542',
  brown: '#9a5420', black: '#30303c',
};

// r=판정 반지름, size=그리기 크기, oriented=진행 방향으로 회전
const SHAPES = {
  small:  { r: 3,   size: 12, draw: (g, c) => orb(g, 6, 6, 5, c) },
  orb:    { r: 6,   size: 22, draw: (g, c) => orb(g, 11, 11, 10, c) },
  big:    { r: 13,  size: 40, draw: (g, c) => orb(g, 20, 20, 18, c) },
  rice:   { r: 2.6, size: 16, oriented: true, draw: (g, c) => ellipse(g, 8, 8, 7, 3.6, c) },
  knife:  { r: 2.6, size: 20, oriented: true, draw: (g, c) => knife(g, c) },
  star:   { r: 4,   size: 16, spin: true, draw: (g, c) => star(g, 8, 8, 7, c) },
  link:   { r: 3,   size: 14, oriented: true, draw: (g, c) => chainLink(g, c) },
  leaf:   { r: 3,   size: 16, oriented: true, draw: (g, c) => leafShape(g, c) },
};

function orb(g, x, y, r, c) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#fff'); gr.addColorStop(0.62, c); gr.addColorStop(1, c + '00');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function ellipse(g, x, y, rx, ry, c) {
  g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, rx * 0.6, ry * 0.45, 0, 0, TAU); g.fill();
}
function knife(g, c) {
  g.fillStyle = c; g.beginPath(); g.moveTo(19, 10); g.lineTo(4, 6); g.lineTo(1, 10); g.lineTo(4, 14); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(16, 10); g.lineTo(5, 8.5); g.lineTo(5, 11.5); g.closePath(); g.fill();
}
function star(g, x, y, r, c) {
  g.fillStyle = c; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r * 0.3, 0, TAU); g.fill();
}
function leafShape(g, c) {
  g.fillStyle = c; g.beginPath(); g.moveTo(15, 8); g.quadraticCurveTo(8, 1, 1, 8); g.quadraticCurveTo(8, 15, 15, 8); g.fill();
  g.strokeStyle = '#eaffea'; g.lineWidth = 1; g.beginPath(); g.moveTo(14, 8); g.lineTo(3, 8); g.stroke();
}
function chainLink(g, c) {
  g.strokeStyle = c; g.lineWidth = 2.4; g.beginPath(); g.ellipse(7, 7, 6, 3.4, 0, 0, TAU); g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.ellipse(7, 7, 6, 3.4, 0, 0, TAU); g.stroke();
}

const spriteCache = new Map();
function sprite(shape, color) {
  const key = shape + '|' + color;
  let s = spriteCache.get(key);
  if (!s) {
    const def = SHAPES[shape] || SHAPES.small;
    s = document.createElement('canvas');
    s.width = s.height = def.size * SC;
    const g = s.getContext('2d'); g.scale(SC, SC);
    def.draw(g, COLORS[color] || color);
    spriteCache.set(key, s);
  }
  return s;
}

// ── 코루틴 ────────────────────────────────────────────────
// 제너레이터가 yield n 하면 n프레임 뒤에 재개됨.
class Tasks {
  constructor(onError) { this.list = []; this.onError = onError; }
  add(gen, owner) { this.list.push({ gen, wait: 0, owner }); return gen; }
  step() {
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      if (t.done) continue;
      if (t.owner && t.owner.dead) { t.done = true; continue; }
      if (t.wait > 0) { t.wait--; continue; }
      try {
        const r = t.gen.next();
        if (r.done) t.done = true; else t.wait = Math.max(0, (r.value ?? 1) - 1);
      } catch (e) { t.done = true; this.onError(e); }
    }
    this.list = this.list.filter(t => !t.done);
  }
  clear() { this.list = []; }
}

// ── 기체 ──────────────────────────────────────────────────
// 외형 색은 갤러리 원화 기준. 사격 성능은 권능 확정 전 임시값.
const ANGELS = {
  AR: { name: '아리엘', hair: '#eadcaa', wing: '#f2f4ff', halo: '#f5c542', accent: '#3a6bff', dress: '#f7f7ff', shot: 'gold' },
  UR: { name: '유리엘', hair: '#e6e6ee', wing: '#15151c', halo: '#ff3048', accent: '#ff3048', dress: '#26262e', shot: 'red' },
  LM: { name: '루미엘', hair: '#ff9cc0', wing: '#e6e2ff', halo: '#b48cff', accent: '#a64dff', dress: '#f7f7ff', shot: 'purple' },
  RH: { name: '라티엘', hair: '#14141e', wing: '#18224e', halo: '#5b7cff', accent: '#4f7bff', dress: '#eef1ff', shot: 'blue' },
};

// 자기 탄 모양. 진행 방향으로 회전해서 그린다. w·h=그리기 크기
const SHOT_SHAPES = {
  needle: { w: 24, h: 6, draw(g, c) { capsule(g, 12, 3, 11, 2.6, c); } },
  lance:  { w: 36, h: 10, draw(g, c) { capsule(g, 18, 5, 17, 4.4, c); } },
  thorn:  { w: 16, h: 10, draw(g, c) {
    g.fillStyle = c; g.beginPath(); g.moveTo(16, 5); g.lineTo(2, 0.5); g.lineTo(5, 5); g.lineTo(2, 9.5); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(13, 5); g.lineTo(5, 3.8); g.lineTo(5, 6.2); g.closePath(); g.fill();
  } },
  amulet: { w: 14, h: 10, draw(g, c) {
    g.fillStyle = c; g.beginPath(); g.moveTo(14, 5); g.lineTo(7, 0); g.lineTo(0, 5); g.lineTo(7, 10); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(7, 5, 1.8, 0, TAU); g.fill();
  } },
  star:   { w: 14, h: 14, spin: true, draw(g, c) { star(g, 7, 7, 6.5, c); } },
};
function capsule(g, x, y, rx, ry, c) {
  const gr = g.createLinearGradient(0, y - ry, 0, y + ry);
  gr.addColorStop(0, c + '00'); gr.addColorStop(0.3, c); gr.addColorStop(0.5, '#fff'); gr.addColorStop(0.7, c); gr.addColorStop(1, c + '00');
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
}
function shotSprite(shape, color) {
  const key = 'shot|' + shape + '|' + color;
  let s = spriteCache.get(key);
  if (!s) {
    const def = SHOT_SHAPES[shape];
    s = document.createElement('canvas');
    s.width = def.w * SC; s.height = def.h * SC;
    const g = s.getContext('2d'); g.scale(SC, SC);
    def.draw(g, COLORS[color] || color);
    spriteCache.set(key, s);
  }
  return s;
}

// 탄 한 발: {x,y,vx,vy,dmg,shape,color,homing,turn,life,laser}
// 파워 단계 L(0~4)에 따라 구성이 바뀐다. 괄호 안은 정지 표적에 붙어 쏠 때 최대 파워 기준 초당 피해량
function shot(out, x, y, a, spd, dmg, shape, color, extra) {
  out.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg, shape, color, ...extra });
}
const UP = -Math.PI / 2;
// 파워 단계별 표: [0, 1, 2, 3, 4]. 탄 줄 수·발사 간격(틱)·한 발 대미지가 함께 오른다.
// 낮은 파워는 적은 줄을 느리게 쏘는 대신 한 발이 조금 더 아프다.
const SHOT_TYPES = {
  // 아리엘: 바늘 1→3줄, 파워 2부터 가끔 적을 따라 휘는 유도 레이저(4에서 두 줄)
  // 초당 피해량 약 50 / 80 / 140 / 150 / 180
  AR(p, out, focus, L) {
    const t = p.fireT, n = [1, 2, 3, 3, 3][L], iv = [6, 5, 4, 3, 3][L], dmg = [5, 3.4, 3, 2.3, 2.5][L];
    if (t % iv === 0) {
      const gapX = focus ? 5 : 10, spread = focus ? 0 : 0.06;
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        shot(out, p.x + k * gapX, p.y - 10, UP + k * spread, 18, dmg, 'needle', 'gold');
      }
    }
    const every = [0, 0, 120, 90, 60][L];
    if (every && t % every === 0) {
      for (const k of L >= 4 ? [-1, 1] : [0]) shot(out, p.x + k * 8, p.y - 12, UP + k * 0.5, 11, 14, 'needle', 'white', { homing: true, turn: 0.18, laser: true, trail: [], life: 120 });
    }
  },
  // 유리엘: 하이리스크 하이리턴. 유도 없음, 사거리 약 230px. 가시 2→7개, 간격 5→2틱
  // 붙어서 쏠 때 초당 피해량 약 75 / 115 / 165 / 225 / 260
  UR(p, out, focus, L) {
    const n = [2, 3, 4, 5, 7][L], iv = [5, 4, 3, 2, 2][L], dmg = [3.2, 2.6, 2.1, 1.5, 1.25][L] * (focus ? 1 : 0.88);
    if (p.fireT % iv) return;
    const gap = focus ? 0.045 : 0.12, wob = focus ? 0.015 : 0.05;
    for (let i = 0; i < n; i++) {
      const a = UP + (i - (n - 1) / 2) * gap + (Math.random() * 2 - 1) * wob;
      shot(out, p.x, p.y - 6, a, 14, dmg, 'thorn', 'red', { life: 16 + (Math.random() * 3 | 0) });
    }
  },
  // 루미엘(중립 선): 정면 바늘 1→2줄 + 파워 1부터 빗나가지 않는 유도 부적(2→4장).
  // 부적은 조금 날아간 뒤 닿은 작은 적탄 하나를 지우고 함께 사라짐. 전체로 초당 2개까지만.
  // 초당 피해량 약 40 / 85 / 95 / 130 / 150
  LM(p, out, focus, L) {
    const t = p.fireT, nN = [1, 2, 2, 2, 2][L], ivN = [6, 4, 3, 3, 3][L], dN = [4, 2, 1.6, 1.6, 1.6][L];
    if (t % ivN === 0) for (let i = 0; i < nN; i++) shot(out, p.x + (nN > 1 ? (i ? 4 : -4) : 0), p.y - 10, UP, 16, dN, 'needle', 'pink');
    const ks = [[], [-1, 1], [-1, 1], [-1, -0.4, 0.4, 1], [-1, -0.4, 0.4, 1]][L], ivA = [0, 9, 7, 7, 5][L];
    if (ks.length && t % ivA === 0) {
      const spreadA = focus ? 0.35 : 0.9;
      for (const k of ks) shot(out, p.x + k * 10, p.y, UP + k * spreadA, 8, focus ? 1.9 : 1.7, 'amulet', 'purple', { homing: true, turn: focus ? 0.25 : 0.14, life: 90, erase: 1 });
    }
  },
  // 라티엘(진 중립): 가운데 바늘 1→3줄 + 파워 2부터 옵션 둘의 별탄(4에서 겹별). 고속은 넓게, 저속은 옵션이 앞으로 모임.
  // 별탄은 잡몹을 꿰뚫고 지나가 여러 마리를 고르게 맞힘(보스에게는 한 번 맞고 사라짐)
  // 초당 피해량 약 50 / 80 / 145 / 175 / 190
  RH(p, out, focus, L) {
    const n = [1, 2, 3, 3, 3][L], iv = [6, 5, 4, 3, 3][L], dmg = [5, 3.4, 2.4, 1.7, 1.7][L];
    if (p.fireT % iv) return;
    for (let i = 0; i < n; i++) shot(out, p.x + (i - (n - 1) / 2) * 5, p.y - 10, UP, 16, dmg, 'needle', 'cyan');
    for (const o of p.options) {
      const a = UP + (focus ? 0 : Math.sign(o.x - p.x) * 0.12);
      if (L >= 4) for (const d of [-3, 3]) shot(out, o.x + d, o.y - 4, a, 13, 1.1, 'star', 'blue', { pierce: [] });
      else shot(out, o.x, o.y - 4, a, 13, L >= 3 ? 1.8 : 1.2, 'star', 'blue', { pierce: [] });
    }
  },
};

// ── 게임 본체 ─────────────────────────────────────────────
class Game {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.keys = new Set(); this.pressed = new Set();
    this.speed = 1; this.invincible = false; this.difficulty = 1; this.practicePower = 0;   // 단일 패턴 연습도 기본은 파워 0(패널에서 올림) this.loop = true; this.paused = false;
    this.spells = []; this.spellIndex = 0;
    this.angel = 'AR';
    this.error = '';
    this.tasks = new Tasks(e => this.fail(e));
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    this.score = 0; this.graze = 0;
    this.bgT = 0;
    this.api = makeAPI(this);
  }

  // 실제로 쓰는 난이도. 엑스트라 패턴은 한 단계 위(최대 3)
  effDiff() { return Math.min(3, this.difficulty + (this.spell && this.spell.extra ? 1 : 0)); }

  fail(e) { console.error(e); this.error = String(e && e.message || e); }

  // ── 패턴 수명주기 ──
  // 단일 패턴 연습: 목숨·폭탄을 채우고 시작
  startSingle(i = this.spellIndex) { this.run = null; this.resetLives(this.practicePower); this.start(i); }
  // 보스전: 여러 패턴을 이어서, 목숨·폭탄을 이어 가며 진행
  startRun(run) {
    this.run = { ...run, idx: 0 };
    this.resetLives(run.power ?? 0);
    this.start(this.spells.indexOf(run.seq[0]));
  }
  restart() { this.run ? this.startRun(this.run) : this.startSingle(); }
  resetLives(power = 0) {
    this.player = this.player || {};
    this.player.lives = START_LIVES; this.player.bombs = START_BOMBS; this.player.power = power;
    this.items = [];
  }

  start(i = this.spellIndex) {
    this.spellIndex = (i + this.spells.length) % this.spells.length;
    const sp = this.spell = this.spells[this.spellIndex];
    this.bullets = []; this.lasers = []; this.enemies = []; this.shots = []; this.fx = [];
    this.partners = []; this.chants = []; this.zones = []; this.areas = []; this.slow = null;
    this.items = this.items || [];
    this.tasks.clear(); this.error = '';
    this.player = this.player || {};
    const cont = this.run && this.run.idx > 0, prev = this.boss;
    if (!cont) Object.assign(this.player, { x: W / 2, y: H - 48, options: [] });
    Object.assign(this.player, { inv: 60, fireT: 0, bomb: null, flash: 0, stun: 0 });
    this.stats = { miss: 0, hits: 0, bombs: 0, dmgLog: new Array(60).fill(0), dmgNow: 0 };
    const hp = sp.hp >= 99999 ? sp.hp : Math.max(1, Math.round((sp.hp || 1000) * HP_MUL[this.effDiff()]));
    const b = this.boss = { x: W / 2, y: -40, hp, maxHp: hp, move: null, hidden: sp.type === 'stage', t: 0,
      name: sp.boss || '', color: sp.bossColor || '#d8d0ff', shield: 0, glow: 0, contact: false };
    if (cont && prev && !prev.hidden) { b.x = prev.x; b.y = prev.y; }
    this.moveBoss(sp.start?.[0] ?? W / 2, sp.start?.[1] ?? 110, 45);
    this.frame = 0; this.phase = 'intro'; this.phaseT = cont ? 100 : 70;
    this.timer = (sp.time || 30) * 60;
    this.banner = sp.type === 'spell' ? { text: sp.name, t: 0 } : null;
    if (this.banner) SFX.spell();
    this.result = null; this.timeFlash = null;
    if (b.hidden) { b.x = W / 2; b.y = -200; b.move = null; }
  }

  // 결과 화면이 끝난 뒤 다음 패턴
  next() {
    const r = this.run;
    if (r) {
      r.idx++;
      if (r.idx < r.seq.length) this.start(this.spells.indexOf(r.seq[r.idx]));
      else if (this.loop) this.startRun(r);
      else this.startSingle(this.spellIndex);
    } else if (this.loop) this.startSingle(this.spellIndex);
    else this.startSingle(this.spellIndex + 1);
  }

  moveBoss(x, y, dur, who = this.boss) {
    who.move = { x0: who.x, y0: who.y, x1: x, y1: y, t: 0, dur: Math.max(1, dur) };
  }

  // 보스·동료 공통: 이동 보간, 보호막·발광 감소, 몸통 판정
  updateActor(a) {
    if (a.move) {
      const m = a.move; m.t++;
      const k = Math.min(1, m.t / m.dur), e = 1 - Math.pow(1 - k, 3);
      a.x = m.x0 + (m.x1 - m.x0) * e; a.y = m.y0 + (m.y1 - m.y0) * e;
      if (k >= 1) a.move = null;
    }
    a.t++;
    if (a.shield > 0) a.shield--;
    if (a.glow > 0) a.glow--;
    const p = this.player;
    if (a.contact && !a.hidden && dist2(a.x, a.y, p.x, p.y) < 16 * 16) this.hitPlayer();
  }

  endSpell(reason) {
    const sp = this.spell;
    const captured = reason !== 'timeout' || sp.survival ? this.stats.miss === 0 && this.stats.bombs === 0 : false;
    if (captured && sp.type === 'spell') { this.score += Math.floor(1000000 * this.timer / (sp.time * 60) + 100000); SFX.capture(); }
    this.clearBullets(true);
    this.tasks.clear(); this.areas = []; this.slow = null;
    // 논스펠은 작은 P만, 스펠은 큰 P 하나를 더 줌
    if (!this.boss.hidden && reason !== 'timeout') this.dropItems(this.boss.x, this.boss.y, 5, sp.type === 'spell' ? 1 : 0, true);
    for (const it of this.items) it.magnet = true;
    this.enemies.forEach(e => this.killEnemy(e, false));
    this.result = { captured: captured && sp.type === 'spell', reason, t: 0, stats: { ...this.stats } };
    this.phase = 'result'; this.phaseT = 170;
  }

  clearBullets(points) {
    for (const b of this.bullets) this.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 20, color: b.color });
    if (points) this.score += this.bullets.length * 10;
    this.bullets = []; this.lasers = [];
  }

  // 아이템: 작은 P(p)·큰 P(P). magnet이면 곧장 플레이어에게 날아옴
  dropItems(x, y, small, big, magnet = false) {
    for (let i = 0; i < small + big; i++) {
      this.items.push({ kind: i < big ? 'P' : 'p', x: x + (Math.random() * 2 - 1) * (8 + i * 2), y: y + (Math.random() * 2 - 1) * 8,
        vy: -2.2 - Math.random() * 1.2, t: 0, magnet });
    }
  }

  updateItems() {
    const p = this.player;
    for (const it of this.items) {
      it.t++;
      const dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy) || 1;
      // 화면 위쪽(회수선 위)에 올라가거나 가까이 가면 빨려 옴
      if (it.magnet && it.t > 20 || p.y < 110 || d < 48) { const v = it.magnet || p.y < 110 ? 9 : 4; it.x += dx / d * v; it.y += dy / d * v; }
      else { it.vy = Math.min(it.vy + 0.06, 1.8); it.y += it.vy; }
      if (d < 18 && this.phase !== 'gameover') {
        it.dead = true;
        const gain = it.kind === 'P' ? P_BIG : P_SMALL;
        if (p.power >= MAX_POWER) this.score += it.kind === 'P' ? 5000 : 500;
        else {
          const before = Math.floor(p.power);
          p.power = Math.min(MAX_POWER, +(p.power + gain).toFixed(2));
          if (Math.floor(p.power) > before) { this.fx.push({ kind: 'text', text: p.power >= MAX_POWER ? 'MAX' : 'POWER UP', x: p.x, y: p.y - 18, t: 0, life: 50 }); SFX.powerUp(); }
        }
        SFX.item();
      }
      if (it.y > H + 20) it.dead = true;
    }
    this.items = this.items.filter(it => !it.dead);
  }

  killEnemy(e, reward = true) {
    if (e.dead) return;
    e.dead = true;
    if (reward) { const dr = e.drop || (e.maxHp >= 100 ? [3, 1] : [2, 0]); this.dropItems(e.x, e.y, dr[0], dr[1]); }
    // 정화 연출: 사람 실루엣이 떠오름
    this.fx.push({ kind: 'purify', x: e.x, y: e.y, t: 0, life: 50 });
    if (reward) this.score += 3000;
    SFX.kill();
  }

  // ── 틱 ──
  update() {
    const p = this.player, sp = this.spell;
    this.bgT++;
    this.updatePlayer();

    const b = this.boss;
    this.updateActor(b);
    for (const a of this.partners) this.updateActor(a);
    for (const c of this.chants) c.t++;
    this.chants = this.chants.filter(c => c.t < c.end + c.fade);
    for (const z of this.zones) z.t++;
    this.zones = this.zones.filter(z => z.t < z.dur);

    if (this.phase === 'intro') {
      if (--this.phaseT <= 0) {
        this.phase = 'active';
        try { this.tasks.add(sp.run.call(sp, this.api)); } catch (e) { this.fail(e); }
      }
    } else if (this.phase === 'active') {
      this.frame++;
      this.tasks.step();
      if (--this.timer <= 0) this.endSpell('timeout');
      else if (!b.hidden && !sp.survival && b.hp <= 0) this.endSpell('defeat');
    } else if (this.phase === 'result') {
      this.result.t++;
      if (--this.phaseT <= 0) this.next();
    } else if (this.phase === 'gameover') {
      if (--this.phaseT <= 0) this.restart();
    }

    if (this.slow && ++this.slow.t >= this.slow.dur) { this.slow = null; SFX.slowOut(); }
    this.updateAreas();
    this.updateItems();
    this.updateBullets();
    this.updateLasers();
    this.updateEnemies();
    this.updateShots();
    this.updateFx();

    const st = this.stats;
    st.dmgLog[this.bgT % 60] = st.dmgNow; st.dmgNow = 0;
    if (this.banner) this.banner.t++;
  }

  updatePlayer() {
    const p = this.player, k = this.keys;
    const focus = k.has('ShiftLeft') || k.has('ShiftRight');
    p.focus = focus;
    let dx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    let dy = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    const spd = (focus ? 2 : 4.5) * (p.stun > 0 ? 0.45 : 1), n = dx && dy ? Math.SQRT1_2 : 1;
    if (p.stun > 0) p.stun--;
    p.x = Math.max(8, Math.min(W - 8, p.x + dx * spd * n));
    p.y = Math.max(16, Math.min(H - 16, p.y + dy * spd * n));
    p.tilt = dx;
    if (p.inv > 0) p.inv--;
    if (p.flash > 0) p.flash--;

    // 라티엘 옵션
    if (this.angel === 'RH' && p.power >= 2) {
      const tx = focus ? 12 : 30, ty = focus ? -14 : 4;
      if (!p.options.length) p.options = [{ x: p.x, y: p.y }, { x: p.x, y: p.y }];
      p.options.forEach((o, i) => { const s = i ? 1 : -1; o.x += (p.x + s * tx - o.x) * 0.3; o.y += (p.y + ty - o.y) * 0.3; });
    } else p.options = [];

    const L = Math.max(0, Math.min(4, Math.floor(p.power)));
    if (k.has('KeyZ') && !p.bomb) { SHOT_TYPES[this.angel](p, this.shots, focus, L); p.fireT++; } else p.fireT = 0;

    if (this.pressed.has('KeyX') && !p.bomb && this.phase === 'active') {
      // 봄: 0.5초 차지(무적) 후 확산하며 탄 소거
      if (p.bombs > 0 || this.invincible) {
        if (!this.invincible) p.bombs--;
        p.bomb = { t: 0 }; p.inv = Math.max(p.inv, 30 + 150); this.stats.bombs++;
        SFX.bomb();
      } else SFX.empty();
    }
    if (p.bomb) {
      const bm = p.bomb; bm.t++;
      if (bm.t > 30) {
        bm.r = (bm.t - 30) * 9;
        for (const b of this.bullets) if (dist2(b.x, b.y, p.x, p.y) < bm.r * bm.r) { b.dead = true; this.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 20, color: b.color }); }
        if (bm.r > 100) this.lasers = [];
        if (bm.t < 100) { this.damageBoss(14); for (const e of this.enemies) e.hp -= 14; }
      }
      if (bm.t >= 100) p.bomb = null;
    }
  }

  damageBoss(d) {
    const b = this.boss;
    if (b.hidden || this.phase !== 'active' || this.spell.survival) return;
    b.hp = Math.max(0, b.hp - d); this.stats.dmgNow += d; this.score += Math.round(d * 10);
    SFX.hit();
  }

  hitPlayer() {
    const p = this.player;
    if (p.inv > 0) return;
    if (this.invincible) {
      this.stats.hits++; p.flash = 20; p.inv = 20; SFX.hurt();
      return;
    }
    if (this.phase !== 'active' && this.phase !== 'intro') return;
    this.stats.miss++;
    this.fx.push({ kind: 'burst', x: p.x, y: p.y, t: 0, life: 40 });
    SFX.die();
    this.clearBullets(false);
    p.x = W / 2; p.y = H - 48; p.inv = 150; p.bomb = null;
    // 한 번 죽을 때마다 목숨 하나. 폭탄은 다시 3개로
    p.lives--; p.bombs = START_BOMBS;
    const lost = Math.min(p.power, DEATH_POWER_LOSS);
    p.power = +(p.power - lost).toFixed(2);
    if (lost > 0) this.dropItems(p.x, p.y - 30, 5, 0);
    if (p.lives <= 0) {
      this.tasks.clear(); this.clearBullets(false);
      this.phase = 'gameover'; this.phaseT = 240;
    }
  }

  slowFactor() {
    const sl = this.slow;
    if (!sl) return 1;
    const ramp = Math.min(1, sl.t / 20, (sl.dur - sl.t) / 20);
    return 1 + (sl.k - 1) * Math.max(0, ramp);
  }

  updateBullets() {
    const p = this.player, bs = this.bullets, k = this.slowFactor();
    for (const b of bs) {
      b.t++;
      if (b.fn) { try { b.fn(b, this.api); } catch (e) { this.fail(e); b.fn = null; } }
      if (b.cart) { b.vx += b.ax * k; b.vy += b.ay * k; b.x += b.vx * k; b.y += b.vy * k; }
      else {
        b.spd += b.accel * k; b.ang += b.angVel * k;
        if (b.maxSpd !== undefined && b.spd > b.maxSpd) b.spd = b.maxSpd;
        if (b.minSpd !== undefined && b.spd < b.minSpd) b.spd = b.minSpd;
        b.x += Math.cos(b.ang) * b.spd * k; b.y += Math.sin(b.ang) * b.spd * k;
      }
      const m = b.margin;
      if (b.x < -m || b.x > W + m || b.y < -m - b.marginTop || b.y > H + m) b.dead = true;
      if (b.dead) continue;
      const d = dist2(b.x, b.y, p.x, p.y), r = b.r + HIT_R, gr = b.r + GRAZE_R;
      if (d < r * r && b.soft) {
        // 딱밤: 별로 아프지 않음. 목숨 대신 잠깐 움직임이 둔해짐
        b.dead = true;
        if (p.inv <= 0 && !(p.stun > 0)) { p.stun = 45; this.fx.push({ kind: 'text', text: '딱!', x: p.x, y: p.y - 14, t: 0, life: 40 }); SFX.flick(); }
        continue;
      }
      if (d < r * r) { this.hitPlayer(); if (!this.invincible) break; }
      else if (d < gr * gr && !b.grazed) { b.grazed = true; this.graze++; this.score += 500; this.fx.push({ kind: 'graze', x: p.x, y: p.y, t: 0, life: 12 }); SFX.graze(); }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  updateLasers() {
    const p = this.player;
    for (const l of this.lasers) {
      l.t++;
      if (l.fn) { try { l.fn(l, this.api); } catch (e) { this.fail(e); l.fn = null; } }
      if (l.kind === 'chain') { this.updateChain(l, p); continue; }
      const total = l.warn + l.dur;
      if (l.t > total + 12) { l.dead = true; continue; }
      // 폭: 예고선 → 8프레임에 걸쳐 전개 → 유지 → 12프레임에 걸쳐 수축
      if (l.t <= l.warn) l.cw = 0;
      else if (l.t <= l.warn + 8) l.cw = l.w * (l.t - l.warn) / 8;
      else if (l.t <= total) l.cw = l.w;
      else l.cw = l.w * (1 - (l.t - total) / 12);
      if (l.cw < l.w * 0.6) continue;
      const d = segDist(p.x, p.y, l.x, l.y, l.x + Math.cos(l.ang) * l.len, l.y + Math.sin(l.ang) * l.len);
      if (d < l.cw * 0.35 + HIT_R) this.hitPlayer();
      else if (d < l.cw * 0.5 + GRAZE_R && l.t % 6 === 0) { this.graze++; this.score += 200; }
    }
    this.lasers = this.lasers.filter(l => !l.dead);
  }

  // 사슬: 예고선 깜빡임 → 선을 따라 빠르게 뻗음 → 유지 → 천천히 걷힘. 뻗은 구간 전체가 판정.
  updateChain(l, p) {
    const t = l.t - l.warn, { shoot, hold, retract } = l;
    if (t === 1) SFX.chain();
    if (t <= 0) l.tip = 0;
    else if (t <= shoot) { const k = t / shoot; l.tip = l.len * (1 - (1 - k) ** 3); }
    else if (t <= shoot + hold) l.tip = l.len;
    else if (t <= shoot + hold + retract) { const k = (t - shoot - hold) / retract; l.tip = l.len * (1 - k * k); }
    else { l.dead = true; return; }
    if (l.tip <= 0) return;
    const d = segDist(p.x, p.y, l.x, l.y, l.x + Math.cos(l.ang) * l.tip, l.y + Math.sin(l.ang) * l.tip);
    if (d < l.w / 2 + HIT_R) this.hitPlayer();
    else if (d < l.w / 2 + GRAZE_R && l.t % 6 === 0) { this.graze++; this.score += 200; }
  }

  // 사각 구역 공격: 예고(번호·테두리 깜빡임) → 발동(채워짐, 판정) → 사라짐
  updateAreas() {
    const p = this.player;
    for (const a of this.areas) {
      a.t++;
      if (a.t === a.warn) SFX.strike();
      if (a.t > a.warn && a.t <= a.warn + a.dur &&
          p.x > a.x - HIT_R && p.x < a.x + a.w + HIT_R && p.y > a.y - HIT_R && p.y < a.y + a.h + HIT_R) this.hitPlayer();
    }
    this.areas = this.areas.filter(a => a.t < a.warn + a.dur + 15);
  }

  updateEnemies() {
    for (const e of this.enemies) {
      e.t++;
      e.x += e.vx; e.y += e.vy;
      if (e.hp <= 0) this.killEnemy(e);
      else if (e.t > 60 && (e.x < -60 || e.x > W + 60 || e.y < -80 || e.y > H + 60)) e.dead = true;
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  updateShots() {
    const b = this.boss, targets = this.enemies;
    if (this.eraseCd > 0) this.eraseCd--;
    for (const s of this.shots) {
      if (s.homing) {
        const tgt = nearest(s, targets, b.hidden || this.phase !== 'active' ? null : b);
        if (tgt) {
          const cur = Math.atan2(s.vy, s.vx), want = Math.atan2(tgt.y - s.y, tgt.x - s.x);
          let da = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          da = Math.max(-s.turn, Math.min(s.turn, da));
          const sp = Math.hypot(s.vx, s.vy), a = cur + da;
          s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
        }
      }
      s.x += s.vx; s.y += s.vy; s.t = (s.t || 0) + 1;
      if (s.trail) { s.trail.push(s.x, s.y); if (s.trail.length > 24) s.trail.splice(0, 2); }
      if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20 || (s.life && s.t > s.life)) { s.dead = true; continue; }
      for (const e of targets) {
        if (e.dead || dist2(s.x, s.y, e.x, e.y) >= (e.r + 6) ** 2) continue;
        if (s.pierce) { if (s.pierce.includes(e)) continue; s.pierce.push(e); }   // 꿰뚫는 탄은 같은 적을 한 번만
        e.hp -= s.dmg; e.hurt = 4; SFX.hit();
        if (!s.pierce) { s.dead = true; break; }
      }
      // 지우는 탄: 닿은 작은 적탄을 지우고 자기도 사라짐(지운 만큼 화력을 잃음)
      // 몸 앞의 방패가 되지 않게 어느 정도 날아간 뒤(약 100px)부터만 지움
      // 전체로는 30프레임에 하나까지만(초당 2개) 지워 가벼운 보조에 머물게 함
      if (s.erase > 0 && !s.dead && s.t > 12 && !(this.eraseCd > 0)) {
        for (const b of this.bullets) {
          if (b.dead || b.r > 4 || dist2(s.x, s.y, b.x, b.y) > 64) continue;
          b.dead = true; this.score += 20;
          this.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 20, color: 'purple' });
          this.eraseCd = 30;
          if (--s.erase <= 0) { s.dead = true; break; }
        }
      }
      if (!s.dead && this.zones.some(z => dist2(s.x, s.y, z.x, z.y) < z.r * z.r)) { s.dead = true; this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); SFX.block(); continue; }
      if (!s.dead && !b.hidden && this.phase === 'active' && dist2(s.x, s.y, b.x, b.y) < 30 * 30) {
        s.dead = true;
        // 필리우스 제1식은 약한 공격을 막음: 통상탄은 막히고 봄은 통함
        if (b.shield > 0) { this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); SFX.block(); continue; }
        this.damageBoss(s.dmg); b.hurt = 3;
      }
      if (s.dead && Math.random() < 0.5) this.fx.push({ kind: 'hit', x: s.x, y: s.y, t: 0, life: 8, color: s.color });
    }
    this.shots = this.shots.filter(s => !s.dead);
  }

  updateFx() {
    for (const f of this.fx) f.t++;
    this.fx = this.fx.filter(f => f.t < f.life);
  }

  // ── 입력 ──
  // 메타 키는 즉시 처리하고 지움. 나머지(X 등)는 다음 틱이 가져감.
  handleKeys() {
    const take = c => this.pressed.delete(c);
    if (take('Escape')) this.paused = !this.paused;
    if (take('KeyR')) this.restart();
    if (take('BracketRight')) { this.startSingle(this.spellIndex + 1); this.onChange?.(); }
    if (take('BracketLeft')) { this.startSingle(this.spellIndex - 1); this.onChange?.(); }
    if (take('KeyM')) { SFX.setMuted(!SFX.muted); this.onChange?.(); }
    if (take('KeyD')) { this.difficulty = (this.difficulty + 1) % DIFFS.length; this.restart(); this.onChange?.(); }
    if (take('KeyI')) { this.invincible = !this.invincible; this.onChange?.(); }
    for (const [code, a] of [['Digit1', 'AR'], ['Digit2', 'UR'], ['Digit3', 'LM'], ['Digit4', 'RH']]) if (take(code)) { this.angel = a; this.onChange?.(); }
  }

  frameTick(dt) {
    this.handleKeys();
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 500) { this.fps = this.fpsN * 1000 / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    if (this.paused) {
      if (this.pressed.has('Period')) this.update();
      this.pressed.clear(); this.acc = 0;
    } else {
      this.acc = (this.acc || 0) + Math.min(dt, 100) * this.speed;
      let n = 0;
      while (this.acc >= 1000 / 60 && n++ < 8) { this.update(); this.acc -= 1000 / 60; this.pressed.clear(); }
    }
    render(this);
  }
}

// ── 패턴 API ──────────────────────────────────────────────
// 패턴 코드가 받는 s. 기본 발사 위치는 보스.
function makeAPI(G) {
  const s = {
    TAU, W, H,
    get boss() { return G.boss; },
    get player() { return G.player; },
    get frame() { return G.frame; },
    get timeLeft() { return G.timer; },
    get hpRate() { return G.boss.hp / G.boss.maxHp; },
    get diff() { return G.effDiff(); },
    lv: (...v) => v[Math.min(G.effDiff(), v.length - 1)],                        // 난이도별 값 고르기 (이지, 노말, 하드[, 엑스트라 하드])
    cnt: n => Math.max(1, Math.round(n * DENSITY[G.effDiff()])),                 // 탄 개수
    wait: f => Math.max(1, Math.round(f * INTERVAL[G.effDiff()])),               // 발사 간격(프레임)
    sp: v => v * SPEED[G.effDiff()],                                             // 탄속
    // 머리 위 말풍선(대사 대신 짧은 절차 표시용): who=보스·동료
    say(who, text, frames = 90) { G.fx.push({ kind: 'say', who, text, t: 0, life: frames }); },
    // 제한시간 연장(초). 타이머 옆에 +n 표시
    extendTime(sec) { G.timer += sec * 60; G.timeFlash = { text: '+' + sec.toFixed(2), t: 0 }; SFX.extend(); },
    // 보스를 지금 자리 근처로 조금만 옮김. 너무 자주 쓰지 않는다(4초에 한 번 정도)
    *wander(range = 50, dur = 60) {
      const b = G.boss;
      const x = Math.max(90, Math.min(W - 90, b.x + (Math.random() * 2 - 1) * range));
      const y = Math.max(80, Math.min(140, b.y + (Math.random() * 2 - 1) * range * 0.4));
      G.moveBoss(x, y, dur); yield dur;
    },
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: arr => arr[Math.floor(Math.random() * arr.length)],
    aim(x = G.boss.x, y = G.boss.y) { return Math.atan2(G.player.y - y, G.player.x - x); },

    // o: {x,y, ang,spd, accel,angVel,maxSpd,minSpd | vx,vy,ax,ay, shape,color, fn(b,s), margin}
    fire(o = {}) {
      const def = SHAPES[o.shape] || SHAPES.small;
      const b = {
        x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, t: 0,
        ang: o.ang ?? Math.PI / 2, spd: o.spd ?? 2, accel: o.accel ?? 0, angVel: o.angVel ?? 0,
        maxSpd: o.maxSpd, minSpd: o.minSpd,
        cart: o.vx !== undefined || o.vy !== undefined || o.ax !== undefined || o.ay !== undefined,
        vx: o.vx ?? 0, vy: o.vy ?? 0, ax: o.ax ?? 0, ay: o.ay ?? 0,
        shape: o.shape || 'small', color: o.color || 'red', r: o.r ?? def.r, alpha: o.alpha ?? 1, soft: !!o.soft,
        fn: o.fn, margin: o.margin ?? 32, marginTop: o.marginTop ?? 0, data: o.data || {},
      };
      G.bullets.push(b);
      return b;
    },
    // n발 원형. o.offset=시작 각도
    ring(n, o = {}) {
      const out = [], off = o.offset ?? 0;
      for (let i = 0; i < n; i++) out.push(s.fire({ ...o, ang: off + i * TAU / n }));
      return out;
    },
    // 중심 각도 center에서 gap 간격으로 n발
    spread(n, center, gap, o = {}) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(s.fire({ ...o, ang: center + (i - (n - 1) / 2) * gap }));
      return out;
    },
    // 고정 레이저: {x,y,ang,len,w,warn,dur,color,fn}
    laser(o = {}) {
      const l = { x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, ang: o.ang ?? Math.PI / 2, len: o.len ?? 700, w: o.w ?? 16,
        warn: o.warn ?? 40, dur: o.dur ?? 60, color: o.color || 'cyan', fn: o.fn, t: 0, cw: 0 };
      G.lasers.push(l);
      return l;
    },
    // 사슬: {x,y,ang,len,w,warn,shoot,hold,retract}. 기본 발사 위치는 보스
    chain(o = {}) {
      const l = { kind: 'chain', x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, ang: o.ang ?? Math.PI / 2, len: o.len ?? 700, w: o.w ?? 7,
        warn: o.warn ?? 45, shoot: o.shoot ?? 12, hold: o.hold ?? 20, retract: o.retract ?? 120, fn: o.fn, t: 0, tip: 0 };
      G.lasers.push(l);
      return l;
    },
    task(gen, owner) { return G.tasks.add(gen, owner); },
    // who를 주면 동료를 움직임. 기본은 보스
    *moveTo(x, y, dur = 60, who) { G.moveBoss(x, y, dur, who); yield dur; },
    move(x, y, dur = 60, who) { G.moveBoss(x, y, dur, who); },
    // 함께 싸우는 동료(체력 없음, 공격받지 않음): {name,x,y,color}
    partner(o = {}) {
      const a = { name: o.name || '', x: o.x ?? W / 2, y: o.y ?? -40, color: o.color || '#cfe8ff', t: 0, shield: 0, glow: 0, contact: false, move: null };
      if (o.to) G.moveBoss(o.to[0], o.to[1], o.dur ?? 45, a);
      G.partners.push(a);
      return a;
    },
    // 판정 없는 빨간 예고선: {x,y,x2,y2,dur}
    warnLine(o) { G.fx.push({ kind: 'warnline', x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, x2: o.x2, y2: o.y2, t: 0, life: o.dur ?? 30 }); },
    // 사각 구역 공격 {x,y,w,h,warn,dur,label,color}. warn 동안 예고, dur 동안 판정
    area(o) {
      const a = { x: o.x, y: o.y, w: o.w, h: o.h, warn: o.warn ?? 60, dur: o.dur ?? 20, label: o.label ?? '', color: o.color || '#ff3b4a', t: 0 };
      G.areas.push(a);
      return a;
    },
    // 불렛타임: frames 동안 적 탄이 k배 속도로 움직임. 플레이어는 그대로
    bulletTime(k, frames) { G.slow = { k, dur: frames, t: 0 }; SFX.slowIn(); },
    // 보호막: 통상탄을 막음(봄은 통과)
    shield(who, frames) { who.shield = frames; who.shieldMax = frames; },
    // 고정 구역 보호막: 안으로 들어온 자기 탄을 지움 {x,y,r,dur}
    zone(o = {}) { const z = { x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, r: o.r ?? 56, dur: o.dur ?? 300, t: 0 }; G.zones.push(z); return z; },
    // 영창: 화면 상단에 한 줄씩 떠오른 뒤 사라짐. 마지막 줄이 호명.
    // yield* 하면 호명 줄이 뜰 때까지 기다림(= 전조 시간). {by, color, step, hold, corner:'left'|'right'}
    *chant(lines, o = {}) {
      if (typeof lines === 'string') lines = CHANTS[lines];
      const step = o.step ?? 40, hold = o.hold ?? 20;
      const corner = o.corner || (o.by && o.by !== G.boss ? 'right' : 'left');
      const c = { lines, t: 0, step, end: lines.length * step + hold + 30, fade: 20, corner, color: o.color || o.by?.chantColor || '#ffe6a0' };
      G.chants.push(c);
      yield lines.length * step + hold;
    },
    // 잡몹: {x,y,vx,vy,hp,r,run(e,s)}
    enemy(o = {}) {
      const e = { x: o.x ?? W / 2, y: o.y ?? -20, vx: o.vx ?? 0, vy: o.vy ?? 0, hp: o.hp ?? 30, maxHp: o.hp ?? 30, drop: o.drop, r: o.r ?? 14, t: 0, color: o.color || 'red', label: o.label || '' };
      G.enemies.push(e);
      if (o.run) G.tasks.add(o.run(e, s), e);
      return e;
    },
    clear() { G.clearBullets(false); },
  };
  return s;
}

// ── 도우미 ────────────────────────────────────────────────
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
function nearest(s, list, extra) {
  let best = extra, bd = extra ? dist2(s.x, s.y, extra.x, extra.y) : Infinity;
  for (const e of list) { if (e.dead) continue; const d = dist2(s.x, s.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ── 그리기 ────────────────────────────────────────────────
function render(G) {
  const g = G.g;
  g.setTransform(SC, 0, 0, SC, 0, 0);
  g.fillStyle = '#12121c'; g.fillRect(0, 0, 640, 480);

  g.save();
  g.translate(FX, FY);
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  drawBackground(G, g);
  drawBoss(G, g);
  drawEnemies(G, g);
  drawItems(G, g);
  drawShots(G, g);
  drawPlayer(G, g);
  drawAreas(G, g);
  drawLasers(G, g);
  drawBullets(G, g);
  drawFx(G, g);
  drawBomb(G, g);
  drawHitbox(G, g);
  drawChants(G, g);
  drawFieldUI(G, g);
  g.restore();

  drawHUD(G, g);
}

function drawBackground(G, g) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#1b1530'); gr.addColorStop(1, '#0a0a14');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
  const off = (G.bgT * 0.8) % 32;
  g.beginPath();
  for (let y = off - 32; y < H; y += 32) { g.moveTo(0, y); g.lineTo(W, y); }
  for (let x = 0; x <= W; x += 32) { g.moveTo(x, 0); g.lineTo(x, H); }
  g.stroke();
}

function drawBoss(G, g) {
  const b = G.boss;
  for (const z of G.zones) drawZone(g, z);
  for (const a of G.partners) drawActor(G, g, a, false);
  if (b.hidden) return;
  g.save(); g.translate(b.x, b.y);
  // 마법진
  g.rotate(b.t * 0.02);
  g.strokeStyle = 'rgba(245,197,66,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, 44, 0, TAU); g.stroke();
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); }
  g.closePath(); g.stroke();
  g.rotate(-b.t * 0.05);
  g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.stroke();
  g.restore();
  drawActor(G, g, b, true);
}

// 몸체 자리표시 + 이름 + 오른손 발광 + 보호막
function drawActor(G, g, a, isBoss) {
  const r = isBoss ? 14 : 11;
  if (a.glow > 0) {
    // 파테르 제1식: 오른손이 황금빛으로 빛남
    const gx = a.x + r + 3, gy = a.y + 2, pulse = 8 + Math.sin(a.t * 0.4) * 2;
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, pulse * 2);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, '#ffd24a'); gr.addColorStop(1, '#ffd24a00');
    g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, pulse * 2, 0, TAU); g.fill();
  }
  g.fillStyle = a.hurt > 0 ? '#fff' : a.color;
  g.beginPath(); g.arc(a.x, a.y, r, 0, TAU); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(a.x, a.y, r * 0.55, 0, TAU); g.fill();
  if (a.hurt > 0) a.hurt--;
  if (a.shield > 0) {
    // 영적 보호막: 물리 장벽이 아니므로 흐릿한 막으로 표현. 끝날 때 깜빡임
    const k = a.shield < 60 && Math.floor(a.shield / 5) % 2 ? 0.3 : 1;
    g.globalAlpha = 0.35 * k; g.fillStyle = '#bfe4ff';
    g.beginPath(); g.arc(a.x, a.y, 30, 0, TAU); g.fill();
    g.globalAlpha = k; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.arc(a.x, a.y, 30 + Math.sin(a.t * 0.2) * 1.5, 0, TAU); g.stroke();
    g.globalAlpha = 1;
  }
  if (a.name) {
    g.font = '10px system-ui, "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText(a.name, a.x, a.y + r + 4); g.textAlign = 'left';
  }
}

function drawZone(g, z) {
  const k = Math.min(1, z.t / 15, (z.dur - z.t) / 20);
  g.globalAlpha = 0.18 * k; g.fillStyle = '#bfe4ff';
  g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.fill();
  g.globalAlpha = 0.7 * k; g.strokeStyle = '#e8f6ff'; g.lineWidth = 1.5;
  g.setLineDash([6, 4]); g.lineDashOffset = -z.t * 0.5;
  g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.stroke();
  g.setLineDash([]); g.globalAlpha = 1;
}

// 영창: 화면 상단 구석에 한 줄씩 페이드인 → 페이드아웃. 마지막 호명 줄은 조금 더 크게, 조금 더 오래.
// 보스는 왼쪽 구석, 동료는 오른쪽 구석
const CHANT_FONT = '"Gowun Batang", "Nanum Myeongjo", Batang, serif';
// 한 줄이 넘치면 가운데에 가장 가까운 끊을 자리(— 앞, 마침표·쉼표 뒤, 띄어쓰기)에서 두 줄로 나눔
function splitToFit(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== ' ') continue;
    const bonus = text[i + 1] === '—' || /[.,]/.test(text[i - 1]) ? 6 : 0;
    if (best < 0 || Math.abs(i - mid) - bonus < Math.abs(best - mid) - (text[best + 1] === '—' || /[.,]/.test(text[best - 1]) ? 6 : 0)) best = i;
  }
  return best < 0 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}
function drawChants(G, g) {
  g.textBaseline = 'top';
  G.chants.forEach((c, row) => {
    const n = c.lines.length, i = Math.min(n - 1, Math.floor(c.t / c.step)), last = i === n - 1;
    const t0 = i * c.step, t1 = last ? c.end + c.fade : t0 + c.step, fi = 12;
    const a = Math.max(0, Math.min(1, (c.t - t0) / fi, (t1 - c.t) / fi));
    // 동시에 읊으면 줄을 달리해 겹치지 않게 함
    const right = c.corner === 'right', x = right ? W - 10 : 10, y = 44 + row * 40;
    const slide = (1 - Math.min(1, (c.t - t0) / fi)) * 8 * (right ? 1 : -1);
    g.globalAlpha = a; g.textAlign = right ? 'right' : 'left';
    g.font = (last ? 'bold 15px ' : '14px ') + CHANT_FONT;
    g.shadowColor = c.color; g.shadowBlur = last ? 12 : 8;
    g.fillStyle = last ? '#fff' : c.color;
    splitToFit(g, c.lines[i], W - 20).forEach((part, k) => g.fillText(part, x + slide, y + k * 18));
  });
  g.shadowBlur = 0; g.globalAlpha = 1; g.textAlign = 'left';
}

function drawEnemies(G, g) {
  for (const e of G.enemies) {
    // 날개 오르트로스 자리표시
    const flap = Math.sin(e.t * 0.3) * 0.4;
    g.fillStyle = 'rgba(200,200,215,0.85)';
    for (const s of [-1, 1]) {
      g.save(); g.translate(e.x + s * 6, e.y - 2); g.scale(s, 1); g.rotate(-0.4 + flap);
      g.beginPath(); g.ellipse(12, 0, 13, 5, 0, 0, TAU); g.fill(); g.restore();
    }
    g.fillStyle = e.hurt > 0 ? '#fff' : '#2a1030';
    g.beginPath(); g.arc(e.x, e.y, e.r * 0.7, 0, TAU); g.fill();
    g.fillStyle = COLORS[e.color] || e.color; g.beginPath(); g.arc(e.x, e.y - 1, 3, 0, TAU); g.fill();
    if (e.hurt > 0) e.hurt--;
    if (e.label) {
      g.font = 'bold 10px system-ui, "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillStyle = '#ff9ab0'; g.fillText(e.label, e.x, e.y - e.r - 2); g.textAlign = 'left'; g.textBaseline = 'top';
    }
  }
}

// 자기 탄은 반투명으로 그려 적탄을 가리지 않게 한다
function drawItems(G, g) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const it of G.items) {
    const big = it.kind === 'P', r = big ? 7 : 4.5;
    g.fillStyle = '#e8403a'; g.fillRect(it.x - r, it.y - r, r * 2, r * 2);
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(it.x - r + 0.5, it.y - r + 0.5, r * 2 - 1, r * 2 - 1);
    g.fillStyle = '#fff'; g.font = `bold ${big ? 10 : 7}px Consolas, monospace`; g.fillText('P', it.x, it.y + 0.5);
  }
  g.textAlign = 'left'; g.textBaseline = 'top';
}

function drawShots(G, g) {
  // 유도 레이저: 지나온 궤적을 빛나는 선으로
  g.lineCap = 'round';
  for (const s of G.shots) {
    if (!s.laser || s.trail.length < 4) continue;
    for (const [w, c, al] of [[6, '#f5c542', 0.35], [2.5, '#ffffff', 0.9]]) {
      g.globalAlpha = al; g.strokeStyle = c; g.lineWidth = w; g.beginPath();
      g.moveTo(s.trail[0], s.trail[1]);
      for (let i = 2; i < s.trail.length; i += 2) g.lineTo(s.trail[i], s.trail[i + 1]);
      g.stroke();
    }
  }
  g.lineCap = 'butt'; g.lineWidth = 1;
  const base = g.getTransform();
  g.globalAlpha = 0.6;
  for (const s of G.shots) {
    if (s.laser) continue;
    const def = SHOT_SHAPES[s.shape], img = shotSprite(s.shape, s.color);
    const a = def.spin ? (s.t || 0) * 0.3 : Math.atan2(s.vy, s.vx), c = Math.cos(a), sn = Math.sin(a);
    g.setTransform(base.a * c, base.a * sn, -base.a * sn, base.a * c, base.e + s.x * base.a, base.f + s.y * base.a);
    g.drawImage(img, -def.w / 2, -def.h / 2, def.w, def.h);
  }
  g.setTransform(base);
  g.globalAlpha = 1;
}

function drawPlayer(G, g) {
  const p = G.player, A = ANGELS[G.angel];
  if (p.inv > 0 && !G.invincible && Math.floor(p.inv / 3) % 2) g.globalAlpha = 0.4;
  g.save(); g.translate(p.x, p.y);
  // 날개
  const flap = Math.sin(G.bgT * 0.15) * 0.15;
  g.fillStyle = A.wing; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.8;
  for (const s of [-1, 1]) {
    g.save(); g.scale(s, 1); g.rotate(-0.5 + flap - (p.tilt || 0) * s * 0.15);
    g.beginPath(); g.ellipse(12, -2, 13, 6, 0, 0, TAU); g.fill(); g.stroke(); g.restore();
  }
  if (G.angel === 'RH') { // 별자리 날개
    g.fillStyle = '#cfe0ff';
    for (const [x, y] of [[-16, -6], [-10, -10], [-20, 0], [15, -7], [9, -11], [19, 1]]) g.fillRect(x, y, 1.2, 1.2);
  }
  // 몸
  g.fillStyle = A.dress; g.beginPath(); g.moveTo(-6, 10); g.lineTo(6, 10); g.lineTo(3, -2); g.lineTo(-3, -2); g.closePath(); g.fill();
  g.fillStyle = A.accent; g.fillRect(-3, 2, 6, 1.5);
  g.fillStyle = A.hair; g.beginPath(); g.arc(0, -6, 5.5, 0, TAU); g.fill();
  if (G.angel !== 'LM') { g.fillRect(-5.5, -6, 11, 12 * (G.angel === 'RH' || G.angel === 'AR' ? 1 : 0.8)); }
  g.fillStyle = '#fde8dc'; g.beginPath(); g.arc(0, -5, 3.4, 0, TAU); g.fill();
  // 광륜
  g.strokeStyle = A.halo; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, -14, 6, 2, 0, 0, TAU); g.stroke();
  g.restore();
  for (const o of p.options) { g.fillStyle = '#9fb8ff'; g.beginPath(); g.arc(o.x, o.y, 4, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.fillRect(o.x - 1, o.y - 1, 2, 2); }
  g.globalAlpha = 1;
}

function drawLasers(G, g) {
  for (const l of G.lasers) {
    if (l.kind === 'chain') { drawChain(G, g, l); continue; }
    const c = COLORS[l.color] || l.color;
    g.save(); g.translate(l.x, l.y); g.rotate(l.ang);
    if (l.t <= l.warn) {
      g.globalAlpha = 0.35 + 0.25 * Math.sin(l.t * 0.5);
      g.fillStyle = c; g.fillRect(0, -0.75, l.len, 1.5);
    } else if (l.cw > 0) {
      g.globalAlpha = 0.85; g.fillStyle = c; g.fillRect(0, -l.cw / 2, l.len, l.cw);
      g.fillStyle = '#fff'; g.fillRect(0, -l.cw / 5, l.len, l.cw / 2.5);
    }
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawAreas(G, g) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const a of G.areas) {
    if (a.t <= a.warn) {
      // 예고: 테두리 깜빡임, 발동이 가까울수록 빠르게. 번호는 순서
      const fast = a.t > a.warn - 20;
      g.globalAlpha = Math.sin(a.t * (fast ? 1.2 : 0.4)) > 0 ? 0.9 : 0.4;
      g.strokeStyle = a.color; g.lineWidth = 2; g.strokeRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2);
      g.globalAlpha = 0.12; g.fillStyle = a.color; g.fillRect(a.x, a.y, a.w, a.h);
      if (a.label !== '') {
        g.globalAlpha = 0.9; g.fillStyle = '#fff'; g.font = 'bold 18px Consolas, monospace';
        g.fillText(String(a.label), a.x + a.w / 2, a.y + a.h / 2);
      }
    } else {
      const k = a.t <= a.warn + a.dur ? 1 : 1 - (a.t - a.warn - a.dur) / 15;
      g.globalAlpha = 0.55 * k; g.fillStyle = a.color; g.fillRect(a.x, a.y, a.w, a.h);
      g.globalAlpha = 0.8 * k; g.fillStyle = '#fff'; g.fillRect(a.x + 3, a.y + 3, a.w - 6, a.h - 6);
    }
  }
  g.globalAlpha = 1; g.textAlign = 'left'; g.textBaseline = 'top';
}

function drawChain(G, g, l) {
  g.save(); g.translate(l.x, l.y); g.rotate(l.ang);
  if (l.t <= l.warn) {
    // 빨간 예고선: 발사 직전일수록 빠르게 깜빡임
    const rate = l.t > l.warn - 15 ? 1.6 : 0.5;
    g.globalAlpha = Math.sin(l.t * rate) > 0 ? 0.9 : 0.25;
    g.fillStyle = '#ff2a3a'; g.fillRect(0, -1, l.len, 2);
  } else if (l.tip > 0) {
    // 고리는 끝부분 기준으로 배치해 뻗고 걷힐 때 함께 움직여 보이게 함
    const img = sprite('link', 'gold'), step = 9;
    g.globalAlpha = 1;
    for (let d = l.tip, i = 0; d > -step; d -= step, i++) {
      g.save(); g.translate(Math.max(0, d), 0); if (i % 2) g.scale(1, 0.55);
      g.drawImage(img, -7, -7, 14, 14); g.restore();
    }
    // 사슬 끝 쐐기
    g.fillStyle = '#ffe28a'; g.beginPath();
    g.moveTo(l.tip + 9, 0); g.lineTo(l.tip, -5); g.lineTo(l.tip - 3, 0); g.lineTo(l.tip, 5); g.closePath(); g.fill();
    // 뻗는 순간 섬광
    const t = l.t - l.warn;
    if (t <= l.shoot + 4) { g.globalAlpha = 0.5 * (1 - t / (l.shoot + 4)); g.fillStyle = '#fff'; g.fillRect(0, -6, l.tip, 12); }
  }
  g.restore(); g.globalAlpha = 1;
}

function drawBullets(G, g) {
  const base = g.getTransform();
  for (const b of G.bullets) {
    const def = SHAPES[b.shape] || SHAPES.small, img = sprite(b.shape, b.color), s = def.size;
    let a = 0;
    if (def.oriented) a = b.cart ? Math.atan2(b.vy, b.vx) : b.ang;
    else if (def.spin) a = b.t * 0.12;
    const k = b.t < 6 ? 1 + (6 - b.t) * 0.15 : 1; // 발사 순간 살짝 크게
    const c = Math.cos(a) * k, sn = Math.sin(a) * k;
    g.setTransform(base.a * c, base.a * sn, -base.a * sn, base.a * c, base.e + b.x * base.a, base.f + b.y * base.a);
    g.globalAlpha = b.alpha;
    g.drawImage(img, -s / 2, -s / 2, s, s);
  }
  g.setTransform(base); g.globalAlpha = 1;
}

function drawFx(G, g) {
  for (const f of G.fx) {
    const k = f.t / f.life;
    if (f.kind === 'spark') {
      g.globalAlpha = 1 - k; g.fillStyle = COLORS[f.color] || '#fff';
      g.fillRect(f.x - 2, f.y - 2 - k * 10, 4, 4);
    } else if (f.kind === 'purify') {
      // 사람 실루엣
      g.globalAlpha = 1 - k; g.fillStyle = '#fff';
      const y = f.y - k * 30;
      g.beginPath(); g.arc(f.x, y - 8, 4, 0, TAU); g.fill();
      g.fillRect(f.x - 4, y - 3, 8, 12);
      g.strokeStyle = '#fff'; g.beginPath(); g.arc(f.x, f.y, 10 + k * 30, 0, TAU); g.stroke();
    } else if (f.kind === 'burst') {
      g.globalAlpha = 1 - k; g.strokeStyle = '#ff5e7a'; g.lineWidth = 3;
      g.beginPath(); g.arc(f.x, f.y, k * 80, 0, TAU); g.stroke();
    } else if (f.kind === 'hit') {
      g.globalAlpha = 0.7 * (1 - k); g.fillStyle = COLORS[f.color] || '#fff';
      g.beginPath(); g.arc(f.x, f.y - k * 6, 2 + k * 6, 0, TAU); g.fill();
    } else if (f.kind === 'warnline') {
      g.globalAlpha = Math.sin(f.t * (f.t > f.life - 12 ? 1.6 : 0.6)) > 0 ? 0.9 : 0.25;
      g.strokeStyle = '#ff2a3a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x2, f.y2); g.stroke();
    } else if (f.kind === 'text') {
      g.globalAlpha = 1 - k; g.fillStyle = '#ffe28a'; g.font = 'bold 16px system-ui, "Malgun Gothic", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(f.text, f.x, f.y - k * 16); g.textAlign = 'left'; g.textBaseline = 'top';
    } else if (f.kind === 'say') {
      const a = f.who, fade = Math.min(1, (f.life - f.t) / 15, f.t / 8);
      g.globalAlpha = fade; g.font = 'bold 12px system-ui, "Malgun Gothic", sans-serif';
      const tw = g.measureText(f.text).width, bx = Math.max(4, Math.min(W - tw - 16, a.x - tw / 2 - 6)), by = a.y - 44;
      g.fillStyle = 'rgba(20,20,32,0.85)'; g.fillRect(bx, by, tw + 12, 20);
      g.strokeStyle = a.chantColor || '#fff'; g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, tw + 11, 19);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(f.text, bx + 6, by + 10.5); g.textBaseline = 'top';
    } else if (f.kind === 'block') {
      g.globalAlpha = 0.8 * (1 - k); g.strokeStyle = '#e8f6ff'; g.lineWidth = 1;
      g.beginPath(); g.arc(f.x, f.y, 3 + k * 5, 0, TAU); g.stroke();
    } else if (f.kind === 'graze') {
      g.globalAlpha = 1 - k; g.fillStyle = '#fff';
      g.fillRect(f.x + (f.t * 1.7 % 20) - 10, f.y - 10 + (f.t * 2.3 % 20), 2, 2);
    }
  }
  g.globalAlpha = 1; g.lineWidth = 1;
}

function drawBomb(G, g) {
  const p = G.player, bm = p.bomb;
  if (!bm) return;
  const c = ANGELS[G.angel].halo;
  g.strokeStyle = c; g.lineWidth = 3;
  if (bm.t <= 30) {
    // 차지: 원이 기체로 수렴
    const r = 60 * (1 - bm.t / 30) + 8;
    g.globalAlpha = 0.8; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.stroke();
  } else {
    g.globalAlpha = Math.max(0, 1 - (bm.t - 30) / 70);
    g.beginPath(); g.arc(p.x, p.y, bm.r, 0, TAU); g.stroke();
    g.fillStyle = c; g.globalAlpha *= 0.15; g.fill();
  }
  g.globalAlpha = 1; g.lineWidth = 1;
}

// 피격 판정은 항상 표시: 빨간 테두리 안의 흰 점이 실제 판정 크기.
// 저속일 때는 주변에 회전하는 링을 더해 위치를 찾기 쉽게 함
function drawHitbox(G, g) {
  const p = G.player;
  if (G.phase === 'gameover') return;
  const hurt = p.flash > 0;
  if (p.focus) {
    g.save(); g.translate(p.x, p.y); g.rotate(G.bgT * 0.05);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2; g.setLineDash([5, 4]);
    g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.stroke(); g.setLineDash([]); g.restore();
  }
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(p.x, p.y, HIT_R + 3.2, 0, TAU); g.fill();
  g.strokeStyle = hurt ? '#ffffff' : '#ff2a3a'; g.lineWidth = 1.6;
  g.beginPath(); g.arc(p.x, p.y, HIT_R + 2.2, 0, TAU); g.stroke();
  g.fillStyle = hurt ? '#ff2a3a' : '#ffffff';
  g.beginPath(); g.arc(p.x, p.y, HIT_R, 0, TAU); g.fill();
}

function drawFieldUI(G, g) {
  const b = G.boss, sp = G.spell;
  if (G.slow) {
    // 불렛타임: 화면이 푸르게 가라앉고 남은 시간 막대
    const k = 1 - G.slowFactor();
    g.globalAlpha = 0.18 * k / (1 - G.slow.k); g.fillStyle = '#4fa8ff'; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1; g.fillStyle = '#bfe4ff'; g.font = 'bold 13px Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('BULLET TIME', 8, H - 22);
    g.fillStyle = 'rgba(191,228,255,0.8)'; g.fillRect(100, H - 17, (W - 110) * (1 - G.slow.t / G.slow.dur), 4);
  }
  g.font = '12px system-ui, "Malgun Gothic", sans-serif'; g.textBaseline = 'top';
  if (!b.hidden && !sp.survival) {
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(8, 6, W - 60, 4);
    g.fillStyle = '#fff'; g.fillRect(8, 6, (W - 60) * b.hp / b.maxHp, 4);
  }
  // 시간
  const sec = Math.max(0, G.timer) / 60;
  g.textAlign = 'right'; g.fillStyle = sec < 10 ? '#ff6b7a' : '#fff'; g.font = 'bold 14px Consolas, monospace';
  g.fillText(sec.toFixed(2), W - 6, 2);
  if (G.timeFlash && G.timeFlash.t++ < 90) {
    g.globalAlpha = 1 - G.timeFlash.t / 90; g.fillStyle = '#9fe8a8';
    g.fillText(G.timeFlash.text, W - 60, 2 + G.timeFlash.t * 0.1); g.globalAlpha = 1;
  }
  // 스펠 선언
  if (G.banner) {
    const t = G.banner.t, x = t < 20 ? W + 20 - (t / 20) * 26 : W - 6, y = t < 60 ? 200 : Math.max(18, 200 - (t - 60) * 8);
    // 긴 이름은 필드 폭에 맞게 글자를 줄임
    g.font = 'bold 13px system-ui, "Malgun Gothic", sans-serif'; g.textAlign = 'right';
    const full = g.measureText(G.banner.text).width;
    if (full > W - 20) g.font = `bold ${Math.max(9, Math.floor(13 * (W - 20) / full))}px system-ui, "Malgun Gothic", sans-serif`;
    const tw = g.measureText(G.banner.text).width;
    g.fillStyle = 'rgba(80,20,40,0.6)'; g.fillRect(x - tw - 10, y - 2, tw + 14, 19);
    g.fillStyle = '#fff'; g.fillText(G.banner.text, x, y);
  }
  g.textAlign = 'left';
  if (G.result) {
    const r = G.result;
    g.textAlign = 'center'; g.font = 'bold 18px system-ui, "Malgun Gothic", sans-serif';
    g.fillStyle = r.captured ? '#f5c542' : '#c8c8d8';
    const runDone = G.run && G.run.idx >= G.run.seq.length - 1 && r.reason === 'defeat';
    const txt = runDone ? `${G.run.name} 격파!` : r.captured ? '스펠카드 획득' : G.spell.type === 'stage' ? '웨이브 종료' : r.reason === 'timeout' ? (G.spell.survival ? '내구 실패' : '시간 초과') : G.spell.type === 'spell' ? '격파 (획득 실패)' : '격파';
    g.fillText(txt, W / 2, 150);
    g.font = '12px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#fff';
    g.fillText(`피탄 ${r.stats.miss + r.stats.hits} · 봄 ${r.stats.bombs}`, W / 2, 178);
    g.textAlign = 'left';
  }
  if (G.phase === 'gameover') {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff6b7a'; g.textAlign = 'center'; g.font = 'bold 24px system-ui, "Malgun Gothic", sans-serif';
    g.fillText('게임 오버', W / 2, H / 2 - 24);
    g.fillStyle = '#fff'; g.font = '12px system-ui, "Malgun Gothic", sans-serif';
    g.fillText('R 바로 재시작 · 잠시 후 자동 재시작', W / 2, H / 2 + 12);
    g.textAlign = 'left';
  }
  if (G.paused) {
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 20px system-ui, "Malgun Gothic", sans-serif';
    g.fillText('일시정지', W / 2, H / 2 - 20);
    g.font = '12px system-ui, "Malgun Gothic", sans-serif'; g.fillText('Esc 재개 · . 한 프레임', W / 2, H / 2 + 8);
    g.textAlign = 'left';
  }
  if (G.error) {
    g.fillStyle = 'rgba(120,0,20,0.85)'; g.fillRect(0, H - 40, W, 40);
    g.fillStyle = '#fff'; g.font = '11px Consolas, monospace'; g.fillText('패턴 오류: ' + G.error.slice(0, 60), 6, H - 34);
  }
}

function drawHUD(G, g) {
  const x = FX + W + 16;
  g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillStyle = '#f5c542'; g.font = 'bold 16px system-ui, "Malgun Gothic", sans-serif';
  g.fillText('탄막 테스트', x, 20);
  const st = G.stats, dps = st.dmgLog.reduce((a, b) => a + b, 0);
  // 목숨·폭탄
  const p = G.player;
  g.font = '13px system-ui, "Malgun Gothic", sans-serif';
  g.fillStyle = '#9090a8'; g.fillText('목숨', x, 50); g.fillText('폭탄', x, 72);
  g.font = '15px system-ui, "Segoe UI Symbol", sans-serif';
  for (let i = 0; i < START_LIVES + 2; i++) { g.fillStyle = i < p.lives ? '#ff6b9a' : '#3a3a4a'; if (i < Math.max(p.lives, START_LIVES)) g.fillText('♥', x + 48 + i * 17, 48); }
  for (let i = 0; i < Math.max(p.bombs, START_BOMBS); i++) { g.fillStyle = i < p.bombs ? '#7fe0a0' : '#3a3a4a'; g.fillText('✦', x + 48 + i * 17, 70); }
  g.font = '13px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#9090a8'; g.fillText('파워', x, 94);
  g.fillStyle = '#2a2a3a'; g.fillRect(x + 48, 98, 90, 8);
  g.fillStyle = p.power >= MAX_POWER ? '#ffd23a' : '#e8403a'; g.fillRect(x + 48, 98, 90 * p.power / MAX_POWER, 8);
  g.fillStyle = '#fff'; g.font = '11px Consolas, monospace'; g.fillText(p.power >= MAX_POWER ? 'MAX' : p.power.toFixed(2), x + 144, 96);
  if (G.invincible) { g.fillStyle = '#9090a8'; g.font = '11px system-ui, "Malgun Gothic", sans-serif'; g.fillText('무적: 목숨·폭탄 소모 없음', x, 114); }
  const rows = [
    ['패턴', G.run ? `${G.run.name} ${G.run.idx + 1}/${G.run.seq.length}` : `${G.spellIndex + 1} / ${G.spells.length}`],
    ['기체', ANGELS[G.angel].name],
    ['난이도', DIFFS[G.difficulty]],
    ['점수', G.score.toLocaleString()],
    ['그레이즈', G.graze],
    ['피탄', G.invincible ? `${st.hits} (무적)` : st.miss],
    ['봄 사용', st.bombs],
    ['탄 수', G.bullets.length + (G.lasers.length ? ` + 레이저 ${G.lasers.length}` : '')],
    ['DPS', dps.toFixed(0)],
    ['보스 HP', G.boss.hidden ? '-' : `${Math.ceil(G.boss.hp)} / ${G.boss.maxHp}`],
    ['속도', G.speed + '×' + (SFX.muted ? ' · 소리 끔' : '')],
    ['FPS', G.fps.toFixed(0)],
  ];
  g.font = '13px system-ui, "Malgun Gothic", sans-serif';
  rows.forEach(([k, v], i) => {
    g.fillStyle = '#9090a8'; g.fillText(k, x, 132 + i * 21);
    g.fillStyle = '#fff'; g.fillText(String(v), x + 72, 132 + i * 21);
  });
  g.fillStyle = '#9090a8'; g.font = '11px system-ui, "Malgun Gothic", sans-serif';
  wrap(g, G.spell.name, x, 132 + rows.length * 21 + 8, 176, 15);
}

function wrap(g, text, x, y, w, lh) {
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > w) { g.fillText(line, x, y); y += lh; line = ch; } else line += ch;
  }
  g.fillText(line, x, y);
}
