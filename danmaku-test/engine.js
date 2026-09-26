'use strict';
// 탄막 테스트 엔진. 좌표는 플레이 영역(384×448) 기준이며 60틱 고정.

const TAU = Math.PI * 2;
const W = 384, H = 448;          // 플레이 영역
const FX = 32, FY = 16;          // 화면(640×480) 안 플레이 영역 위치
const SC = 2;                    // 캔버스 내부 배율
const HIT_R = 2.4, GRAZE_R = 18;

// ── 탄 스프라이트 ──────────────────────────────────────────
const COLORS = {
  red: '#ff3b4a', orange: '#ff8a2a', yellow: '#ffd23a', green: '#3ddc6a', cyan: '#35d6ff',
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

// 탄 한 발: {x,y,vx,vy,dmg,shape,color,homing,turn,life}
// 3틱마다 한 번 발사(초당 20회)가 기준. 정지 표적 명중 기준 DPS 목표는 주석대로.
function shot(out, x, y, a, spd, dmg, shape, color, extra) {
  out.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg, shape, color, ...extra });
}
const UP = -Math.PI / 2;
const SHOT_TYPES = {
  // 아리엘: 정밀한 전방 집중. 저속 시 최고 단일 화력(약 220)
  AR(p, out, focus) {
    const t = p.fireT;
    if (t % 3 === 0) {
      const xs = focus ? [-6, -2, 2, 6] : [-13, -5, 5, 13], spread = focus ? 0 : 0.035;
      xs.forEach((dx, i) => shot(out, p.x + dx, p.y - 10, UP + (i - 1.5) * spread, 18, focus ? 2.3 : 2.1, 'needle', 'gold'));
    }
    if (focus && t % 6 === 0) shot(out, p.x, p.y - 14, UP, 20, 4, 'lance', 'white');
  },
  // 유리엘: 넓게 흔들리는 가시. 고속은 거리에 따라 크게 달라지고(원거리 약 80~근접 약 200), 저속은 좁은 다발(약 180)
  UR(p, out, focus) {
    if (p.fireT % 3) return;
    const n = focus ? 5 : 7, gap = focus ? 0.05 : 0.13, wob = focus ? 0.02 : 0.07;
    for (let i = 0; i < n; i++) {
      const a = UP + (i - (n - 1) / 2) * gap + (Math.random() * 2 - 1) * wob;
      shot(out, p.x, p.y - 6, a, 12 + Math.random() * 2, focus ? 1.8 : 2.0, 'thorn', 'red');
    }
  },
  // 루미엘: 절대 빗나가지 않는 유도 부적 + 약한 정면탄(약 130)
  LM(p, out, focus) {
    const t = p.fireT;
    if (t % 3 === 0) for (const dx of [-4, 4]) shot(out, p.x + dx, p.y - 10, UP, 16, 1.2, 'needle', 'pink');
    if (t % 5 === 0) {
      const spreadA = focus ? 0.35 : 0.9;
      for (const k of [-1, -0.4, 0.4, 1]) shot(out, p.x + k * 10, p.y, UP + k * spreadA, 8, focus ? 1.8 : 1.6, 'amulet', 'purple',
        { homing: true, turn: focus ? 0.25 : 0.14, life: 90 });
    }
  },
  // 라티엘: 가운데 바늘 + 옵션의 별탄. 고속은 넓게 덮고(약 110), 저속은 옵션이 앞으로 모임(약 175)
  RH(p, out, focus) {
    if (p.fireT % 3) return;
    for (const dx of [-5, 0, 5]) shot(out, p.x + dx, p.y - 10, UP, 16, 1.7, 'needle', 'cyan');
    for (const o of p.options) {
      const a = UP + (focus ? 0 : Math.sign(o.x - p.x) * 0.12);
      shot(out, o.x, o.y - 4, a, 13, 1.8, 'star', 'blue');
    }
  },
};

// ── 게임 본체 ─────────────────────────────────────────────
class Game {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.keys = new Set(); this.pressed = new Set();
    this.speed = 1; this.invincible = true; this.loop = true; this.paused = false;
    this.spells = []; this.spellIndex = 0;
    this.angel = 'AR';
    this.error = '';
    this.tasks = new Tasks(e => this.fail(e));
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    this.score = 0; this.graze = 0;
    this.bgT = 0;
    this.api = makeAPI(this);
  }

  fail(e) { console.error(e); this.error = String(e && e.message || e); }

  // ── 패턴 수명주기 ──
  start(i = this.spellIndex) {
    this.spellIndex = (i + this.spells.length) % this.spells.length;
    const sp = this.spell = this.spells[this.spellIndex];
    this.bullets = []; this.lasers = []; this.enemies = []; this.shots = []; this.fx = [];
    this.partners = []; this.chants = []; this.zones = [];
    this.tasks.clear(); this.error = '';
    this.player = this.player || {};
    Object.assign(this.player, { x: W / 2, y: H - 48, inv: 60, fireT: 0, bomb: null, options: [], flash: 0 });
    this.stats = { miss: 0, hits: 0, bombs: 0, dmgLog: new Array(60).fill(0), dmgNow: 0 };
    const b = this.boss = { x: W / 2, y: -40, hp: sp.hp || 1000, maxHp: sp.hp || 1000, move: null, hidden: sp.type === 'stage', t: 0,
      name: sp.boss || '', color: sp.bossColor || '#d8d0ff', shield: 0, glow: 0, contact: false };
    this.moveBoss(sp.start?.[0] ?? W / 2, sp.start?.[1] ?? 110, 45);
    this.frame = 0; this.phase = 'intro'; this.phaseT = 50;
    this.timer = (sp.time || 30) * 60;
    this.banner = sp.type === 'spell' ? { text: sp.name, t: 0 } : null;
    this.result = null;
    if (b.hidden) { b.x = W / 2; b.y = -200; b.move = null; }
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
    if (captured && sp.type === 'spell') this.score += Math.floor(1000000 * this.timer / (sp.time * 60) + 100000);
    this.clearBullets(true);
    this.tasks.clear();
    this.enemies.forEach(e => this.killEnemy(e, false));
    this.result = { captured: captured && sp.type === 'spell', reason, t: 0, stats: { ...this.stats } };
    this.phase = 'result'; this.phaseT = 150;
  }

  clearBullets(points) {
    for (const b of this.bullets) this.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 20, color: b.color });
    if (points) this.score += this.bullets.length * 10;
    this.bullets = []; this.lasers = [];
  }

  killEnemy(e, reward = true) {
    if (e.dead) return;
    e.dead = true;
    // 정화 연출: 사람 실루엣이 떠오름
    this.fx.push({ kind: 'purify', x: e.x, y: e.y, t: 0, life: 50 });
    if (reward) this.score += 3000;
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
      if (--this.phaseT <= 0) this.start(this.loop ? this.spellIndex : this.spellIndex + 1);
    }

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
    const spd = focus ? 2 : 4.5, n = dx && dy ? Math.SQRT1_2 : 1;
    p.x = Math.max(8, Math.min(W - 8, p.x + dx * spd * n));
    p.y = Math.max(16, Math.min(H - 16, p.y + dy * spd * n));
    p.tilt = dx;
    if (p.inv > 0) p.inv--;
    if (p.flash > 0) p.flash--;

    // 라티엘 옵션
    if (this.angel === 'RH') {
      const tx = focus ? 12 : 30, ty = focus ? -14 : 4;
      if (!p.options.length) p.options = [{ x: p.x, y: p.y }, { x: p.x, y: p.y }];
      p.options.forEach((o, i) => { const s = i ? 1 : -1; o.x += (p.x + s * tx - o.x) * 0.3; o.y += (p.y + ty - o.y) * 0.3; });
    } else p.options = [];

    if (k.has('KeyZ') && !p.bomb) { SHOT_TYPES[this.angel](p, this.shots, focus); p.fireT++; } else p.fireT = 0;

    if (this.pressed.has('KeyX') && !p.bomb && this.phase !== 'result') {
      // 봄: 0.5초 차지(무적) 후 확산하며 탄 소거
      p.bomb = { t: 0 }; p.inv = Math.max(p.inv, 30 + 150); this.stats.bombs++;
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
  }

  hitPlayer() {
    const p = this.player;
    if (p.inv > 0) return;
    if (this.invincible) {
      this.stats.hits++; p.flash = 20; p.inv = 20;
      return;
    }
    this.stats.miss++;
    this.fx.push({ kind: 'burst', x: p.x, y: p.y, t: 0, life: 40 });
    this.clearBullets(false);
    p.x = W / 2; p.y = H - 48; p.inv = 150; p.bomb = null;
  }

  updateBullets() {
    const p = this.player, bs = this.bullets;
    for (const b of bs) {
      b.t++;
      if (b.fn) { try { b.fn(b, this.api); } catch (e) { this.fail(e); b.fn = null; } }
      if (b.cart) { b.vx += b.ax; b.vy += b.ay; b.x += b.vx; b.y += b.vy; }
      else {
        b.spd += b.accel; b.ang += b.angVel;
        if (b.maxSpd !== undefined && b.spd > b.maxSpd) b.spd = b.maxSpd;
        if (b.minSpd !== undefined && b.spd < b.minSpd) b.spd = b.minSpd;
        b.x += Math.cos(b.ang) * b.spd; b.y += Math.sin(b.ang) * b.spd;
      }
      const m = b.margin;
      if (b.x < -m || b.x > W + m || b.y < -m - b.marginTop || b.y > H + m) b.dead = true;
      if (b.dead) continue;
      const d = dist2(b.x, b.y, p.x, p.y), r = b.r + HIT_R, gr = b.r + GRAZE_R;
      if (d < r * r) { this.hitPlayer(); if (!this.invincible) break; }
      else if (d < gr * gr && !b.grazed) { b.grazed = true; this.graze++; this.score += 500; this.fx.push({ kind: 'graze', x: p.x, y: p.y, t: 0, life: 12 }); }
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
      if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20 || (s.life && s.t > s.life)) { s.dead = true; continue; }
      for (const e of targets) if (!e.dead && dist2(s.x, s.y, e.x, e.y) < (e.r + 6) ** 2) { e.hp -= s.dmg; e.hurt = 4; s.dead = true; break; }
      if (!s.dead && this.zones.some(z => dist2(s.x, s.y, z.x, z.y) < z.r * z.r)) { s.dead = true; this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); continue; }
      if (!s.dead && !b.hidden && this.phase === 'active' && dist2(s.x, s.y, b.x, b.y) < 30 * 30) {
        s.dead = true;
        // 필리우스 제1식은 약한 공격을 막음: 통상탄은 막히고 봄은 통함
        if (b.shield > 0) { this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); continue; }
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
    if (take('KeyR')) this.start();
    if (take('BracketRight')) { this.start(this.spellIndex + 1); this.onChange?.(); }
    if (take('BracketLeft')) { this.start(this.spellIndex - 1); this.onChange?.(); }
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
        shape: o.shape || 'small', color: o.color || 'red', r: o.r ?? def.r,
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
      const e = { x: o.x ?? W / 2, y: o.y ?? -20, vx: o.vx ?? 0, vy: o.vy ?? 0, hp: o.hp ?? 30, r: o.r ?? 14, t: 0, color: o.color || 'red' };
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
  drawShots(G, g);
  drawPlayer(G, g);
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
  }
}

// 자기 탄은 반투명으로 그려 적탄을 가리지 않게 한다
function drawShots(G, g) {
  const base = g.getTransform();
  g.globalAlpha = 0.6;
  for (const s of G.shots) {
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
    g.drawImage(img, -s / 2, -s / 2, s, s);
  }
  g.setTransform(base);
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

function drawHitbox(G, g) {
  const p = G.player;
  if (!p.focus && !p.flash) return;
  g.fillStyle = p.flash ? '#ff3b4a' : '#fff';
  g.strokeStyle = p.flash ? '#ff3b4a' : ANGELS[G.angel].accent; g.lineWidth = 1;
  g.beginPath(); g.arc(p.x, p.y, HIT_R + 2, 0, TAU); g.stroke();
  g.beginPath(); g.arc(p.x, p.y, HIT_R, 0, TAU); g.fill();
}

function drawFieldUI(G, g) {
  const b = G.boss, sp = G.spell;
  g.font = '12px system-ui, "Malgun Gothic", sans-serif'; g.textBaseline = 'top';
  if (!b.hidden && !sp.survival) {
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(8, 6, W - 60, 4);
    g.fillStyle = '#fff'; g.fillRect(8, 6, (W - 60) * b.hp / b.maxHp, 4);
  }
  // 시간
  const sec = Math.max(0, G.timer) / 60;
  g.textAlign = 'right'; g.fillStyle = sec < 10 ? '#ff6b7a' : '#fff'; g.font = 'bold 14px Consolas, monospace';
  g.fillText(sec.toFixed(2), W - 6, 2);
  // 스펠 선언
  if (G.banner) {
    const t = G.banner.t, x = t < 20 ? W + 20 - (t / 20) * 26 : W - 6, y = t < 60 ? 200 : Math.max(18, 200 - (t - 60) * 8);
    g.font = 'bold 13px system-ui, "Malgun Gothic", sans-serif'; g.textAlign = 'right';
    const tw = g.measureText(G.banner.text).width;
    g.fillStyle = 'rgba(80,20,40,0.6)'; g.fillRect(x - tw - 10, y - 2, tw + 14, 19);
    g.fillStyle = '#fff'; g.fillText(G.banner.text, x, y);
  }
  g.textAlign = 'left';
  if (G.result) {
    const r = G.result;
    g.textAlign = 'center'; g.font = 'bold 18px system-ui, "Malgun Gothic", sans-serif';
    g.fillStyle = r.captured ? '#f5c542' : '#c8c8d8';
    const txt = r.captured ? '스펠카드 획득' : G.spell.type === 'stage' ? '웨이브 종료' : r.reason === 'timeout' ? (G.spell.survival ? '내구 실패' : '시간 초과') : G.spell.type === 'spell' ? '격파 (획득 실패)' : '격파';
    g.fillText(txt, W / 2, 150);
    g.font = '12px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#fff';
    g.fillText(`피탄 ${r.stats.miss + r.stats.hits} · 봄 ${r.stats.bombs}`, W / 2, 178);
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
  const rows = [
    ['패턴', `${G.spellIndex + 1} / ${G.spells.length}`],
    ['기체', ANGELS[G.angel].name],
    ['점수', G.score.toLocaleString()],
    ['그레이즈', G.graze],
    ['피탄', G.invincible ? `${st.hits} (무적)` : st.miss],
    ['봄 사용', st.bombs],
    ['탄 수', G.bullets.length + (G.lasers.length ? ` + 레이저 ${G.lasers.length}` : '')],
    ['DPS', dps.toFixed(0)],
    ['보스 HP', G.boss.hidden ? '-' : `${Math.ceil(G.boss.hp)} / ${G.boss.maxHp}`],
    ['속도', G.speed + '×'],
    ['FPS', G.fps.toFixed(0)],
  ];
  g.font = '13px system-ui, "Malgun Gothic", sans-serif';
  rows.forEach(([k, v], i) => {
    g.fillStyle = '#9090a8'; g.fillText(k, x, 56 + i * 24);
    g.fillStyle = '#fff'; g.fillText(String(v), x + 72, 56 + i * 24);
  });
  g.fillStyle = '#9090a8'; g.font = '11px system-ui, "Malgun Gothic", sans-serif';
  wrap(g, G.spell.name, x, 56 + rows.length * 24 + 10, 176, 15);
}

function wrap(g, text, x, y, w, lh) {
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > w) { g.fillText(line, x, y); y += lh; line = ch; } else line += ch;
  }
  g.fillText(line, x, y);
}
