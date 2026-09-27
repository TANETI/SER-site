'use strict';
// 탄막 테스트 엔진. 좌표는 플레이 영역(384×448) 기준이며 60틱 고정.

const TAU = Math.PI * 2;
const W = 384, H = 448;          // 플레이 영역
const FX = 32, FY = 16;          // 화면(640×480) 안 플레이 영역 위치
const SC = 2;                    // 캔버스 내부 배율
const HIT_R = 2.0, GRAZE_R = 18;   // 기체 피격 반지름(2.4에서 줄임). 판정점 표시도 이 값을 따름
const START_LIVES = 3, START_BOMBS = 3;
// 노말 이하는 목숨 하나 더
const livesFor = diff => diff <= 1 ? 4 : START_LIVES;
// 파워 0.00~4.00. 정수 부분이 탄 단계. 작은 P +0.02, 큰 P +0.25, 죽으면 -0.5
const MAX_POWER = 4, P_SMALL = 0.02, P_BIG = 0.25, DEATH_POWER_LOSS = 0.5;
// 난이도별 보스 체력 배율
// 기준을 한 칸 내림: 예전 이지 값이 지금 노말, 예전 노말 값이 지금 하드
const HP_MUL = [0.6, 0.7, 0.85, 1, 1.1, 1.2];
// 보스 체력 전체 배율(제한시간에는 영향 없음)
const BOSS_HP = 0.855;   // 0.9에서 5% 너프
// 패턴에 적힌 체력·제한시간에 곱하는 배율(내구 스펠·잡몹 구간·허수아비 제외).
// 보스전은 스테이지마다 hpScale로 길이를 따로 맞춤(BOSS_RUNS). 단일 패턴 연습은 이 기본값
const HP_SCALE = 2.2;
// 난이도: 0=이지 1=노말 2=하드 3=베리하드 4=헬. 패턴은 s.lv·s.cnt·s.wait·s.sp로 난이도를 반영한다.
// 하드가 시험판 처음의 잠정 최고 밀도. 표의 6번째 값은 예전 '엑스트라 한 단계 위' 계산용으로 지금은 쓰지 않음
const DIFFS = ['이지', '노말', '하드', '베리하드', '헬'];
const DENSITY = [0.55, 0.8, 1, 1.2, 1.4, 1.6], INTERVAL = [1.6, 1.25, 1, 0.88, 0.78, 0.7], SPEED = [0.82, 0.92, 1, 1.06, 1.12, 1.16];

// ── 탄 스프라이트 ──────────────────────────────────────────
const COLORS = {
  // 배경이 거의 검정이라 어두운 색(파랑·보라·갈색)은 밝게 둠. 노랑(레몬)과 금색(호박)은 서로 구분되게 벌림
  ivy: '#3fae5a', red: '#ff3b4a', orange: '#ff8a2a', yellow: '#ffe55c', green: '#3ddc6a', cyan: '#35d6ff',
  blue: '#5b8cff', purple: '#bb6bff', pink: '#ff5ec8', white: '#e8e8f4', gold: '#f0ad32',
  brown: '#cf8446', black: '#30303c',
  // void: 흰 광채를 두른 검은 탄(sprite에서 따로 그림)
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

// 적탄은 배경·자기 탄과 섞이지 않게 모두 어두운 테두리를 두르고 흰 심을 넣는다
const EDGE = 'rgba(0,0,0,0.75)';
function orb(g, x, y, r, c) {
  const gr = g.createRadialGradient(x, y, r * 0.6, x, y, r);   // 바깥 광채
  gr.addColorStop(0, c + '88'); gr.addColorStop(1, c + '00');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = c; g.beginPath(); g.arc(x, y, r * 0.66, 0, TAU); g.fill();
  g.strokeStyle = EDGE; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r * 0.38, 0, TAU); g.fill();
}
function ellipse(g, x, y, rx, ry, c) {
  g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  g.strokeStyle = EDGE; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, rx * 0.55, ry * 0.4, 0, 0, TAU); g.fill();
}
function knife(g, c) {
  g.fillStyle = c; g.beginPath(); g.moveTo(19, 10); g.lineTo(4, 6); g.lineTo(1, 10); g.lineTo(4, 14); g.closePath(); g.fill();
  g.strokeStyle = EDGE; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(16, 10); g.lineTo(5, 8.5); g.lineTo(5, 11.5); g.closePath(); g.fill();
}
function star(g, x, y, r, c) {
  g.fillStyle = c; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill(); g.strokeStyle = EDGE; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r * 0.3, 0, TAU); g.fill();
}
function leafShape(g, c) {
  g.fillStyle = c; g.beginPath(); g.moveTo(15, 8); g.quadraticCurveTo(8, 1, 1, 8); g.quadraticCurveTo(8, 15, 15, 8); g.fill();
  g.strokeStyle = EDGE; g.lineWidth = 1; g.stroke();
  g.strokeStyle = '#eaffea'; g.lineWidth = 1; g.beginPath(); g.moveTo(14, 8); g.lineTo(3, 8); g.stroke();
}
function chainLink(g, c) {
  g.strokeStyle = EDGE; g.lineWidth = 3.6; g.beginPath(); g.ellipse(7, 7, 6, 3.4, 0, 0, TAU); g.stroke();
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
    if (color === 'void') {
      // 빛나는 검은 탄(아즈라엘): 흰 광채를 먼저 깔고 그 위에 검은 몸체
      const h = def.size / 2, gr = g.createRadialGradient(h, h, h * 0.3, h, h, h);
      gr.addColorStop(0, '#ffffffcc'); gr.addColorStop(0.55, '#ffffff55'); gr.addColorStop(1, '#ffffff00');
      g.fillStyle = gr; g.beginPath(); g.arc(h, h, h, 0, TAU); g.fill();
      def.draw(g, '#0c0c14');
    } else def.draw(g, COLORS[color] || color);
    spriteCache.set(key, s);
  }
  return s;
}

// ── 캐릭터 이미지(임시) ──────────────────────────────────
// srp.issssm.com의 1번(기본) 이미지에서 얼굴·어깨를 잘라 보스·동료의 작은 초상으로, 102번(전투) 이미지에서 얼굴이 있는
// 가로 띠를 잘라 스펠 컷인으로 씀. 불러오지 못하면 예전처럼 색 동그라미로 그림
const IMG_BASE = 'https://srp.issssm.com/';
const PORTRAIT_CODE = { '윤도연': 'YD', '고현성': 'KS', '마리': 'MR', '마르코': 'MC', '김예나': 'KY', '차서린': 'CS', '고태웅': 'KT',
  '아즈라엘': 'AZ', '예로니모': 'JR', '리크니스': 'LY', '이즘': 'IZ', '시연': 'SY' };
// 전투 이미지가 있는 인물과, 컷인으로 자를 가로 띠의 시작 위치(이미지 위에서부터 비율, 얼굴이 들어오게).
// 약스펠은 102(전투), 강스펠은 103(필살기)·120(고유 클라비스) 등. 인물별로 가진 이미지만 적음(없으면 102를 씀)
const CUTIN_BAND = { KY: 0.08, CS: 0.03, KT: 0.08, KS: 0.13, JR: 0.2, SY: 0.12 };
const CUTIN_STRONG_BAND = { 'KY/103': 0, 'CS/103': 0, 'KT/103': 0.04, 'KS/103': 0.07, 'JR/103': 0.14, 'JR/120': 0.07 };
const CUTIN_CODES = new Set(Object.keys(CUTIN_BAND));
// '예로니모(진심)', '마리 (기절)'처럼 괄호가 붙은 이름도 본래 인물로
function codeOf(name) { return name ? PORTRAIT_CODE[name] || PORTRAIT_CODE[name.replace(/\s*\(.*\)$/, '')] || null : null; }
const imgCache = new Map();
// cook(img)로 한 번만 가공한 캔버스를 돌려줌. 아직 못 불러왔거나 실패면 null
// 같은 이미지를 다르게 가공할 때는 variant로 구분(약스펠 띠·강스펠 띠)
function charSprite(code, shot, cook, variant = '') {
  const key = code + '/' + shot;
  let e = imgCache.get(key);
  if (!e) {
    e = { img: new Image(), ok: false, out: {} };
    e.img.crossOrigin = 'anonymous';   // 화면을 이미지로 저장할 수 있게(이미지 서버가 CORS 허용)
    e.img.onload = () => { e.ok = true; };
    e.img.src = `${IMG_BASE}${code}/D/${shot}.webp`;
    imgCache.set(key, e);
  }
  if (e.ok && !e.out[variant]) e.out[variant] = cook(e.img);
  return e.out[variant] || null;
}
// 초상 카드: 1번 이미지 위쪽 가운데(얼굴·어깨)를 44×50 모서리 둥근 카드로
function cookPortrait(img) {
  const w = 44, h = 50, c = document.createElement('canvas');
  c.width = w * SC; c.height = h * SC;
  const g = c.getContext('2d'); g.scale(SC, SC);
  g.beginPath(); g.roundRect(0, 0, w, h, 8); g.clip();
  const sw = img.naturalWidth * 0.5, sh = sw * h / w;
  g.drawImage(img, img.naturalWidth * 0.25, img.naturalHeight * 0.05, sw, sh, 0, 0, w, h);
  return c;
}
// 컷인 띠: 102번 이미지의 가로 띠(top부터 34%)를 흐리게. 왼쪽에서 들어오므로 뒤따르는 왼쪽 끝이 잔상처럼 투명하게 사라짐
function cookCutin(img, top) {
  const w = 250, h = 58, c = document.createElement('canvas');
  c.width = w * SC; c.height = h * SC;
  const g = c.getContext('2d'); g.scale(SC, SC);
  g.filter = 'blur(0.8px)';
  g.drawImage(img, 0, img.naturalHeight * top, img.naturalWidth, img.naturalHeight * 0.34, 0, 0, w, h);
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0.95)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return c;
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
// 모든 기체 공통 대미지 배율. 표 안의 대미지·주석의 초당 피해량은 배율 적용 전 값
const SHOT_DMG = 1.65;   // 1.25 × 1.15 × 1.15
function shot(out, x, y, a, spd, dmg, shape, color, extra) {
  out.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg: dmg * SHOT_DMG, shape, color, ...extra });
}
const UP = -Math.PI / 2;
// 거리 감쇠가 있는 탄은 멀리 갈수록 약해짐(남은 수명 비율 기준)
function shotDamage(s) { return s.falloff ? s.dmg * (0.45 + 0.85 * (1 - s.t / s.life)) : s.dmg; }

// 모든 기체는 기본으로 유도탄을 쏜다(유도탄 모양·색은 기체마다). 기체의 특색은 본체 탄의 퍼짐·개수·속도·모양에서 나온다.
// 표는 파워 단계 [0, 1, 2, 3, 4]. n=발 수, iv=발사 간격(틱), dmg=한 발 대미지(공통 배율 적용 전)
const HOMING = {
  AR: { n: [1, 1, 1, 1, 2], iv: [70, 60, 50, 45, 40], dmg: [22, 22, 22, 22, 22], spd: 9.5, turn: 0.18, spread: 0.5, shape: 'needle', color: 'white', laser: true },
  UR: { n: [2, 2, 2, 3, 4], iv: [12, 10, 9, 8, 7], dmg: [1.2, 1.2, 1.2, 1.2, 1.2], spd: 8, turn: 0.14, spread: 0.9, shape: 'amulet', color: 'orange' },
  LM: { n: [2, 2, 2, 4, 4], iv: [10, 9, 7, 7, 5], dmg: [1.8, 1.8, 1.8, 1.8, 1.8], spd: 7, turn: 0.16, spread: 0.9, shape: 'amulet', color: 'purple' },
  RH: { n: [2, 2, 2, 2, 4], iv: [10, 9, 8, 7, 6], dmg: [1.2, 1.2, 1.2, 1.2, 1.2], spd: 8.5, turn: 0.15, spread: 0.35, shape: 'star', color: 'blue', fromOptions: true, pierce: true },
};
function homingShots(p, out, focus, L, h) {
  const n = h.n[L];
  if (p.fireT % h.iv[L]) return;
  const ks = n === 1 ? [0] : n === 2 ? [-1, 1] : n === 3 ? [-1, 0, 1] : [-1, -0.4, 0.4, 1];
  ks.forEach((k, i) => {
    const o = h.fromOptions && p.options.length ? p.options[i % p.options.length] : { x: p.x + k * 10, y: p.y - 4 };
    const extra = { homing: true, turn: focus ? h.turn * 1.6 : h.turn, life: 110 };
    if (h.laser) Object.assign(extra, { laser: true, trail: [] });
    if (h.pierce) extra.pierce = [];
    shot(out, o.x, o.y, UP + k * h.spread * (focus ? 0.4 : 1), h.spd, h.dmg[L], h.shape, h.color, extra);
  });
}
// 본체 탄: n줄을 좌우 간격 gapX·각도 간격 spread로 부채꼴 발사
function bodyShots(p, out, focus, L, b) {
  if (p.fireT % b.iv[L]) return;
  const n = b.n[L], spread = focus ? b.focusSpread(n) : b.spread, gapX = focus ? 4 : b.gapX;
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2, wob = b.wob ? (Math.random() * 2 - 1) * (focus ? b.wob / 3 : b.wob) : 0;
    const extra = b.falloff ? { life: b.life + (Math.random() * 3 | 0), falloff: true } : undefined;
    shot(out, p.x + k * gapX, p.y - 10, UP + k * spread + wob, b.spd, b.dmg[L] * (focus ? 1 : (b.wideDmg ?? 1)), b.shape, b.color, extra);
  }
}
const BODY = {
  // 아리엘(질서 선): 가장 빠르고 곧은 좁은 바늘 다발
  AR: { n: [2, 3, 3, 4, 5], iv: [6, 5, 4, 3, 3], dmg: [1.6, 1.88, 2.81, 1.63, 1.2], spd: 15.5, spread: 0.03, focusSpread: () => 0, gapX: 8, shape: 'needle', color: 'gold' },
  // 유리엘(혼돈 선): 가장 많은 가시를 부채꼴로. 멀리 갈수록 약해지고 흐려짐(사거리 약 360px)
  UR: { n: [3, 4, 5, 6, 8], iv: [5, 4, 3, 2, 2], dmg: [1.41, 1.53, 1.34, 0.9, 0.68], spd: 12, spread: 0.07, focusSpread: n => Math.min(0.035, 0.16 / Math.max(n - 1, 1)),
        gapX: 3, wob: 0.03, wideDmg: 0.9, shape: 'thorn', color: 'red', falloff: true, life: 29 },
  // 루미엘(중립 선): 적고 느린 바늘. 대신 유도탄 비중이 가장 큼
  LM: { n: [1, 2, 2, 2, 3], iv: [6, 4, 3, 3, 3], dmg: [2.2, 2.5, 2.06, 1.9, 1.25], spd: 12.5, spread: 0, focusSpread: () => 0, gapX: 8, shape: 'needle', color: 'pink' },
  // 라티엘(진 중립): 중간 퍼짐의 바늘. 옵션 둘이 유도 별을 쏨
  RH: { n: [1, 2, 3, 3, 4], iv: [6, 5, 4, 3, 3], dmg: [3.6, 3.04, 3.12, 2.57, 1.8], spd: 14, spread: 0.05, focusSpread: () => 0.012, gapX: 6, shape: 'needle', color: 'cyan' },
};
const SHOT_TYPES = Object.fromEntries(['AR', 'UR', 'LM', 'RH'].map(code => [code, (p, out, focus, L) => {
  bodyShots(p, out, focus, L, BODY[code]);
  homingShots(p, out, focus, L, HOMING[code]);
}]));

// ── 본게임 해금 기록(이 브라우저에만 저장) ──
// 본편 클리어 → 엑스트라, 엑스트라 클리어 → 엑스트라 2
const UNLOCK_NEXT = { main: 'extra', extra: 'extra2' };
function unlocked(key) {
  if (key === 'main') return true;
  try { return !!JSON.parse(localStorage.getItem('danmaku.unlock') || '{}')[key]; } catch (e) { return false; }
}
function unlockStory(cleared) {
  const key = UNLOCK_NEXT[cleared];
  if (!key) return;
  try { const u = JSON.parse(localStorage.getItem('danmaku.unlock') || '{}'); u[key] = true; localStorage.setItem('danmaku.unlock', JSON.stringify(u)); } catch (e) { /* 저장 못 해도 진행 */ }
}

// ── 게임 본체 ─────────────────────────────────────────────
class Game {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.keys = new Set(); this.pressed = new Set();
    this.speed = 1; this.invincible = false; this.difficulty = 1; this.practicePower = 0;   // 단일 패턴 연습도 기본은 파워 0(패널에서 올림)
    this.shakeOn = true; this.shakeMag = 0;   // 화면 흔들림(경기 화면만)
    this.powerLock = false;   // 켜면 파워가 연습 파워에 고정(보스전 포함, 죽어도 안 줄고 아이템으로 안 오름)
    this.loop = true; this.paused = false;
    this.spells = []; this.spellIndex = 0;
    this.angel = 'AR';
    this.error = '';
    this.tasks = new Tasks(e => this.fail(e));
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    this.score = 0; this.graze = 0;
    this.bgT = 0;
    this.api = makeAPI(this);
  }

  // 화면 흔들림: 가장 센 것을 따르고 매 프레임 줄어듦
  shake(mag) { if (this.shakeOn) this.shakeMag = Math.max(this.shakeMag, mag); }

  // 압박 곡선(홍마향처럼 스펠이 진행될수록 거세짐): 스펠카드는 보스 체력이 줄수록, 내구 스펠은 시간이 지날수록 0→1.
  // cnt는 최대 +20%, wait는 최대 약 13% 짧아짐. 논스펠은 0
  // 격화: 패턴 진행도 0→1(보스 체력이 깎인 비율, 내구 스펠은 지난 시간 비율). 논스펠·스펠 모두.
  // 진행도에 따라 탄 수 ×0.75→1.35, 발사 간격 ×1.25→0.75, 탄속 ×0.92→1.12, 회전 ×0.8→1.5로 연속해서 바뀜(절반에서 거의 원래 값).
  // 진행도 1/3·2/3를 넘으면 격화 단계가 오름(격화 II·III). 잡몹 구간은 0.5로 고정
  heat() {
    const sp = this.spell;
    if (!sp) return 0.5;
    if (sp.type === 'stage') return 0.5;
    const p = sp.survival ? 1 - this.timer / this.timerMax : 1 - this.boss.hp / this.boss.maxHp;
    return Math.max(0, Math.min(1, p));
  }
  surgeLevel() { return Math.min(2, Math.floor(this.heat() * 3)); }

  // 엑스트라는 본편을 깬 뒤 열리는 스테이지일 뿐 난이도 체계가 아니므로 고른 난이도 그대로 씀
  effDiff(sp = this.spell) { return this.difficulty; }

  // 패턴의 실제 체력(난이도·보스전 배율 반영). 체력바를 그릴 때 다음 패턴 몫도 이걸로 셈
  hpFor(sp) {
    const scaled = sp.hp < 99999 && !sp.survival && sp.type !== 'stage';
    const k = scaled ? (this.run ? this.run.hpScale * (this.run.bossScale?.[sp.boss] ?? 1) : HP_SCALE) : 1;   // bossScale: 보스전 안 보스별 배율(중간 보스 등)
    return sp.hp >= 99999 ? sp.hp : Math.max(1, Math.round((sp.hp || 1000) * HP_MUL[this.effDiff(sp)] * k * (scaled ? BOSS_HP : 1)));
  }

  // 홍마향식 체력바: 논스펠과 바로 뒤의 스펠(같은 보스)이 체력바 하나. 그 밖의 패턴은 혼자 체력바 하나.
  // 돌려주는 값: 패턴 번호마다 체력바 번호
  barsOf(seq, pages) {
    // pages(페이지마다 패턴 수)가 있으면 그대로 페이지 = 체력바
    if (pages && pages.reduce((a, b) => a + b, 0) === seq.length) return pages.flatMap((n, i) => Array(n).fill(i));
    const bar = [];
    let n = -1;
    seq.forEach((sp, i) => {
      // follow: 앞 패턴에 이어지는 뒤 단계(한 스펠을 둘로 나눈 것)는 앞 패턴과 같은 체력바
      const pairWithPrev = i > 0 && (sp.follow || (sp.type === 'spell' && seq[i - 1].type === 'nonspell' && seq[i - 1].boss === sp.boss && bar[i - 1] !== bar[i - 2]));
      bar.push(pairWithPrev ? n : ++n);
    });
    return bar;
  }

  fail(e) { console.error(e); this.error = String(e && e.message || e); }

  // ── 패턴 수명주기 ──
  // 단일 패턴 연습: 목숨·폭탄을 채우고 시작
  startSingle(i = this.spellIndex) { this.run = null; this.story = null; this.resetLives(this.practicePower); this.start(i); }
  // 보스전: 여러 패턴을 이어서, 목숨·폭탄을 이어 가며 진행
  // carry=true면 본게임에서 앞 스테이지의 목숨·파워를 이어받음(파워는 그 스테이지 기준값보다 1 넘게 낮지 않게, 폭탄은 다시 채움)
  startRun(run, carry = false) {
    // 보스전 동안 쌓는 상태(김예나 시청자 수 등)는 다시 시작하면 초기화
    // 본게임에서 도중(잡몹 구간)이 있으면 그것부터(idx -1). 패턴 테스트 룸의 보스전은 보스부터
    const staged = !!(run.stage && this.story && !this.skipStage);   // 도중 건너뛰기(테스트 도구)면 보스부터
    this.run = { ...run, idx: staged ? -1 : 0, bars: this.barsOf(run.seq, run.pages), yena: undefined, afterStage: false };
    if (carry && this.player) {
      const p = this.player;
      if (!this.powerLock) p.power = Math.max(p.power, (run.power ?? 0) - 1);
      p.bombs = Math.max(p.bombs, START_BOMBS); this.items = [];
    } else this.resetLives(run.power ?? 0);
    this.start(this.spells.indexOf(staged ? run.stage : run.seq[0]));
  }
  // 본게임: 스테이지(보스전)를 차례로. 게임 오버면 그 스테이지부터 다시(컨티뉴, 점수는 0부터)
  startStory(key) {
    const list = (STORY[key] || []).map(name => BOSS_RUNS.find(r => r.name === name)).filter(Boolean);
    if (!list.length) return;
    this.story = { key, list, idx: 0 };
    this.score = 0; this.graze = 0;
    this.startRun(list[0]);
  }
  restart() {
    if (this.story && this.story.idx >= this.story.list.length) return this.startStory(this.story.key);   // 클리어 뒤 R: 처음부터
    if (this.story) { this.score = 0; this.graze = 0; this.startRun(this.story.list[this.story.idx]); }
    else if (this.run) this.startRun(this.run); else this.startSingle();
  }
  resetLives(power = 0) {
    this.player = this.player || {};
    // 파워 고정이면 보스전에서도 연습 파워를 씀
    this.player.lives = livesFor(this.difficulty); this.player.bombs = START_BOMBS; this.player.power = this.powerLock ? this.practicePower : power;
    this.items = [];
  }

  start(i = this.spellIndex) {
    this.spellIndex = (i + this.spells.length) % this.spells.length;
    const sp = this.spell = this.spells[this.spellIndex];
    this.bullets = []; this.lasers = []; this.enemies = []; this.shots = []; this.fx = []; this.boost = null; this.gauge = null; this.surgeLv = 0;
    this.partners = []; this.chants = []; this.zones = []; this.areas = []; this.slow = null; this.safes = [];
    this.items = this.items || [];
    this.tasks.clear(); this.error = '';
    this.player = this.player || {};
    // cont: 보스전 안에서 이어지는 패턴(도중 뒤 첫 보스 포함). 기체 자리·곡을 이어 감
    const cont = this.run && (this.run.idx > 0 || (this.run.idx === 0 && this.run.afterStage)), prev = this.boss;
    if (!cont) Object.assign(this.player, { x: W / 2, y: H - 48, options: [] });
    Object.assign(this.player, { inv: 60, fireT: 0, bomb: null, flash: 0, stun: 0 });
    this.stats = { miss: 0, hits: 0, bombs: 0, dmgLog: new Array(60).fill(0), dmgNow: 0 };
    const scaled = sp.hp < 99999 && !sp.survival && sp.type !== 'stage';
    const k = scaled ? (this.run ? this.run.hpScale * (this.run.bossScale?.[sp.boss] ?? 1) : HP_SCALE) : 1;   // bossScale: 보스전 안 보스별 배율(중간 보스 등)
    const hp = this.hpFor(sp);
    const b = this.boss = { x: W / 2, y: -40, hp, maxHp: hp, move: null, hidden: sp.type === 'stage', t: 0,
      name: sp.boss || '', color: sp.bossColor || '#d8d0ff', shield: 0, glow: 0, contact: false };
    if (cont && prev && !prev.hidden) { b.x = prev.x; b.y = prev.y; }
    // 배경음악: 이 보스의 폴더 곡. 보스전 도중 곡이 없는 보스면 앞 곡을 이어 감. 같은 곡이면 처음으로 돌리지 않음
    // bgmRate: 곡 재생 속도(폭주 마르코 1.2). 함수면 게임 상태로 정함(김예나 시청자 수 단계)
    // 도중은 bgm(스테이지 폴더 이름)으로 곡을 찾음
    BGM.playBoss(sp.bgm || sp.boss, cont, (typeof sp.bgmRate === 'function' ? sp.bgmRate(this) : sp.bgmRate) || 1);
    // 보스전 시작이나 보스가 바뀔 때(중간 보스 → 보스) 가운데에 소개
    if (this.run && sp.boss && (!cont || !prev || prev.name !== sp.boss)) {
      this.fx.push({ kind: 'intro', top: cont ? '' : this.run.title, text: sp.boss, t: 0, life: 130 });
    }
    // 도중 시작: 스테이지 이름
    if (this.run && sp.type === 'stage' && this.run.idx < 0) {
      const [top, ...rest] = this.run.title.split(' · ');
      this.fx.push({ kind: 'intro', top, text: rest.join(' · ') || top, t: 0, life: 150 });
    }
    this.moveBoss(sp.start?.[0] ?? W / 2, sp.start?.[1] ?? 110, 45);
    // 같은 체력바의 논스펠 → 스펠은 짧게 이어짐
    const sameBar = cont && this.run.idx > 0 && this.run.bars && this.run.bars[this.run.idx] === this.run.bars[this.run.idx - 1];
    this.frame = 0; this.phase = 'intro'; this.phaseT = sameBar ? 45 : cont ? 100 : 70;
    // 제한시간도 난이도별 체력 배율을 따라가 난이도와 상관없이 '필요 시간/제한시간' 비율이 같게 함
    this.timer = this.timerMax = Math.round((sp.time || 30) * 60 * k * (scaled ? HP_MUL[this.effDiff()] : 1));
    // 앞 패턴에 이어지는 뒤 단계(follow)는 다시 선언하지 않음
    this.banner = sp.type === 'spell' && !sp.follow ? { text: sp.name, t: 0 } : null;
    // 전투 이미지가 있는 인물의 스펠: 왼쪽에서 짧게 지나가는 컷인
    const code = codeOf(sp.boss);
    // 강스펠(strong)은 화려한 컷인: 필살기(103) 등 따로 지정한 이미지(없으면 102). 약스펠은 작은 컷인(102)
    const strongShot = sp.cutinShot || (CUTIN_STRONG_BAND[code + '/103'] !== undefined ? '103' : '102');
    this.cutin = sp.type === 'spell' && !sp.follow && code && CUTIN_CODES.has(code) ? { code, t: 0, strong: !!sp.strong, shot: sp.strong ? strongShot : '102' } : null;
    if (this.cutin && this.cutin.strong) this.shake(4);
    if (this.banner) SFX.spell();
    this.result = null; this.timeFlash = null;
    if (b.hidden) { b.x = W / 2; b.y = -200; b.move = null; }
  }

  // 결과 화면이 끝난 뒤 다음 패턴
  next() {
    const r = this.run;
    if (r) {
      if (r.idx < 0) r.afterStage = true;
      r.idx++;
      if (r.idx < r.seq.length) this.start(this.spells.indexOf(r.seq[r.idx]));
      else if (this.story) {
        // 본게임: 다음 스테이지로. 마지막이면 클리어 기록(엑스트라 해금)을 남기고 클리어 화면
        const st = this.story;
        if (++st.idx < st.list.length) this.startRun(st.list[st.idx], true);
        else { unlockStory(st.key); this.phase = 'storyclear'; this.phaseT = 99999; this.onUnlock?.(); }
      }
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
    if (captured && sp.type === 'spell') { this.score += Math.floor(1000000 * this.timer / this.timerMax + 100000); SFX.capture(); }
    // 본게임: 스펠카드 획득 수(뒤 단계는 앞 단계와 한 장으로 셈)
    if (this.story && sp.type === 'spell' && !sp.follow) {
      const c = this.story.cards = this.story.cards || { got: 0, tried: 0 };
      c.tried++; if (captured) c.got++;
    }
    if (reason === 'defeat' && !this.boss.hidden) {
      SFX.boom(); this.shake(9);
      this.fx.push({ kind: 'burst', x: this.boss.x, y: this.boss.y, t: 0, life: 50, color: '#fff' });
    }
    this.clearBullets(true);
    this.tasks.clear(); this.areas = []; this.slow = null;
    // 논스펠은 작은 P만, 스펠은 큰 P 하나를 더 줌
    if (!this.boss.hidden && reason !== 'timeout') this.dropItems(this.boss.x, this.boss.y, 5, sp.type === 'spell' ? 1 : 0, true);
    for (const it of this.items) it.magnet = true;
    this.enemies.forEach(e => this.killEnemy(e, false));
    this.result = { captured: captured && sp.type === 'spell', reason, t: 0, stats: { ...this.stats } };
    this.phase = 'result'; this.phaseT = 170;
    const bars = this.run && this.run.bars;
    if (bars && bars[this.run.idx + 1] === bars[this.run.idx]) { this.result.quiet = true; this.phaseT = 30; }
    if (this.run && this.run.idx < 0) { this.result.quiet = true; this.phaseT = 50; }   // 도중이 끝나면 결과 화면 없이 보스 등장
    // 보스전 마지막 패턴을 격파(내구 스펠은 버팀)하면 배경음악이 자연스럽게 줄어들며 끝남
    if (this.run && this.run.idx >= this.run.seq.length - 1 && (reason === 'defeat' || sp.survival)) BGM.fadeOut(3);
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
        if (p.power >= MAX_POWER || this.powerLock) this.score += it.kind === 'P' ? 5000 : 500;
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
    for (const c of this.chants) {
      c.t++;
      // 영창 한 줄이 뜰 때마다 종소리(호명 줄은 더 길게)
      for (const gr of c.groups) gr.lines.forEach((_, i) => { if (c.t === gr.start + i * c.step + 1) SFX.chime(gr.last); });
    }
    this.shakeMag = this.shakeMag < 0.3 ? 0 : this.shakeMag * 0.86;
    this.chants = this.chants.filter(c => c.t < c.end + c.fade);
    for (const z of this.safes) z.t++;
    this.safes = this.safes.filter(z => z.t < z.dur);
    for (const z of this.zones) z.t++;
    this.zones = this.zones.filter(z => z.t < z.dur);

    if (this.phase === 'intro') {
      if (--this.phaseT <= 0) {
        this.phase = 'active';
        try { this.tasks.add(sp.run.call(sp, this.api)); } catch (e) { this.fail(e); }
      }
    } else if (this.phase === 'active') {
      this.frame++;
      // 격화 단계가 오르면 보스 옆에 알림
      const sl = this.surgeLevel();
      if (sl > (this.surgeLv ?? 0) && !this.boss.hidden) {
        this.fx.push({ kind: 'text', text: sl === 1 ? '격화 II' : '격화 III', x: this.boss.x, y: this.boss.y - 40, t: 0, life: 70 });
        this.fx.push({ kind: 'burst', x: this.boss.x, y: this.boss.y, t: 0, life: 40, color: sl === 1 ? '#f5c542' : '#ff5e7a' });
        this.boss.glow = 40;
        this.shake(sl === 1 ? 4 : 6); SFX.spell();
      }
      this.surgeLv = sl;
      this.tasks.step();
      // 제한시간 10초 전부터 초읽기
      if (this.timer <= 600 && this.timer % 60 === 0 && this.timer > 0) SFX.tick(this.timer <= 180);
      if (--this.timer <= 0) this.endSpell('timeout');
      else if (!b.hidden && !sp.survival && b.hp <= 0) this.endSpell('defeat');
    } else if (this.phase === 'result') {
      this.result.t++;
      if (--this.phaseT <= 0) this.next();
    } else if (this.phase === 'gameover') {
      if (--this.phaseT <= 0) this.restart();
    }

    if (this.cutin) this.cutin.t++;   // 스펠 컷인은 게임 시간으로 흐름(일시정지 중에는 멈춤)
    if (this.slow && ++this.slow.t >= this.slow.dur) { if (this.slow.k < 1) SFX.slowOut(); this.slow = null; }
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
    // 고속 3.6·저속 1.6px/프레임. 누르기 시작한 뒤 3프레임은 35%→57%→79%로 올라가서 짧게 톡 치면 조금만 움직임(미세 조정)
    p.hold = dx || dy ? (p.hold || 0) + 1 : 0;
    const ramp = Math.min(1, 0.13 + p.hold * 0.22);
    const spd = (focus ? 1.6 : 3.6) * ramp * (p.stun > 0 ? 0.45 : 1), n = dx && dy ? Math.SQRT1_2 : 1;
    if (p.stun > 0) p.stun--;
    const ox = p.x, oy = p.y;
    p.x = Math.max(8, Math.min(W - 8, p.x + dx * spd * n));
    p.y = Math.max(16, Math.min(H - 16, p.y + dy * spd * n));
    p.vx = p.x - ox; p.vy = p.y - oy;
    p.tilt = dx;
    if (p.inv > 0) p.inv--;
    if (p.flash > 0) p.flash--;

    // 라티엘 옵션
    if (this.angel === 'RH') {
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
        p.bomb.shook = false;
      } else SFX.empty();
    }
    if (p.bomb) {
      const bm = p.bomb; bm.t++;
      if (bm.t > 30) {
        if (bm.t === 31) this.shake(7);
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
    SFX.die(); this.shake(12);
    this.clearBullets(false);
    p.x = W / 2; p.y = H - 48; p.inv = 150; p.bomb = null;
    // 한 번 죽을 때마다 목숨 하나. 폭탄은 다시 3개로
    p.lives--; p.bombs = START_BOMBS;
    const lost = this.powerLock ? 0 : Math.min(p.power, DEATH_POWER_LOSS);
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
    // 시작: from→k로 20프레임, 끝: 1로 20프레임
    const a = Math.min(1, sl.t / 20), e = Math.max(0, Math.min(1, (sl.dur - sl.t) / 20));
    const v = (sl.from ?? 1) + (sl.k - (sl.from ?? 1)) * a;
    return 1 + (v - 1) * e;
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
      if (b.dead || b.off) continue;   // off: 꺼진(깜빡임) 탄은 판정 없음
      const d = dist2(b.x, b.y, p.x, p.y), r = b.r + HIT_R, gr = b.r + GRAZE_R;
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
      if (l.t === l.warn + 1) SFX.laser();
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
    if (t === 1) { SFX.chain(); this.shake(2.5); }
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
      if (a.t === a.warn && a.dur > 0) { SFX.strike(); this.shake(4); }
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
        e.hp -= shotDamage(s); e.hurt = 4; SFX.hit();
        if (!s.pierce) { s.dead = true; break; }
      }
      if (!s.dead && this.zones.some(z => dist2(s.x, s.y, z.x, z.y) < z.r * z.r)) { s.dead = true; this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); SFX.block(); continue; }
      if (!s.dead && !b.hidden && this.phase === 'active' && dist2(s.x, s.y, b.x, b.y) < 30 * 30) {
        s.dead = true;
        // 필리우스 제1식은 약한 공격을 막음: 통상탄은 막히고 봄은 통함
        if (b.shield > 0) { this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); SFX.block(); continue; }
        this.damageBoss(shotDamage(s)); b.hurt = 3;
      }
      // 함께 싸우는 동료(마리 등)도 맞으면 보스 체력바를 깎음
      if (!s.dead && this.phase === 'active') for (const a of this.partners) {
        if (!a.hittable || dist2(s.x, s.y, a.x, a.y) >= 30 * 30) continue;
        s.dead = true;
        if (a.shield > 0) { this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); SFX.block(); break; }
        this.damageBoss(shotDamage(s)); a.hurt = 3;
        break;
      }
      if (s.dead && Math.random() < 0.2) this.fx.push({ kind: 'hit', x: s.x, y: s.y, t: 0, life: 8, color: s.color });
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
    if (take('KeyM')) { SFX.setMuted(!SFX.muted); this.onChange?.(); }
    if (take('KeyI')) { this.invincible = !this.invincible; this.onChange?.(); }   // 무적(테스트 중이라 스테이지 모드에서도)
    // 패턴 전환·기체·난이도 단축키는 패턴 테스트 룸에서만(스테이지 모드는 패널에서 고름)
    if (this.mode === 'stage') { for (const c of ['BracketRight', 'BracketLeft', 'KeyD', 'Digit1', 'Digit2', 'Digit3', 'Digit4']) this.pressed.delete(c); return; }
    if (take('BracketRight')) { this.startSingle(this.spellIndex + 1); this.onChange?.(); }
    if (take('BracketLeft')) { this.startSingle(this.spellIndex - 1); this.onChange?.(); }
    if (take('KeyD')) { this.difficulty = (this.difficulty + 1) % DIFFS.length; this.restart(); this.onChange?.(); }
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
    lv: (...v) => v[Math.min(G.effDiff(), v.length - 1)],                        // 난이도별 값 고르기 (이지, 노말, 하드, 베리하드, 헬)
    cnt: n => Math.max(1, Math.round(n * DENSITY[G.effDiff()] * (0.75 + 0.6 * G.heat()) * (G.boost?.cnt ?? 1))),     // 탄 개수(격화 ×0.75→1.35)
    wait: f => Math.max(1, Math.round(f * INTERVAL[G.effDiff()] * (1.25 - 0.5 * G.heat()) * (G.boost?.wait ?? 1))),  // 발사 간격(프레임, 격화 ×1.25→0.75)
    // 패턴이 거는 추가 배율 {cnt, wait}(김예나 시청자 수 등). 패턴이 바뀌면 풀림
    setBoost(o) { G.boost = o; },
    get boost() { return G.boost || { cnt: 1, wait: 1 }; },
    get run() { return G.run; },
    // 배경음악 재생 속도를 패턴 도중에 바꿈
    bgmRate(r) { BGM.wantRate = r; BGM.setRate(r); },
    get heat() { return G.heat(); },
    get slow() { return G.slowFactor(); },   // 지금 적 탄 속도 배율(불렛타임·오버클럭)
    // 필드 하단 게이지 {v: 0~1, color, flash}. 패턴이 객체를 들고 v를 바꾸면 그대로 그려짐. null이면 숨김
    setGauge(o) { G.gauge = o; return o; },
    spin: v => v * (0.8 + 0.7 * G.heat()),   // 회전량(회전벽·도는 레이저). 격화되면 촘촘해지는 대신 더 빨리 돎(×0.8→1.5)
    get surge() { return G.surgeLevel(); },   // 격화 단계 0·1·2(격화 I·II·III)
    arms: n => n + G.surgeLevel(),             // 회전벽 등의 줄 수: 격화 II에서 한 줄, III에서 한 줄 더(3줄 → 4줄 → 5줄)   // 회전량(회전벽·도는 레이저). 격화되면 촘촘해지는 대신 더 빨리 돎(×0.85→1.25)
    sp: v => v * SPEED[G.effDiff()] * (0.92 + 0.2 * G.heat()),                  // 탄속(격화 ×0.92→1.12)
    // 머리 위 말풍선(대사 대신 짧은 절차 표시용): who=보스·동료
    // 화면 흔들림(세기 2~12 정도)과 충격음
    shake(mag = 4) { G.shake(mag); },
    impact(mag = 6) { G.shake(mag); SFX.impact(); },
    sound(name, ...args) { SFX[name]?.(...args); },
    title(text, color = 'white') { G.fx.push({ kind: 'title', text, color: COLORS[color] || color, t: 0, life: 110 }); },
    // 초록 안전지대 표시(판정 없음). 돌려받은 객체의 x·y를 바꾸면 따라 움직임 {x,y,r,dur,label}
    safeZone(o) { const z = { x: o.x, y: o.y, r: o.r ?? 40, dur: o.dur ?? 90, label: o.label ?? '', t: 0 }; G.safes.push(z); return z; },
    // 탄 여러 개를 한꺼번에 터뜨려 지움. loud면 '빰!' 소리와 흔들림
    pop(list, loud = true) {
      for (const b of list) if (!b.dead) { b.dead = true; if (Math.random() < 0.3) G.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 18, color: b.color }); }
      if (loud) { SFX.bam(); G.shake(5); }
    },
    // (x,y)에서 r 안에 shape 모양 적탄이 있는지(탄이 뭉치지 않게 놓을 때 씀)
    near(x, y, r, shape) { for (const b of G.bullets) if (!b.dead && (!shape || b.shape === shape) && (b.x - x) ** 2 + (b.y - y) ** 2 < r * r) return true; return false; },
    ghost(x, y, color) { G.fx.push({ kind: 'ghost', x, y, color, t: 0, life: 20 }); },
    // 판정 없는 조준 표시(빨간 십자선) {x,y,dur}
    mark(o) { G.fx.push({ kind: 'mark', x: o.x, y: o.y, t: 0, life: o.dur ?? 30 }); },
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
        shape: o.shape || 'small', color: o.color || 'red', r: o.r ?? def.r, alpha: o.alpha ?? 1,
        fn: o.fn, margin: o.margin ?? 32, marginTop: o.marginTop ?? 0, data: o.data || {},
      };
      G.bullets.push(b);
      SFX.fire(b.shape === 'big' || b.shape === 'orb');
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
      // 세 발 이상 부채꼴은 바깥에 줄을 더함(가운데 조준 여부가 바뀌지 않게 좌우 한 줄씩). fixed: true면 그대로
      // 난이도: 하드·베리하드 좌우 한 줄씩(+2), 헬 두 줄씩(+4). 격화 III: 좌우 한 줄씩 더(+2)
      if (n >= 3 && !o.fixed) n += [0, 0, 2, 2, 4][G.effDiff()] + (G.surgeLevel() >= 2 ? 2 : 0);
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
      // hittable: 내 탄에 맞음(피해는 보스 체력바를 함께 깎음)
      const a = { name: o.name || '', x: o.x ?? W / 2, y: o.y ?? -40, color: o.color || '#cfe8ff', t: 0, shield: 0, glow: 0, contact: false, move: null, hittable: !!o.hittable };
      if (o.to) G.moveBoss(o.to[0], o.to[1], o.dur ?? 45, a);
      G.partners.push(a);
      return a;
    },
    // 판정 없는 빨간 예고선: {x,y,x2,y2,dur}
    warnLine(o) { G.fx.push({ kind: 'warnline', x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, x2: o.x2, y2: o.y2, t: 0, life: o.dur ?? 30, band: o.band ?? 0 }); },
    // 사각 구역 공격 {x,y,w,h,warn,dur,label,color}. warn 동안 예고, dur 동안 판정
    area(o) {
      const a = { x: o.x, y: o.y, w: o.w, h: o.h, warn: o.warn ?? 60, dur: o.dur ?? 20, label: o.label ?? '', color: o.color || '#ff3b4a', t: 0, fog: !!o.fog, edge: o.edge };
      G.areas.push(a);
      return a;
    },
    // 불렛타임: frames 동안 적 탄이 k배 속도로 움직임. 플레이어는 그대로
    // 이미 배율이 걸려 있으면 지금 배율에서 새 배율로 20프레임에 걸쳐 넘어감(불렛타임 도중 오버클럭 등)
    bulletTime(k, frames) {
      const from = G.slowFactor();
      G.slow = { k, dur: frames, t: 0, from };
      if (k < from) SFX.slowIn(); else if (k > from && k !== 1 && (k > 1 || k >= 0.5)) SFX.overclock();   // 원래 속도나 평소 불렛타임으로 돌아갈 때는 소리 없음
    },
    // 보호막: 통상탄을 막음(봄은 통과)
    shield(who, frames) { who.shield = frames; who.shieldMax = frames; },
    // 고정 구역 보호막: 안으로 들어온 자기 탄을 지움 {x,y,r,dur}
    zone(o = {}) { const z = { x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, r: o.r ?? 56, dur: o.dur ?? 300, t: 0 }; G.zones.push(z); return z; },
    // 영창: 화면 상단에 한 줄씩 떠오른 뒤 사라짐. 마지막 줄이 호명.
    // yield* 하면 호명 줄이 뜰 때까지 기다림(= 전조 시간). {by, color, step, hold, corner:'left'|'right'}
    // 본문은 두 줄씩 묶어 나타났다가 함께 사라지고, 마지막 호명 줄은 따로 크게 뜸. 한 줄 간격은 step의 1.15배.
    // yield* 하면 호명 줄이 드러나기 시작할 때까지 기다림(= 전조)
    *chant(lines, o = {}) {
      if (typeof lines === 'string') lines = CHANTS[lines];
      const step = Math.round((o.step ?? 40) * 1.15), hold = Math.round(step * 0.7), fade = 18;
      const corner = o.corner || (o.by && o.by !== G.boss ? 'right' : 'left');
      const groups = [], body = lines.slice(0, -1);
      let t = 0;
      for (let i = 0; i < body.length; i += 2) {
        const ls = body.slice(i, i + 2);
        groups.push({ lines: ls, start: t, end: t + ls.length * step + hold, last: false });
        t += ls.length * step + hold + fade;
      }
      const callAt = t;
      groups.push({ lines: [lines[lines.length - 1]], start: t, end: t + step + (o.hold ?? 20) + 50, last: true });
      const c = { groups, t: 0, step, fade, corner, end: groups[groups.length - 1].end, color: o.color || o.by?.chantColor || '#ffe6a0' };
      G.chants.push(c);
      yield callAt + Math.round(step * 0.5);
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
  // 흔들림은 경기 화면에만. 오른쪽 정보창은 가만히 둠
  const sm = G.shakeMag;
  g.translate(FX + (sm ? (Math.random() * 2 - 1) * sm : 0), FY + (sm ? (Math.random() * 2 - 1) * sm : 0));
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
  drawSafes(G, g);
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
  gr.addColorStop(0, '#120f22'); gr.addColorStop(1, '#07070e');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 1;
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
  if (a.ghost) {
    // 가상 사본: 반투명하게, 가끔 옆으로 튀는 잡음
    g.save(); g.globalAlpha = 0.35 + (Math.random() < 0.08 ? 0.3 : 0);
    g.translate(Math.random() < 0.06 ? (Math.random() * 2 - 1) * 6 : 0, 0);
    g.fillStyle = a.color; g.beginPath(); g.arc(a.x, a.y, r, 0, TAU); g.fill();
    g.strokeStyle = '#fff'; g.setLineDash([3, 3]); g.beginPath(); g.arc(a.x, a.y, r + 4, 0, TAU); g.stroke(); g.setLineDash([]);
    g.restore();
    return;
  }
  if (a.glow > 0) {
    // 파테르 제1식: 오른손이 황금빛으로 빛남
    const gx = a.x + r + 3, gy = a.y + 2, pulse = 8 + Math.sin(a.t * 0.4) * 2;
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, pulse * 2);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, '#ffd24a'); gr.addColorStop(1, '#ffd24a00');
    g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, pulse * 2, 0, TAU); g.fill();
  }
  if (a.rage) {
    // 폭주: 붉은 기운이 일렁임
    const pr = r + 10 + Math.sin(a.t * 0.3) * 3 + Math.random() * 2;
    const rg = g.createRadialGradient(a.x, a.y, r * 0.6, a.x, a.y, pr);
    rg.addColorStop(0, '#ff304888'); rg.addColorStop(1, '#ff304800');
    g.fillStyle = rg; g.beginPath(); g.arc(a.x, a.y, pr, 0, TAU); g.fill();
  }
  const code = codeOf(a.name), pic = code && charSprite(code, '01', cookPortrait);
  if (pic) {
    // 초상 카드(기절한 동료는 흑백·반투명), 인물 색 테두리. 맞으면 잠깐 하얗게
    const w = 44, h = 50, fainted = /기절/.test(a.name);
    g.save();
    if (fainted) { g.filter = 'grayscale(1)'; g.globalAlpha = 0.6; }
    g.drawImage(pic, a.x - w / 2, a.y - h / 2, w, h);
    g.filter = 'none';
    if (a.rage) {
      // 폭주: 테두리가 붉게 일렁임(두께·밝기가 맥박처럼, 바깥으로 붉은 번짐)
      const pulse = 0.5 + 0.5 * Math.sin(a.t * 0.25), jit = Math.random() * 1.5;
      g.strokeStyle = `rgba(255,48,72,${0.25 + 0.25 * pulse})`; g.lineWidth = 7 + 3 * pulse + jit;
      g.beginPath(); g.roundRect(a.x - w / 2, a.y - h / 2, w, h, 8); g.stroke();
      g.strokeStyle = `rgb(255,${60 + Math.round(80 * pulse)},${70 + Math.round(40 * pulse)})`; g.lineWidth = 2.5 + pulse;
    } else { g.strokeStyle = a.color; g.lineWidth = 2; }
    g.beginPath(); g.roundRect(a.x - w / 2, a.y - h / 2, w, h, 8); g.stroke();
    if (a.hurt > 0) { g.globalAlpha = 0.45; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(a.x - w / 2, a.y - h / 2, w, h, 8); g.fill(); }
    g.restore();
    if (isBoss || a.hittable) {
      // 피격 지점(몸통 판정 16px)
      g.strokeStyle = '#ff3b4a'; g.lineWidth = 1.5; g.beginPath(); g.arc(a.x, a.y, 16, 0, TAU); g.stroke();
      g.fillStyle = '#ff3b4a'; g.beginPath(); g.arc(a.x, a.y, 2, 0, TAU); g.fill();
    }
  } else {
    g.fillStyle = a.hurt > 0 ? '#fff' : a.color;
    g.beginPath(); g.arc(a.x, a.y, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(a.x, a.y, r * 0.55, 0, TAU); g.fill();
  }
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
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText(a.name, a.x, a.y + (pic ? 27 : r + 4)); g.textAlign = 'left';
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
// 영창 그리기: 글자가 왼쪽부터 번지듯 드러나고(끝에 빛 알갱이), 금빛에서 흰빛으로 빛이 훑고 지나감.
// 뒤에는 어두운 판, 아래에는 자라나는 장식선. 호명 줄은 더 크고 굵게
function drawChants(G, g) {
  g.textBaseline = 'top';
  G.chants.forEach((c, row) => {
    const right = c.corner === 'right', x0 = right ? W - 12 : 12, yBase = 44 + row * 62;
    for (const gr of c.groups) {
      if (c.t < gr.start || c.t > gr.end + c.fade) continue;
      const out = c.t > gr.end ? Math.max(0, 1 - (c.t - gr.end) / c.fade) : 1;
      const size = gr.last ? 16 : 14, lh = size + 8;
      g.font = `${gr.last ? 'bold ' : ''}${size}px ${CHANT_FONT}`;
      const rows = [];
      gr.lines.forEach((line, i) => splitToFit(g, line, W - 44).forEach(part => rows.push({ text: part, at: gr.start + i * c.step })));
      const maxW = Math.max(...rows.map(r => g.measureText(r.text).width));
      const h = rows.length * lh + 10, openK = Math.min(1, (c.t - gr.start) / 12);

      // 뒤판: 글자 쪽이 짙고 바깥으로 옅어짐
      g.globalAlpha = out * openK;
      const pl = right ? x0 - maxW - 24 : x0 - 8, pw = maxW + 32;
      const pg = g.createLinearGradient(right ? pl + pw : pl, 0, right ? pl : pl + pw, 0);
      pg.addColorStop(0, 'rgba(8,6,18,0.72)'); pg.addColorStop(0.75, 'rgba(8,6,18,0.45)'); pg.addColorStop(1, 'rgba(8,6,18,0)');
      g.fillStyle = pg; g.fillRect(pl, yBase - 6, pw, h);

      rows.forEach((r, k) => {
        const p = Math.max(0, Math.min(1, (c.t - r.at) / (c.step * 0.8)));
        if (p <= 0) return;
        const tw = g.measureText(r.text).width, y = yBase + k * lh, left = right ? x0 - tw : x0;
        // 드러나는 폭만큼 잘라 그림
        g.save();
        g.beginPath(); g.rect(left - 4, y - 6, (tw + 8) * p, lh + 6); g.clip();
        // 빛이 한 번 훑고 지나감
        const sweep = (c.t - r.at) * 4 - tw * 0.3;
        const tg = g.createLinearGradient(left + sweep - 40, 0, left + sweep + 40, 0);
        tg.addColorStop(0, c.color); tg.addColorStop(0.5, '#ffffff'); tg.addColorStop(1, c.color);
        g.globalAlpha = out * Math.min(1, p * 1.6);
        g.shadowColor = c.color; g.shadowBlur = gr.last ? 16 : 10;
        g.fillStyle = tg; g.textAlign = 'left';
        g.fillText(r.text, left, y);
        if (gr.last) { g.shadowBlur = 0; g.globalAlpha *= 0.5; g.fillStyle = '#fff'; g.fillText(r.text, left, y); }
        g.restore();
        // 번지는 끝의 빛 알갱이
        if (p < 1) {
          const ex = left + tw * p, glow = g.createRadialGradient(ex, y + size / 2, 0, ex, y + size / 2, 9);
          glow.addColorStop(0, 'rgba(255,255,255,0.9)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
          g.globalAlpha = out; g.fillStyle = glow; g.fillRect(ex - 9, y + size / 2 - 9, 18, 18);
        }
      });

      // 장식선: 글 아래에서 자라나고 끝에 작은 마름모
      const grow = Math.min(1, (c.t - gr.start) / (c.step * 1.2)), lw = (maxW + 6) * grow, ly = yBase + rows.length * lh + 1;
      g.globalAlpha = out * 0.8; g.strokeStyle = c.color; g.lineWidth = 1;
      const lx0 = right ? x0 : x0, lx1 = right ? x0 - lw : x0 + lw;
      const lg = g.createLinearGradient(lx0, 0, lx1, 0);
      lg.addColorStop(0, c.color); lg.addColorStop(1, c.color + '00');
      g.strokeStyle = lg; g.beginPath(); g.moveTo(lx0, ly); g.lineTo(lx1, ly); g.stroke();
      g.fillStyle = c.color; g.beginPath();
      g.moveTo(lx0, ly - 3); g.lineTo(lx0 + (right ? -3 : 3), ly); g.lineTo(lx0, ly + 3); g.lineTo(lx0 + (right ? 3 : -3), ly); g.closePath(); g.fill();
    }
  });
  g.shadowBlur = 0; g.globalAlpha = 1; g.textAlign = 'left';
}

function drawEnemies(G, g) {
  for (const e of G.enemies) {
    // 날개 오르트로스 자리표시
    const flap = Math.sin(e.t * 0.3) * 0.4;
    g.fillStyle = 'rgba(200,200,215,0.85)';
    const k = e.r / 14;   // 중형은 날개도 크게
    for (const s of [-1, 1]) {
      g.save(); g.translate(e.x + s * 6 * k, e.y - 2); g.scale(s * k, k); g.rotate(-0.4 + flap);
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
    for (const [w, c, al] of [[6, '#f5c542', 0.2], [2.5, '#ffffff', 0.55]]) {
      g.globalAlpha = al; g.strokeStyle = c; g.lineWidth = w; g.beginPath();
      g.moveTo(s.trail[0], s.trail[1]);
      for (let i = 2; i < s.trail.length; i += 2) g.lineTo(s.trail[i], s.trail[i + 1]);
      g.stroke();
    }
  }
  g.lineCap = 'butt'; g.lineWidth = 1;
  const base = g.getTransform();
  g.globalAlpha = 0.38;
  for (const s of G.shots) {
    if (s.laser) continue;
    g.globalAlpha = s.falloff ? 0.38 * Math.max(0.25, 1 - (s.t || 0) / s.life) + 0.1 : 0.38;
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
      warnStroke(g, l.len, c, l.t, l.warn - l.t, l.w * 0.7);   // 띠 = 실제 판정 폭
    } else if (l.cw > 0) {
      g.globalAlpha = 0.85; g.fillStyle = c; g.fillRect(0, -l.cw / 2, l.len, l.cw);
      g.fillStyle = '#fff'; g.fillRect(0, -l.cw / 5, l.len, l.cw / 2.5);
    }
    g.restore();
  }
  g.globalAlpha = 1;
}

// 안전지대: 초록 원이 숨 쉬듯 밝아졌다 어두워지고, 번호가 있으면 가운데에 표시. 막 나타날 때 크게 줄어들며 자리 잡음
function drawSafes(G, g) {
  for (const z of G.safes) {
    const inK = Math.min(1, z.t / 12), outK = Math.min(1, (z.dur - z.t) / 12), a = Math.min(inK, outK);
    const r = z.r * (1 + (1 - inK) * 0.8), pulse = 0.5 + 0.5 * Math.sin(z.t * 0.25);
    g.globalAlpha = (0.12 + 0.08 * pulse) * a; g.fillStyle = '#3dff7a';
    g.beginPath(); g.arc(z.x, z.y, r, 0, TAU); g.fill();
    g.globalAlpha = 0.9 * a; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#6dff9a'; g.lineWidth = 2.5; g.setLineDash([10, 6]); g.lineDashOffset = -z.t; g.stroke(); g.setLineDash([]);
    if (z.label !== '') {
      g.font = 'bold 20px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(String(z.label), z.x + 1, z.y + 1);
      g.fillStyle = '#b8ffcc'; g.fillText(String(z.label), z.x, z.y);
      g.textAlign = 'left'; g.textBaseline = 'top';
    }
  }
  g.globalAlpha = 1; g.lineWidth = 1;
}

function drawAreas(G, g) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const a of G.areas) {
    if (a.t > a.warn && a.dur === 0) continue;   // 예고 전용
    if (a.fog) { drawFog(G, g, a); continue; }
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

// 검은 안개 구역(아즈라엘): 예고 동안 옅은 안개와 깜빡이는 흰 테두리 → 발동하면 짙은 검은 안개가 일렁이고
// 가장자리에 흰 빛이 번짐(배경과 구분되게). 들어가면 피격
function drawFog(G, g, a) {
  const live = a.t > a.warn, fade = !live ? Math.min(1, a.t / 20) * 0.35 : a.t <= a.warn + a.dur ? 1 : Math.max(0, 1 - (a.t - a.warn - a.dur) / 15);
  g.save();
  g.beginPath(); g.rect(a.x, a.y, a.w, a.h); g.clip();
  g.globalAlpha = 0.85 * fade; g.fillStyle = '#06050b'; g.fillRect(a.x, a.y, a.w, a.h);
  // 일렁이는 안개 덩어리
  for (let i = 0; i < 7; i++) {
    const px = a.x + ((i * 53 + G.bgT * (0.4 + i * 0.07)) % (a.w + 60)) - 30;
    const py = a.y + ((i * 97 + Math.sin(G.bgT * 0.02 + i) * 30) % Math.max(1, a.h));
    const r = 36 + (i % 3) * 14, gr = g.createRadialGradient(px, py, 0, px, py, r);
    gr.addColorStop(0, 'rgba(60,56,80,0.55)'); gr.addColorStop(1, 'rgba(60,56,80,0)');
    g.globalAlpha = fade; g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
  }
  g.restore();
  // 가장자리 빛: 예고 동안은 깜빡이고, 발동 뒤에는 은은하게
  g.globalAlpha = live ? 0.55 * fade : (Math.sin(a.t * (a.t > a.warn - 20 ? 1.2 : 0.4)) > 0 ? 0.9 : 0.35);
  g.strokeStyle = '#e8e8f4'; g.lineWidth = live ? 2 : 1.5;
  if (a.edge) {
    // 여러 띠로 이어 붙인 안개: 안쪽 가장자리(통로 쪽)만 빛나게
    const ex = a.edge === 'right' ? a.x + a.w : a.x;
    g.beginPath(); g.moveTo(ex, a.y); g.lineTo(ex, a.y + a.h); g.stroke();
  } else g.strokeRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2);
  g.globalAlpha = 1;
}

// 예고선: 어두운 테두리 위에 굵은 색 점선. 점선은 공격이 나아갈 방향으로 흐르고,
// 발동 직전(남은 18프레임)에는 빠르게 깜빡이며 더 굵어짐. band를 주면 실제로 맞는 폭을 옅은 띠로 함께 보여 줌.
// (0,0)에서 +x 방향으로 len만큼 그림
function warnStroke(g, len, color, t, remain, band = 0) {
  const urgent = remain < 18;
  const blink = urgent ? (Math.sin(t * 1.4) > 0 ? 1 : 0.5) : 0.8 + 0.2 * Math.sin(t * 0.3);
  if (band > 0) { g.globalAlpha = 0.16 * blink; g.fillStyle = color; g.fillRect(0, -band / 2, len, band); }
  g.lineCap = 'butt';
  g.globalAlpha = 0.75 * blink; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = urgent ? 7 : 6;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
  g.globalAlpha = blink; g.strokeStyle = color; g.lineWidth = urgent ? 4 : 3;
  g.setLineDash([14, 7]); g.lineDashOffset = -t * 1.6;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
  g.setLineDash([]); g.lineDashOffset = 0;
  // 시작점: 어디서 오는지
  g.fillStyle = 'rgba(0,0,0,0.85)'; g.beginPath(); g.arc(0, 0, 5.5, 0, TAU); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill();
  g.lineWidth = 1; g.globalAlpha = 1;
}

function drawChain(G, g, l) {
  g.save(); g.translate(l.x, l.y); g.rotate(l.ang);
  if (l.t <= l.warn) {
    warnStroke(g, l.len, '#ff2a3a', l.t, l.warn - l.t, l.w);
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
    g.globalAlpha = b.off ? 0.1 : b.alpha;   // 꺼진 탄은 자리만 아주 흐리게
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
      g.globalAlpha = 1 - k; g.strokeStyle = f.color || '#ff5e7a'; g.lineWidth = 3;
      g.beginPath(); g.arc(f.x, f.y, k * 80, 0, TAU); g.stroke();
      if (f.color) { g.lineWidth = 1.5; g.beginPath(); g.arc(f.x, f.y, k * 130, 0, TAU); g.stroke(); }
    } else if (f.kind === 'hit') {
      g.globalAlpha = 0.7 * (1 - k); g.fillStyle = COLORS[f.color] || '#fff';
      g.beginPath(); g.arc(f.x, f.y - k * 6, 2 + k * 6, 0, TAU); g.fill();
    } else if (f.kind === 'warnline') {
      g.save(); g.translate(f.x, f.y); g.rotate(Math.atan2(f.y2 - f.y, f.x2 - f.x));
      warnStroke(g, Math.hypot(f.x2 - f.x, f.y2 - f.y), '#ff2a3a', f.t, f.life - f.t, f.band || 0);
      g.restore();
    } else if (f.kind === 'text') {
      g.globalAlpha = 1 - k; g.fillStyle = '#ffe28a'; g.font = 'bold 16px system-ui, "Malgun Gothic", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(f.text, f.x, f.y - k * 16); g.textAlign = 'left'; g.textBaseline = 'top';
    } else if (f.kind === 'mark') {
      // 조준 표시: 빨간 십자선이 좁혀 들어옴
      const r = 16 * (1 - k) + 5;
      g.globalAlpha = Math.sin(f.t * 0.8) > 0 ? 0.95 : 0.4; g.strokeStyle = '#ff2a3a'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(f.x, f.y, r, 0, TAU);
      g.moveTo(f.x - r - 5, f.y); g.lineTo(f.x + r + 5, f.y); g.moveTo(f.x, f.y - r - 5); g.lineTo(f.x, f.y + r + 5); g.stroke();
    } else if (f.kind === 'ghost') {
      g.globalAlpha = 0.5 * (1 - k); g.fillStyle = COLORS[f.color] || f.color; g.fillRect(f.x - 2, f.y - 2, 4, 4);
    } else if (f.kind === 'intro') {
      // 보스 소개: 가는 선이 양옆으로 벌어지고 위에 스테이지 이름, 가운데에 보스 이름
      const inK = Math.min(1, f.t / 18), outK = Math.min(1, (f.life - f.t) / 25), al = Math.min(inK, outK);
      g.save(); g.globalAlpha = al; g.textAlign = 'center'; g.textBaseline = 'middle';
      const cy = H * 0.42, half = 150 * inK;
      g.strokeStyle = '#f5c542'; g.lineWidth = 1; g.beginPath(); g.moveTo(W / 2 - half, cy + 22); g.lineTo(W / 2 + half, cy + 22); g.stroke();
      if (f.top) { g.fillStyle = '#c8c8d8'; g.font = `13px ${CHANT_FONT}`; g.fillText(f.top, W / 2, cy - 24); }
      g.shadowColor = '#f5c542'; g.shadowBlur = 14; g.fillStyle = '#fff'; g.font = `bold 26px ${CHANT_FONT}`; g.fillText(f.text, W / 2, cy + 2);
      g.restore(); g.textAlign = 'left'; g.textBaseline = 'top';
    } else if (f.kind === 'title') {
      // 큰 제목: 살짝 크게 나타났다가 제자리로 줄고, 글자 간격이 벌어지며 사라짐
      const inK = Math.min(1, f.t / 14), outK = Math.min(1, (f.life - f.t) / 30);
      g.save(); g.translate(W / 2, H * 0.36); const sc = 1 + (1 - inK) * 0.35; g.scale(sc, sc);
      g.globalAlpha = 0.85 * Math.min(inK, outK);
      g.font = `bold 40px ${CHANT_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = `${4 + k * 10}px`;
      g.shadowColor = f.color; g.shadowBlur = 24; g.fillStyle = f.color; g.fillText(f.text, 0, 0);
      g.shadowBlur = 0; g.globalAlpha *= 0.7; g.fillStyle = '#fff'; g.fillText(f.text, 0, 0);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      g.restore(); g.textAlign = 'left'; g.textBaseline = 'top';
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

// 강스펠 컷인 띠: 필드 폭 전체, 높이 96. 선명하게, 양 끝만 살짝 투명하게
function cookCutinStrong(img, top) {
  const w = W, h = 96, c = document.createElement('canvas');
  c.width = w * SC; c.height = h * SC;
  const g = c.getContext('2d'); g.scale(SC, SC);
  const sh = img.naturalWidth * h / w;
  g.filter = 'saturate(1.15) contrast(1.05)';
  g.drawImage(img, 0, img.naturalHeight * top, img.naturalWidth, sh, 0, 0, w, h);
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.2)'); gr.addColorStop(0.12, 'rgba(0,0,0,1)'); gr.addColorStop(0.88, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return c;
}

// 강스펠 컷인(약 2.2초): 잔상을 달고 빠르게 들어와 섬광, 머무는 동안 천천히 확대되며 빛줄기가 흐르고, 중간에 흰 사선 섬광이 띠를 가르고,
// 둘레로 불똥이 흩날림. 테두리는 맥박처럼 두께가 바뀌고, 112프레임부터 긴 잔상을 남기며 오른쪽으로 빠르게 빠져나감
function drawCutinStrong(G, g, c) {
  const band = CUTIN_STRONG_BAND[c.code + '/' + c.shot] ?? CUTIN_BAND[c.code] ?? 0.1;
  const strip = charSprite(c.code, c.shot, img => cookCutinStrong(img, band), 'strong');
  if (!strip) return;
  const t = c.t, y = 104, h = 96, inK = Math.min(1, t / 9), e = 1 - Math.pow(1 - inK, 3), out = Math.max(0, (t - 112) / 18);
  const x = -W * (1 - e) + out * W * 1.1, col = G.boss.color || '#fff';
  // 배경 어둡게
  g.globalAlpha = 0.35 * Math.min(1, t / 6) * (1 - out); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // 잔상(들어올 때·나갈 때)
  if (t < 9 || out > 0) for (const k of [3, 2, 1]) { g.globalAlpha = 0.14 * k * (1 - out * 0.5); g.drawImage(strip, x - (out > 0 ? -1 : 1) * k * 24, y, W, h); }
  // 본체: 천천히 확대
  const z = 1 + 0.06 * Math.min(1, t / 120);
  g.save(); g.beginPath(); g.rect(0, y, W, h); g.clip();
  g.globalAlpha = 1 - out;
  g.drawImage(strip, x - W * (z - 1) / 2, y - h * (z - 1) / 2, W * z, h * z);
  // 가로로 흐르는 빛줄기
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const sy = y + 8 + ((i * 37 + t * 3) % (h - 16)), sx = ((i * 97 - t * 14) % (W + 120) + W + 120) % (W + 120) - 60;
    g.globalAlpha = 0.25 * (1 - out); g.fillStyle = '#fff'; g.fillRect(x + sx, sy, 60, 1.5);
  }
  // 흰 사선 섬광이 띠를 한 번 가름(40~62프레임)
  if (t >= 40 && t < 62) {
    const k = (t - 40) / 22, sx = x - 60 + (W + 120) * k;
    g.globalAlpha = 0.8 * (1 - Math.abs(k - 0.5) * 1.2); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + 14, y); g.lineTo(sx - 26, y + h); g.lineTo(sx - 40, y + h); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.restore();
  // 둘레로 흩날리는 불똥(보스 색·흰색)
  for (let i = 0; i < 14; i++) {
    const seed = i * 97.13, life = (t * 2 + seed) % 60, px = ((seed * 7.7) % W) + x * 0.2 - life * 1.2, py = y + (i % 2 ? -6 - life * 0.5 : h + 6 + life * 0.5);
    g.globalAlpha = Math.max(0, 0.7 * (1 - life / 60)) * (1 - out) * Math.min(1, t / 10); g.fillStyle = i % 3 ? col : '#fff';
    g.fillRect(px, py, 2, 2);
  }
  // 위아래 테두리(보스 색, 맥박처럼 두께가 바뀜)
  const th = 3 + 1.5 * Math.sin(t * 0.25);
  g.globalAlpha = (0.9 - 0.3 * Math.sin(t * 0.3)) * (1 - out); g.fillStyle = col;
  g.fillRect(x, y - th, W, th); g.fillRect(x, y + h, W, th);
  g.globalAlpha = 0.6 * (1 - out); g.fillStyle = '#fff'; g.fillRect(x, y - 1, W, 1); g.fillRect(x, y + h + 1, W, 1);
  // 들어온 순간 섬광
  if (t >= 8 && t < 22) { g.globalAlpha = 0.45 * (1 - (t - 8) / 14); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
  g.globalAlpha = 1;
}

// 약스펠 컷인(약 1.7초): 왼쪽에서 살짝 지나쳤다 튕겨 들어오고, 머무는 동안 이미지가 조금씩 흐르며 빛 한 줄기가 비스듬히 훑고,
// 뒤로 속도선이 지나감. 보스 색 테두리. 80프레임부터 오른쪽으로 밀리며 사라짐
function drawCutin(G, g) {
  const c = G.cutin;
  if (!c) return;
  if (c.strong) { if (c.t <= 130) drawCutinStrong(G, g, c); return; }
  if (c.t > 100) return;
  const strip = charSprite(c.code, '102', img => cookCutin(img, CUTIN_BAND[c.code]), 'weak');
  if (!strip) return;
  const t = c.t, inK = Math.min(1, t / 12), out = Math.max(0, (t - 80) / 20);
  // 살짝 지나쳤다 돌아오는 들어오기(back-out)
  const bo = inK === 1 ? 1 : 1 + 2.2 * Math.pow(inK - 1, 3) + 1.2 * Math.pow(inK - 1, 2);
  const x = -250 + (250 + 8) * bo + out * 40, y = 118, w = 250, h = 58, col = G.boss.color || '#fff', a = 1 - out;
  // 뒤 속도선
  g.globalAlpha = 0.35 * a; g.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) { const sy = y + 6 + i * 11, sx = ((t * 18 + i * 70) % (w + 80)) - 40; g.fillRect(x + w - sx, sy, 30, 1); }
  // 본체(머무는 동안 조금씩 흐름)
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.globalAlpha = 0.88 * a; g.drawImage(strip, x - Math.min(1, t / 80) * 10, y, w + 10, h);
  // 비스듬히 훑는 빛
  if (t > 14 && t < 60) {
    const k = (t - 14) / 46, gx = x - 40 + (w + 80) * k;
    const gr = g.createLinearGradient(gx - 24, 0, gx + 24, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = a; g.fillStyle = gr;
    g.beginPath(); g.moveTo(gx - 10, y); g.lineTo(gx + 26, y); g.lineTo(gx + 10, y + h); g.lineTo(gx - 26, y + h); g.closePath(); g.fill();
  }
  g.restore();
  // 테두리(보스 색 + 흰 선)
  g.globalAlpha = 0.7 * a; g.fillStyle = col; g.fillRect(x, y - 2, w, 2); g.fillRect(x, y + h, w, 2);
  g.globalAlpha = 0.6 * a; g.fillStyle = '#fff'; g.fillRect(x, y, w * (1 - out), 1); g.fillRect(x, y + h - 1, w * (1 - out), 1);
  g.globalAlpha = 1;
}

function drawFieldUI(G, g) {
  drawCutin(G, g);
  const b = G.boss, sp = G.spell;
  if (G.slow) {
    // 불렛타임은 화면이 푸르게, 오버클럭(직전보다 빨라짐)은 붉게. 끝이 정해진 경우만 남은 시간 막대
    // 오버클럭: 1배보다 빠르거나, 직전보다 빨라지면서 0.5배 이상(아주 느린 구간에서 평소로 돌아오는 것은 제외)
    const over = G.slow.k > 1 || (G.slow.k > (G.slow.from ?? 1) && G.slow.k >= 0.5), k = Math.min(1, Math.abs(1 - G.slowFactor()) / 0.5);
    const tint = over ? '#ff4a5a' : '#4fa8ff', ink = over ? '#ffc2c8' : '#bfe4ff';
    g.globalAlpha = 0.16 * k; g.fillStyle = tint; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1; g.fillStyle = ink; g.font = 'bold 13px Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(over ? 'OVERCLOCK' : 'BULLET TIME', 8, H - 22);
    if (G.slow.dur < 9999 && !G.gauge) { g.globalAlpha = 0.8; g.fillRect(100, H - 17, (W - 110) * (1 - G.slow.t / G.slow.dur), 4); g.globalAlpha = 1; }
  }
  if (G.gauge) {
    // 패턴 게이지(오버클럭 쿨타임 등): 필드 하단. 가득 차 있으면(flash) 깜빡임
    const gg = G.gauge, gx = 100, gy = H - 18, gw = W - 110;
    g.globalAlpha = 0.7; g.fillStyle = '#000'; g.fillRect(gx - 1, gy - 1, gw + 2, 8);
    g.globalAlpha = gg.flash && Math.floor(G.bgT / 4) % 2 ? 0.5 : 1; g.fillStyle = gg.color || '#ff4a5a';
    g.fillRect(gx, gy, gw * Math.max(0, Math.min(1, gg.v)), 6);
    g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.strokeRect(gx - 0.5, gy - 0.5, gw + 1, 7);
  }
  g.font = '12px system-ui, "Malgun Gothic", sans-serif'; g.textBaseline = 'top';
  // 페이지 체력바: 한 페이지(여러 패턴)가 한 막대. 오른쪽부터 줄어들고, 표시선이 패턴 사이 경계(왼쪽일수록 뒤 패턴)
  const run = G.run, bars = run && run.bars, bw = W - 60;
  if (!b.hidden && !sp.survival) {
    let fill = b.hp / b.maxHp, marks = [];
    if (bars) {
      const idxs = run.seq.map((_, i) => i).filter(i => bars[i] === bars[run.idx]);
      const hp = idxs.map(i => (run.seq[i].survival ? 0 : i === run.idx ? b.maxHp : G.hpFor(run.seq[i])));
      const total = hp.reduce((a2, c) => a2 + c, 0) || 1, k = idxs.indexOf(run.idx);
      const later = hp.slice(k + 1).reduce((a2, c) => a2 + c, 0);
      fill = (later + b.hp) / total;
      // 경계선: 각 패턴 뒤에 남는 몫의 위치
      for (let j = 0; j < idxs.length - 1; j++) marks.push(hp.slice(j + 1).reduce((a2, c) => a2 + c, 0) / total);
    }
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(8, 6, bw, 4);
    g.fillStyle = sp.type === 'spell' ? '#ffd0dc' : '#fff'; g.fillRect(8, 6, bw * fill, 4);
    g.fillStyle = '#ff5e7a'; for (const m of marks) g.fillRect(8 + bw * m - 1, 4, 2, 8);
  }
  if (!(run && bars) && !b.hidden) {
    g.fillStyle = '#f5c542'; g.font = 'bold 10px system-ui, "Malgun Gothic", sans-serif'; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText(`격화 ${['I', 'II', 'III'][G.surgeLevel()]}`, 8, 12);
  }
  if (run && bars && run.idx >= 0) {
    // 이 보스의 몇 번째 페이지인지(페이지의 보스 = 그 페이지 마지막 패턴의 보스)
    const pageBoss = pg => { let last = -1; bars.forEach((v, i) => { if (v === pg) last = i; }); return run.seq[last].boss; };
    const cur = bars[run.idx], boss = pageBoss(cur), all = [...new Set(bars)].filter(pg => pageBoss(pg) === boss);
    g.fillStyle = '#f5c542'; g.font = 'bold 10px system-ui, "Malgun Gothic", sans-serif'; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText(`PAGE ${all.indexOf(cur) + 1}/${all.length} · 격화 ${['I', 'II', 'III'][G.surgeLevel()]}`, 8, 12);
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
  if (G.result && !G.result.quiet) {
    const r = G.result;
    g.textAlign = 'center'; g.font = 'bold 18px system-ui, "Malgun Gothic", sans-serif';
    g.fillStyle = r.captured ? '#f5c542' : '#c8c8d8';
    // 보스전 마지막 패턴을 넘기면(격파 또는 내구 스펠을 버팀) 완료 표시
    const runDone = G.run && G.run.idx >= G.run.seq.length - 1 && (r.reason === 'defeat' || G.spell.survival);
    const txt = runDone ? `${G.run.name} 클리어!` : r.captured ? '스펠카드 획득' : G.spell.type === 'stage' ? '웨이브 종료' : r.reason === 'timeout' ? (G.spell.survival ? '내구 실패' : '시간 초과') : G.spell.type === 'spell' ? '격파 (획득 실패)' : '격파';
    g.fillText(txt, W / 2, 150);
    g.font = '12px system-ui, "Malgun Gothic", sans-serif'; g.fillStyle = '#fff';
    g.fillText(`피탄 ${r.stats.miss + r.stats.hits} · 봄 ${r.stats.bombs}`, W / 2, 178);
    g.textAlign = 'left';
  }
  if (G.phase === 'storyclear') {
    const key = G.story && G.story.key, nextKey = UNLOCK_NEXT[key];
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f5c542'; g.textAlign = 'center'; g.font = 'bold 24px system-ui, "Malgun Gothic", sans-serif';
    g.fillText(key === 'main' ? '본편 클리어!' : key === 'extra' ? '엑스트라 클리어!' : '엑스트라 2 클리어!', W / 2, H / 2 - 30);
    g.fillStyle = '#fff'; g.font = '13px system-ui, "Malgun Gothic", sans-serif';
    g.fillText(`점수 ${G.score.toLocaleString()}`, W / 2, H / 2 + 2);
    if (nextKey) g.fillText(nextKey === 'extra' ? '엑스트라가 열렸습니다' : '엑스트라 2가 열렸습니다', W / 2, H / 2 + 24);
    g.fillText('R 처음부터 다시', W / 2, H / 2 + 46);
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
  const x = FX + W + 16, w = 640 - x - 12, p = G.player, st = G.stats;
  const font = (px, bold) => `${bold ? 'bold ' : ''}${px}px system-ui, "Malgun Gothic", sans-serif`;
  g.textBaseline = 'top'; g.textAlign = 'left';

  // 무엇을 하고 있는지: 모드와 패턴 이름
  g.fillStyle = '#f5c542'; g.font = font(11, true);
  const head = G.story && G.story.idx < G.story.list.length
    ? `본게임 ${G.story.idx + 1}/${G.story.list.length} · ${G.run.name}`
    : G.run ? `보스전 · ${G.run.name} ${G.run.idx + 1}/${G.run.seq.length}` : `단일 패턴 ${G.spellIndex + 1}/${G.spells.length}`;
  g.fillText(head, x, 18);
  g.fillStyle = '#fff'; g.font = font(12, true);
  const nameEnd = wrap(g, G.spell.name, x, 34, w, 16, 3);
  g.fillStyle = '#8e8ea6'; g.font = font(11);
  g.fillText(`${ANGELS[G.angel].name} · ${DIFFS[G.difficulty]}`, x, nameEnd + 4);

  // 게임 정보
  let y = nameEnd + 30;
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y - 8, w, 1);
  g.font = font(12); g.fillStyle = '#8e8ea6';
  g.fillText('목숨', x, y); g.fillText('폭탄', x, y + 22); g.fillText('파워', x, y + 44);
  g.font = '15px system-ui, "Segoe UI Symbol", sans-serif';
  for (let i = 0; i < Math.max(p.lives, livesFor(G.difficulty)); i++) { g.fillStyle = i < p.lives ? '#ff6b9a' : '#3a3a4a'; g.fillText('♥', x + 44 + i * 17, y - 2); }
  for (let i = 0; i < Math.max(p.bombs, START_BOMBS); i++) { g.fillStyle = i < p.bombs ? '#7fe0a0' : '#3a3a4a'; g.fillText('✦', x + 44 + i * 17, y + 20); }
  // 파워: 4칸(단계마다 한 칸). 채운 칸 수 = 지금 단계, 다음 칸은 다음 단계까지 찬 만큼. 단계마다 색이 바뀜
  const L = Math.min(MAX_POWER, Math.floor(p.power + 1e-6)), frac = p.power - L, LV = ['#8e8ea6', '#ff8a2a', '#ffe55c', '#3ddc9a', '#f0ad32'];
  for (let i = 0; i < MAX_POWER; i++) {
    const bx = x + 44 + i * 23;
    g.fillStyle = '#2a2a3a'; g.fillRect(bx, y + 47, 20, 10);
    const k = i < L ? 1 : i === L ? frac : 0;
    if (k > 0) { g.fillStyle = i < L ? LV[L] : LV[Math.min(4, L + 1)] + '88'; g.fillRect(bx, y + 47, 20 * k, 10); }
  }
  g.fillStyle = L >= MAX_POWER ? LV[4] : '#fff'; g.font = 'bold 11px Consolas, monospace';
  g.fillText(`${L >= MAX_POWER ? 'MAX' : 'Lv' + L}${G.powerLock ? ' 고정' : ''}`, x + 140, y + 46);
  // 단계가 오르면 기체 위에 POWER UP
  if (G.lastLevel !== undefined && L > G.lastLevel) G.fx.push({ kind: 'text', text: L >= MAX_POWER ? 'POWER MAX' : `POWER UP · Lv${L}`, x: p.x, y: p.y - 22, t: 0, life: 50 });
  G.lastLevel = L;
  y += 72;
  g.font = font(12); g.fillStyle = '#8e8ea6'; g.fillText('점수', x, y); g.fillText('그레이즈', x, y + 20);
  g.fillStyle = '#fff'; g.font = font(13, true);
  g.textAlign = 'right'; g.fillText(G.score.toLocaleString(), x + w, y); g.fillText(String(G.graze), x + w, y + 20); g.textAlign = 'left';

  y += 52;
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y - 8, w, 1);
  if (G.story) {
    // 본게임: 개발 정보 대신 이번 판 스펠카드 획득 수와 남은 체력바
    const sc = G.story.cards || { got: 0, tried: 0 }, bars = G.run && G.run.bars;
    const left = bars ? bars[bars.length - 1] - (G.run.idx < 0 ? 0 : bars[G.run.idx]) + 1 : 0;
    g.font = font(12); g.fillStyle = '#8e8ea6'; g.fillText('스펠카드', x, y); g.fillText('남은 체력바', x, y + 20);
    g.fillStyle = '#fff'; g.font = font(13, true); g.textAlign = 'right';
    g.fillText(`${sc.got} / ${sc.tried}`, x + w, y); g.fillText(String(left), x + w, y + 20); g.textAlign = 'left';
  } else {
  // 개발 정보(작게)
  g.fillStyle = '#6e6e86'; g.font = font(10, true); g.fillText('개발 정보', x, y); y += 16;
  const dps = st.dmgLog.reduce((a, b) => a + b, 0);
  const rows = [
    ['피탄', G.invincible ? `${st.hits} (무적)` : `${st.miss}`],
    ['폭탄 사용', st.bombs],
    ['적탄', G.bullets.length + (G.lasers.length ? ` + 레이저 ${G.lasers.length}` : '')],
    ['초당 피해', dps.toFixed(0)],
    ['보스 체력', G.boss.hidden ? '-' : `${Math.ceil(G.boss.hp)} / ${G.boss.maxHp}`],
    ['FPS', `${G.fps.toFixed(0)}${G.speed !== 1 ? ` · ${G.speed}×` : ''}`],
  ];
  g.font = font(11);
  rows.forEach(([k, v], i) => {
    g.fillStyle = '#8e8ea6'; g.fillText(k, x, y + i * 17);
    g.fillStyle = '#c8c8d8'; g.textAlign = 'right'; g.fillText(String(v), x + w, y + i * 17); g.textAlign = 'left';
  });
  }

  // 켜져 있는 연습 옵션 표시
  const tags = [G.invincible && '무적', G.powerLock && '파워 고정', SFX.muted && '소리 끔', G.paused && '일시정지'].filter(Boolean);
  let tx = x;
  g.font = font(10, true);
  for (const t of tags) {
    const tw = g.measureText(t).width + 10;
    if (tx + tw > x + w) break;
    g.fillStyle = '#3a2e10'; g.fillRect(tx, 452, tw, 16);
    g.fillStyle = '#ffe6a0'; g.fillText(t, tx + 5, 455);
    tx += tw + 4;
  }
}

// 폭 w에 맞춰 줄바꿈해 그림. 마지막 줄 다음 y를 돌려줌. maxLines를 넘으면 말줄임
function wrap(g, text, x, y, w, lh, maxLines = 99) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > w) { lines.push(line); line = ch; } else line += ch;
  }
  lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…'; }
  lines.forEach((l, i) => g.fillText(l, x, y + i * lh));
  return y + lines.length * lh;
}
