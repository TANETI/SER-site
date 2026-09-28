'use strict';
// 탄막 테스트 엔진. 좌표는 플레이 영역(384×448) 기준이며 60틱 고정.

const TAU = Math.PI * 2;
const W = 384, H = 448;          // 플레이 영역
const FX = 32, FY = 16;          // 화면(640×480) 안 플레이 영역 위치
const SC = 2;                    // 캔버스 내부 배율
// 모바일(좁은 화면): 캔버스에 플레이 영역만 그리고 위에 얇은 정보 줄(MH). 캔버스는 W × (H + MH)
const MH = 24;
const HIT_R = 2.0, GRAZE_R = 18;   // 기체 피격 반지름(2.4에서 줄임). 판정점 표시도 이 값을 따름
const START_LIVES = 3, START_BOMBS = 3;
// 노말 이하는 목숨 하나 더
const livesFor = diff => diff <= 1 ? 4 : START_LIVES;
// 파워 0.00~4.00. 정수 부분이 탄 단계. 작은 P +0.02, 큰 P +0.25, 죽으면 -0.5
const MAX_POWER = 4, P_SMALL = 0.02, P_BIG = 0.25, DEATH_POWER_LOSS = 0.5;
// 난이도별 보스 체력 배율
// 하드 이상은 완만하게: 노말 대비 하드 1.1배, 베리하드 약 1.19배, 헬 1.25배(제한시간도 같은 배율)
const HP_MUL = [0.6, 0.7, 0.77, 0.83, 0.875, 0.9];
// 보스 체력 전체 배율(제한시간에는 영향 없음)
const BOSS_HP = 0.855;   // 0.9에서 5% 너프
// 패턴에 적힌 체력·제한시간에 곱하는 배율(내구 스펠·잡몹 구간·허수아비 제외).
// 보스전은 스테이지마다 hpScale로 길이를 따로 맞춤(BOSS_RUNS). 단일 패턴 연습은 이 기본값
const HP_SCALE = 2.2;
// 난이도: 0=이지 1=노말 2=하드 3=베리하드 4=헬. 패턴은 s.lv·s.cnt·s.wait·s.sp로 난이도를 반영한다.
// 하드가 시험판 처음의 잠정 최고 밀도. 표의 6번째 값은 예전 '엑스트라 한 단계 위' 계산용으로 지금은 쓰지 않음
const DIFFS = ['이지', '노말', '하드', '베리하드', '헬'];
const DENSITY = [0.55, 0.8, 1, 1.2, 1.4, 1.6], INTERVAL = [1.6, 1.25, 1, 0.88, 0.78, 0.7], SPEED = [0.82, 0.92, 1, 1.06, 1.12, 1.16];

// ── 게임 난수 ──────────────────────────────────────────────
// 패턴·아이템·자기 탄 흔들림 등 게임 결과에 닿는 난수는 모두 rng()로(연출·화면 흔들림은 Math.random).
// 패턴을 시작할 때마다 다시 심음: 시드를 정해 두면(패턴 테스트 룸의 '난수 시드' 또는 주소 ?seed=) 같은 패턴은 같은 난수로 재현됨.
// 비워 두면 매번 무작위 시드(지금 쓴 시드는 G.seedUsed)
// 흐름은 둘: 패턴(rng)과 기체 쪽(rngP: 자기 탄 흔들림·아이템 흩어짐). 조작이 달라도 패턴 난수는 같게
function makeRng() {   // mulberry32
  let st = 1;
  const f = () => {
    st = (st + 0x6D2B79F5) | 0;
    let t = st;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.seed = n => { st = (n >>> 0) || 1; };
  return f;
}
const rng = makeRng(), rngP = makeRng();
function seedRng(n) { rng.seed(n); rngP.seed(Math.imul(n, 1597334677) ^ 0x9E3779B9); }

// ── 탄 스프라이트 ──────────────────────────────────────────
const COLORS = {
  // ivy: 리크니스의 잎. 리크니스 이펙트는 빨강·검정 계열(잎 짙은 빨강, 덩굴 머리 검정, 꽃잎 빨강)
  // 배경이 거의 검정이라 어두운 색(파랑·보라·갈색)은 밝게 둠. 노랑(레몬)과 금색(호박)은 서로 구분되게 벌림
  ivy: '#b3142c', red: '#ff3b4a', orange: '#ff8a2a', yellow: '#ffe55c', green: '#3ddc6a', cyan: '#35d6ff',
  blue: '#5b8cff', purple: '#bb6bff', pink: '#ff5ec8', white: '#e8e8f4', gold: '#f0ad32',
  brown: '#cf8446', black: '#30303c',
  // void: 흰 광채를 두른 검은 탄(sprite에서 따로 그림)
};

// r=판정 반지름, size=그리기 크기, oriented=진행 방향으로 회전
const SHAPES = {
  small:  { r: 3,   size: 12, draw: (g, c) => orb(g, 6, 6, 5, c) },
  orb:    { r: 6,   size: 22, draw: (g, c) => orb(g, 11, 11, 10, c) },
  big:    { r: 13,  size: 40, draw: (g, c) => orb(g, 20, 20, 18, c) },
  rice:   { r: 2.6, size: 18, oriented: true, draw: (g, c) => needle(g, c) },   // 쌀알탄: 양끝이 뾰족한 바늘(판정은 그대로)
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
// 쌀알탄(바늘): 옅은 광채 → 양끝이 뾰족한 가는 몸통(앞이 더 길고 날카로움) → 가운데 흰 심줄
function needle(g, c) {
  const gr = g.createRadialGradient(9, 9, 1, 9, 9, 8);
  gr.addColorStop(0, c + '66'); gr.addColorStop(1, c + '00');
  g.fillStyle = gr; g.beginPath(); g.ellipse(9, 9, 8.5, 4.2, 0, 0, TAU); g.fill();
  g.fillStyle = c; g.beginPath(); g.moveTo(17.5, 9); g.quadraticCurveTo(10, 5.6, 2, 9); g.quadraticCurveTo(10, 12.4, 17.5, 9); g.closePath(); g.fill();
  g.strokeStyle = EDGE; g.lineWidth = 1; g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(5, 9); g.lineTo(14.5, 9); g.stroke();
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
  '아즈라엘': 'AZ', '예로니모': 'JR', '리크니스': 'LY', '이즘': 'IZ', '티폰': 'TY', '시연': 'SY', '코스모': 'CM', '진': 'GN', '셰리': 'SH' };
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
const SHOT_DMG = 2;   // 기체 대미지 공통 배율
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
    const k = i - (n - 1) / 2, wob = b.wob ? (rngP() * 2 - 1) * (focus ? b.wob / 3 : b.wob) : 0;
    const extra = b.falloff ? { life: b.life + (rngP() * 3 | 0), falloff: true } : undefined;
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
const UNLOCK_NEXT = { main: 'extra', extra: 'extra2', extra2: 'extra3' };
function unlocked(key) {
  if (key === 'main') return true;
  try { return !!JSON.parse(localStorage.getItem('danmaku.unlock') || '{}')[key]; } catch (e) { return false; }
}
function unlockStory(cleared) {
  const key = UNLOCK_NEXT[cleared];
  if (!key) return;
  try { const u = JSON.parse(localStorage.getItem('danmaku.unlock') || '{}'); u[key] = true; localStorage.setItem('danmaku.unlock', JSON.stringify(u)); } catch (e) { /* 저장 못 해도 진행 */ }
}

// 패턴 테스트 룸 목록에서의 번호(목록이 없으면 패턴 번호)
function roomNo(G) { const at = G.roomOrder ? G.roomOrder.indexOf(G.spellIndex) : -1; return at >= 0 ? at + 1 : G.spellIndex + 1; }

// 본게임 최종 점수(만점 100000 = 헬 만점). 클리어 33500 + 시간 보너스(최대 16700) + 노미스 3300 + 노봄 6600 + 노컨티뉴 6600
// − 미스 700·폭탄 350·컨티뉴 2700씩, 그 뒤 난이도 배율(이지 0.7, 노말 1, 하드 1.1, 베리하드 1.2, 헬 1.5), 최대 100000.
// 시간 보너스: 기준 시간(노말 약 25분, 난이도별 보스 체력 배율만큼 길게) 안이면 만점, 기준의 두 배에서 0
const SCORE_DIFF = [0.7, 1, 1.1, 1.2, 1.5];
// 컨티뉴: 본게임에서 최대 2회, 보스 3명마다 1회 보충. 게임 오버 뒤 10초 안에 이어 하지 않으면 탈락
const MAX_CONTINUES = 2, CONTINUE_EVERY = 3, CONTINUE_WAIT = 600;
// 철인 모드(하드부터, 컨티뉴 없음): 클리어하면 난이도 배율을 곱한 뒤 5000점 추가(헬 철인 만점 105000)
const IRON_BONUS = 5000;
// 발악: 격화 III에 닿은 뒤 버티는 시간(프레임)
const DESPERATE_FRAMES = 900;
function finalScore(st) {
  const d = st.diff ?? 1, sec = st.frames / 60;
  const scale = st.list.length / 8;   // 본편 8스테이지 기준
  const target = 25 * 60 * scale * HP_MUL[d] / HP_MUL[1];
  const time = Math.round(16700 * Math.max(0, Math.min(1, (2 * target - sec) / target)));
  const parts = [
    ['클리어', 33500], ['시간 보너스', time],
    ['노미스', st.miss === 0 ? 3300 : 0], ['노봄', st.bombs === 0 ? 6600 : 0], ['노컨티뉴', st.continues === 0 ? 6600 : 0],
    ['미스', -700 * st.miss], ['폭탄', -350 * st.bombs], ['컨티뉴', -2700 * st.continues],
  ];
  const raw = Math.max(0, parts.reduce((a, [, v]) => a + v, 0));
  const iron = st.iron ? IRON_BONUS : 0;
  return { diff: d, sec, target, parts, raw, mul: SCORE_DIFF[d], iron, score: Math.min(100000, Math.round(raw * SCORE_DIFF[d])) + iron, miss: st.miss, bombs: st.bombs, continues: st.continues, tools: st.tools };
}

// 탈락(게임 오버로 끝난 판) 점수: 시간·노미스·노봄·노컨티뉴 보너스 없이 기본 5000 + 진행도(깬 스테이지 / 전체 × 28500)
// − 미스 300·폭탄 150씩(탈락판은 감점을 가볍게), 그 뒤 같은 난이도 배율. 탈락하면 목숨을 다 잃은 것이므로 미스는 보통 목숨 수
function failScore(r) {
  const raw = Math.max(0, 5000 + 28500 * (r.cleared / (r.total || 8)) - 300 * r.miss - 150 * r.bombs);
  return Math.round(raw * SCORE_DIFF[r.diff]);
}

// 오래 켜 두는 레이저(패턴 내내 켜진 빔·쓸고 가는 레이저·시선): 폭탄이나 피탄으로 지우면 패턴이 다시 만들지 않으므로 남김
function lasting(l) { return l.kind !== 'chain' && (l.light || l.dur >= 300); }

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
    // 발악 중에는 체력이 멈추므로 격화는 15초에 걸쳐 2/3에서 끝(1)까지 오름
    if (this.desperate) return Math.min(1, 2 / 3 + this.desperate.t / this.desperate.dur / 3);
    const p = sp.survival ? 1 - this.timer / this.timerMax : 1 - this.boss.hp / this.boss.maxHp;
    return Math.max(0, Math.min(1, p));
  }
  surgeLevel() { return Math.min(2, Math.floor(this.heat() * 3)); }
  // 발악이 걸리는 패턴: lastStand 보스전(5스테이지부터·엑스트라)의 맨 마지막 패턴. 패턴 테스트 룸에서는 그런 보스전의 마지막 패턴이면
  lastStandSpell(sp) {
    if (this.run) return !!this.run.lastStand && this.run.seq[this.run.seq.length - 1] === sp;
    return typeof BOSS_RUNS !== 'undefined' && BOSS_RUNS.some(r => r.lastStand && r.seq[r.seq.length - 1] === sp);
  }

  // 엑스트라는 본편을 깬 뒤 열리는 스테이지일 뿐 난이도 체계가 아니므로 고른 난이도 그대로 씀
  effDiff(sp = this.spell) { return this.difficulty; }

  // 패턴의 실제 체력(난이도·보스전 배율 반영). 체력바를 그릴 때 다음 패턴 몫도 이걸로 셈
  hpFor(sp) {
    const { scaled, k } = this.scaleOf(sp);
    return sp.hp >= 99999 ? sp.hp : Math.max(1, Math.round((sp.hp || 1000) * HP_MUL[this.effDiff(sp)] * k * (scaled ? BOSS_HP : 1)));
  }
  // 체력·제한시간 배율: 체력으로 깨는 패턴(scaled)만 보스전 배율(hpScale × bossScale, 단일 패턴 연습은 HP_SCALE)을 받음
  scaleOf(sp) {
    const scaled = sp.hp < 99999 && !sp.survival && sp.type !== 'stage';
    const k = scaled ? (this.run ? this.run.hpScale * (this.run.bossScale?.[sp.boss] ?? 1) : HP_SCALE) : 1;   // bossScale: 보스전 안 보스별 배율(중간 보스 등)
    return { scaled, k };
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
  // 패턴 테스트 룸 목록 순서(roomOrder, 패널이 정함)로 앞뒤 패턴
  stepSingle(d) {
    const ord = this.roomOrder && this.roomOrder.length ? this.roomOrder : this.spells.map((_, i) => i);
    const at = ord.indexOf(this.spellIndex);
    this.startSingle(ord[((at < 0 ? 0 : at) + d + ord.length) % ord.length]);
  }
  // 시작 화면(스테이지 모드 첫 화면): 게임을 멈춘 채 모드·기체·난이도를 고름. 패널(main.js)이 겹침 화면을 그림
  toTitle() {
    if (!this.spell) this.startSingle(this.roomOrder?.[0] ?? 0);   // 처음 켰을 때: 그릴 것이 있게 패턴 하나를 깔아 둠
    this.story = null; this.run = null;
    this.clearField(); this.items = []; this.tip = null;
    this.boss.hidden = true; this.cutin = null; this.banner = null;
    BGM.fadeOut(1);
    this.phase = 'title'; this.phaseT = 99999;
    this.onTitle?.();
  }
  // 테스트 도구: 본편의 i번째 스테이지로 바로(목숨·폭탄은 새로, 파워는 그 스테이지 기준값). 테스트 도구 사용으로 기록
  jumpStage(i) {
    const iron = !!(this.story && this.story.iron);
    this.startStory('main', iron);
    const st = this.story;
    if (!st || i < 0 || i >= st.list.length) return;
    st.idx = i; st.tools = true;
    this.startRun(st.list[i]);
    this.onChange?.();
  }
  // 스테이지 클리어 화면에서 다음 스테이지로
  continueStage() {
    const st = this.story;
    if (this.phase !== 'stageclear' || !st) return;
    st.idx++; this.startRun(st.list[st.idx], true);
    this.onChange?.();
  }
  // 스테이지 모드: 지금 스테이지를 건너뛰고 다음 스테이지로(목숨·파워 이어받음)
  nextStage() {
    const st = this.story;
    if (!st || st.idx >= st.list.length - 1) return false;
    st.tools = true;
    st.idx++; this.startRun(st.list[st.idx], true);
    return true;
  }
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
  // iron: 철인 모드(컨티뉴 없음, 하드부터). 클리어하면 추가 점수
  startStory(key, iron = false) {
    const list = (STORY[key] || []).map(name => BOSS_RUNS.find(r => r.name === name)).filter(Boolean);
    if (!list.length) return;
    iron = iron && this.difficulty >= 2;
    // 본게임 기록: 플레이 시간(프레임)·미스·폭탄·컨티뉴, 테스트 도구를 썼는지(tools)
    // contLeft: 남은 컨티뉴(최대 2, 처음 2). 보스를 3명 쓰러뜨릴 때마다 1 보충(같은 보스는 한 번만 셈). beaten: 쓰러뜨린 보스
    this.story = { key, list, idx: 0, frames: 0, miss: 0, bombs: 0, continues: 0, tools: false, diff: this.difficulty, contLeft: iron ? 0 : MAX_CONTINUES, beaten: new Set(), iron };
    this.score = 0; this.graze = 0;
    this.startRun(list[0]);
    this.showTip('위험하면 폭탄(X)을 아끼지 말고 쓰세요\n죽으면 폭탄이 다시 3개로 채워집니다', 420);
  }
  // 본게임 게임 오버에서 이어 하기: 컨티뉴 하나를 쓰고 그 스테이지 처음부터(점수는 0부터)
  useContinue() {
    const st = this.story;
    if (this.phase !== 'gameover' || !st || st.contLeft <= 0) return;
    st.contLeft--; st.continues++;
    this.score = 0; this.graze = 0; this.startRun(st.list[st.idx]);
    this.onChange?.();
  }
  // 본게임 탈락: 컨티뉴가 없거나 10초 안에 이어 하지 않음. 탈락 점수로 채점
  storyFail() {
    const st = this.story;
    this.phase = 'storyfail'; this.phaseT = 99999;
    st.result = { fail: true, diff: st.diff, sec: st.frames / 60, miss: st.miss, bombs: st.bombs, continues: st.continues, tools: st.tools,
      cleared: st.idx, total: st.list.length, stage: st.list[st.idx].title.split(' · ')[0] };
    st.result.score = failScore(st.result);
    this.onStoryClear?.(st.result);
  }
  restart() {
    if (this.story && (this.story.idx >= this.story.list.length || this.phase === 'storyclear' || this.phase === 'storyfail')) return this.toTitle();   // 클리어·탈락 뒤 R: 시작 화면
    if (this.story && this.phase === 'gameover') return this.useContinue();   // 게임 오버에서 R: 컨티뉴
    if (this.story) { this.score = 0; this.graze = 0; this.startRun(this.story.list[this.story.idx]); }
    else if (this.run) this.startRun(this.run); else this.startSingle();
  }
  resetLives(power = 0) {
    this.player = this.player || {};
    // 파워 고정이면 보스전에서도 연습 파워를 씀
    this.player.lives = livesFor(this.difficulty); this.player.bombs = START_BOMBS; this.player.power = this.powerLock ? this.practicePower : power;
    this.items = [];
  }

  // 필드를 비움(패턴 시작·시작 화면): 탄·레이저·적·연출·패턴이 건 상태와 작업
  clearField() {
    this.tasks.clear();
    this.bullets = []; this.lasers = []; this.enemies = []; this.shots = []; this.fx = []; this.boost = null; this.gauge = null; this.surgeLv = 0;
    this.partners = []; this.chants = []; this.zones = []; this.areas = []; this.slow = null; this.safes = [];
    this.rifts = []; this.mists = [];
  }
  start(i = this.spellIndex) {
    this.spellIndex = (i + this.spells.length) % this.spells.length;
    const sp = this.spell = this.spells[this.spellIndex];
    this.clearField();
    this.items = this.items || [];
    this.error = '';
    // 난수 시드: 정해 둔 시드가 있으면 그 시드와 패턴 번호로(같은 패턴은 같은 난수), 없으면 무작위
    this.seedUsed = this.fixedSeed != null ? (Math.imul(this.fixedSeed >>> 0, 2654435761) ^ this.spellIndex) >>> 0 : (Math.random() * 4294967296) >>> 0;
    seedRng(this.seedUsed);
    this.player = this.player || {};
    // cont: 보스전 안에서 이어지는 패턴(도중 뒤 첫 보스 포함). 기체 자리·곡을 이어 감
    const cont = this.run && (this.run.idx > 0 || (this.run.idx === 0 && this.run.afterStage)), prev = this.boss;
    if (!cont) Object.assign(this.player, { x: W / 2, y: H - 48, options: [] });
    Object.assign(this.player, { inv: 60, fireT: 0, bomb: null, flash: 0, stun: 0 });
    this.stats = { miss: 0, hits: 0, bombs: 0, dmgLog: new Array(60).fill(0), dmgNow: 0 };
    const { scaled, k } = this.scaleOf(sp);
    const hp = this.hpFor(sp);
    const b = this.boss = { x: W / 2, y: -40, hp, maxHp: hp, move: null, hidden: sp.type === 'stage', t: 0,
      name: sp.boss || '', color: sp.bossColor || '#d8d0ff', shield: 0, glow: 0, contact: false };
    if (cont && prev && !prev.hidden) { b.x = prev.x; b.y = prev.y; }
    // 배경음악: 이 보스의 폴더 곡. 보스전 도중 곡이 없는 보스면 앞 곡을 이어 감. 같은 곡이면 처음으로 돌리지 않음
    // bgmRate: 곡 재생 속도(폭주 마르코 1.2). 함수면 게임 상태로 정함(김예나 시청자 수 단계)
    // 도중은 bgm(스테이지 폴더 이름)으로 곡을 찾음
    this.bgmFollowR = 1; this.bgmSentR = 1;
    // 곡이 없는 보스면 앞 곡을 이어 가는데(중간 보스 → 보스), 도중(잡몹 구간)에서 넘어올 때는 이어 가지 않고 멈춤
    const fromStage = prev && prev.hidden && this.run && this.run.afterStage && this.run.idx === 0;
    BGM.playBoss(sp.bgm || sp.boss, cont && !fromStage, (typeof sp.bgmRate === 'function' ? sp.bgmRate(this) : sp.bgmRate) || 1);
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
    const samePrev = cont && this.run.idx > 0 && this.run.seq[this.run.idx - 1].boss === sp.boss;   // 같은 보스의 다음 페이즈
    this.frame = 0; this.phase = 'intro'; this.phaseT = sameBar ? 45 : samePrev ? 60 : cont ? 100 : 70;
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
    this.result = null; this.timeFlash = null; this.desperate = null; this.timerPulse = 0;
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
        // 스테이지를 깨면 잠깐 멈추고 '다음 스테이지로' 버튼(Z·Enter). 마지막이면 채점 화면
        BGM.fadeOut(1.5);   // 마지막 패턴이 시간 초과로 끝났어도 클리어 화면에서는 곡을 줄임
        if (st.idx < st.list.length - 1) { this.phase = 'stageclear'; this.phaseT = 99999; this.clearAt = performance.now(); SFX.stageClear(); this.onStageClear?.(st.list[st.idx], st.list[st.idx + 1]); }
        else { if (!st.tools) unlockStory(st.key); this.phase = 'storyclear';   // 테스트 도구를 쓴 판은 다음 모드를 열지 않음
           this.phaseT = 99999; SFX.stageClear(); st.result = finalScore(st); this.onUnlock?.(); this.onStoryClear?.(st.result); }
      }
      else if (this.loop) this.startRun(r);
      else this.startSingle(this.spellIndex);
    } else if (this.loop) this.startSingle(this.spellIndex);
    else this.stepSingle(1);
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
    // 차원절단 균열은 다음 패턴으로 넘어가기 전에 쩌저적 하며 다시 붙음. 붉은 안개는 걷힘
    for (const r of this.rifts) this.closeRift(r);
    for (const m of this.mists) m.life = Math.min(m.life, m.t + 40);
    // 논스펠은 작은 P만, 스펠은 큰 P 하나를 더 줌
    if (!this.boss.hidden && reason !== 'timeout') this.dropItems(this.boss.x, this.boss.y, 5, sp.type === 'spell' ? 1 : 0, true);
    for (const it of this.items) it.magnet = true;
    this.enemies.forEach(e => this.killEnemy(e, false));
    this.result = { captured: captured && sp.type === 'spell', reason, t: 0, stats: { ...this.stats } };
    this.phase = 'result'; this.phaseT = 170;
    const bars = this.run && this.run.bars;
    if (bars && bars[this.run.idx + 1] === bars[this.run.idx]) { this.result.quiet = true; this.phaseT = 30; }
    if (this.run && this.run.idx < 0) { this.result.quiet = true; this.phaseT = 50; }   // 도중이 끝나면 결과 화면 없이 보스 등장
    // 페이즈 전환: 같은 보스의 다음 페이즈(pages의 다음 칸)로 넘어가면 결과 화면 없이 큰 전환 연출(탄 지움·번쩍임·PHASE n)
    const nextSp = this.run && this.run.idx >= 0 ? this.run.seq[this.run.idx + 1] : null;
    if (bars && nextSp && nextSp.boss === sp.boss && bars[this.run.idx + 1] !== bars[this.run.idx]) {
      this.result.quiet = true; this.phaseT = 80;
      const mine = [...new Set(this.run.seq.map((x, i) => (x.boss === sp.boss ? bars[i] : null)).filter(v => v !== null))];
      const n = mine.indexOf(bars[this.run.idx + 1]) + 1;
      this.fx.push({ kind: 'phase', text: `PHASE ${n}`, sub: sp.boss, x: this.boss.x, y: this.boss.y, t: 0, life: 150 });
      this.boss.glow = 120; this.shake(10); SFX.boom(); SFX.spell();
    }
    // 본게임: 보스의 마지막 패턴이 끝나면(다음 패턴이 다른 보스거나 보스전 끝) 그 보스를 쓰러뜨린 것으로 셈. 3명마다 컨티뉴 1 보충
    if (this.story && this.run && this.run.idx >= 0 && sp.boss) {
      const nx = this.run.seq[this.run.idx + 1], st = this.story, id = this.run.name + '/' + sp.boss;
      if ((!nx || nx.boss !== sp.boss) && !st.beaten.has(id)) {
        st.beaten.add(id);
        if (!st.iron && st.beaten.size % CONTINUE_EVERY === 0 && st.contLeft < MAX_CONTINUES) {
          st.contLeft++;
          this.fx.push({ kind: 'text', text: '컨티뉴 +1', x: W / 2, y: 96, t: 0, life: 90 });
          SFX.extend();
        }
      }
    }
    // 결과 화면 없이 넘어가도 스펠카드 획득은 짧게 알림
    if (this.result.quiet && this.result.captured) this.fx.push({ kind: 'text', text: '스펠카드 획득!', x: W / 2, y: 70, t: 0, life: 70 });
    // 보스전 마지막 패턴을 격파(내구 스펠은 버팀)하면 배경음악이 자연스럽게 줄어들며 끝남
    if (this.run && this.run.idx >= this.run.seq.length - 1 && (reason === 'defeat' || sp.survival)) BGM.fadeOut(3);
  }

  // keepStructures: 피탄 때처럼 패턴이 계속 이어지는 경우. 구조물 탄(keep)은 되살아난 무적 동안 꺼 두고, 오래 켜 두는 레이저는 남김
  clearBullets(points, keepStructures = false) {
    const gone = keepStructures ? this.bullets.filter(b => !b.keep) : this.bullets;
    for (const b of gone) this.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 20, color: b.color });
    if (points) this.score += gone.length * 10;
    if (keepStructures) {
      this.bullets = this.bullets.filter(b => b.keep);
      for (const b of this.bullets) { b.off = true; b.offT = Math.max(b.offT || 0, 150); }
      this.lasers = this.lasers.filter(l => lasting(l));
    } else { this.bullets = []; this.lasers = []; }
  }

  // 아이템: 작은 P(p)·큰 P(P). magnet이면 곧장 플레이어에게 날아옴
  dropItems(x, y, small, big, magnet = false) {
    for (let i = 0; i < small + big; i++) {
      this.items.push({ kind: i < big ? 'P' : 'p', x: x + (rngP() * 2 - 1) * (8 + i * 2), y: y + (rngP() * 2 - 1) * 8,
        vy: -2.2 - rngP() * 1.2, t: 0, magnet });
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
    if (this.phase === 'title') return;   // 시작 화면: 게임은 멈춰 있음
    if (this.story && ['intro', 'active', 'result'].includes(this.phase)) {
      const st = this.story; st.frames++;
      if (this.invincible || this.powerLock || this.skipStage || this.speed !== 1) st.tools = true;
      st.diff = Math.min(st.diff, this.difficulty);   // 도중에 난이도를 낮추면 낮은 쪽으로 채점
    }
    this.updatePlayer();
    this.updateRifts();

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
      // 발악: 5스테이지부터(lastStand인 보스전) 보스전의 맨 마지막 패턴만. 격화 III에 닿으면(내구 스펠·도중 제외)
      // 체력바가 사라지고 보스는 더 맞지 않으며 15초를 버티면 그 패턴을 깬 것으로 침
      if (sl >= 2 && !this.desperate && !sp.survival && sp.type !== 'stage' && !this.boss.hidden && this.lastStandSpell(sp)) {
        this.desperate = { t: 0, dur: DESPERATE_FRAMES };
        this.timer = this.timerMax = DESPERATE_FRAMES;
        this.timerPulse = 72;   // 문구 없이 제한시간 표시를 한 번 크게 강조
        this.shake(6); SFX.boom();
      }
      if (this.desperate) this.desperate.t++;
      if (sl > (this.surgeLv ?? 0) && !this.boss.hidden) {
        this.fx.push({ kind: 'text', text: sl === 1 ? '격화 II' : '격화 III', x: this.boss.x, y: this.boss.y - 40, t: 0, life: 70 });
        this.fx.push({ kind: 'burst', x: this.boss.x, y: this.boss.y, t: 0, life: 40, color: sl === 1 ? '#f5c542' : '#ff5e7a' });
        this.boss.glow = 40;
        this.shake(sl === 1 ? 4 : 6); SFX.spell();
        // 격화 III: 그 보스다운 추가 탄막이 이 패턴이 끝날 때까지 함께 나옴(SURGE_EXTRA, patterns.js)
        const extra = sl === 2 && !sp.noSurgeExtra && typeof SURGE_EXTRA !== 'undefined' && SURGE_EXTRA[(sp.boss || '').replace(/\s*\(.*\)$/, '')];
        if (extra) this.tasks.add(extra(this.api));
      }
      this.surgeLv = sl;
      // bgmFollow: 곡 속도가 적 탄 속도를 따라감. 값은 이 패턴의 평소 탄 속도 배율(그때 1배속). 1.5배속~0.75배속 사이에서 탄 속도에 비례하고, 곡은 프레임당 0.008씩(약 1초에 걸쳐) 서서히 옮겨 감. 패턴 첫 0.7초는 1배속
      if (sp.bgmFollow) {
        // 탄 속도 비율에 비례: 3배 이상이면 1.5배속, 0.4배 이하면 0.75배속, 그 사이는 비례해서
        const ratio = this.slowFactor() / sp.bgmFollow;
        const want = this.frame < 40 ? 1 : ratio >= 1 ? 1 + 0.5 * Math.min(1, (ratio - 1) / 2) : 1 - 0.25 * Math.min(1, (1 - ratio) / 0.6);
        const cur = this.bgmFollowR ?? 1, r = cur + Math.max(-0.008, Math.min(0.008, want - cur));
        this.bgmFollowR = r;
        if (Math.abs(r - (this.bgmSentR ?? 1)) > 0.02 || (r === want && r !== this.bgmSentR)) { this.bgmSentR = r; BGM.setRate(r); }
      }
      this.tasks.step();
      // 제한시간 10초 전부터 초읽기
      if (this.timer <= 600 && this.timer % 60 === 0 && this.timer > 0) SFX.tick(this.timer <= 180);
      if (--this.timer <= 0) this.endSpell(this.desperate ? 'defeat' : 'timeout');   // 발악을 버티면 격파로 침
      else if (!b.hidden && !sp.survival && b.hp <= 0) this.endSpell('defeat');
    } else if (this.phase === 'result') {
      this.result.t++;
      if (--this.phaseT <= 0) this.next();
    } else if (this.phase === 'gameover') {
      if (--this.phaseT <= 0) { if (this.story) this.storyFail(); else this.restart(); }
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
    p.tilt = dx;
    p.vx = p.x - ox; p.vy = p.y - oy;
    if (p.inv > 0) p.inv--;
    if (p.respawn > 0) p.respawn--;
    if (p.flash > 0) p.flash--;

    // 라티엘 옵션
    if (this.angel === 'RH') {
      const tx = focus ? 12 : 30, ty = focus ? -14 : 4;
      if (!p.options.length) p.options = [{ x: p.x, y: p.y }, { x: p.x, y: p.y }];
      p.options.forEach((o, i) => { const s = i ? 1 : -1; o.x += (p.x + s * tx - o.x) * 0.3; o.y += (p.y + ty - o.y) * 0.3; });
    } else p.options = [];

    const L = Math.max(0, Math.min(4, Math.floor(p.power)));
    if ((k.has('KeyZ') || this.autoFire) && !p.bomb) { SHOT_TYPES[this.angel](p, this.shots, focus, L); p.fireT++; } else p.fireT = 0;

    if (this.pressed.has('KeyX') && !p.bomb && this.phase === 'active') {
      // 봄: 0.5초 차지(무적) 후 확산하며 탄 소거
      if (p.bombs > 0 || this.invincible) {
        if (!this.invincible) p.bombs--;
        if (this.story) this.story.bombs++;
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
        for (const b of this.bullets) {
          if (b.off || dist2(b.x, b.y, p.x, p.y) >= bm.r * bm.r) continue;
          // 구조물 탄은 지우지 않고 폭탄이 끝날 때까지 꺼 둠(흐리게, 판정 없음)
          if (b.keep) { b.off = true; b.offT = Math.max(b.offT || 0, 100 - bm.t + 1); continue; }
          b.dead = true; this.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 20, color: b.color });
        }
        if (bm.r > 100) this.lasers = this.lasers.filter(l => lasting(l));
        if (bm.t < 100) { this.damageBoss(14); for (const e of this.enemies) e.hp -= 14; }
      }
      if (bm.t >= 100) p.bomb = null;
    }
  }

  // 보호막 깎기: 보호막 체력(shieldHp, 구역은 hp)이 있으면 막은 탄의 대미지만큼 줄고, 0이 되면 깨짐. 체력이 없으면(Infinity) 완전 무적
  chipShield(o, d) {
    const zone = o.dur !== undefined && o.r !== undefined && !('shield' in o);
    const key = zone ? 'hp' : 'shieldHp';
    if (!(o[key] < Infinity)) return;
    o[key] -= d; o.chip = 6;
    if (o[key] > 0) return;
    if (zone) o.dur = o.t; else o.shield = 0;
    o.broken = true;
    this.fx.push({ kind: 'burst', x: o.x, y: o.y, t: 0, life: 40, color: '#bfe4ff' });
    this.fx.push({ kind: 'text', text: '보호막 파괴!', x: o.x, y: o.y - 30, t: 0, life: 60 });
    this.shake(5); SFX.boom();
  }

  damageBoss(d) {
    const b = this.boss;
    if (b.hidden || this.phase !== 'active' || this.spell.survival || this.desperate) return;   // 발악 중에는 맞지 않음
    b.hp = Math.max(0, b.hp - d); this.stats.dmgNow += d; this.score += Math.round(d * 10);
    SFX.hit();
  }

  // ── 차원절단 균열(티폰) ──
  // 화면을 가로지르는 직선 균열. 예고(warn) → 한쪽 끝에서 다른 끝으로 찢어짐(tear) → 벌어진 틈(열린 동안 기체가 지나갈 수 없음)
  // → 닫힘(쩌저적 하며 다시 붙음, 40프레임). n·(x,y) = c가 균열의 중심선, cw는 지금 벌어진 반폭.
  // lethal: 벌어지는 순간 틈 위에 있으면 피탄(아니면 가까운 쪽으로 밀려남). block: 적 탄을 삼킴
  // (guard를 주면 그 쪽으로 넘어가려는 탄만 삼킴: 균열 너머 한쪽만 지키는 붉은 안개용)
  updateRifts() {
    const p = this.player;
    if (!this.rifts) return;
    for (const r of this.rifts) {
      r.t++;
      const open = r.warn + r.tear;
      if (r.t === r.warn + 1) { SFX.riftTear(); this.shake(r.quiet ? 3 : 8); }
      if (r.t > r.warn && r.t <= open && !r.quiet) {
        // 찢어지는 끝에서 불꽃이 튐
        const s = -r.len / 2 + r.len * (r.t - r.warn) / r.tear, tx = r.x + r.dx * s, ty = r.y + r.dy * s;
        for (let i = 0; i < 3; i++) this.fx.push({ kind: 'shard', x: tx, y: ty, vx: (Math.random() * 2 - 1) * 3, vy: (Math.random() * 2 - 1) * 3, t: 0, life: 18 + Math.random() * 14, color: i ? '#ff6fae' : '#fff' });
      }
      if (r.t === open && r.visual) { r.shown = true; r.cw = r.w; }   // visual: 보이기만 하는 균열(막지도 맞히지도 않음)
      else if (r.t === open) {
        r.live = true; r.cw = r.w;
        const d = r.nx * p.x + r.ny * p.y - r.c;
        r.side = d < 0 ? -1 : 1;
        if (Math.abs(d) < r.w + HIT_R && r.lethal) this.hitPlayer();
      }
      if (r.closing) {
        r.ct++;
        r.cw = r.w * Math.max(0, 1 - r.ct / 22);
        if (r.ct === 22) r.live = r.shown = false;
        if (r.ct % 3 === 0 && r.ct < 26) {
          const s = (Math.random() - 0.5) * r.len, tx = r.x + r.dx * s, ty = r.y + r.dy * s;
          this.fx.push({ kind: 'shard', x: tx, y: ty, vx: r.nx * (Math.random() * 2 - 1) * 2, vy: r.ny * (Math.random() * 2 - 1) * 2, t: 0, life: 14, color: '#fff' });
        }
        if (r.ct >= 40) r.dead = true;
      }
    }
    this.rifts = this.rifts.filter(r => !r.dead);
    this.keepOffRifts();
    // 붉은 안개: 떠다니는 안개 덩어리는 속도대로 움직임
    for (const m of this.mists) { m.t++; if (m.vx) m.x += m.vx; if (m.vy) m.y += m.vy; }
    this.mists = this.mists.filter(m => m.t < m.life);
  }
  // 기체가 벌어진 균열을 넘거나 틈에 들어가지 못하게 원래 쪽으로 밀어냄(겹친 균열이 있어 두 번 되풀이)
  keepOffRifts() {
    const p = this.player;
    if (!p || !this.rifts.length) return;
    for (let k = 0; k < 2; k++) for (const r of this.rifts) {
      if (!r.live) continue;
      const d = r.nx * p.x + r.ny * p.y - r.c, need = r.cw + 3;
      if (d * r.side < need) { const m = r.side * need - d; p.x += r.nx * m; p.y += r.ny * m; }
      p.x = Math.max(8, Math.min(W - 8, p.x)); p.y = Math.max(16, Math.min(H - 16, p.y));
    }
  }
  // 되살아난 자리를 기준으로 기체가 선 쪽을 다시 정함
  resideRifts() {
    const p = this.player;
    for (const r of this.rifts || []) { const d = r.nx * p.x + r.ny * p.y - r.c; r.side = d < 0 ? -1 : 1; }
    this.keepOffRifts();
  }
  riftEats(b) {
    for (const r of this.rifts) {
      if (!r.live || !r.block) continue;
      const d = r.nx * b.x + r.ny * b.y - r.c;
      if (Math.abs(d) > r.cw) continue;
      if (!r.guard) return true;
      const vx = b.cart ? b.vx : Math.cos(b.ang) * b.spd, vy = b.cart ? b.vy : Math.sin(b.ang) * b.spd;
      if ((vx * r.nx + vy * r.ny) * r.guard > 0) return true;
    }
    return false;
  }
  closeRift(r) { if (!r.closing && !r.dead) { if (!r.live && !r.shown) { r.dead = true; return; } r.closing = true; r.ct = 0; SFX.riftClose(); } }

  // 필드 아래쪽 안내 한 줄(frames 동안, 끝 1초는 옅어짐)
  showTip(text, frames = 300) { this.tip = { text, t: 0, life: frames }; }

  hitPlayer() {
    const p = this.player;
    if (p.inv > 0) return;
    if (this.invincible) {
      this.stats.hits++; p.flash = 20; p.inv = 20; SFX.hurt();
      return;
    }
    if (this.phase !== 'active' && this.phase !== 'intro') return;
    this.stats.miss++;
    // 폭탄을 하나도 안 쓰고 죽으면(본게임에서 한 번) 폭탄은 죽으면 다시 채워진다고 알려 줌
    if (this.story && p.bombs >= START_BOMBS && !this.story.bombTip) { this.story.bombTip = true; this.showTip('폭탄 3개를 남긴 채 죽었습니다\n죽으면 어차피 3개로 다시 채워지니 위험하면 X', 360); }
    this.fx.push({ kind: 'burst', x: p.x, y: p.y, t: 0, life: 40 });
    SFX.die(); this.shake(12);
    this.clearBullets(false, true);
    // respawn: 되살아난 직후 무적 동안 새로 깔린 레이저·사슬은 판정 없음(되살아난 자리를 노린 레이저가 무적이 끝나는 순간 맞혀 목숨이 연달아 줄지 않게)
    p.x = W / 2; p.y = H - 48; p.inv = 150; p.respawn = 150; p.bomb = null;
    this.resideRifts();
    // 한 번 죽을 때마다 목숨 하나. 폭탄은 다시 3개로
    p.lives--; p.bombs = START_BOMBS;
    if (this.story) this.story.miss++;
    const lost = this.powerLock ? 0 : Math.min(p.power, DEATH_POWER_LOSS);
    p.power = +(p.power - lost).toFixed(2);
    if (lost > 0) this.dropItems(p.x, p.y - 30, 5, 0);
    if (p.lives <= 0) {
      this.tasks.clear(); this.clearBullets(false);
      // 본게임: 컨티뉴가 남았으면 10초 기다림(그 안에 이어 하기), 없으면 잠깐 뒤 탈락. 그 밖에는 4초 뒤 자동 재시작
      this.phase = 'gameover'; this.phaseT = this.story ? (this.story.contLeft > 0 ? CONTINUE_WAIT : 120) : 240;
      if (this.story) BGM.fadeOut(1.5);   // 본게임은 게임 오버 화면에서 곡을 줄이고, 컨티뉴하면 그 스테이지 곡이 처음부터
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
      if (b.offT > 0 && --b.offT === 0) b.off = false;   // 폭탄·되살아남 동안 꺼 둔 구조물 탄이 돌아옴
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
      if (this.rifts.length && !b.dead && this.riftEats(b)) { b.dead = true; if (Math.random() < 0.25) this.fx.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 14, color: 'red' }); }
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
      if (l.cw < l.w * 0.6 || l.ghost) continue;   // ghost: 되살아난 직후 깔린 레이저(판정 없음)
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
    if (l.tip <= 0 || l.ghost) return;
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
      const zHit = s.dead ? null : this.zones.find(z => z.t < z.dur && dist2(s.x, s.y, z.x, z.y) < z.r * z.r);
      if (zHit) { s.dead = true; this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); SFX.block(); this.chipShield(zHit, shotDamage(s)); continue; }
      if (!s.dead && !b.hidden && this.phase === 'active' && dist2(s.x, s.y, b.x, b.y) < 30 * 30) {
        s.dead = true;
        // 필리우스 제1식은 약한 공격을 막음: 통상탄은 막히고 봄은 통함
        if (b.shield > 0) { this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); SFX.block(); this.chipShield(b, shotDamage(s)); continue; }
        this.damageBoss(shotDamage(s)); b.hurt = 3;
      }
      // 함께 싸우는 동료(마리 등)도 맞으면 보스 체력바를 깎음
      if (!s.dead && this.phase === 'active') for (const a of this.partners) {
        if (!a.hittable || dist2(s.x, s.y, a.x, a.y) >= 30 * 30) continue;
        s.dead = true;
        if (a.shield > 0) { this.fx.push({ kind: 'block', x: s.x, y: s.y, t: 0, life: 10 }); SFX.block(); this.chipShield(a, shotDamage(s)); break; }
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
    if (this.phase === 'title') { if (take('KeyZ') || take('Enter')) this.onTitleStart?.(); take('KeyR'); take('Escape'); return; }
    if (this.phase === 'stageclear') {
      const z = take('KeyZ') || take('Enter');
      if (z && performance.now() - (this.clearAt || 0) > 500) { this.continueStage(); return; }
    }
    if (this.phase === 'gameover' && this.story && (take('KeyZ') || take('Enter'))) { this.useContinue(); return; }
    if (take('Escape')) this.paused = !this.paused;
    if (take('KeyR')) this.restart();
    if (take('KeyM')) { SFX.setMuted(!SFX.muted); this.onChange?.(); }
    if (take('KeyC')) { this.autoFire = !this.autoFire; this.fx.push({ kind: 'text', text: this.autoFire ? '자동 사격 켬' : '자동 사격 끔', x: this.player.x, y: this.player.y - 20, t: 0, life: 50 }); this.onChange?.(); }
    if (take('KeyI')) { this.invincible = !this.invincible; this.onChange?.(); }   // 무적(테스트 중이라 스테이지 모드에서도)
    // 패턴 전환·기체·난이도 단축키는 패턴 테스트 룸에서만(스테이지 모드는 패널에서 고름)
    if (this.mode === 'stage') { for (const c of ['BracketRight', 'BracketLeft', 'KeyD', 'Digit1', 'Digit2', 'Digit3', 'Digit4']) this.pressed.delete(c); return; }
    if (take('BracketRight')) { this.stepSingle(1); this.onChange?.(); }
    if (take('BracketLeft')) { this.stepSingle(-1); this.onChange?.(); }
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
      const t0 = performance.now();
      while (this.acc >= 1000 / 60 && n++ < 8) { this.update(); this.acc -= 1000 / 60; this.pressed.clear(); }
      if (n) this.msUpdate = (this.msUpdate ?? 0) * 0.9 + (performance.now() - t0) / n * 0.1;   // 틱 한 번 처리 시간(ms, 평활)
    }
    const t1 = performance.now();
    render(this);
    this.msRender = (this.msRender ?? 0) * 0.9 + (performance.now() - t1) * 0.1;   // 한 번 그리는 시간(ms, 평활)
    this.bulletPeak = Math.max(this.bulletPeak ?? 0, this.bullets?.length ?? 0);
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
    get surge() { return G.surgeLevel(); },
    get bullets() { return G.bullets; },
    // 방향 전조: 대상(안전지대 등, x·y를 가진 객체)을 따라다니며 ang 방향으로 흐르는 화살표를 frames 동안
    arrow(target, ang, frames = 44) { G.fx.push({ kind: 'arrow', z: target, ang, t: 0, life: frames }); },   // 지금 화면의 적 탄(탄을 바꾸는 기믹용)   // 격화 단계 0·1·2(격화 I·II·III)
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
      const x = Math.max(90, Math.min(W - 90, b.x + (rng() * 2 - 1) * range));
      const y = Math.max(80, Math.min(140, b.y + (rng() * 2 - 1) * range * 0.4));
      G.moveBoss(x, y, dur); yield dur;
    },
    rand: (a = 0, b = 1) => a + rng() * (b - a),
    randInt: (a, b) => Math.floor(a + rng() * (b - a + 1)),
    pick: arr => arr[Math.floor(rng() * arr.length)],
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
        keep: !!o.keep,   // keep: 한 번 깔고 계속 쓰는 구조물 탄(채운 화면·격자). 폭탄·피탄에 지워지지 않고 잠깐 꺼졌다가 돌아옴
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
        warn: o.warn ?? 40, dur: o.dur ?? 60, color: o.color || 'cyan', fn: o.fn, t: 0, cw: 0, ghost: G.player.respawn > 0 || !!o.light, light: !!o.light };   // light: 판정 없는 빛줄기(시선 등)
      G.lasers.push(l);
      return l;
    },
    // 사슬: {x,y,ang,len,w,warn,shoot,hold,retract}. 기본 발사 위치는 보스
    chain(o = {}) {
      const l = { kind: 'chain', x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, ang: o.ang ?? Math.PI / 2, len: o.len ?? 700, w: o.w ?? 7,
        warn: o.warn ?? 45, shoot: o.shoot ?? 12, hold: o.hold ?? 20, retract: o.retract ?? 120, fn: o.fn, t: 0, tip: 0, ghost: G.player.respawn > 0 };
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
    // 차원절단 균열 {x,y,ang,warn,tear,w,lethal,block,guard,quiet}: (x,y)를 지나 ang 방향으로 화면을 가로지름. 닫을 때까지 열려 있음
    // guard: 균열 너머 지킬 쪽(균열 법선 n=(-sin,cos) 기준 +1·-1). 그 쪽으로 넘어가려는 적 탄만 삼킴
    rift(o = {}) {
      const ang = o.ang ?? Math.PI / 2, nx = -Math.sin(ang), ny = Math.cos(ang), x0 = o.x ?? W / 2, y0 = o.y ?? H / 2;
      // 선 위의 기준점은 화면 가운데에서 선에 내린 수선의 발(그래야 길이 len으로 화면을 끝까지 가로지름)
      const off = nx * (x0 - W / 2) + ny * (y0 - H / 2), x = W / 2 + nx * off, y = H / 2 + ny * off;
      const N = 36, jag = () => Array.from({ length: N + 1 }, () => Math.random() * 2.6);
      const r = { x, y, ang, dx: Math.cos(ang), dy: Math.sin(ang), nx, ny, c: nx * x + ny * y, len: Math.hypot(W, H) + 20,
        warn: o.warn ?? 50, tear: o.tear ?? 18, w: o.w ?? 6, cw: 0, lethal: !!o.lethal, block: !!o.block, guard: o.guard ?? 0, quiet: !!o.quiet, visual: !!o.visual,
        t: 0, live: false, side: 1, N, jagA: jag(), jagB: jag() };
      G.rifts.push(r);
      return r;
    },
    closeRift(r) { G.closeRift(r); },
    closeRifts() { for (const r of G.rifts) G.closeRift(r); },
    // 점 (x,y)가 균열 r의 어느 쪽인지(+1·-1)
    riftSide(r, x, y) { return r.nx * x + r.ny * y - r.c < 0 ? -1 : 1; },
    // 붉은 안개(판정 없음). 사각 {x,y,w,h} 또는 덩어리 {x,y,r,vx,vy}. fade 동안 짙어짐, life가 되면 사라짐(끝 40프레임은 옅어짐)
    mist(o = {}) { const m = { x: o.x, y: o.y, w: o.w, h: o.h, r: o.r, vx: o.vx ?? 0, vy: o.vy ?? 0, t: 0, fade: o.fade ?? 40, life: o.life ?? 600 }; G.mists.push(m); return m; },
    // 판정 없는 빨간 예고선: {x,y,x2,y2,dur}
    warnLine(o) { G.fx.push({ kind: 'warnline', x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, x2: o.x2, y2: o.y2, t: 0, life: o.dur ?? 30, band: o.band ?? 0 }); },
    // 사각 구역 공격 {x,y,w,h,warn,dur,label,color}. warn 동안 예고, dur 동안 판정
    area(o) {
      const a = { x: o.x, y: o.y, w: o.w, h: o.h, warn: o.warn ?? 60, dur: o.dur ?? 20, label: o.label ?? '', color: o.color || '#ff3b4a', t: 0, fog: !!o.fog, edge: o.edge, group: o.group, pulse: !!o.pulse };   // pulse: 예고 동안 구역 전체가 한 번 밝게 번쩍임   // group: 같은 객체를 준 안개 띠들은 한 덩어리로 그림
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
    // hp를 주면 때려서 부술 수 있는 보호막(막은 탄의 대미지만큼 깎임). 없으면 완전 무적
    shield(who, frames, hp = Infinity) { who.shield = frames; who.shieldMax = frames; who.shieldHp = who.shieldHpMax = hp; who.broken = false; },
    // 고정 구역 보호막: 안으로 들어온 자기 탄을 지움 {x,y,r,dur}
    zone(o = {}) { const z = { x: o.x ?? G.boss.x, y: o.y ?? G.boss.y, r: o.r ?? 56, dur: o.dur ?? 300, t: 0, hp: o.hp ?? Infinity, hpMax: o.hp ?? Infinity }; G.zones.push(z); return z; },
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
  const ox = G.mobile ? 0 : FX, oy = G.mobile ? MH : FY;   // 플레이 영역 위치(모바일은 정보 줄 아래)

  g.save();
  // 흔들림은 경기 화면에만. 오른쪽 정보창은 가만히 둠
  const sm = G.shakeMag;
  g.translate(ox + (sm ? (Math.random() * 2 - 1) * sm : 0), oy + (sm ? (Math.random() * 2 - 1) * sm : 0));
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  drawBackground(G, g);
  drawMists(G, g);
  drawRifts(G, g);
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

  if (G.mobile) drawMobileHUD(G, g); else drawHUD(G, g);
}

// 모바일 정보 줄: 목숨·폭탄·파워(왼쪽), 본게임 진행·컨티뉴·점수(오른쪽)
function drawMobileHUD(G, g) {
  const p = G.player, L = Math.floor(p.power);
  g.fillStyle = '#12121c'; g.fillRect(0, 0, W, MH);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, MH - 1, W, 1);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = 'bold 11px system-ui, "Malgun Gothic", sans-serif';
  let x = 6;
  for (let i = 0; i < Math.max(p.lives, livesFor(G.difficulty)); i++) { g.fillStyle = i < p.lives ? '#ff6b9a' : '#3a3a4a'; g.fillText('♥', x, MH / 2); x += 11; }
  x += 4;
  for (let i = 0; i < Math.max(p.bombs, START_BOMBS); i++) { g.fillStyle = i < p.bombs ? '#7fe0a0' : '#3a3a4a'; g.fillText('✦', x, MH / 2); x += 11; }
  x += 4;
  g.fillStyle = '#f5c542'; g.fillText(L >= MAX_POWER ? 'P MAX' : `P ${p.power.toFixed(2)}`, x, MH / 2);
  g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText(G.score.toLocaleString(), W - 6, MH / 2);
  if (G.story) {
    g.fillStyle = '#8e8ea6'; g.font = '10px system-ui, "Malgun Gothic", sans-serif';
    const sw = g.measureText(G.score.toLocaleString() + '  ').width + 18;
    g.fillText(`${G.story.idx + 1}/${G.story.list.length} · ${G.story.iron ? '철인' : 'C' + G.story.contLeft}`, W - 6 - sw, MH / 2);
  }
  g.textAlign = 'left'; g.textBaseline = 'top';
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
    // 부술 수 있는 보호막: 남은 체력만큼 굵은 호
    if (a.shieldHp < Infinity) {
      g.strokeStyle = a.chip > 0 ? '#ffffff' : '#9fd8ff'; g.lineWidth = 3;
      g.beginPath(); g.arc(a.x, a.y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, a.shieldHp / a.shieldHpMax)); g.stroke();
      if (a.chip > 0) a.chip--;
    }
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
  g.setLineDash([]);
  // 부술 수 있는 보호막: 남은 체력만큼 굵은 호. 맞으면 잠깐 밝아짐
  if (z.hp < Infinity) {
    const f = Math.max(0, z.hp / z.hpMax);
    g.globalAlpha = k; g.strokeStyle = z.chip > 0 ? '#ffffff' : '#9fd8ff'; g.lineWidth = 3;
    g.beginPath(); g.arc(z.x, z.y, z.r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.stroke();
    if (z.chip > 0) z.chip--;
  }
  g.globalAlpha = 1;
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
    if (l.ghost && !l.light) g.globalAlpha = 0.3;   // 판정 없는 레이저는 흐리게
    if (l.t <= l.warn) {
      warnStroke(g, l.len, c, l.t, l.warn - l.t, l.w * 0.7);   // 띠 = 실제 판정 폭
    } else if (l.cw > 0) {
      g.globalAlpha = l.light ? 0.35 : l.ghost ? 0.25 : 0.85; g.fillStyle = c; g.fillRect(0, -l.cw / 2, l.len, l.cw);
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
  const groups = new Set();
  for (const a of G.areas) {
    if (a.t > a.warn && a.dur === 0) continue;   // 예고 전용
    if (a.fog && a.group) { if (!groups.has(a.group)) { groups.add(a.group); drawFogGroup(G, g, G.areas.filter(b => b.group === a.group)); } continue; }
    if (a.fog) { drawFog(G, g, a); continue; }
    if (a.t <= a.warn) {
      // 예고: 테두리 깜빡임, 발동이 가까울수록 빠르게. 번호는 순서
      const fast = a.t > a.warn - 20;
      g.globalAlpha = Math.sin(a.t * (fast ? 1.2 : 0.4)) > 0 ? 0.9 : 0.4;
      g.strokeStyle = a.color; g.lineWidth = 2; g.strokeRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2);
      g.globalAlpha = a.pulse ? 0.08 + 0.3 * Math.sin(Math.PI * a.t / a.warn) : 0.12; g.fillStyle = a.color; g.fillRect(a.x, a.y, a.w, a.h);
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
// 띠 여러 개로 이어 붙인 안개를 한 덩어리로: 안쪽 가장자리를 띠 가운데 점들을 잇는 부드러운 곡선으로 그리고, 그 안을 채움
function drawFogGroup(G, g, list) {
  list = list.slice().sort((p, q) => p.y - q.y);
  const a0 = list[0], left = a0.edge === 'right';   // edge right = 왼쪽 안개(안쪽 가장자리가 오른쪽)
  const live = a0.t > a0.warn, fade = !live ? Math.min(1, a0.t / 20) * 0.35 : a0.t <= a0.warn + a0.dur ? 1 : Math.max(0, 1 - (a0.t - a0.warn - a0.dur) / 15);
  const top = a0.y, bot = list[list.length - 1].y + list[list.length - 1].h, outer = left ? 0 : W;
  const pts = list.map(a => ({ x: left ? a.x + a.w : a.x, y: a.y + a.h / 2 }));
  const edgePath = () => {
    g.moveTo(pts[0].x, top);
    for (let i = 0; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    g.lineTo(pts[pts.length - 1].x, bot);
  };
  g.save();
  g.beginPath(); g.moveTo(outer, top); edgePath(); g.lineTo(outer, bot); g.closePath();
  g.globalAlpha = 0.85 * fade; g.fillStyle = '#06050b'; g.fill();
  g.clip();
  // 일렁이는 안개 덩어리(덩어리 전체에 고르게)
  const x0 = Math.min(outer, ...pts.map(p => p.x)), x1 = Math.max(outer, ...pts.map(p => p.x)), w = Math.max(1, x1 - x0), h = Math.max(1, bot - top);
  for (let i = 0; i < 14; i++) {
    const px = x0 + ((i * 53 + G.bgT * (0.4 + (i % 7) * 0.07)) % (w + 60)) - 30;
    const py = top + ((i * 97 + Math.sin(G.bgT * 0.02 + i) * 30) % h + h) % h;
    const r = 40 + (i % 3) * 16, gr = g.createRadialGradient(px, py, 0, px, py, r);
    gr.addColorStop(0, 'rgba(60,56,80,0.55)'); gr.addColorStop(1, 'rgba(60,56,80,0)');
    g.globalAlpha = fade; g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
  }
  g.restore();
  // 안쪽 가장자리 빛: 예고 동안은 깜빡이고, 발동 뒤에는 은은하게
  g.save();
  g.globalAlpha = live ? 0.55 * fade : (Math.sin(a0.t * (a0.t > a0.warn - 20 ? 1.2 : 0.4)) > 0 ? 0.9 : 0.35);
  g.strokeStyle = '#e8e8f4'; g.lineWidth = live ? 2 : 1.5;
  g.beginPath(); edgePath(); g.stroke();
  g.restore();
}

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
  if (l.ghost) g.globalAlpha = 0.3;   // 판정 없는 사슬은 흐리게
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

// 탄이 많을 때(헬 1,000~2,000발) 그리기가 병목이라: 돌지 않는 탄은 변환 없이 제자리에 바로 그리고(대부분),
// 도는 탄만 변환을 바꿈. 투명도도 바뀔 때만 설정
function drawBullets(G, g) {
  const base = g.getTransform();
  let alpha = 1, rotated = false;
  g.globalAlpha = 1;
  for (const b of G.bullets) {
    const def = SHAPES[b.shape] || SHAPES.small, img = sprite(b.shape, b.color), s = def.size;
    const al = b.off ? 0.1 : b.alpha;   // 꺼진 탄은 자리만 아주 흐리게
    if (al !== alpha) { g.globalAlpha = alpha = al; }
    const k = b.t < 6 ? 1 + (6 - b.t) * 0.15 : 1; // 발사 순간 살짝 크게
    if (!def.oriented && !def.spin && k === 1) {
      if (rotated) { g.setTransform(base); rotated = false; }
      g.drawImage(img, b.x - s / 2, b.y - s / 2, s, s);
      continue;
    }
    const a = def.oriented ? (b.cart ? Math.atan2(b.vy, b.vx) : b.ang) : def.spin ? b.t * 0.12 : 0;
    const c = Math.cos(a) * k, sn = Math.sin(a) * k;
    g.setTransform(base.a * c, base.a * sn, -base.a * sn, base.a * c, base.e + b.x * base.a, base.f + b.y * base.a);
    rotated = true;
    g.drawImage(img, -s / 2, -s / 2, s, s);
  }
  g.setTransform(base); g.globalAlpha = 1;
}

// 붉은 안개: 옅은 붉은 막 위로 일렁이는 덩어리. 탄이 보이도록 짙지 않게
function drawMists(G, g) {
  if (!G.mists || !G.mists.length) return;
  g.save();
  for (const m of G.mists) {
    const a = Math.min(1, m.t / m.fade) * Math.min(1, (m.life - m.t) / 40);
    if (a <= 0) continue;
    if (m.r) {
      const pr = m.r * (1 + 0.08 * Math.sin(G.bgT * 0.1 + m.x)), gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, pr);
      gr.addColorStop(0, 'rgba(255,40,70,0.55)'); gr.addColorStop(0.6, 'rgba(200,20,50,0.28)'); gr.addColorStop(1, 'rgba(160,0,30,0)');
      g.globalAlpha = a; g.fillStyle = gr; g.fillRect(m.x - pr, m.y - pr, pr * 2, pr * 2);
      continue;
    }
    g.save(); g.beginPath(); g.rect(m.x, m.y, m.w, m.h); g.clip();
    g.globalAlpha = 0.22 * a; g.fillStyle = '#b3122e'; g.fillRect(m.x, m.y, m.w, m.h);
    for (let i = 0; i < 9; i++) {
      const px = m.x + ((i * 61 + G.bgT * (0.5 + (i % 5) * 0.1)) % (m.w + 80)) - 40;
      const py = m.y + ((i * 89 + Math.sin(G.bgT * 0.025 + i) * 40) % Math.max(1, m.h) + m.h) % Math.max(1, m.h);
      const r = 44 + (i % 3) * 18, gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(255,50,80,0.42)'); gr.addColorStop(1, 'rgba(255,50,80,0)');
      g.globalAlpha = a; g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
    }
    g.restore();
  }
  g.restore();
}

// 차원절단 균열: 예고(흐르는 점선) → 흰 빛이 한쪽 끝에서 찢고 지나감 → 들쭉날쭉한 틈 속에 검보랏빛 공간, 가장자리는 붉게 빛남
// → 닫힐 때 틈이 좁아지며 흰 금이 번쩍이다 흉터처럼 사라짐
function drawRifts(G, g) {
  if (!G.rifts || !G.rifts.length) return;
  g.save();
  for (const r of G.rifts) {
    const L = r.len, open = r.warn + r.tear;
    const P = (s, off) => [r.x + r.dx * s + r.nx * off, r.y + r.dy * s + r.ny * off];
    if (r.t <= r.warn) {
      const urgent = r.warn - r.t < 18, blink = urgent ? (Math.sin(r.t * 1.4) > 0 ? 1 : 0.45) : 0.55 + 0.25 * Math.sin(r.t * 0.3);
      g.globalAlpha = blink; g.strokeStyle = '#ff4d9a'; g.lineWidth = urgent ? 2.5 : 1.5;
      g.setLineDash([10, 8]); g.lineDashOffset = -r.t * 1.5;
      g.beginPath(); g.moveTo(...P(-L / 2, 0)); g.lineTo(...P(L / 2, 0)); g.stroke();
      g.setLineDash([]); g.lineDashOffset = 0;
      if (r.lethal) { g.globalAlpha = 0.1 * blink; g.lineWidth = (r.w + 3) * 2; g.stroke(); }
      continue;
    }
    // 찢어진 길이(한쪽 끝에서부터)와 지금 반폭
    const k = Math.min(1, (r.t - r.warn) / r.tear), tip = -L / 2 + L * k;
    const cw = r.live || r.shown || r.closing ? r.cw : r.w * Math.min(1, k * 1.5);
    if (cw > 0.3) {
      const pts = i => -L / 2 + L * i / r.N;
      const last = Math.max(1, Math.ceil(r.N * k));
      const gap = new Path2D();
      for (let i = 0; i <= last; i++) { const s = Math.min(tip, pts(i)); gap.lineTo(...P(s, cw + r.jagA[i] * (cw / r.w))); }
      for (let i = last; i >= 0; i--) { const s = Math.min(tip, pts(i)); gap.lineTo(...P(s, -cw - r.jagB[i] * (cw / r.w))); }
      gap.closePath();
      g.globalAlpha = 1; g.fillStyle = '#07010d'; g.fill(gap);
      // 틈 속: 흐르는 보랏빛 줄
      g.save(); g.clip(gap);
      g.globalAlpha = 0.7; g.strokeStyle = '#7a2cff'; g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const s = ((i * 173 + G.bgT * (2 + i % 3)) % L) - L / 2, off = (i % 3 - 1) * cw * 0.5;
        g.beginPath(); g.moveTo(...P(s, off)); g.lineTo(...P(s + 26, off)); g.stroke();
      }
      g.restore();
      // 가장자리 빛
      const ea = r.closing ? 0.6 + 0.4 * Math.random() : 0.85 + 0.15 * Math.sin(G.bgT * 0.3);
      g.globalAlpha = 0.25 * ea; g.strokeStyle = '#ff2d6f'; g.lineWidth = 9; g.stroke(gap);
      g.shadowColor = '#ff2d6f'; g.shadowBlur = 18;
      g.globalAlpha = ea; g.strokeStyle = '#ff7aa8'; g.lineWidth = 2.5; g.stroke(gap);
      g.shadowBlur = 0; g.globalAlpha = 0.8 * ea; g.strokeStyle = '#fff0f6'; g.lineWidth = 1; g.stroke(gap);
    }
    // 찢는 중: 끝을 따라가는 흰 빛
    if (r.t <= open && !r.quiet) {
      const [tx, ty] = P(tip, 0);
      g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.shadowColor = '#fff'; g.shadowBlur = 16;
      g.beginPath(); g.moveTo(...P(-L / 2, 0)); g.lineTo(tx, ty); g.stroke(); g.shadowBlur = 0;
      const gr = g.createRadialGradient(tx, ty, 0, tx, ty, 34);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.4, 'rgba(255,90,160,0.5)'); gr.addColorStop(1, 'rgba(255,90,160,0)');
      g.fillStyle = gr; g.fillRect(tx - 34, ty - 34, 68, 68);
    }
    // 다 찢어진 순간: 화면이 번쩍
    if (!r.quiet && r.t > open - 2 && r.t < open + 12) {
      g.globalAlpha = 0.35 * (1 - (r.t - open + 2) / 14); g.fillStyle = '#ffe0ee'; g.fillRect(0, 0, W, H);
    }
    // 닫히는 중: 들쭉날쭉한 흰 금이 번쩍이며 이어 붙고(쩌저적), 다 붙으면 흉터가 옅어짐
    if (r.closing) {
      const q = r.ct / 40;
      g.globalAlpha = r.ct < 22 ? 0.9 : Math.max(0, 1 - (r.ct - 22) / 18) * 0.7;
      g.strokeStyle = '#fff'; g.lineWidth = r.ct < 22 ? 1.5 : 1; g.shadowColor = '#ff8fc0'; g.shadowBlur = 8;
      g.beginPath();
      for (let i = 0; i <= r.N; i++) { const s = -L / 2 + L * i / r.N, z = r.ct < 22 ? (Math.random() * 2 - 1) * 3 * (1 - q) : 0; g.lineTo(...P(s, z)); }
      g.stroke(); g.shadowBlur = 0;
    }
  }
  g.restore();
  g.globalAlpha = 1;
}

function drawFx(G, g) {
  for (const f of G.fx) {
    const k = f.t / f.life;
    if (f.kind === 'shard') {
      // 균열 불꽃: 흩어지며 사라지는 작은 파편
      g.globalAlpha = 1 - k; g.fillStyle = f.color;
      g.fillRect(f.x + f.vx * f.t - 1.5, f.y + f.vy * f.t - 1.5, 3, 3);
    } else if (f.kind === 'spark') {
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
    } else if (f.kind === 'arrow') {
      // 방향 전조: 안전지대 가운데에서 그 방향으로 흘러가는 겹화살표 셋(깜빡이며 점점 또렷)
      g.save(); g.translate(f.z.x, f.z.y); g.rotate(f.ang);
      const al = Math.min(1, f.t / 8, (f.life - f.t) / 8);
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = '#ffe6a0'; g.shadowBlur = 8;
      for (let i = 0; i < 3; i++) {
        const d = ((f.t * 1.2 + i * 12) % 36) - 6;
        g.globalAlpha = al * (0.4 + 0.6 * (1 - Math.abs(d - 12) / 24));
        g.beginPath(); g.moveTo(d - 6, -8); g.lineTo(d + 2, 0); g.lineTo(d - 6, 8); g.stroke();
      }
      g.restore();
    } else if (f.kind === 'phase') {
      // 페이즈 전환: 화면 번쩍임 → 보스에서 퍼지는 금빛 고리 두 겹 → 가운데 큰 PHASE n(위에 보스 이름)
      g.save();
      if (f.t < 24) { g.globalAlpha = 0.55 * (1 - f.t / 24); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
      for (const [d, col] of [[0, '#f5c542'], [10, '#ffffff']]) {
        const tt = f.t - d; if (tt < 0 || tt > 60) continue;
        g.globalAlpha = 1 - tt / 60; g.strokeStyle = col; g.lineWidth = 4 * (1 - tt / 60) + 1;
        g.beginPath(); g.arc(f.x, f.y, 10 + tt * 9, 0, TAU); g.stroke();
      }
      const inK = Math.min(1, Math.max(0, f.t - 10) / 16), outK = Math.min(1, (f.life - f.t) / 30);
      g.globalAlpha = Math.min(inK, outK); g.translate(W / 2, H * 0.4);
      const sc = 1 + (1 - inK) * 0.5; g.scale(sc, sc);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-W / 2, -34, W, 62);
      g.fillStyle = '#c8c8d8'; g.font = `13px ${CHANT_FONT}`; g.fillText(f.sub, 0, -18);
      g.shadowColor = '#f5c542'; g.shadowBlur = 20; g.fillStyle = '#fff'; g.font = `bold 32px ${CHANT_FONT}`;
      if ('letterSpacing' in g) g.letterSpacing = `${6 + (1 - outK) * 10}px`;
      g.fillText(f.text, 0, 8);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
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
  if (G.perfHud) {
    g.save(); g.font = '10px Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    const txt = `FPS ${G.fps.toFixed(0)} · 처리 ${(G.msUpdate ?? 0).toFixed(1)} · 그리기 ${(G.msRender ?? 0).toFixed(1)}ms · 탄 ${G.bullets.length} (최대 ${G.bulletPeak ?? 0})`;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(2, H - 14, g.measureText(txt).width + 6, 13);
    g.fillStyle = '#9fffb0'; g.fillText(txt, 5, H - 13); g.restore();
  }
  const b = G.boss, sp = G.spell;
  if (G.tip) {
    const tp = G.tip, a = Math.min(1, tp.t / 15, (tp.life - tp.t) / 60);
    g.save(); g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = tp.text.split('\n'), tw = Math.max(...lines.map(l => g.measureText(l).width)) + 20, top = H - 64 - lines.length * 16;
    g.globalAlpha = 0.75 * a; g.fillStyle = '#000'; g.fillRect(W / 2 - tw / 2, top, tw, lines.length * 16 + 8);
    g.globalAlpha = a; g.fillStyle = '#ffe6a0'; lines.forEach((l, i) => g.fillText(l, W / 2, top + 12 + i * 16));
    g.restore();
    if (!G.paused && ++tp.t >= tp.life) G.tip = null;
  }
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
  if (!b.hidden && !sp.survival && !G.desperate) {
    let fill = b.hp / b.maxHp, marks = [];
    if (bars && run.idx >= 0 && run.idx < run.seq.length) {   // 스테이지를 깬 뒤(idx가 끝을 넘음)에는 이 패턴 몫만
      // 보스 하나가 체력바 하나: 지금 보스가 이어서 나오는 패턴 전부. 표시선은 페이즈(pages) 경계에만
      let i0 = run.idx, i1 = run.idx;
      while (i0 > 0 && run.seq[i0 - 1].boss === sp.boss) i0--;
      while (i1 < run.seq.length - 1 && run.seq[i1 + 1].boss === sp.boss) i1++;
      const idxs = []; for (let i = i0; i <= i1; i++) idxs.push(i);
      const hp = idxs.map(i => (run.seq[i].survival ? 0 : i === run.idx ? b.maxHp : G.hpFor(run.seq[i])));
      const total = hp.reduce((a2, c) => a2 + c, 0) || 1, k = idxs.indexOf(run.idx);
      const later = hp.slice(k + 1).reduce((a2, c) => a2 + c, 0);
      fill = (later + b.hp) / total;
      // 경계선: 페이즈가 바뀌는 자리에만(그 뒤에 남는 몫의 위치)
      for (let j = 0; j < idxs.length - 1; j++) if (bars[idxs[j]] !== bars[idxs[j + 1]]) marks.push(hp.slice(j + 1).reduce((a2, c) => a2 + c, 0) / total);
    }
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(8, 6, bw, 4);
    g.fillStyle = sp.type === 'spell' ? '#ffd0dc' : '#fff'; g.fillRect(8, 6, bw * fill, 4);
    g.fillStyle = '#f5c542'; for (const m of marks) { g.fillRect(8 + bw * m - 1, 2, 3, 12); }
  }
  if (!(run && bars) && !b.hidden) {
    g.fillStyle = '#f5c542'; g.font = 'bold 10px system-ui, "Malgun Gothic", sans-serif'; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText(`격화 ${['I', 'II', 'III'][G.surgeLevel()]}`, 8, 12);
  }
  if (run && bars && run.idx >= 0 && run.idx < run.seq.length) {
    // 이 보스의 몇 번째 페이지인지(페이지의 보스 = 그 페이지 마지막 패턴의 보스)
    const pageBoss = pg => { let last = -1; bars.forEach((v, i) => { if (v === pg) last = i; }); return run.seq[last].boss; };
    const cur = bars[run.idx], boss = pageBoss(cur), all = [...new Set(bars)].filter(pg => pageBoss(pg) === boss);
    g.fillStyle = '#f5c542'; g.font = 'bold 10px system-ui, "Malgun Gothic", sans-serif'; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText(`PHASE ${all.indexOf(cur) + 1}/${all.length} · ${'격화 ' + ['I', 'II', 'III'][G.surgeLevel()]}`, 8, 16);
  }
  // 시간
  const sec = Math.max(0, G.timer) / 60;
  g.textAlign = 'right'; g.fillStyle = sec < 10 ? '#ff6b7a' : '#fff'; g.font = 'bold 14px Consolas, monospace';
  if (G.timerPulse > 0) {
    // 발악 시작: 제한시간이 크게 튀어나왔다가 제자리로(약 1.2초)
    const k = G.timerPulse / 72, sc = 1 + 1.6 * Math.sin(Math.PI * Math.min(1, (1 - k) * 1.6)) * k;
    g.save(); g.translate(W - 6, 2); g.scale(sc, sc);
    g.shadowColor = '#ff5e7a'; g.shadowBlur = 14 * k; g.fillStyle = '#ff6b7a';
    g.fillText(sec.toFixed(2), 0, 0); g.restore();
    if (!G.paused) G.timerPulse--;
  } else g.fillText(sec.toFixed(2), W - 6, 2);
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
  if (G.phase === 'title') {
    g.fillStyle = 'rgba(6,6,12,0.9)'; g.fillRect(0, 0, W, H);
  }
  if (G.phase === 'stageclear' || G.phase === 'storyclear') {
    // 클리어 화면(글자·버튼은 게임 화면 위 겹침 화면이 그림)
    g.fillStyle = G.phase === 'storyclear' ? 'rgba(6,6,12,0.88)' : 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, H);
  }
  if (G.phase === 'gameover' && G.story) {
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(0, 0, W, H);
  } else if (G.phase === 'storyfail') {
    g.fillStyle = 'rgba(6,6,12,0.88)'; g.fillRect(0, 0, W, H);
  } else if (G.phase === 'gameover') {
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
  const head = G.phase === 'title' ? '스테이지 모드' : G.story && G.story.idx < G.story.list.length
    ? `본게임 ${G.story.idx + 1}/${G.story.list.length} · ${G.run.name}`
    : G.run ? `보스전 · ${G.run.name} ${G.run.idx + 1}/${G.run.seq.length}` : `단일 패턴 ${roomNo(G)}/${G.roomOrder?.length || G.spells.length}`;
  g.fillText(head, x, 18);
  g.fillStyle = '#fff'; g.font = font(12, true);
  const nameEnd = wrap(g, G.phase === 'title' ? '시작 화면' : G.spell.name, x, 34, w, 16, 3);
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
  g.fillText(L >= MAX_POWER ? 'MAX' : p.power.toFixed(2), x + 140, y + 46);   // 칸 = 단계, 숫자 = 실제 파워
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
    const left = bars ? bars[bars.length - 1] - (G.run.idx < 0 ? 0 : bars[Math.min(G.run.idx, bars.length - 1)]) + 1 : 0;
    g.font = font(12); g.fillStyle = '#8e8ea6'; g.fillText('스펠카드', x, y); g.fillText('남은 페이즈', x, y + 20); g.fillText('컨티뉴', x, y + 40);
    g.fillStyle = '#fff'; g.font = font(13, true); g.textAlign = 'right';
    g.fillText(`${sc.got} / ${sc.tried}`, x + w, y); g.fillText(String(left), x + w, y + 20);
    g.fillText(G.story.iron ? '철인 모드' : `${G.story.contLeft} / ${MAX_CONTINUES}`, x + w, y + 40); g.textAlign = 'left';
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
    ['처리 · 그리기', `${(G.msUpdate ?? 0).toFixed(1)} · ${(G.msRender ?? 0).toFixed(1)}ms`],
  ];
  g.font = font(11);
  rows.forEach(([k, v], i) => {
    g.fillStyle = '#8e8ea6'; g.fillText(k, x, y + i * 17);
    g.fillStyle = '#c8c8d8'; g.textAlign = 'right'; g.fillText(String(v), x + w, y + i * 17); g.textAlign = 'left';
  });
  }

  // 켜져 있는 연습 옵션 표시
  const tags = [G.autoFire && '자동 사격', G.invincible && '무적', G.powerLock && '파워 고정', SFX.muted && '소리 끔', G.paused && '일시정지'].filter(Boolean);
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
