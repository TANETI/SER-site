'use strict';
// 패턴 목록. 새 패턴은 아래 형식으로 SPELLS에 추가한다.
//
// {
//   name: '표시 이름',
//   type: 'spell' | 'nonspell' | 'stage',   // spell=선언 배너·획득 판정, stage=보스 없이 잡몹만
//   boss: '보스 이름', bossColor: '#색',       // 선택
//   hp: 3000, time: 40,                      // 보스 체력, 제한시간(초)
//   survival: false,                         // true면 보스 무적, 시간까지 버티면 획득
//   start: [192, 110],                       // 보스 시작 위치
//   follow: true,                            // 선택. 앞 패턴에 이어지는 뒤 단계(같은 체력바, 다시 선언하지 않음)
//   strong: true,                            // 선택. 강스펠(화려한 컷인, 필살기 이미지). 없으면 약스펠(작은 컷인)
//   cutinShot: '120',                         // 선택. 강스펠 컷인 이미지 번호(기본 103, 없으면 102)
//   bgmRate: 1.2,                            // 선택. 배경음악 재생 속도(폭주 마르코처럼 같은 곡을 빠르게)
//   bgmFollow: 0.25,                         // 선택. 곡 속도가 적 탄 속도를 따라감. 값은 평소 탄 속도 배율. 빨라지면 1.5배속, 느려지면 0.75배속으로 서서히 옮겨 감
//   *run(s) { ... }                          // 제너레이터. yield n = n프레임 대기
// }
//
// 난이도 (0=이지 1=노말 2=하드 3=베리하드 4=헬. 패턴에 적은 기준값이 하드)
//   s.lv(이지, 노말, 하드, ...)   난이도별 값 고르기. 값이 모자라면 마지막 값을 씀
//   s.cnt(n)   탄 개수 배율(이지 55%, 노말 80%, 베리하드 120%, 헬 140%). 격화로 패턴 진행에 따라 ×0.75→1.35(s.wait ×1.25→0.75, s.sp ×0.92→1.12)
//   s.spread는 세 발 이상이면 하드·베리하드 +2줄, 헬 +4줄, 격화 III +2줄(좌우 대칭). 줄 수를 그대로 둘 땐 fixed: true
//   s.heat      격화 진행도 0→1(깎인 보스 체력 비율, 내구 스펠은 지난 시간 비율). 논스펠·스펠 모두
//   s.wait(f)  발사 간격 배율(이지 1.6배 … 헬 0.78배)
//   s.sp(v)    탄속 배율(이지 82% … 헬 112%)
//   s.spin(v)  회전량에 격화를 곱함(×0.8→1.5). 회전벽·도는 레이저는 발사 간격을 고정하고 이것으로 도는 속도만 올림(촘촘해지지 않게)
//   체력·제한시간은 엔진이 배율을 곱해 적용(보스전은 hpScale, 단일 연습은 2.2배. 내구 스펠·잡몹 구간 제외)
//
// s 주요 함수
//   s.fire({ang, spd, shape, color, accel, angVel, maxSpd, minSpd, x, y, fn, alpha})
//   s.fire({vx, vy, ax, ay, ...})             // 직교 좌표 운동(중력 등)
//   s.fire({..., keep: true})                 // 한 번 깔고 계속 쓰는 구조물 탄: 폭탄·피탄에 지워지지 않고 잠깐 꺼졌다가 돌아옴
//   s.ring(n, {offset, spd, shape, color})    // 원형 n발
//   s.spread(n, 중심각, 간격, {...})           // 부채꼴 n발
//   s.laser({x, y, ang, len, w, warn, dur, color})
//   s.chain({x, y, ang, len, w, warn, shoot, hold, retract})   // 빨간 예고선 → 황금 사슬이 뻗었다 걷힘
//   s.aim(x?, y?)      자기 위치(기본 보스)에서 플레이어 방향 각도
//   yield* s.moveTo(x, y, 프레임)    보스 이동을 기다림.  s.move(...)는 기다리지 않음
//   yield* s.wander(범위, 프레임)    보스를 근처로 조금만 이동. 4초에 한 번 정도만 쓴다
//   s.task(function* () {...}())     병렬 작업. 돌려받은 값.return()으로 멈춤
//   s.enemy({x, y, vx, vy, hp, run: function* (e, s) {...}})
//   s.partner({name, x, y, to:[x,y], color})  함께 나오는 동료(체력 없음). s.move(x, y, 프레임, 동료)로 이동
//   yield* s.chant('PATER1', {by, step})     화면 상단 구석에 영창을 한 줄씩 띄움. 호명 줄이 뜰 때까지 기다림(전조)
//   s.shield(대상, 프레임, hp)                보호막. 통상탄은 막고 봄은 통과. hp를 주면 막은 탄 대미지만큼 깎여 부서짐
//   s.zone({x, y, r, dur, hp})                고정 구역 보호막. 들어온 자기 탄을 지움. hp를 주면 때려서 부술 수 있음
//   s.sound('beep', 0~1)                       효과음 직접 재생(beep=조준 경고음, 인자는 높낮이)
//   s.safeZone({x, y, r, dur, label})          초록 안전지대 표시(판정 없음). 돌려받은 객체의 x·y를 바꾸면 따라 움직임
//   fillField(s, {holes, motion, pad, spacing, color})   안전지대만 빼고 화면을 탄으로 채움. motion.vx·vy로 통째로 이동
//   s.pop(탄 목록)                            한꺼번에 터뜨려 지움(빰!)
//   s.title(글자, color)                       화면 가운데에 큰 제목이 떠올랐다 사라짐
//   s.warnLine({x, y, x2, y2, dur, band})     판정 없는 빨간 예고선. band=덮을 폭을 옅은 띠로(돌진이면 몸통 폭 32)
//   s.extendTime(초)                          제한시간 연장
//   s.area({x, y, w, h, warn, dur, label, color})   사각 구역 공격. 번호(label)를 붙여 순서를 보여 줌
//   s.bulletTime(배율, 프레임)                 적 탄 속도 배율(1보다 작으면 불렛타임, 크면 오버클럭). 플레이어는 그대로
//   s.area({... dur: 0})                      판정 없이 예고만 띄움
//   ivyVine(s, {...}) · ivyLeaf(...)           담쟁이 덩굴·잎 (리크니스)
//   s.rand(a, b) · s.randInt(a, b) · s.pick(arr) · s.frame · s.hpRate · s.TAU · s.W · s.H
//   영창 키: FILIUS1 FILIUS2 PATER1 PATER2 SPIRITUS1 NUNC_DIMITTIS CONFITEOR. 배열을 직접 넘겨 일부 줄만 읊을 수도 있음
//   s.say(대상, '짧은 표시', 프레임)            머리 위 말풍선
//   s.shake(세기) · s.impact(세기)             화면 흔들림 · 흔들림+충격음(돌진 착지 등)
//   s.mark({x, y, dur})                       판정 없는 조준 표시(빨간 십자선)
//   s.ghost(x, y, color)                      잔상 한 점
//   s.player.vx · s.player.vy                 플레이어의 이번 프레임 이동량(예측 조준용)
//   동료에 ghost = true를 주면 반투명 사본으로 그려짐
//   extra: true                               엑스트라 스테이지 패턴 표시(난이도 계산은 본편과 같음)
//   탄의 alpha는 판정이 그대로이므로 0.35 아래로 내리지 않는다
//
// shape: small orb big rice knife star link leaf
// color: red orange yellow green ivy cyan blue purple pink white gold brown black

// ── 세라피안 공통 ──
// 김예나: 생방송 시청자 수. 보스전 동안 패턴이 바뀌어도 이어서 늘고(단일 패턴 연습은 패턴마다 새로), 2초마다 0.5만.
// 10만을 넘으면 「인기 급상승!」 탄 수 ×1.2·발사 간격 ×0.85·노래 1.08배속, 20만을 넘으면 「시청자 폭주!」 ×1.35·×0.75·1.15배속.
// 20만 단계가 한계라 그 뒤로는 더 빨라지지 않음
const YENA_LV = [{ cnt: 1, wait: 1, rate: 1 }, { cnt: 1.2, wait: 0.85, rate: 1.08 }, { cnt: 1.35, wait: 0.75, rate: 1.15 }];
const yenaRate = g => YENA_LV[g.run?.yena?.level ?? 0].rate;
function yenaLive(s) {
  const st = s.run ? (s.run.yena = s.run.yena || { viewers: 1.2, level: 0 }) : { viewers: 1.2, level: 0 };
  const apply = () => { const L = YENA_LV[st.level]; s.setBoost({ cnt: L.cnt, wait: L.wait }); s.bgmRate(L.rate); };
  apply();
  s.task(function* () {
    for (;;) {
      s.say(s.boss, `시청자 ${st.viewers.toFixed(1)}만`, 60);
      yield 120;
      st.viewers += 0.5;
      const lv = st.viewers >= 20 ? 2 : st.viewers >= 10 ? 1 : 0;
      if (lv > st.level) { st.level = lv; apply(); s.say(s.boss, lv === 2 ? '시청자 폭주!' : '인기 급상승!', 80); s.sound('overclock'); yield 80; }
    }
  }());
}
// s.lv로 직접 정한 발 수·간격에 시청자 수 배율을 걸 때
const yc = (s, n) => Math.max(1, Math.round(n * s.boost.cnt)), yw = (s, f) => Math.max(1, Math.round(f * s.boost.wait));


// 아즈라엘 공통: 비 내리듯 천천히 내려오는 귀찮은 탄막. 위에서 빗방울이 좌우로 살짝 흔들리며 느리게 떨어짐.
// 바로 앞 방울 자리와 40px 안에는 떨어뜨리지 않아 같은 자리에 겹쳐 나오지 않음
function* azRain(s, o = {}) {
  let last = -999;
  for (let k = 0; ; k++) {
    let x, tries = 0;
    do { x = s.rand(o.x0 ?? 8, o.x1 ?? s.W - 8); } while (Math.abs(x - last) < 40 && ++tries < 10);
    last = x;
    const ph = s.rand(0, s.TAU), sway = o.sway ?? 0.35;
    const spd = typeof o.spd === 'function' ? o.spd() : (o.spd ?? 1.1);   // 함수면 그때그때 속도(점점 빨라지는 비)
    s.fire({ x, y: -8, vx: 0, vy: s.sp(spd), shape: o.shape ?? (k % 3 ? 'rice' : 'orb'), color: o.color ?? (k % 3 ? 'white' : 'void'),
      fn: b => { b.vx = Math.sin(b.t * 0.04 + ph) * sway; } });
    yield s.wait(o.every ?? 10);
  }
}

// 이즘 공통: 예측 저격 한 발. 가는 방향을 읽어 도착할 자리에 십자선과 조준선을 띄우고, 점점 빨라지는 경고음(삐비비빅) 뒤
// 그 줄을 따라 칼날을 한 줄로 주르륵 쏨. 멈추거나 방향을 틀면 빗나감.
// 하드 이상: 가는 쪽과 지금 자리가 30px 넘게 떨어지면 지금 자리에도 한 줄(그대로 가도 멈춰도 맞으므로 방향을 틀어야 함).
// 가만히 서 있으면 옆으로 한 칸 크게 비껴 한 줄 더 → 서 있던 자리 좌우 한쪽이 막힘
function* predictShot(s) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const p = s.player, delay = s.lv(48, 42, 36, 32, 28), travel = s.lv(20, 18, 16, 14, 13), lead = delay + travel;
  const tx = clamp(p.x + (p.vx || 0) * lead, 10, s.W - 10), ty = clamp(p.y + (p.vy || 0) * lead, 10, s.H - 10);
  const a = Math.atan2(ty - s.boss.y, tx - s.boss.x), dist = Math.hypot(tx - s.boss.x, ty - s.boss.y);
  s.mark({ x: tx, y: ty, dur: lead });
  s.warnLine({ x: s.boss.x, y: s.boss.y, x2: s.boss.x + Math.cos(a) * 700, y2: s.boss.y + Math.sin(a) * 700, dur: delay, band: 10 });
  const moving = Math.hypot(tx - p.x, ty - p.y) > 30;
  const a2 = moving ? Math.atan2(p.y - s.boss.y, p.x - s.boss.x) : a + (Math.random() < 0.5 ? -1 : 1) * 0.16;
  const two = s.diff >= 2;
  if (two) s.warnLine({ x: s.boss.x, y: s.boss.y, x2: s.boss.x + Math.cos(a2) * 700, y2: s.boss.y + Math.sin(a2) * 700, dur: delay, band: 10 });
  for (let t = 0, gap = 12; t < delay;) {
    s.sound('beep', t / delay);
    const g = Math.max(2, Math.min(delay - t, Math.round(gap)));
    yield g; t += g; gap *= 0.78;
  }
  const spd = Math.max(5, dist / travel), n = s.lv(6, 8, 10, 12, 14);
  for (let i = 0; i < n; i++) { s.fire({ ang: a, spd, shape: 'knife', color: 'red' }); if (two) s.fire({ ang: a2, spd, shape: 'knife', color: 'red' }); yield 2; }
}

// ── 성당교회 공통 ──
// 2스테이지 가운데 구간: 마르코가 합류해 마리와 함께 싸움. 마르코가 보스, 마리는 동료. 영창 색은 마르코=금빛, 마리=하늘빛
function churchDuo(s, at = [80, 70]) {
  s.boss.chantColor = '#ffe6a0';
  const mari = s.partner({ name: '마리', x: -30, y: 40, to: at, color: '#cfe8ff', hittable: true });   // 마리도 맞음(보스 체력바를 함께 깎음)
  mari.chantColor = '#cfe8ff';
  return mari;
}
// 마리의 느린 원형탄
function* mariRings(s, mari, every = 60) {
  for (let k = 0; ; k++) {
    s.ring(s.cnt(14), { x: mari.x, y: mari.y, offset: k * 0.23, spd: s.sp(1.5), shape: 'orb', color: 'cyan' });
    yield s.wait(every);
  }
}
// 2스테이지 마지막 구간: 마리가 쓰러지면 마르코가 폭주함. 한쪽에 기절한 마리가 남고, 마르코는 붉은 기운을 두름
function marcoRage(s) {
  s.boss.chantColor = '#ffe6a0';
  s.boss.rage = true;
  s.partner({ name: '마리 (기절)', x: 44, y: 44, color: '#5a6070' });
}
// 술식을 너무 자주 쓰지 않게: 한 패턴 안에서 두 번째 영창부터는 앞에 쉬는 구간(가벼운 견제탄)을 둠.
// 쉬는 길이는 이지 5초 … 헬 3초
function* castGap(s) {
  s.boss.casts = (s.boss.casts || 0) + 1;
  if (s.boss.casts === 1) return;
  const frames = s.lv(300, 260, 220, 200, 180);
  for (let t = 0; t < frames; t += s.wait(40)) {
    s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.3, { spd: s.sp(2.2), shape: 'small', color: 'white' });
    yield s.wait(40);
  }
}
// 베리하드 이상에서만 기다리는 동안 20프레임마다 조준탄 한 발. 그 아래 난이도는 그냥 기다림.
// 기믹 중심 스펠의 곁다리는 이 난이도에서만 가볍게 붙인다
function* hardAim(s, frames, color = 'white') {
  if (s.diff < 3) { yield frames; return; }
  for (let t = 0; t < frames; t += 20) {
    s.fire({ ang: s.aim(), spd: s.sp(2.4), shape: 'rice', color });
    yield Math.min(20, frames - t);
  }
}
// 기다리는 동안(돌진 예고 등) 느린 조준탄을 몇 번 쏨. 홍마향처럼 고정 탄 사이에 조준 요소를 섞어 가만히 서 있지 못하게
function* aimWhile(s, frames, color = 'white') {
  const every = s.lv(22, 18, 16, 14, 12);
  for (let t = 0; t < frames; t += every) {
    s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.22, { spd: s.sp(2.4), shape: 'rice', color });
    yield Math.min(every, frames - t);
  }
}

// ── 리크니스: 담쟁이 덩굴 ──
// 잎: 한 덩굴에 붙은 잎은 같은 무리(group). 덩굴이 다 자란 뒤 무리 전체가 같은 순간에 같은 속도·같은 흔들림으로
// 떨어져, 붙어 있던 위치와 간격을 그대로 지킴(뭉치지 않음). 무리가 없으면 자기 stay 뒤에 떨어짐
function ivyLeaf(s, x, y, ang, stay, group) {
  const born = s.frame;
  return s.fire({
    x, y, ang, spd: 0, shape: 'leaf', color: 'ivy', margin: 40,
    fn: b => {
      const fallAt = group ? group.fallAt : born + stay;
      if (s.frame < fallAt) return;
      const ft = s.frame - fallAt;
      if (ft === 0) b.ang = Math.PI / 2;
      b.spd = Math.min(s.sp(1.6), ft * 0.02);
      b.x += Math.sin(ft * 0.04 + (group ? group.phase : 0)) * 0.35;   // 떨어지며 좌우로 천천히 흔들림
    },
  });
}
// 덩굴 줄기: 머리(초록 큰 탄)가 굽이치며 자라고 지나간 자리에 잎을 남김
// o: {x, y, ang, spd, len, gapPx, stay, turn, wave, phase, curl, seek, seekFor, seekOffX, seekOffY, margin, step(x, y, t)}
// curl=매 프레임 일정하게 도는 양(spd / 반지름이면 원을 그림), step=머리가 움직일 때마다 불림
// 잎은 gapPx 간격으로 붙고, 덩굴이 다 자란 뒤 한꺼번에 모양을 유지하며 떨어짐. skip=출발점 근처 잎 생략 거리.
// 잎은 gapPx 간격으로 붙음. 잎 판정(3)+기체 판정(2.4)이 양쪽에서 약 11px를 막으므로
// 간격을 17px 이상으로 둬 어느 난이도에서도 잎 사이로 빠져나갈 틈을 남긴다(벽처럼 닫힌 덩굴 금지)
// seek은 처음 seekFor 프레임(기본 70)만 쫓음. 계속 쫓으면 플레이어 둘레를 돌며 가둬 버림
function* ivyVine(s, o) {
  let { x, y, ang } = o;
  const spd = o.spd ?? 2.4, gapPx = o.gapPx ?? s.lv(26, 22, 19, 18, 17), m = o.margin ?? 20, seekFor = o.seekFor ?? 70;
  const head = s.fire({ x, y, spd: 0, shape: 'orb', color: 'void', margin: m + 20 });   // 덩굴 머리: 빛나는 검은 구슬
  // 출발점 근처(skip px)에는 잎을 두지 않음: 한 점에서 여러 덩굴이 나갈 때 잎이 뭉치지 않게
  const group = { fallAt: Infinity, phase: Math.random() * 6 };
  let run = -(o.skip ?? 18), side = 0;
  for (let t = 0; t < o.len && !head.dead; t++) {
    ang += (o.curl ?? 0) + Math.sin(t * (o.wave ?? 0.08) + (o.phase ?? 0)) * (o.turn ?? 0.03);
    if (o.seek && t < seekFor) {
      const want = Math.atan2(s.player.y + (o.seekOffY ?? 0) - y, s.player.x + (o.seekOffX ?? 0) - x);
      const da = ((want - ang + Math.PI * 3) % s.TAU) - Math.PI;
      ang += Math.max(-o.seek, Math.min(o.seek, da));
    }
    x += Math.cos(ang) * spd; y += Math.sin(ang) * spd;
    head.pvx = x - head.x; head.pvy = y - head.y;   // 이번 프레임 이동량(회피 봇 예측용)
    head.x = x; head.y = y;
    if (o.step) o.step(x, y, t);
    if (x < -m || x > s.W + m || y < -m || y > s.H + m) break;
    run += spd;
    // 12px 안에 이미 잎이 있으면 건너뜀(덩굴이 휘거나 겹치는 곳에서 잎이 뭉치지 않게)
    if (run >= gapPx) { run -= gapPx; if (!s.near(x, y, 12, 'leaf')) ivyLeaf(s, x, y, ang + (side++ % 2 ? 0.9 : -0.9), 0, group); }
    yield 1;
  }
  head.dead = true;
  // 다 자란 뒤 stay의 60%가 지나면 잎이 무리째 떨어짐
  group.fallAt = s.frame + Math.round((o.stay ?? 150) * 0.6);
}

// NYMPH 공통 「탐색 사격」: 천사가 보이지 않아 처음에는 기체를 겨누지 못하고 화면 아래쪽을 좌우로 훑는 방향으로만 쏨.
// 이즘의 분석이 끝나면(약 3.5~5.5초) 기체 위에 LOCK 표시와 경고음이 뜨고 그 뒤로는 기체를 조준함.
// sweep(x, y): 잠금 전에는 훑는 방향, 잠금 뒤에는 (x, y)(기본 보스)에서 기체를 향한 방향
function nymphScan(s) {
  const st = { locked: false };
  s.task(function* () {
    yield s.lv(330, 300, 270, 240, 220);
    st.locked = true;
    s.say(s.player, 'LOCK', 60); s.sound('beep', 1); s.mark({ x: s.player.x, y: s.player.y, dur: 30 });
  }());
  st.sweep = (x = s.boss.x, y = s.boss.y) => st.locked ? Math.atan2(s.player.y - y, s.player.x - x) : Math.PI / 2 + Math.sin(s.frame * 0.025) * 0.9;
  return st;
}

const SPELLS = [
  {
    name: '사격 시험 · 허수아비',
    type: 'nonspell', hp: 99999, time: 60, start: [192, 120],
    *run(s) {
      for (;;) {
        yield* s.moveTo(96, 120, 120);
        yield* s.moveTo(288, 120, 120);
      }
    },
  },
  {
    name: '논스펠 · 조준 5way와 원형탄',
    type: 'nonspell', hp: 2400, time: 30, start: [192, 110],
    *run(s) {
      for (let w = 1; ; w++) {
        for (let k = 0; k < s.lv(2, 3, 3); k++) {
          s.spread(s.lv(3, 5, 5), s.aim(), 0.18, { spd: s.sp(3.4), shape: 'rice', color: 'blue' });
          yield 8;
        }
        s.ring(s.cnt(28), { offset: s.rand(0, s.TAU), spd: s.sp(1.8), shape: 'small', color: 'white' });
        if (s.diff > 0) s.ring(s.cnt(28), { offset: s.rand(0, s.TAU), spd: s.sp(2.4), shape: 'small', color: 'cyan' });
        yield s.wait(30);
        if (w % 3 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '시험 스펠 「이중 나선」',
    type: 'spell', hp: 3200, time: 40, start: [192, 130],
    *run(s) {
      let a = 0;
      for (let f = 0; ; f++) {
        a += s.spin(0.13 + 0.05 * Math.sin(f * 0.01));
        const arms = s.arms(s.lv(3, 4, 4));
        for (let i = 0; i < arms; i++) s.fire({ ang: a + i * s.TAU / arms, spd: s.sp(2.6), shape: 'rice', color: 'purple' });
        if (s.diff >= 2 || (s.diff === 1 && f % 2 === 0)) for (let i = 0; i < 3; i++) s.fire({ ang: -a * 0.7 + i * s.TAU / 3, spd: s.sp(1.8), shape: 'small', color: 'pink' });
        yield 5;
      }
    },
  },
  {
    name: '시험 스펠 「휘어 피는 꽃잎」',
    type: 'spell', hp: 3400, time: 40, start: [192, 120],
    *run(s) {
      for (let w = 0; ; w++) {
        const dir = w % 2 ? 1 : -1, off = s.rand(0, s.TAU), n = s.cnt(30);
        for (let i = 0; i < n; i++) {
          s.fire({
            ang: off + i * s.TAU / n, spd: s.sp(4), accel: -0.08, minSpd: s.sp(1.2),
            shape: 'orb', color: dir > 0 ? 'pink' : 'green',
            // 감속하는 동안만 휘고, 이후 직진
            fn: b => { b.angVel = b.t < 40 ? dir * 0.03 : 0; },
          });
        }
        yield s.wait(40);
        if (w % 4 === 3) yield* s.wander();
      }
    },
  },
  {
    name: '시험 스펠 「격자 레이저」',
    type: 'spell', hp: 3000, time: 45, start: [192, 90],
    *run(s) {
      const gapX = s.lv(96, 80, 64), gapY = s.lv(110, 90, 72);
      for (;;) {
        const off = s.rand(0, 48);
        for (let x = off; x < s.W; x += gapX) s.laser({ x, y: 0, ang: Math.PI / 2, len: s.H, w: 14, warn: s.lv(70, 60, 50), dur: 50, color: 'cyan' });
        yield 40;
        for (let k = 0; k < s.lv(3, 4, 6); k++) { s.spread(s.lv(1, 3, 3), s.aim(), 0.25, { spd: s.sp(4.5), shape: 'knife', color: 'blue' }); yield 6; }
        yield 20;
        const offY = s.rand(160, 200);
        for (let y = offY; y < s.H; y += gapY) s.laser({ x: 0, y, ang: 0, len: s.W, w: 14, warn: s.lv(70, 60, 50), dur: 50, color: 'yellow' });
        yield s.wait(90);
      }
    },
  },
  {
    name: '시험 스펠 「조준 칼날과 느린 비」',
    type: 'spell', hp: 3000, time: 40, start: [192, 100],
    *run(s) {
      s.task(function* () {
        for (;;) {
          s.fire({ x: s.rand(0, s.W), y: -8, ang: Math.PI / 2 + s.rand(-0.2, 0.2), spd: s.sp(s.rand(1, 1.8)), shape: 'small', color: 'blue' });
          yield s.wait(4);
        }
      }());
      for (let w = 1; ; w++) {
        yield s.wait(50);
        const a = s.aim();
        for (let k = 0; k < s.lv(4, 6, 8); k++) { s.fire({ ang: a, spd: s.sp(7), shape: 'knife', color: 'red' }); yield 3; }
        if (w % 3 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '논스펠 · 윤도연',
    type: 'nonspell', boss: '윤도연', bossColor: '#9fb4c8', hp: 1400, time: 32, start: [192, 100],
    *run(s) {
      // E3 제압 사격: 짧게 끊어 쏘는 조준 3점사 + 박자에 맞춘 느린 원형탄. 홍마향 1스테이지처럼 조준과 고정 탄을 번갈아
      for (let w = 1; ; w++) {
        for (let k = 0; k < 2; k++) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.14, { spd: s.sp(3), shape: 'rice', color: 'blue' }); yield 8; }
        yield s.wait(24);
        s.ring(s.cnt(16), { offset: w * 0.13, spd: s.sp(1.5), shape: 'small', color: 'white' });
        yield s.wait(30);
        if (w % 3 === 0) yield* s.wander(70, 50);
      }
    },
  },
  {
    name: '「발포 점착제」(가칭)',
    type: 'spell', boss: '윤도연', bossColor: '#9fb4c8', hp: 1800, time: 40, start: [192, 90],
    *run(s) {
      // 대책반의 구속 장비. 점착제 덩어리가 포물선으로 날아가 떨어진 자리에 한동안 붙어 있는 장애물이 됨.
      // 떨어질 자리를 십자선으로 먼저 보여 주고, 플레이어 바로 위에는 떨어뜨리지 않음. 붙는 순간 작은 방울이 튀고,
      // 붙은 덩어리 사이로 조준 사격을 피함
      const stick = s.lv(170, 150, 135, 125, 120);
      for (let w = 0; ; w++) {
        for (let i = 0; i < s.lv(3, 4, 5, 5, 6); i++) {
          let tx, ty, tries = 0;
          do { tx = s.rand(40, s.W - 40); ty = s.rand(220, s.H - 40); } while (Math.hypot(tx - s.player.x, ty - s.player.y) < 60 && ++tries < 20);
          const T = 50, g = 0.12;
          s.mark({ x: tx, y: ty, dur: T });
          s.fire({
            vx: (tx - s.boss.x) / T, vy: (ty - s.boss.y) / T - 0.5 * g * T, ay: g, shape: 'big', color: '#f0e6a0', marginTop: 200,
            fn: (b, s) => {
              if (b.t === T) {
                // 철퍽: 붙는 순간 작은 방울이 느리게 튐
                b.vx = 0; b.vy = 0; b.ay = 0;
                s.ring(s.lv(4, 5, 6, 6, 7), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: 0.3, accel: 0.02, maxSpd: s.sp(1.4), shape: 'small', color: '#f0e6a0' });
              }
              if (b.t > T + stick) b.dead = true;
            },
          });
          yield 8;
        }
        for (let k = 0; k < 2; k++) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.2, { spd: s.sp(2.5), shape: 'rice', color: 'blue' }); yield s.wait(24); }
        yield s.wait(50);
      }
    },
  },
  {
    name: '논스펠 · 고현성 1',
    type: 'nonspell', boss: '고현성', bossColor: '#c8d4e8', hp: 1800, time: 34, start: [192, 100],
    *run(s) {
      // E4 관통탄 연사: 조준한 방향 둘레를 좌우로 훑는 칼날 줄기 + 사이사이 원형탄(칼날 속도 3.6, 줄기 사이 5프레임)
      for (let w = 1; ; w++) {
        const a0 = s.aim();
        for (let k = 0; k < s.lv(6, 8, 10, 11, 12); k++) {
          s.spread(s.lv(3, 3, 5, 5, 7), a0 + Math.sin(k * 0.4) * 0.25, 0.2, { spd: s.sp(3.6), shape: 'knife', color: 'cyan' });
          yield 5;
        }
        yield s.wait(30);
        s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'orb', color: 'blue' });
        yield s.wait(40);
        if (w % 2 === 0) yield* s.wander(80, 45);
      }
    },
  },
  {
    name: '「강선 그물」(가칭)',
    type: 'spell', boss: '고현성', bossColor: '#c8d4e8', hp: 2200, time: 45, start: [192, 90],
    *run(s) {
      // 강선 그물: 플레이어 둘레에 격자로 예고선이 깔리고, 강선이 한꺼번에 팽팽해짐. 칸 한가운데로 옮기면 안전.
      // 45도 마름모 격자와 가로세로 격자를 번갈아 침
      for (let w = 0; ; w++) {
        const gap = s.lv(110, 96, 86, 80, 76), warn = s.lv(52, 45, 40, 37, 34);
        const cx = s.player.x, cy = s.player.y, off = s.rand(-gap / 2, gap / 2);
        if (s.diff >= 3) s.ring(s.cnt(12), { offset: s.rand(0, s.TAU), spd: s.sp(1.5), shape: 'small', color: 'white' });
        const tilt = w % 2 ? 0 : Math.PI / 4;
        for (const ang of [tilt, tilt + Math.PI / 2]) {
          const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
          for (let k = -4; k <= 4; k++) {
            const px = cx + nx * (k * gap + off), py = cy + ny * (k * gap + off);
            s.laser({ x: px - Math.cos(ang) * 640, y: py - Math.sin(ang) * 640, ang, len: 1280, w: 10, warn, dur: 60, color: 'white' });
          }
        }
        yield warn;
        for (let k = 0; k < 2; k++) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.6), shape: 'rice', color: 'cyan' }); yield 18; }
        yield s.wait(40);
      }
    },
  },
  {
    name: '논스펠 · 고현성 2',
    type: 'nonspell', boss: '고현성', bossColor: '#c8d4e8', hp: 2000, time: 36, start: [192, 100],
    *run(s) {
      // 충격탄: 느려지며 멈춘 자리에서 터져 작은 탄을 사방으로.
      // 두 번에 한 번 조명탄: 위로 쏘아 올린 탄이 터지며 불똥이 포물선을 그리며 흩날려 떨어짐
      for (let w = 1; ; w++) {
        if (w % 2 === 0) {
          const fx = s.rand(60, s.W - 60), fy = s.rand(30, 70), T = 30;
          s.fire({ x: s.boss.x, y: s.boss.y, vx: (fx - s.boss.x) / T, vy: (fy - s.boss.y) / T, shape: 'big', color: 'white',
            fn: (b, s) => {
              if (b.t < T) return;
              b.dead = true;
              s.shake(1);
              for (let i = 0; i < s.cnt(18); i++) s.fire({ x: b.x, y: b.y, vx: s.rand(-1.6, 1.6), vy: s.rand(-1.8, -0.4), ay: 0.035, shape: 'small', color: 'orange', marginTop: 120,
                fn: c => { if (c.vy > 2) c.vy = 2; c.vx *= 0.995; } });   // 떨어지는 속도는 2까지
            } });
        }
        for (let i = 0; i < s.lv(2, 3, 3, 4, 4); i++) {
          s.fire({
            ang: s.aim() + (i - 1) * 0.5, spd: s.sp(3.4), accel: -0.06, minSpd: 0, shape: 'big', color: 'blue',
            fn: (b, s) => { if (b.spd > 0) return; b.dead = true; s.ring(s.cnt(14), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: s.sp(1.8), shape: 'small', color: 'cyan' }); s.shake(2); },
          });
          yield 10;
        }
        yield s.wait(50);
        if (w % 3 === 0) yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '「성스러운 수류탄」(가칭)',
    type: 'spell', strong: true, boss: '고현성', bossColor: '#c8d4e8', hp: 2400, time: 48, start: [192, 90],
    *run(s) {
      // 성당교회가 보급하는 금색 유리병. 떨어질 자리를 십자선으로 먼저 보여 주고, 깨진 자리에서 금빛 물방울이 퍼짐(처음엔 느리게)
      for (let w = 0; ; w++) {
        const n = s.lv(3, 4, 5, 5, 6), T = s.lv(60, 54, 48, 44, 40), g = 0.1;
        for (let i = 0; i < n; i++) {
          const tx = Math.max(30, Math.min(s.W - 30, s.player.x + s.rand(-110, 110))), ty = Math.max(200, Math.min(s.H - 30, s.player.y + s.rand(-80, 40)));
          s.mark({ x: tx, y: ty, dur: T });
          s.fire({
            vx: (tx - s.boss.x) / T, vy: (ty - s.boss.y) / T - 0.5 * g * T, ay: g, shape: 'orb', color: 'gold', marginTop: 200,
            fn: (b, s) => {
              if (b.t !== T) return;
              b.dead = true;
              s.ring(s.cnt(16), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: 0.5, accel: 0.04, maxSpd: s.sp(2.4), shape: 'rice', color: 'gold' });
              s.shake(3);
            },
          });
          yield s.wait(14);
        }
        yield s.wait(60);
      }
    },
  },
  {
    name: '논스펠 · 마리',
    type: 'nonspell', boss: '마리', bossColor: '#cfe8ff', hp: 950, time: 28, start: [192, 100],
    *run(s) {
      // 마리 1막: 느린 원형탄과 조준탄을 박자에 맞춰 번갈아. 필리우스 전문이라 탄이 둥글고 느림
      s.boss.chantColor = '#cfe8ff';
      for (let w = 1; ; w++) {
        s.ring(s.cnt(18), { offset: w * 0.21, spd: s.sp(1.6), shape: 'orb', color: 'cyan' });
        yield s.wait(26);
        s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.6), shape: 'small', color: 'white' });
        yield s.wait(26);
        if (w % 3 === 0) yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라',
    type: 'spell', boss: '마리', bossColor: '#cfe8ff', hp: 1150, time: 36, start: [192, 100],
    *run(s) {
      // 마리의 딱밤. 오른손이 빛나지만 필리우스 전문이라 파테르의 위력이 나오지 않음 → 느리고 둥근 노란 딱밤 탄(맞으면 목숨이 줄어드는
      // 보통 탄)을 "딱!" 하고 튕김. 옆으로 섞여 오는 하늘색 탄을 함께 피함. 세 번에 한 번은 필리우스 제1식으로 자기에게 보호막(때려서 부술 수 있음)
      s.boss.chantColor = '#cfe8ff';
      for (let cycle = 0; ; cycle++) {
        yield* castGap(s);
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.3, spd: s.sp(1.5), shape: 'orb', color: 'cyan' }); yield s.wait(34); }
        }());
        if (cycle % 3 === 2) { yield* s.chant('FILIUS1', { by: s.boss }); s.shield(s.boss, s.lv(150, 180, 200, 210, 220), s.lv(300, 350, 400, 450, 500)); }
        yield* s.chant('PATER1', { by: s.boss });
        light.return();
        s.boss.glow = 170;
        for (let k = 0; k < s.lv(4, 5, 6, 6, 7); k++) {
          const a = s.aim();
          s.spread(s.lv(3, 5, 5, 7, 7), a, 0.26, { spd: s.sp(2.2), shape: 'big', color: 'yellow' });
          if (s.diff >= 3) for (const side of [-1, 1]) s.fire({ ang: a + side * 0.6, spd: s.sp(2.8), shape: 'small', color: 'cyan' });
          if (k % 2 === 0) { s.say(s.boss, '딱!', 24); s.sound('flick'); }
          yield 22;
        }
      }
    },
  },
  {
    name: '논스펠 · 마리와 마르코',
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', hp: 1300, time: 38, start: [240, 100],
    *run(s) {
      const mari = churchDuo(s, [120, 80]);
      let holding = false;
      // 마리: 구역 보호막을 유지하는 동안은 다른 탄을 쏘지 않음
      s.task(function* () {
        for (let k = 0; ; k++) {
          if (!holding) s.ring(s.cnt(14), { x: mari.x, y: mari.y, offset: k * 0.23, spd: s.sp(1.5), shape: 'orb', color: 'cyan' });
          yield s.wait(50);
        }
      }());
      s.task(function* () {
        for (;;) {
          yield 600;   // 약 10초에 한 번
          yield* s.chant('FILIUS2', { by: mari });
          holding = true;
          // 구역 보호막: 때려서 부술 수 있음. 부서지면 바로 풀림
          const z = s.zone({ x: s.boss.x, y: s.boss.y, r: 52, dur: 270, hp: s.lv(350, 400, 450, 500, 550) });
          for (let t = 0; t < 270 && !z.broken; t++) yield 1;
          holding = false;
        }
      }());
      // 마르코: 묵직한 조준 연발. 구역 보호막 안에 있는 동안은 자리를 지킴
      for (let w = 1; ; w++) {
        for (let k = 0; k < s.lv(2, 3, 3); k++) { s.spread(s.lv(1, 3, 3), s.aim(), 0.3, { spd: s.sp(3.6), shape: 'orb', color: 'gold' }); yield 12; }
        yield s.wait(50);
        if (!holding && w % 3 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '필리우스 제2식 — 그의 백성을 두르시리로다',
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 1400, time: 74, start: [232, 95],
    *run(s) {
      // 마리가 둘을 감싸는 구역 보호막을 세움. 보호막이 서 있는 동안은 자기 탄이 들어가지 않지만, 보호막을 계속 때리면 부서짐.
      // → 부수거나, 마리가 다시 영창하는 동안(보호막이 없는 동안)이 공격할 때. 부수면 마리가 다시 세우기까지 더 오래 걸림
      const mari = churchDuo(s, [152, 95]);
      for (;;) {
        const light = s.task(function* () {   // 마리가 영창하는 동안 마르코가 조준탄과 느린 원형탄으로 견제
          for (let k = 0; ; k++) {
            s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.3, { spd: s.sp(2.4), shape: 'small', color: 'orange' });
            if (k % 2 === 0) s.ring(s.cnt(14), { offset: k * 0.31, spd: s.sp(1.5), shape: 'small', color: 'yellow' });
            yield s.wait(32);
          }
        }());
        yield* castGap(s);
        yield* s.chant('FILIUS2', { by: mari });
        light.return();
        const dur = s.lv(240, 300, 360);
        const z = s.zone({ x: 192, y: 95, r: 82, dur, hp: s.lv(500, 600, 700, 800, 900) });
        // 보호막 안의 마르코: 황금 탄을 던지고, 한 번은 시계방향·한 번은 반시계방향으로 휘는 원형탄을 번갈아 깖.
        // 마리는 유지하느라 쏘지 않음
        for (let t = 0, k = 0; t < dur && !z.broken; t += s.wait(40), k++) {
          s.fire({ ang: s.aim(), spd: s.sp(3.6), shape: 'big', color: 'gold' });
          s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.8), angVel: (k % 2 ? 1 : -1) * 0.006, shape: 'rice', color: 'gold' });
          if (k % 2) s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.2, { spd: s.sp(2.8), shape: 'rice', color: 'orange' });
          yield s.wait(40);
        }
        yield z.broken ? 150 : 60;   // 보호막 사이 쉬는 틈(부수면 더 김)
      }
    },
  },
  {
    name: '필리우스 제1식 — 불꽃이 너를 사르지 못하리니',
    type: 'spell', survival: true, boss: '마르코', bossColor: '#e0c89a', hp: 1, time: 40, start: [192, 100],
    *run(s) {
      // 내구 스펠: 마리가 마르코에게 보호막을 계속 씌우는 동안 버티기
      const mari = churchDuo(s);
      yield* s.chant('FILIUS1', { by: mari });
      s.shield(s.boss, 60 * 60);
      s.task(mariRings(s, mari, 60));
      s.task(function* () {   // 보호막을 두른 마르코의 조준 연사
        for (;;) { yield s.wait(50); s.spread(s.lv(3, 5, 5, 7, 7), s.aim(), 0.16, { spd: s.sp(2.8), shape: 'rice', color: 'gold' }); }
      }());
      for (;;) {
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 36 });
        for (let k = 0; k < 2; k++) {
          const px = s.player.x, py = s.player.y, d = Math.hypot(px - s.boss.x, py - s.boss.y) || 1;
          const stop = Math.max(0, d - 80);
          const tx = s.boss.x + (px - s.boss.x) / d * stop, ty = Math.min(s.boss.y + (py - s.boss.y) / d * stop, s.H - 130);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: s.lv(48, 40, 34) });
          yield* aimWhile(s, s.lv(48, 40, 34), 'yellow');
          s.boss.contact = true;
          yield* s.moveTo(tx, ty, 20);
          s.boss.contact = false;
          s.impact(7);
          s.ring(s.cnt(18), { spd: 0.6, accel: 0.04, maxSpd: s.sp(2), shape: 'orb', color: 'gold' });
          yield 45;
          yield* s.moveTo(s.rand(140, 244), s.rand(80, 110), 45);
        }
        yield 40;
      }
    },
  },
  {
    name: '논스펠 · 마르코 (폭주)',
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', bgmRate: 1.2, hp: 1530, time: 36, start: [192, 100],
    *run(s) {
      // 마리가 쓰러지자 마르코 폭주. 성큼성큼 다가서며 묵직한 조준탄을 연달아 쏘고 발을 구름
      marcoRage(s);
      for (let w = 1; ; w++) {
        yield* s.moveTo(Math.max(90, Math.min(s.W - 90, s.player.x + s.rand(-60, 60))), s.rand(80, 130), 30);
        for (let k = 0; k < 3; k++) { s.spread(s.lv(3, 5, 5, 7, 7), s.aim(), 0.2, { spd: s.sp(3.6), shape: 'orb', color: 'gold' }); yield 10; }
        s.ring(s.cnt(22), { offset: s.rand(0, s.TAU), spd: s.sp(2), shape: 'rice', color: 'gold' });
        s.impact(3);
        yield s.wait(44);
      }
    },
  },
  {
    name: '파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라',
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', bgmRate: 1.2, hp: 1790, time: 50, start: [192, 100],
    *run(s) {
      marcoRage(s);
      for (;;) {
        // 전조: 영창하는 동안은 가벼운 탄만
        const light = s.task(function* () {
          for (;;) { s.spread(s.lv(3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.2), shape: 'small', color: 'orange' }); yield s.wait(30); }
        }());
        yield* castGap(s);
        yield* s.chant('PATER1', { by: s.boss });
        light.return();
        // 오른손이 황금빛으로 빛나는 동안 플레이어 쪽으로 자리를 잡고 황금 주먹을 연달아 날림(폭주라 한 발 더)
        s.boss.glow = 240;
        yield* s.moveTo(Math.max(110, Math.min(s.W - 110, s.player.x)), 110, 36);
        for (let k = 0; k < s.lv(3, 4, 4, 5, 5); k++) {
          s.fire({
            ang: s.aim(), spd: s.sp(5), shape: 'big', color: 'gold',
            // 지나간 자리 양옆으로 작은 탄을 흘림(이지는 흘리지 않음)
            fn: (b, s) => {
              if (s.diff === 0 || b.t % s.lv(99, 12, 9)) return;
              for (const d of [-1, 1]) s.fire({ x: b.x, y: b.y, ang: b.ang + d * Math.PI / 2, spd: 0.5, accel: 0.015, maxSpd: s.sp(1.6), shape: 'small', color: 'yellow' });
            },
          });
          if (s.diff >= 3) s.ring(s.cnt(10), { offset: s.rand(0, s.TAU), spd: s.sp(2), shape: 'rice', color: 'gold' });
          s.impact(4);
          yield s.wait(40);
        }
        yield 50;
      }
    },
  },
  {
    name: '논스펠 · 마르코 2 (폭주)',
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', bgmRate: 1.2, hp: 2000, time: 36, start: [192, 100],
    *run(s) {
      // 뛰어올랐다 내리찍는 발구름: 착지 자리에서 처음엔 느린 충격파가 두 겹 퍼지고, 그 사이로 조준탄
      marcoRage(s);
      for (let w = 1; ; w++) {
        const tx = Math.max(90, Math.min(s.W - 90, s.player.x + s.rand(-80, 80))), ty = s.rand(90, 150);
        s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: 26 });
        yield* hardAim(s, 26, 'yellow');
        yield* s.moveTo(tx, ty, 16);
        s.impact(6);
        s.ring(s.cnt(24), { spd: 0.5, accel: 0.035, maxSpd: s.sp(2.2), shape: 'orb', color: 'gold' });
        yield 12;
        s.ring(s.cnt(24), { offset: Math.PI / 24, spd: 0.4, accel: 0.03, maxSpd: s.sp(1.6), shape: 'small', color: 'yellow' });
        yield s.wait(60);
      }
    },
  },
  {
    name: '파테르 제2식 — 능히 일어나지 못하게 하리니',
    type: 'spell', strong: true, boss: '마르코', bossColor: '#e0c89a', bgmRate: 1.2, hp: 2130, time: 58, start: [192, 100],
    *run(s) {
      // 폭주한 마르코의 마지막 스펠: 달려드는 제압. 플레이어가 1초 전에 있던 자리로 끝까지 돌진하고, 착지한 자리에서 충격파
      marcoRage(s);
      const hist = [];   // 플레이어 자리 기록(최근 1.5초)
      s.task(function* () { for (;;) { hist.push({ x: s.player.x, y: s.player.y }); if (hist.length > 90) hist.shift(); yield 1; } }());
      for (;;) {
        const light = s.task(function* () {   // 영창하는 동안 느린 원형탄과 조준탄
          for (let k = 0; ; k++) {
            s.ring(s.cnt(16), { offset: k * 0.29, spd: s.sp(1.5), shape: 'small', color: 'yellow' });
            yield s.wait(34);
          }
        }());
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 50 });
        light.return();
        for (let k = 0; k < s.lv(2, 2, 3, 3, 4); k++) {
          // 목표는 1초 전 플레이어 자리. 멈추지 않고 그 자리까지 끝까지 달려듦(예고선이 그 자리까지 그어짐)
          const back = hist[Math.max(0, hist.length - 61)] || s.player;
          const tx = Math.max(24, Math.min(s.W - 24, back.x)), ty = Math.max(60, Math.min(s.H - 40, back.y));
          const warn = s.lv(50, 44, 38, 36, 34);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: warn });
          yield* hardAim(s, warn, 'yellow');
          // 사거리가 없으므로 직접 달려듦. 돌진 중에는 몸에 닿아도 피격
          s.boss.contact = true;
          // 달려드는 동안 지나간 자리 양옆으로 작은 탄을 흘림
          const trail = s.task(function* () {
            const ang = Math.atan2(ty - s.boss.y, tx - s.boss.x);
            for (;;) {
              for (const d of [-1, 1]) s.fire({ x: s.boss.x, y: s.boss.y, ang: ang + d * Math.PI / 2, spd: 0.4, accel: 0.02, maxSpd: s.sp(1.5), shape: 'small', color: 'yellow' });
              yield 3;
            }
          }());
          yield* s.moveTo(tx, ty, 20);
          trail.return();
          s.boss.contact = false;
          s.impact(7);
          s.ring(s.cnt(24), { offset: s.rand(0, s.TAU), spd: 0.6, accel: 0.04, maxSpd: s.sp(2.2), shape: 'orb', color: 'gold' });
          yield 36;   // 붙든 자리에서 잠시 멈춤 = 공격 기회
          // 제자리로 물러남
          s.move(s.rand(140, 244), s.rand(80, 110), 40);
          yield 40 + s.wait(24);
        }
        yield 30;
      }
    },
  },
  // ── 3스테이지 · 세라피안들: 3-1 김예나, 3-2 차서린, 3-3 고태웅 ──
  // 변신 외형·능력은 미정. 확정된 사실(매개물·好·염원·모티브 문자)만 재료로 쓴 임시 패턴이며 기술명은 전부 가칭.
  // 대사는 확정된 것만 쓰므로 넣지 않음
  {
    name: '논스펠 · 김예나 1',
    type: 'nonspell', boss: '김예나', bossColor: '#ffb3d9', bgmRate: yenaRate, hp: 1900, time: 36, start: [192, 100],
    *run(s) {
      // 생방송: 원형 별탄과 조준 3점사를 번갈아. 시청자 수가 오르면(yenaLive) 탄 수·발사 속도·노래가 빨라짐
      yenaLive(s);
      for (let w = 0; ; w++) {
        s.ring(s.cnt(16), { offset: w * 0.17, spd: s.sp(1.7), shape: 'star', color: 'pink' });
        yield s.wait(26);
        for (let k = 0; k < 2; k++) { s.spread(yc(s, s.lv(1, 3, 3, 3, 5)), s.aim(), 0.16, { spd: s.sp(3.2), shape: 'rice', color: 'white' }); yield 7; }
        yield s.wait(26);
        if (w % 4 === 3) yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '「셔터 찬스」(가칭)',
    type: 'spell', boss: '김예나', bossColor: '#ffb3d9', bgmRate: yenaRate, hp: 2300, time: 42, start: [192, 90],
    *run(s) {
      // 촬영: 찰칵 할 때마다 십자 레이저(사진 프레임) 여러 개가 한꺼번에 깔림(예고선 → 찰칵 순간 발사). 하나는 플레이어 자리,
      // 나머지는 화면 여기저기(가로줄·세로줄끼리 64px 넘게 떨어져 줄 사이로 설 자리가 남음). 모든 가로줄·세로줄을 벗어나야 함.
      // 하드부터는 두 장에 한 장이 X자(대각선) 프레임. 찰칵 뒤에는 찍힌 자리로 가벼운 부채꼴. 다음 장은 앞 장 레이저가 걷힌 뒤에 깔림
      yenaLive(s);
      if (s.diff >= 3) s.task(function* () {
        for (let k = 0; ; k++) { s.ring(s.cnt(8), { offset: k * 0.21, spd: s.sp(1.2), shape: 'star', color: 'pink' }); yield s.wait(110); }
      }());
      const cross = (x, y, diag, lead) => {
        const angs = diag ? [Math.PI / 4, -Math.PI / 4] : [0, Math.PI / 2];
        for (const ang of angs) s.laser({ x: x - Math.cos(ang) * 800, y: y - Math.sin(ang) * 800, ang, len: 1600, w: 12, warn: lead, dur: 16, color: 'pink' });
        s.mark({ x, y, dur: lead });
      };
      for (let w = 0; ; w++) {
        for (let k = 0; k < s.lv(2, 3, 3, 3, 4); k++) {
          const lead = s.lv(46, 42, 38, 36, 34), diag = s.diff >= 2 && k % 2 === 1;
          const n = s.lv(2, 3, 3, 4, 4) + (s.surge >= 2 ? 1 : 0);   // 격화 III에서 하나 더
          const pts = [{ x: s.player.x, y: s.player.y }];
          // 나머지 프레임 자리: 이미 고른 자리와 가로·세로(X자면 두 대각선) 모두 64px 넘게 떨어진 곳
          const apart = (p, q) => diag ? Math.abs((p.x + p.y) - (q.x + q.y)) > 90 && Math.abs((p.x - p.y) - (q.x - q.y)) > 90
                                       : Math.abs(p.x - q.x) > 64 && Math.abs(p.y - q.y) > 64;
          for (let tries = 0; pts.length < n && tries < 200; tries++) {
            const p = { x: s.rand(30, s.W - 30), y: s.rand(120, s.H - 30) };
            if (pts.every(q => apart(p, q))) pts.push(p);
          }
          for (const p of pts) cross(p.x, p.y, diag, lead);
          const tx = pts[0].x, ty = pts[0].y;
          s.task(function* () {
            yield lead;
            s.sound('beep', 1);
            s.shake(1);
            const a = Math.atan2(ty - s.boss.y, tx - s.boss.x);
            for (let i = 0; i < 2; i++) { s.spread(s.lv(3, 3, 3, 3, 5), a, 0.16, { spd: s.sp(2.6 + i * 0.3), shape: 'rice', color: 'white', fixed: true }); yield 4; }
          }());
          yield lead + 30;   // 앞 장 레이저가 걷힌 뒤 다음 장(시청자 수로 빨라지지 않음)
        }
        yield s.wait(90);
        if (w % 2 === 1) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '논스펠 · 김예나 2',
    type: 'nonspell', boss: '김예나', bossColor: '#ffb3d9', bgmRate: yenaRate, hp: 2000, time: 36, start: [192, 100],
    *run(s) {
      // 텐션 업: 세 갈래 별 나선이 돌다가 약 1.5초마다 갑자기 반대로 꺾임(자극). 꺾일 때마다 조준 부채꼴
      yenaLive(s);
      let a = 0, dir = 1;
      for (let f = 0; ; f++) {
        if (f % 18 === 17) { dir = -dir; s.spread(yc(s, s.lv(3, 3, 5, 5, 7)), s.aim(), 0.2, { spd: s.sp(3), shape: 'rice', color: 'white' }); }
        a += dir * s.spin(0.13);
        const arms = s.arms(3);   // 격화 II 네 갈래, III 다섯 갈래
        for (let i = 0; i < arms; i++) s.fire({ ang: a + i * s.TAU / arms, spd: s.sp(2.2), shape: 'star', color: i % 2 ? 'pink' : 'yellow' });
        if (f % 24 === 6) s.fire({ ang: s.aim(), spd: s.sp(3), shape: 'rice', color: 'white' });
        if (f % 90 === 89) yield* s.wander(40, 40);
        yield yw(s, s.lv(7, 6, 5, 5, 4));
      }
    },
  },
  {
    name: '「스펙타클」(가칭)',
    type: 'spell', strong: true, boss: '김예나', bossColor: '#ffb3d9', bgmRate: yenaRate, hp: 2600, time: 48, start: [192, 80],
    *run(s) {
      // 불꽃놀이: 폭죽이 화면 위쪽 여기저기로 날아가(터질 자리에 십자선) 별 원형탄으로 터지고, 불똥이 흩날려 떨어짐.
      // 터지는 자리는 플레이어에게서 90px 넘게 떨어진 곳만
      yenaLive(s);
      for (let w = 0; ; w++) {
        for (let k = 0; k < yc(s, s.lv(2, 3, 4, 4, 5)); k++) {
          let tx, ty, tries = 0;
          do { tx = s.rand(50, s.W - 50); ty = s.rand(70, 230); } while (Math.hypot(tx - s.player.x, ty - s.player.y) < 90 && ++tries < 20);
          const T = 36;
          s.mark({ x: tx, y: ty, dur: T });
          const col = s.pick(['pink', 'yellow', 'cyan', 'purple']);
          s.fire({ x: s.boss.x, y: s.boss.y, vx: (tx - s.boss.x) / T, vy: (ty - s.boss.y) / T, shape: 'big', color: col,
            fn: (b, s) => {
              if (b.t < T) return;
              b.dead = true;
              s.shake(2);
              s.ring(s.cnt(14), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: s.sp(1.8), shape: 'star', color: col });
              for (let i = 0; i < s.lv(3, 4, 6, 6, 7); i++) s.fire({ x: b.x, y: b.y, vx: s.rand(-1.2, 1.2), vy: s.rand(-1.4, -0.2), ay: 0.03, shape: 'small', color: 'orange', marginTop: 120,
                fn: c => { if (c.vy > 1.8) c.vy = 1.8; } });
            } });
          yield yw(s, s.lv(24, 22, 20, 19, 18));
        }
        if (s.diff >= 3) s.spread(3, s.aim(), 0.18, { spd: s.sp(2.8), shape: 'rice', color: 'white' });
        yield s.wait(50);
        if (w % 3 === 2) yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '논스펠 · 차서린 1',
    type: 'nonspell', boss: '차서린', bossColor: '#9fc8ff', hp: 1900, time: 36, start: [192, 100],
    *run(s) {
      // 4박: 박자(24프레임)마다 작은 원형탄, 강박(1박)에는 큰 탄 조준 부채꼴
      for (let beat = 0; ; beat++) {
        const strong = beat % 4 === 0;
        if (strong) s.spread(s.lv(3, 3, 5, 5, 5), s.aim(), 0.3, { spd: s.sp(2.6), shape: 'big', color: 'blue' });
        else {
          s.ring(s.cnt(14), { offset: beat * 0.26, spd: s.sp(1.8), shape: 'small', color: 'cyan' });
          s.fire({ ang: s.aim(), spd: s.sp(3), shape: 'rice', color: 'white' });
        }
        if (beat % 32 === 31) yield* s.wander(50, 48);
        else yield 24;
      }
    },
  },
  {
    name: '「리프」(가칭)',
    type: 'spell', boss: '차서린', bossColor: '#9fc8ff', hp: 2300, time: 42, start: [192, 90],
    *run(s) {
      // 기타 리프: 같은 네 마디를 되풀이. 박자마다 칼날(피크) 부채꼴이 왼쪽→오른쪽→왼쪽으로 한 칸씩 옮겨 가고,
      // 마디 끝 강박에 원형탄. 되풀이되므로 박자를 익히면 틈이 보임
      const riff = [-0.5, -0.25, 0, 0.25, 0.5, 0.25, 0, -0.25];
      for (let bar = 0; ; bar++) {
        for (let i = 0; i < riff.length; i++) {
          const a = Math.PI / 2 + riff[i] * (bar % 2 ? -1 : 1);
          s.spread(s.lv(3, 5, 5, 7, 7), a, 0.09, { spd: s.sp(2.6), shape: 'knife', color: 'cyan' });
          if (s.diff >= 3 && i % 4 === 3) s.fire({ ang: s.aim(), spd: s.sp(3), shape: 'rice', color: 'white' });
          yield s.lv(20, 17, 15, 14, 13);
        }
        s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'orb', color: 'blue' });
        s.shake(2);
        yield s.wait(30);
        if (bar % 3 === 2) yield* s.wander(40, 40);
      }
    },
  },
  {
    name: '논스펠 · 차서린 2',
    type: 'nonspell', boss: '차서린', bossColor: '#9fc8ff', hp: 2000, time: 36, start: [192, 80],
    *run(s) {
      // 음파: 물결 모양으로 늘어선 탄 줄이 화면 아래로 천천히 퍼져 내려감. 물결 위 한 칸이 틈.
      // 줄 사이 약 90px(노말). 다음 줄의 틈은 앞 줄 틈에서 150px 안쪽에만 나와 줄이 오기 전에 옮겨 갈 수 있음.
      // 네 줄(한 소절)을 보내면 쉼표: 약 2.5초 동안 줄을 보내지 않고 가운데 근처에 멈춰 가벼운 조준탄만(딜 타임).
      // 쉼표 뒤 첫 줄의 틈은 보스 바로 아래 근처라 보스 밑에서 쏘던 자리에서 이어서 피할 수 있음
      let gapX = s.W / 2;
      for (let bar = 0; ; bar++) {
        for (let w = 0; w < 4; w++) {
          const ph = s.rand(0, s.TAU), n = 24;
          gapX = w === 0 ? Math.max(50, Math.min(s.W - 50, s.boss.x + s.rand(-40, 40))) : Math.max(50, Math.min(s.W - 50, gapX + s.rand(-150, 150)));
          for (let i = 0; i < n; i++) {
            const x = (i + 0.5) * s.W / n;
            if (Math.abs(x - gapX) < s.lv(34, 28, 24, 22, 20)) continue;
            s.fire({ x, y: s.boss.y + 20 + Math.sin(x * 0.03 + ph) * 26, ang: Math.PI / 2, spd: s.sp(1.2), shape: 'small', color: 'cyan' });
          }
          yield s.wait(60);
        }
        // 쉼표: 마지막 줄이 내려가는 동안 자리를 옮긴 뒤 멈춰 섬
        if (bar % 2 === 1) yield* s.wander(40, 40);
        const rest = s.lv(170, 160, 150, 140, 130);
        for (let t = 0; t < rest; t += 50) {
          if (s.diff >= 1) s.fire({ ang: s.aim(), spd: s.sp(2.2), shape: 'rice', color: 'white' });
          yield Math.min(50, rest - t);
        }
      }
    },
  },
  {
    name: '「시선」(가칭)',
    type: 'spell', strong: true, boss: '차서린', bossColor: '#9fc8ff', hp: 2860, time: 53, start: [192, 90],
    *run(s) {
      // 아인(눈·보다·빛): 화면 양옆 높이에 눈 표식 둘이 뜨고 플레이어를 바라봄 → 예고선 뒤 그 시선을 따라 빛줄기.
      // 두 눈이 번갈아 보므로 한쪽을 피한 자리를 다른 쪽이 노림. 박자에 맞춘 원형탄이 함께
      s.task(function* () {
        for (let beat = 0; ; beat++) {
          s.ring(s.cnt(beat % 2 ? 10 : 16), { offset: beat * 0.2, spd: s.sp(1.5), shape: 'small', color: beat % 2 ? 'cyan' : 'blue' });
          yield 24;
        }
      }());
      for (let w = 0; ; w++) {
        for (const side of [-1, 1]) {
          const ex = side < 0 ? 24 : s.W - 24, ey = s.rand(120, 260), warn = s.lv(50, 44, 40, 38, 36);
          s.mark({ x: ex, y: ey, dur: warn + 30 });
          const a = Math.atan2(s.player.y - ey, s.player.x - ex);
          s.laser({ x: ex, y: ey, ang: a, len: 700, w: s.lv(12, 14, 16, 16, 18), warn, dur: 30, color: 'cyan' });
          yield s.lv(40, 34, 30, 28, 26);
        }
        if (s.diff >= 3) s.spread(3, s.aim(), 0.2, { spd: s.sp(2.6), shape: 'rice', color: 'white' });
        yield s.wait(40);
        if (w % 3 === 2) yield* s.wander(40, 40);
      }
    },
  },
  {
    name: '논스펠 · 고태웅 1',
    type: 'nonspell', boss: '고태웅', bossColor: '#ffcf6b', hp: 2200, time: 38, start: [192, 100],
    *run(s) {
      // 변신 포즈: 포즈를 잡는 동안(약 1초) 멈춰서 아무것도 쏘지 않음 = 공격 기회. 포즈가 끝나면 번쩍이며
      // 별 원형탄 두 겹과 조준 연사.
      for (let w = 0; ; w++) {
        s.say(s.boss, 'POSE', 50);
        s.boss.glow = 60;
        yield 60;
        s.impact(3);
        s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(2), shape: 'star', color: 'yellow' });
        s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.4), shape: 'star', color: 'orange' });
        for (let k = 0; k < 3; k++) { s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.15, { spd: s.sp(3.2), shape: 'rice', color: 'white' }); yield 10; }
        s.ring(s.cnt(18), { offset: s.rand(0, s.TAU), spd: s.sp(1.8), shape: 'small', color: 'yellow' });
        yield s.wait(40);
        if (w % 2 === 1) yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '「히어로 킥」(가칭)',
    type: 'spell', boss: '고태웅', bossColor: '#ffcf6b', hp: 2700, time: 48, start: [192, 100],
    *run(s) {
      // 화면 안쪽 위 구석으로 뛰어올라 자세를 잡고(이때도 맞힐 수 있음), 비스듬히 내리꽂는 발차기.
      // 날아오는 동안 궤적 양옆으로 작은 탄을 흘리고, 예고선 끝(플레이어 70px 앞)에 착지하며 충격파 세 겹.
      // 돌진 중에는 몸에 닿아도 피격. 킥 사이에는 쉬는 시간을 넉넉히 둠
      for (let w = 0; ; w++) {
        const sx = s.player.x < s.W / 2 ? s.W - 40 : 40, sy = 40;
        s.boss.glow = 40;
        yield* s.moveTo(sx, sy, 30);
        const px = s.player.x, py = s.player.y, d = Math.hypot(px - sx, py - sy) || 1, stop = Math.max(0, d - 70);
        const tx = sx + (px - sx) / d * stop, ty = Math.min(sy + (py - sy) / d * stop, s.H - 110);
        const warn = s.lv(50, 44, 38, 36, 34);
        s.warnLine({ x: sx, y: sy, x2: tx, y2: ty, band: 32, dur: warn });
        yield* hardAim(s, warn, 'yellow');
        s.boss.contact = true;
        const ang = Math.atan2(ty - sy, tx - sx);
        const trail = s.task(function* () {
          for (;;) {
            for (const dd of [-1, 1]) s.fire({ x: s.boss.x, y: s.boss.y, ang: ang + dd * Math.PI / 2, spd: 0.4, accel: 0.02, maxSpd: s.sp(1.5), shape: 'small', color: 'orange' });
            yield 3;
          }
        }());
        yield* s.moveTo(tx, ty, 18);
        trail.return();
        s.boss.contact = false;
        s.impact(7);
        // 충격파 세 겹: 빠른 별탄, 중간 쌀알탄, 느린 작은 탄(겹마다 반 칸씩 엇갈림)
        const off = s.rand(0, s.TAU), n = s.cnt(18);
        s.ring(n, { offset: off, spd: 0.6, accel: 0.045, maxSpd: s.sp(2.4), shape: 'star', color: 'yellow' });
        s.ring(n, { offset: off + Math.PI / n, spd: 0.5, accel: 0.035, maxSpd: s.sp(1.8), shape: 'rice', color: 'orange' });
        s.ring(n, { offset: off, spd: 0.4, accel: 0.025, maxSpd: s.sp(1.3), shape: 'small', color: 'yellow' });
        yield 40;
        s.move(s.rand(140, 244), s.rand(80, 110), 44);
        yield 44 + s.wait(70);
      }
    },
  },
  {
    name: '논스펠 · 고태웅 2',
    type: 'nonspell', boss: '고태웅', bossColor: '#ffcf6b', hp: 2300, time: 38, start: [192, 100],
    *run(s) {
      // 형 따라 하기: 1스테이지 형(고현성)의 관통탄 칼날 줄기를 흉내 냄. 흉내라 줄기가 조금씩 삐뚤빼뚤 흔들림.
      // 줄기 사이로 별 원형탄
      for (let w = 0; ; w++) {
        const base = s.aim();
        const m = s.lv(3, 4, 4, 5, 5);
        for (let k = 0; k < m; k++) {
          const a = base + (k - (m - 1) / 2) * 0.32;
          s.task(function* () {
            for (let i = 0; i < 10; i++) { s.fire({ ang: a + Math.sin(i * 0.9) * 0.05, spd: s.sp(4.2), shape: 'knife', color: 'yellow' }); yield 3; }
          }());
        }
        yield s.wait(26);
        s.ring(s.cnt(22), { offset: w * 0.3, spd: s.sp(1.8), shape: 'star', color: 'orange' });
        yield s.wait(26);
        if (w % 4 === 3) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「정의의 파도」(가칭)',
    type: 'spell', strong: true, boss: '고태웅', bossColor: '#ffcf6b', hp: 3000, time: 52, start: [192, 80],
    *run(s) {
      // 정의의 파도: 엇갈린 세로 줄들이 고정 간격(가로 44px, 세로 dy 48~58px, 이웃 줄은 반 칸 엇갈림)을 지키며 왼쪽에서 오른쪽으로
      // 계속 밀려옴(깜빡이지 않음). 엇갈린 이웃 줄 사이 dy/4 높이에 격자와 함께 흐르는 가로 안전 줄이 있고
      // (탄 판정 가장자리까지 dy/4 - 8.4 = 약 3.6~6.1px), 줄과 줄 사이 틈(44 - 16.8 = 약 27px)이 지나는 동안 다음 안전 줄로 옮김.
      // 고태웅 양쪽에서 계속 켜져 있는 레이저 두 줄이 약 4초 주기로 위아래로 쓸어, 격자가 없는 화면 위쪽에 숨을 수 없게 함
      // 격자는 화면 맨 위부터 깔리고 가로 위치에 따라 위아래로 출렁이는 물결 모양(진폭 16px)으로 흘러감.
      // 물결은 시간에 따라서도 흘러 제자리의 안전 줄이 오르내리므로 가만히 있을 수 없음(따라가는 속도는 최대 약 0.7px/프레임).
      // 이 스펠 동안 보스 몸통에 닿아도 피격(몸에 붙어 숨지 못하게)
      const dx = 44, dy = s.lv(58, 54, 52, 50, 48), v = s.sp(0.95), top = -dy, A = 16, k = 0.025;
      s.boss.contact = true;
      // 레이저: 1초 예고 뒤 스펠 끝까지. 보스를 따라 붙고, 각도가 위로 0.25 ~ 아래로 0.55 사이를 오감
      const sweep = t => 0.15 + 0.4 * Math.sin(t * s.TAU / 240);
      for (const side of [-1, 1]) {
        s.laser({ x: s.boss.x, y: s.boss.y, ang: side < 0 ? Math.PI - sweep(0) : sweep(0), len: 460, w: 10, warn: 60, dur: 99999, color: 'yellow',
          fn: l => { const a = sweep(l.t); l.ang = side < 0 ? Math.PI - a : a; l.x = s.boss.x; l.y = s.boss.y; } });
      }
      // 파도: 왼쪽 밖에서 dx/v 프레임마다 한 줄씩. 모두 같은 속도라 줄 사이 간격이 그대로 유지됨
      for (let c = 0; ; c++) {
        const off = (c % 2) * dy / 2;
        for (let y = top + off; y < s.H + 10; y += dy) s.fire({ x: -10, y, ang: 0, spd: v, shape: 'orb', color: 'yellow', margin: 60, data: { y0: y },
          fn: bb => { bb.y = bb.data.y0 + A * Math.sin(bb.x * k - s.frame * 0.02); } });
        yield Math.round(dx / v);
      }
    },
  },
  // ── 4스테이지 · NYMPH: 코스모(중간 보스) → 진(보스). 변신체 능력은 미정이라 코드명 분야(뇌과학·화학·수학)만 재료로 쓴 임시안 ──
  // 공통 기믹 「탐색 사격」(nymphScan): 천사가 보이지 않아 처음에는 기체를 겨누지 못하고 화면을 훑는 방향으로만 쏨.
  // 이즘의 분석이 끝나면 기체 위에 LOCK 표시와 함께 조준으로 바뀜(패턴마다 훑기 → 잠금 두 단계)
  {
    name: '논스펠 · 코스모',
    type: 'nonspell', boss: '코스모', bossColor: '#b8a0ff', hp: 1500, time: 32, start: [192, 100],
    *run(s) {
      // 착각: 진짜 기체 자리와 좌우가 뒤바뀐 자리를 번갈아 노리는 보라 부채꼴 + 느린 원형탄. 잠금 전에는 훑는 방향으로
      const scan = nymphScan(s);
      for (let k = 0; ; k++) {
        const tx = k % 2 ? s.W - s.player.x : s.player.x;
        const a = scan.locked ? Math.atan2(s.player.y - s.boss.y, tx - s.boss.x) : scan.sweep();
        s.spread(s.lv(3, 3, 5, 5, 5), a, 0.15, { spd: s.sp(2.5), shape: 'orb', color: 'purple' });
        if (k % 3 === 2) s.ring(s.cnt(14), { offset: s.rand(0, s.TAU), spd: s.sp(1.4), shape: 'small', color: 'white' });
        yield s.wait(32);
        if (k % 8 === 7) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「꿈의 재현」(가칭)',
    type: 'spell', boss: '코스모', bossColor: '#b8a0ff', hp: 1900, time: 44, start: [192, 150],
    *run(s) {
      // 꿈의 재현: 코스모가 가운데에서 원형탄을 쉬지 않고 뿜는 동안(너무 촘촘하진 않게) 화면을 세로로 반씩 나눈 왼쪽·오른쪽이
      // 천천히 한쪽씩 깜빡임(왼쪽 낮은 종소리, 오른쪽 높은 종소리). 깜빡임·휩쓸기 동안은 원형탄을 절반으로 줄임. 한 판에 왼쪽·오른쪽이 모두 나오고 같은 쪽은 두 번까지만 연달아 깜빡임. 다 깜빡이고 1초 뒤, 깜빡인 순서 그대로 그 절반을
      // 빠른 탄막이 위에서 아래로 휩쓸고 지나감. 순서를 기억해 휩쓸리는 절반의 반대쪽에 가 있으면 됨
      // 원형탄: 깜빡임·휩쓸기가 이어지는 동안(busy)은 두 번에 한 번만 쏴서 가운데를 건너갈 틈을 줌
      const st = { busy: false };
      s.task(function* () {
        for (let k = 0; ; k++) {
          if (!st.busy || k % 2 === 0) s.ring(s.cnt(s.lv(10, 11, 12, 13, 14)), { offset: k * 0.19, spd: s.sp(1.5), shape: 'orb', color: 'purple' });
          yield s.wait(16);
        }
      }());
      yield 60;
      const half = s.W / 2;
      for (let w = 0; ; w++) {
        const n = s.lv(2, 3, 3, 4, 4) + (s.surge >= 2 ? 1 : 0), seq = [];
        // 순서: 한 판에 왼쪽·오른쪽이 모두 나오고, 같은 쪽은 두 번까지만 연달아
        do {
          seq.length = 0;
          for (let i = 0; i < n; i++) {
            const run2 = i >= 2 && seq[i - 1] === seq[i - 2];
            seq.push(run2 ? 1 - seq[i - 1] : (Math.random() < 0.5 ? 0 : 1));
          }
        } while (!seq.includes(0) || !seq.includes(1));
        st.busy = true;
        // 깜빡임: 천천히 한쪽씩
        for (const side of seq) {
          s.area({ x: side * half, y: 0, w: half, h: s.H, warn: 34, dur: 0, color: side ? '#7fd8ff' : '#ff8ad8', pulse: true });
          s.sound(side ? 'dreamR' : 'dreamL');
          yield s.lv(56, 50, 46, 42, 40);
        }
        yield 60;   // 1초 뒤
        // 휩쓸기: 순서대로 그 절반을 위에서 아래로 빠른 탄 네 줄이 훑음(탄 사이 10px라 빠져나갈 틈 없음)
        for (let i = 0; i < seq.length; i++) {
          const side = seq[i];
          // 같은 쪽이 연달아 휩쓸리면 앞 탄 벽이 지나간 뒤에 다음 벽(겹치지 않게)
          if (i > 0 && seq[i - 1] === side) yield 40;
          s.sound(side ? 'dreamR' : 'dreamL'); s.shake(3);
          // 휩쓸기는 가운데 선을 6px 넘어 반대쪽까지 덮음(가운데 선 위에 서서 두 쪽을 다 피하지 못하게)
          const x0 = side ? half - 6 : 5, x1 = side ? s.W - 5 : half + 6;
          for (let r = 0; r < 4; r++) for (let x = x0; x <= x1; x += 10)
            s.fire({ x, y: -10 - r * 12, ang: Math.PI / 2, spd: s.sp(8), shape: 'small', color: side ? 'cyan' : 'pink', marginTop: 80 });
          yield s.lv(52, 46, 42, 40, 38);
        }
        st.busy = false;
        yield s.wait(50);
      }
    },
  },
  {
    name: '논스펠 · 진',
    type: 'nonspell', boss: '진', bossColor: '#c07cff', hp: 1800, time: 34, start: [192, 100],
    *run(s) {
      // 결정: 보라 결정 탄 부채꼴이 날아가다 멈춰 섰다가 세 갈래로 갈라져 흩어짐 + 훑기(잠금 뒤 조준) 쌀알탄
      const scan = nymphScan(s);
      for (let k = 0; ; k++) {
        const a = scan.sweep();
        s.spread(s.lv(3, 5, 5, 7, 7), a, 0.3, { spd: s.sp(2.6), accel: -0.05, minSpd: 0, shape: 'star', color: 'purple',
          fn: (b, s) => { if (b.spd === 0 && !b.data.split) { b.data.split = true; b.dead = true; s.spread(3, b.ang, 0.5, { x: b.x, y: b.y, spd: s.sp(1.3), shape: 'small', color: 'purple', fixed: true }); } } });
        yield s.wait(26);
        s.fire({ ang: scan.sweep(), spd: s.sp(3), shape: 'rice', color: 'white' });
        yield s.wait(26);
        if (k % 5 === 4) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「승화」(가칭)',
    type: 'spell', boss: '진', bossColor: '#c07cff', hp: 2100, time: 42, start: [192, 80],
    *run(s) {
      // 승화: 보라 결정 탄이 화면 위쪽 여기저기에 박혀 멈춰 있다가(약 2초) 증기처럼 느리게 흩어지는 알갱이로 바뀜.
      // 결정은 기체에서 80px 넘게 떨어진 곳에만 박힘. 잠금 뒤에는 결정이 기체 쪽으로 조금 치우쳐 박힘
      const scan = nymphScan(s);
      for (let w = 0; ; w++) {
        for (let i = 0; i < s.lv(4, 5, 6, 7, 7); i++) {
          let tx, ty, tries = 0;
          do {
            tx = scan.locked ? s.player.x + s.rand(-160, 160) : s.rand(30, s.W - 30);
            ty = s.rand(60, s.H * 0.55);
          } while (Math.hypot(tx - s.player.x, ty - s.player.y) < 80 && ++tries < 20);
          tx = Math.max(20, Math.min(s.W - 20, tx));
          const T = 30;
          s.fire({ x: s.boss.x, y: s.boss.y, vx: (tx - s.boss.x) / T, vy: (ty - s.boss.y) / T, shape: 'big', color: 'purple',
            fn: (b, s) => {
              if (b.t === T) { b.vx = 0; b.vy = 0; }
              if (b.t === T + 120) {
                b.dead = true;
                for (let j = 0; j < s.lv(6, 7, 8, 9, 10); j++) {
                  const ph = s.rand(0, s.TAU);
                  s.fire({ x: b.x, y: b.y, ang: s.rand(0, s.TAU), spd: s.rand(0.5, 1.0) * s.sp(1), shape: 'small', color: 'purple',
                    fn: c => { c.ang += Math.sin(c.t * 0.05 + ph) * 0.02; } });
                }
              }
            } });
          yield 8;
        }
        yield s.wait(90);
        if (w % 3 === 2) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「연쇄 반응」(가칭)',
    type: 'spell', strong: true, boss: '진', bossColor: '#c07cff', hp: 2200, time: 44, start: [192, 90],
    *run(s) {
      // 연쇄 반응: 진이 주황 탄과 파랑 탄을 서로 반대로 도는 나선으로 뿌림. 두 색 탄이 맞닿은 자리에 예고 표시가 뜨고
      // 약 0.4초 뒤 작은 원형 폭발(두 탄은 그 자리에서 사라짐). 잠금 뒤에는 조준탄을 섞음
      const scan = nymphScan(s);
      s.task(function* () {
        for (;;) {
          const bs = s.bullets, org = bs.filter(b => b.color === 'orange' && !b.data.gone), blu = bs.filter(b => b.color === 'blue' && !b.data.gone);
          let n = 0;
          for (const o of org) {
            for (const u of blu) {
              if (u.data.gone || Math.abs(o.x - u.x) > 9 || Math.abs(o.y - u.y) > 9) continue;
              o.data.gone = u.data.gone = true; o.dead = u.dead = true;
              const x = (o.x + u.x) / 2, y = (o.y + u.y) / 2;
              if (Math.hypot(x - s.player.x, y - s.player.y) < 40) break;   // 기체 코앞에서는 터지지 않음
              s.mark({ x, y, dur: 24 });
              s.task(function* () { yield 24; s.ring(s.lv(6, 6, 8, 8, 10), { x, y, offset: s.rand(0, s.TAU), spd: s.sp(1.5), shape: 'small', color: 'yellow' }); }());
              n++;
              break;
            }
            if (n >= 3) break;
          }
          yield 2;
        }
      }());
      let a = 0;
      for (let k = 0; ; k++) {
        a += s.spin(0.12);
        for (let i = 0; i < 3; i++) {
          s.fire({ ang: a + i * s.TAU / 3, spd: s.sp(1.7), angVel: 0.004, shape: 'orb', color: 'orange' });
          s.fire({ ang: -a + i * s.TAU / 3 + 0.5, spd: s.sp(1.7), angVel: -0.004, shape: 'orb', color: 'blue' });
        }
        if (scan.locked && k % 12 === 6) s.spread(3, scan.sweep(), 0.2, { spd: s.sp(2.6), shape: 'rice', color: 'white', fixed: true });
        yield s.lv(9, 8, 7, 7, 6);
        if (k % 60 === 59) yield* s.wander(40, 50);
      }
    },
  },
  // ── 5스테이지 · 세라프: 아즈라엘(보스). 이즘의 시뮬레이션이 불러낸 사본이라 실루엣과 모티브 문자만, 대사 없음 ──
  // 모티브 문자 아인(ע): 눈·보다·빛. 탄은 빛나는 검은색(void)과 흰색 위주
  {
    name: '논스펠 · 아즈라엘 1',
    type: 'nonspell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 2400, time: 38, start: [192, 90],
    *run(s) {
      // 보슬비: 위에서 흰·검은 빗방울이 천천히 흔들리며 내려옴. 두 줄기의 비가 박자를 달리해 엇갈려 내림
      s.task(azRain(s, { every: 14, spd: 1.1 }));
      s.task(azRain(s, { every: 22, spd: 0.8, shape: 'orb', color: 'void', sway: 0.5 }));
      for (let w = 0; ; w++) {
        yield s.wait(90);
        if (s.diff >= 3) s.fire({ ang: s.aim(), spd: s.sp(2.2), shape: 'rice', color: 'white' });
        if (w % 3 === 2) yield* s.wander(50, 60);
      }
    },
  },
  {
    name: '「명암」(가칭)',
    type: 'spell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 3000, time: 48, start: [192, 70],
    *run(s) {
      // 명암: 화면 위에 검은 구슬 줄과 흰 구슬 줄이 번갈아 한 줄씩 쭉 깔려 내려옴. 검은 줄은 오른쪽으로, 흰 줄은 왼쪽으로 흘러
      // 이웃한 줄이 서로 엇갈려 지나가므로 틈이 계속 바뀜. 구슬 사이 44px(판정 사이 약 28px), 줄 사이 약 45~50px라
      // 비스듬히 줄 사이를 타고 내려가거나 올라가며 틈으로 빠져나감. 두 줄마다 아즈라엘이 가벼운 흰 조준 부채꼴
      const gap = 44;
      for (let w = 0; ; w++) {
        const dark = w % 2 === 0, dir = dark ? 1 : -1, off = s.rand(0, gap);
        for (let x = off - gap; x < s.W + gap; x += gap)
          s.fire({ x, y: -8, vx: dir * 0.55, vy: s.sp(0.75), shape: 'orb', color: dark ? 'void' : 'white', margin: 70 });
        if (!dark) s.spread(3, s.aim(), 0.22, { spd: s.sp(2.2), shape: 'rice', color: 'white', fixed: true });
        yield s.lv(72, 64, 60, 56, 52);
        if (w % 8 === 7) yield* s.wander(40, 50);
      }
    },
  },
  {
    name: '논스펠 · 아즈라엘 2',
    type: 'nonspell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 2500, time: 38, start: [192, 100],
    *run(s) {
      // 빗방울 부채: 보스가 아래쪽으로 넓게 느린 흰 부채를 흩뿌리고(부채마다 조금씩 돌아간 자리), 위에서는 검은 빗방울이 내림
      s.task(azRain(s, { every: 16, spd: 0.9, shape: 'orb', color: 'void', sway: 0.45 }));
      for (let w = 0; ; w++) {
        const n = s.cnt(13), base = Math.PI / 2 + Math.sin(w * 0.7) * 0.3;
        for (let i = 0; i < n; i++) s.fire({ ang: base + (i - (n - 1) / 2) * 0.2, spd: s.sp(0.9), accel: 0.004, maxSpd: s.sp(1.3), shape: 'rice', color: 'white' });
        yield s.wait(46);
        if (w % 5 === 4) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「섬광」(가칭)',
    type: 'spell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 3100, time: 50, start: [192, 110],
    *run(s) {
      // 섬광: 보스가 빛을 모으는 동안 방사형 예고선 → 흰 레이저가 사방으로 뻗은 채 켜져 있음.
      // 레이저를 켠 채로 천천히 반 바퀴 돌리고, 잠깐 멈췄다가 270도 더 돌린 뒤 걷힘. 도는 방향은 매번 무작위.
      // 도는 속도는 화면 끝(보스에서 약 350px)에서도 틈이 약 2.3px/프레임으로 움직일 만큼 느림. 보스에 가까울수록 더 느림.
      // 그사이 위에서 검은 비가 천천히 내림
      s.task(azRain(s, { every: 18, spd: 0.9, shape: 'orb', color: 'void', sway: 0.4 }));
      const omega = 0.0065;
      for (let w = 0; ; w++) {
        const n = s.lv(6, 6, 8, 8, 8) + s.surge, off = s.rand(0, s.TAU), warn = s.lv(60, 56, 50, 46, 44), st = { rot: 0 };
        const turn1 = Math.PI, turn2 = Math.PI * 1.5, pause = 40;
        const om = s.spin(omega), f1 = Math.round(turn1 / om), f2 = Math.round(turn2 / om), total = f1 + pause + f2;   // 격화되면 더 빨리 돎
        s.boss.glow = warn;
        for (let i = 0; i < n; i++) {
          s.laser({ x: s.boss.x, y: s.boss.y, ang: off + i * s.TAU / n, len: 700, w: 14, warn, dur: total, color: 'white',
            fn: l => { l.ang = off + i * s.TAU / n + st.rot; l.x = s.boss.x; l.y = s.boss.y; } });
        }
        yield warn;
        const d1 = Math.random() < 0.5 ? -1 : 1;
        for (let t = 0; t < f1; t++) { st.rot += d1 * om; yield 1; }
        yield pause;
        const d2 = Math.random() < 0.5 ? -1 : 1;
        for (let t = 0; t < f2; t++) { st.rot += d2 * om; yield 1; }
        yield 20;
        if (s.diff >= 3) s.spread(3, s.aim(), 0.2, { spd: s.sp(2.6), shape: 'rice', color: 'white' });
        yield s.wait(60);
      }
    },
  },
  {
    name: '논스펠 · 아즈라엘 3',
    type: 'nonspell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 2100, time: 36, start: [192, 90],
    *run(s) {
      // 잔상: 기체 양옆을 스쳐 지나가는 검은 조준탄 둘(기체 쪽 ±0.28)이 지나간 자리에 흰 잔상이 남았다가 천천히 흘러내림.
      // 잔상은 기체가 선 세로줄 양옆에만 떨어져 보스 밑에서 쏘던 자리가 막히지 않음. 두 번에 한 번은 잔상 없는 조준탄 한 발로 조금씩 비키게 함
      for (let w = 0; ; w++) {
        const a0 = s.aim();
        for (const side of [-1, 1]) {
          s.fire({ ang: a0 + side * 0.28, spd: s.sp(2.4), shape: 'orb', color: 'void',
            // 잔상은 기체 쪽 세로줄에서 옆으로 약 25px 넘게 벌어진 뒤(보스 밑이 막히지 않게)부터 1초 동안 16프레임마다
            fn: (b, s) => { const lat = Math.abs(Math.sin(b.ang - a0) * Math.hypot(b.x - s.boss.x, b.y - s.boss.y)); if (lat > 25 && b.t < 100 && b.t % 16 === 8) s.fire({ x: b.x, y: b.y, ang: Math.PI / 2, spd: 0.2, accel: 0.012, maxSpd: s.sp(1.0), shape: 'small', color: 'white' }); } });
        }
        if (w % 2) s.fire({ ang: a0, spd: s.sp(2.6), shape: 'orb', color: 'void' });
        yield s.wait(46);
        if (w % 2) s.ring(s.cnt(12), { offset: s.rand(0, s.TAU), spd: s.sp(1.4), shape: 'rice', color: 'white' });
        if (w % 4 === 3) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「검은 안개」(가칭)',
    type: 'spell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 3100, time: 52, start: [192, 80],
    *run(s) {
      // 보스 양옆을 검은 안개로 막아 들어갈 수 없는 구역을 만듦(판정 있음). 안개는 화면 맨 위부터 바닥까지 이어진 한 덩어리이고
      // 안쪽 가장자리가 물결처럼 일렁임(최대 14px, 통로는 가장 좁을 때도 헬 기준 약 88px). 남는 곳은 보스 밑 세로 통로뿐.
      // 판정은 10px 가로 띠로 이어 붙여 보이는 가장자리를 따라감. 안개가 서 있는 동안 통로로 흰 비가 드문드문 내리는데
      // 점점 빨라짐(1.0 → 1.5, 거기서 멈춤). 안개 속에서는 검은 탄이 가끔 튀어나와 통로 쪽으로 천천히 날아옴.
      // 안개는 1초 예고(깜빡이는 가장자리) 뒤 짙어지고, 보스가 옮기면 다시 깔림
      for (let w = 0; ; w++) {
        yield* s.moveTo(s.rand(140, s.W - 140), s.rand(70, 100), 40);
        const cx = s.boss.x, gap = s.lv(84, 74, 66, 62, 58), bottom = s.H;
        const warn = 60, dur = s.lv(330, 360, 390, 400, 420), sh = 10, strips = [], groups = { '-1': {}, '1': {} };
        for (let y = 0; y < bottom; y += sh) for (const side of [-1, 1]) {
          const a = s.area({ x: 0, y, w: 1, h: Math.min(sh, bottom - y), warn, dur, color: '#16141f', fog: true, edge: side < 0 ? 'right' : 'left', group: groups[side] });
          strips.push({ a, side, y });
        }
        // 안개 가장자리 일렁임(스펠이 끝나면 작업도 함께 멈춤)
        const wave = s.task(function* () {
          for (let t = 0; ; t++) {
            for (const st of strips) {
              const wob = 14 * Math.sin(st.y * 0.03 + t * 0.035 + (st.side < 0 ? 0 : 1.7));
              if (st.side < 0) { st.a.x = 0; st.a.w = Math.max(1, cx - gap + wob); }
              else { st.a.x = cx + gap - wob; st.a.w = Math.max(1, s.W - st.a.x); }
            }
            yield 1;
          }
        }());
        s.sound('beep', 0.2);
        yield warn;
        // 점점 빨라지는 성긴 비와 안개 속에서 가끔 튀어나오는 검은 탄
        let t0 = 0;
        const rain = s.task(azRain(s, { every: 20, spd: () => 1.0 + 0.5 * Math.min(1, t0 / dur), shape: 'rice', color: 'white', sway: 0.3, x0: cx - gap + 18, x1: cx + gap - 18 }));
        for (; t0 < dur; t0 += s.wait(44)) {
          const st = s.pick(strips.filter(q => q.y < s.H * 0.6)), ex = st.side < 0 ? st.a.x + st.a.w - 10 : st.a.x + 10, ey = st.y + 5;
          s.fire({ x: ex, y: ey, ang: st.side < 0 ? 0.35 : Math.PI - 0.35, spd: 0.5, accel: 0.012, maxSpd: s.sp(1.3), shape: 'orb', color: 'void' });
          if (s.diff >= 3 && (t0 / 44 | 0) % 3 === 0) s.fire({ ang: s.aim(), spd: s.sp(2.2), shape: 'orb', color: 'void' });
          yield s.wait(44);
        }
        rain.return(); wave.return();
        yield 30;
      }
    },
  },
  {
    name: '「아인」(가칭)',
    type: 'spell', strong: true, boss: '아즈라엘', bossColor: '#e8e8f4', hp: 5600, time: 84, start: [192, 70],
    *run(s) {
      // 아인(눈·보다·빛): 아즈라엘이 느린 검은 구슬 원형탄을 계속 풀어 놓고, 눈에서 나온 시선(빛줄기, 판정 없음)이
      // 화면 아래쪽을 한쪽 끝에서 반대쪽 끝까지 약 3초에 걸쳐 쓸어 감(판마다 방향이 바뀜). 시선에 닿은 검은 구슬은 노란 빛 탄이 되어
      // 잠깐 멈칫한 뒤 그 순간의 기체 자리로 날아듦. 기체에서 80px 안의 구슬은 바뀌지 않음(코앞에서 튀지 않게).
      // 시선이 어디를 지나갈지 읽고, 빛 탄이 모여드는 자리에서 비켜 남. 격화 III부터는 시선이 둘(서로 반대쪽에서 쓸어 옴)
      s.title('ע', '#e8e8f4');
      s.task(function* () {
        for (let k = 0; ; k++) {
          s.ring(s.cnt(14), { offset: k * 0.21, spd: s.sp(0.75), angVel: (k % 2 ? 1 : -1) * 0.0015, shape: 'orb', color: 'void' });
          yield s.wait(44);
        }
      }());
      yield 90;
      const lo = 0.2, hi = Math.PI - 0.2;
      for (let w = 0; ; w++) {
        const two = s.surge >= 2, sweep = s.lv(200, 190, 180, 170, 165), warn = 50;
        const beams = [];
        for (const rev of two ? [false, true] : [false]) {
          const from = (w % 2 === 0) !== rev ? lo : hi, to = from === lo ? hi : lo, st = { ang: from };
          const l = s.laser({ x: s.boss.x, y: s.boss.y, ang: from, len: 700, w: 16, warn, dur: sweep, color: 'white', light: true,
            fn: l => { l.x = s.boss.x; l.y = s.boss.y; l.ang = st.ang; } });
          beams.push({ st, from, to, l });
        }
        s.boss.glow = warn + sweep;
        s.sound('beep', 0.3);
        yield warn;
        for (let t = 0; t <= sweep; t++) {
          for (const bm of beams) {
            bm.st.ang = bm.from + (bm.to - bm.from) * (t / sweep);
            const cx = Math.cos(bm.st.ang), cy = Math.sin(bm.st.ang), bx = s.boss.x, by = s.boss.y;
            for (const b of s.bullets) {
              if (b.color !== 'void' || b.lit) continue;
              const rx = b.x - bx, ry = b.y - by, along = rx * cx + ry * cy;
              if (along < 20 || Math.abs(rx * cy - ry * cx) > 9) continue;
              if (Math.hypot(b.x - s.player.x, b.y - s.player.y) < 80) continue;
              b.lit = true; b.color = 'yellow'; b.angVel = 0;
              b.ang = Math.atan2(s.player.y - b.y, s.player.x - b.x); b.spd = 0; b.accel = 0.04; b.maxSpd = s.sp(1.9);
            }
          }
          yield 1;
        }
        yield s.wait(50);
        if (w % 3 === 2) yield* s.wander(40, 50);
      }
    },
  },
  {
    name: '논스펠 · 예로니모 1',
    type: 'nonspell', boss: '예로니모', bossColor: '#e8e0c8', hp: 2800, time: 42, start: [192, 100],
    *run(s) {
      for (let w = 1; ; w++) {
        // 황금 사슬 부채꼴: 줄마다 고리 4개가 속도 차로 늘어져 사슬처럼 보임
        const a = s.aim(), rows = s.lv(3, 5, 7);
        for (let i = 0; i < rows; i++) for (let k = 0; k < 4; k++) s.fire({ ang: a + (i - (rows - 1) / 2) * 0.22, spd: s.sp(1.8 + k * 0.4), shape: 'link', color: 'gold' });
        yield s.wait(45);
        s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'small', color: 'white' });
        yield s.wait(45);
        if (w % 3 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고',
    type: 'spell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3400, time: 45, start: [192, 100],
    *run(s) {
      for (let cycle = 0; ; cycle++) {
        const light = s.task(function* () {
          for (;;) { s.spread(s.lv(1, 3, 3), s.aim(), 0.3, { spd: s.sp(2), shape: 'small', color: 'white' }); yield s.wait(40); }
        }());
        yield* castGap(s);
        yield* s.chant('SPIRITUS1', { by: s.boss });
        light.return();
        // 골든타임을 억지로 근소하게 늘리는 술식 → 이 스펠의 제한시간이 조금 늘어남(최대 3번)
        if (cycle < 3) s.extendTime(5);
        // 등불이 내려오며 불씨를 흘림
        // 등불이 내려오며 불씨를 흘림. 그사이 보스는 조준탄
        const lamps = [], n = s.lv(3, 4, 5, 5, 6);
        for (let i = 0; i < n; i++) lamps.push(s.fire({ ang: Math.PI / 2 + (i - (n - 1) / 2) * 0.4, spd: 2.2, accel: -0.04, minSpd: 0.25, shape: 'big', color: 'orange' }));
        for (let t = 0; t < 8; t++) {
          for (const L of lamps) if (!L.dead) s.ring(s.lv(4, 6, 7, 8, 8), { x: L.x, y: L.y, offset: t * 0.4, spd: s.sp(1.3), shape: 'small', color: 'orange' });
          yield 20;
        }
        // 꺼져 감: 흐려지며 멈춤. 판정은 남으므로 완전히 사라지지 않게 35%까지만. 그동안 보스의 느린 원형탄
        for (let t = 0; t < 60; t++) {
          for (const L of lamps) { L.alpha = 1 - 0.65 * t / 60; L.spd *= 0.95; }
          yield 1;
        }
        yield 20;
        // 꺼지지 아니하나니: 다시 타올라 흩어짐
        for (const L of lamps) {
          if (L.dead) continue;
          s.ring(s.cnt(16), { x: L.x, y: L.y, offset: s.rand(0, s.TAU), spd: 0.6, accel: 0.03, maxSpd: s.sp(2.4), shape: 'rice', color: 'yellow' });
          L.dead = true;
          yield 8;
        }
        yield 60;
      }
    },
  },
  {
    name: '논스펠 · 예로니모 2',
    type: 'nonspell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3000, time: 42, start: [192, 110],
    *run(s) {
      // 도는 사슬 팔(고리 사이 간격을 넓혀 팔을 가로지를 수 있음, 약 2.5초마다 도는 방향이 바뀜) + 노말 이상에서 반대로 도는 가는 팔 셋
      // + 조준 칼날 + 가끔 느린 원형탄
      let a = 0, b = Math.PI / 3;
      for (let f = 0; ; f++) {
        a += s.spin(0.05) * (Math.floor(f / 40) % 2 ? -1 : 1);
        b -= s.spin(0.06);
        const arms = s.arms(s.lv(3, 3, 4, 4, 4));   // 격화마다 팔 하나씩 더
        for (let i = 0; i < arms; i++) s.fire({ ang: a + i * s.TAU / arms, spd: s.sp(2.4), shape: 'link', color: 'gold' });
        if (s.diff >= 1 && f % 2 === 0) for (let i = 0; i < 3; i++) s.fire({ ang: b + i * s.TAU / 3, spd: s.sp(1.8), shape: 'small', color: 'yellow' });
        if (f % 5 === 0) s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.15, { spd: s.sp(4), shape: 'knife', color: 'white' });
        if (f % 40 === 39) yield* s.wander(40, 50);
        yield s.lv(11, 10, 9, 9, 8);   // 팔마다 고리 사이 간격(약 25% 넓힘)
      }
    },
  },
  {
    name: '파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라',
    type: 'spell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3400, time: 52, start: [192, 100],
    *run(s) {
      for (;;) {
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(10), { offset: k * 0.3, spd: s.sp(1.4), shape: 'small', color: 'white' }); yield s.wait(35); }
        }());
        yield* castGap(s);
        yield* s.chant('PATER1', { by: s.boss });
        light.return();
        // 황금빛 오른손으로 던진 큰 탄이 멈춰 선 자리에서 사슬 고리가 두 겹으로 번져 나감(붙드는 손).
        // 던지는 동안에도 조준 쌀알탄을 쏴서, 고리가 번지는 틈을 찾으며 움직여야 함
        s.boss.glow = 260;
        const aimT = s.task(function* () {
          for (let k = 0; ; k++) {
            yield s.wait(14);
            s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.2, { spd: s.sp(2.6), shape: 'rice', color: 'gold' });
          }
        }());
        for (let k = 0; k < s.lv(3, 4, 5, 5, 6); k++) {
          s.fire({
            ang: s.aim() + s.rand(-0.35, 0.35), spd: 5, accel: -0.1, minSpd: 0, shape: 'big', color: 'gold',
            fn: (b, s) => {
              if (b.spd > 0) return;
              b.dead = true;
              s.ring(s.cnt(20), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: 0.6, accel: 0.03, maxSpd: s.sp(2.4), shape: 'link', color: 'gold' });
              s.ring(s.cnt(14), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: 0.4, accel: 0.02, maxSpd: s.sp(1.6), shape: 'small', color: 'yellow' });
              s.shake(2);
            },
          });
          yield 22;
        }
        yield 50;
        aimT.return();
        yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '논스펠 · 예로니모 3',
    type: 'nonspell', boss: '예로니모', bossColor: '#e8e0c8', hp: 2900, time: 42, start: [192, 110],
    *run(s) {
      // 사슬 고리 두 겹: 보스 둘레를 서로 반대로 돌며 원을 넓히다가 풀려 나감. 두 겹의 속도가 달라 엇갈리며 그물눈 같은 틈이 생김.
      // 고리가 풀려 나가는 사이 조준 칼날을 세 번
      for (let w = 1; ; w++) {
        const cx = s.boss.x, cy = s.boss.y;
        for (const dir of [1, -1]) {
          const n = s.cnt(22), a0 = s.rand(0, s.TAU), out = dir > 0 ? s.sp(2.2) : s.sp(1.5);
          for (let i = 0; i < n; i++) {
            const base = a0 + i * s.TAU / n;
            s.fire({
              x: cx, y: cy, spd: 0, shape: 'link', color: dir > 0 ? 'gold' : 'yellow',
              fn: b => {
                if (b.t < 50) {
                  const r = 20 + b.t * 1.4, a = base + dir * b.t * 0.05;
                  b.x = cx + Math.cos(a) * r; b.y = cy + Math.sin(a) * r; b.ang = a + dir * Math.PI / 2;
                } else if (b.t === 50) { b.ang = base + dir * 2.85; b.spd = out; }
              },
            });
          }
          yield s.wait(14);
        }
        for (let k = 0; k < 2; k++) { s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.18, { spd: s.sp(3.4), shape: 'knife', color: 'white' }); yield s.wait(12); }
        yield s.wait(14);
        if (w % 4 === 0) yield* s.wander();
      }
    },
  },
  {
    name: 'Clavis Collata — NUNC DIMITTIS · 후반',
    type: 'spell', follow: true, boss: '예로니모', bossColor: '#e8e0c8', hp: 2600, time: 48, start: [192, 90],
    *run(s) {
      // NUNC DIMITTIS 뒤 단계(앞 단계와 한 체력바, 다시 선언하지 않음). 쇄도하는 쇠사슬: 화면 가장자리(위·왼쪽·오른쪽) 여기저기서 황금 사슬이 기체의 0.5초 전 자리를 향해 짧은 예고선 뒤 연달아 뻗음.
      // 계속 움직이지 않으면 걸림(으아악! 도망쳐!). 가끔 사슬 머리 한두 개가 뱀처럼 기체를 쫓아오며 고리를 흘림(머리 속도 2로 고정, 고속 이동으로 떼어 놓을 수 있음).
      // 사슬 사이 간격은 스펠이 진행될수록 짧아지다가 한계에서 멈춤(s.wait의 압박 곡선)
      const hist = [];
      s.task(function* () { for (;;) { hist.push({ x: s.player.x, y: s.player.y }); if (hist.length > 60) hist.shift(); yield 1; } }());
      const past = () => hist[Math.max(0, hist.length - 31)] || s.player;
      const edge = () => {
        const side = s.randInt(0, 2);
        return side === 0 ? { x: -8, y: s.rand(20, s.H * 0.7) } : side === 1 ? { x: s.W + 8, y: s.rand(20, s.H * 0.7) } : { x: s.rand(20, s.W - 20), y: -8 };
      };
      // 추적 사슬: 머리가 기체를 향해 조금씩 꺾으며 달려오고, 지나간 자리에 잠깐 남는 고리를 흘림
      const snake = () => {
        const o = edge(), head = s.fire({ x: o.x, y: o.y, ang: Math.atan2(s.player.y - o.y, s.player.x - o.x), spd: 2, shape: 'big', color: 'gold', margin: 40,   // 머리 속도는 난이도·격화와 상관없이 2(고속 이동 3.6으로 떼어 놓음)
          fn: (b, s) => {
            const want = Math.atan2(s.player.y - b.y, s.player.x - b.x), da = ((want - b.ang + Math.PI * 3) % s.TAU) - Math.PI;
            b.ang += Math.max(-0.03, Math.min(0.03, da));
            if (b.t % 5 === 0) s.fire({ x: b.x, y: b.y, ang: b.ang, spd: 0, shape: 'link', color: 'gold', fn: c => { if (c.t > 45) c.dead = true; } });
            if (b.t > 150) b.dead = true;
          } });
        return head;
      };
      s.task(function* () {
        yield 180;
        for (;;) { snake(); if (s.diff >= 2 && Math.random() < 0.5) { yield 20; snake(); } yield s.wait(240); }
      }());
      yield 30;
      for (let k = 0; ; k++) {
        const n = k % 4 === 3 ? 2 : 1;
        for (let j = 0; j < n; j++) {
          const o = edge(), t = past(), warn = s.lv(36, 32, 30, 30, 30);   // 베리하드·헬도 예고 0.5초
          s.chain({ x: o.x, y: o.y, ang: Math.atan2(t.y - o.y, t.x - o.x), len: 760, warn, shoot: 8, hold: 8, retract: 28 });
        }
        yield Math.max(28, s.wait(s.lv(36, 32, 30, 30, 30)));   // 사슬 사이 간격(최소 약 0.47초)
      }
    },
  },
  {
    name: '파테르 제2식 — 능히 일어나지 못하게 하리니',
    type: 'spell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3200, time: 52, start: [192, 100],
    *run(s) {
      // 예로니모의 파테르 제2식: 기체 근처(기체에서 70~110px 떨어진 곳, 보스 쪽으로 치우침)로 돌진해 멈춘 자리에서 황금 사슬을
      // 사방으로 뻗어 붙들어 둠(사슬 사이 대각선 방향이 틈). 돌진은 판마다 2~3번이고 돌진 사이 쉬는 틈이 김.
      // 사슬이 뻗어 있는 동안 조준탄이 이어지고, 걷힐 때 원형탄 두 겹
      for (;;) {
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.27, spd: s.sp(1.5), shape: 'small', color: 'white' }); yield s.wait(34); }
        }());
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 50 });
        light.return();
        for (let k = 0; k < s.lv(2, 2, 3, 3, 3); k++) {
          // 돌진할 자리: 기체에서 보스 쪽으로 ±1라디안 안의 방향으로 70~110px 떨어진 곳(화면 아래쪽 160px 안으로는 내려가지 않음)
          const px = s.player.x, py = s.player.y, th = Math.atan2(s.boss.y - py, s.boss.x - px) + s.rand(-1, 1), r = s.rand(70, 110);
          const tx = Math.max(30, Math.min(s.W - 30, px + Math.cos(th) * r)), ty = Math.max(60, Math.min(s.H - 160, py + Math.sin(th) * r));
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: s.lv(48, 40, 34) });
          yield* hardAim(s, s.lv(48, 40, 34), 'yellow');
          s.boss.contact = true;
          yield* s.moveTo(tx, ty, 20);
          s.boss.contact = false;
          s.impact(7);
          const n = s.lv(6, 9, 11, 11, 13), off = s.rand(0, s.TAU), warn = s.lv(45, 40, 34);   // 사슬 수: 이지 그대로, 노말부터 하나씩 더
          for (let i = 0; i < n; i++) s.chain({ x: tx, y: ty, ang: off + i * s.TAU / n, len: 520, warn, shoot: 10, hold: 14, retract: 70 });
          // 하드부터: 첫 사슬이 뻗은 뒤 그 사이(반 칸 돌아간 자리)로 두 번째 사슬이 한 번 더 뻗음
          if (s.diff >= 2) s.task(function* () { yield warn + 14; for (let i = 0; i < n; i++) s.chain({ x: tx, y: ty, ang: off + (i + 0.5) * s.TAU / n, len: 520, warn: 30, shoot: 10, hold: 10, retract: 60 }); }());
          yield warn + 30;   // 사슬이 뻗은 동안은 본체가 쏘지 않음(사슬에 집중)
          s.ring(s.cnt(24), { offset: off + Math.PI / n, spd: 0.5, accel: 0.03, maxSpd: s.sp(2.3), shape: 'orb', color: 'gold' });
          s.ring(s.cnt(14), { offset: off, spd: 0.3, accel: 0.02, maxSpd: s.sp(1.4), shape: 'small', color: 'yellow' });
          yield 40;
          s.move(s.rand(140, 244), s.rand(80, 110), 40);
          yield 60;   // 돌진 사이 쉬는 틈
        }
        yield 30;
      }
    },
  },
  {
    name: 'Clavis Collata — NUNC DIMITTIS',
    type: 'spell', strong: true, cutinShot: '120', boss: '예로니모', bossColor: '#e8e0c8', hp: 3000, time: 52, start: [192, 100],
    *run(s) {
      // 전조: 고유 클라비스 영창. 읊는 동안은 느린 원형탄만
      const light = s.task(function* () {
        for (let k = 0; ; k++) { s.ring(s.cnt(12), { offset: k * 0.3, spd: s.sp(1.3), shape: 'small', color: 'gold' }); yield s.wait(40); }
      }());
      yield* s.chant('NUNC_DIMITTIS', { by: s.boss, step: 29 });   // 영창 10% 빠르게
      light.return();
      // 화면 가장자리의 한 점에서 목표점을 지나는 사슬. 목표를 주지 않으면 필드 안 무작위 지점
      function edgeChain(target) {
        const side = s.randInt(0, 2);
        const x = side === 0 ? -8 : side === 1 ? s.W + 8 : s.rand(20, s.W - 20);
        const y = side === 2 ? -8 : s.rand(20, s.H * 0.8);
        const tx = target ? target.x : s.rand(40, s.W - 40), ty = target ? target.y : s.rand(s.H * 0.4, s.H - 30);
        s.chain({ x, y, ang: Math.atan2(ty - y, tx - x), len: 720, warn: s.lv(70, 60, 50), shoot: 12, hold: 16, retract: 110 });
      }
      for (let w = 0; ; w++) {
        const n = Math.min(s.lv(5, 6, 6) + w, s.lv(7, 8, 9));   // 사슬 수를 두 차례 늘림(처음 +3, 최대 +4)
        for (let i = 0; i < n; i++) {
          edgeChain(i === 0 ? { x: s.player.x, y: s.player.y } : null);   // 첫 사슬은 플레이어 조준
          yield 5;
        }
        yield s.lv(70, 60, 50) - 5;
        // 사슬이 뻗어 있는 동안 탄막: 원형탄이 한 방향으로 조금씩 돌며 이어지고, 조준탄을 섞음
        for (let k = 0; k < 10; k++) {
          if (k % 3 === 0) s.ring(s.cnt(12), { offset: k * 0.13, spd: s.sp(1.7), shape: 'orb', color: 'yellow' });   // 큰 패턴이라 본체 탄은 가볍게
          yield 14;
        }
        yield 10;
        if (w % 3 === 2) yield* s.wander();
      }
    },
  },
  // ── 엑스트라 · 진심 예로니모: 6스테이지와 같은 술식을 다른 모양으로 ──
  {
    name: '논스펠 · 예로니모 1',
    type: 'nonspell', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 2800, time: 42, start: [192, 100],
    *run(s) {
      // 사슬 채찍: 고리 줄기를 부채처럼 휘둘러 쓸어 냄(좌→우, 우→좌 번갈아). 속도가 다른 두 줄이라 줄 사이가 틈.
      // 한 번 휘두를 때마다 조준 칼날
      for (let w = 0; ; w++) {
        const dir = w % 2 ? -1 : 1, base = s.aim() - dir * 1.1;
        for (let t = 0; t < 24; t++) {
          const a = base + dir * t * 0.095;
          s.fire({ ang: a, spd: s.sp(2.6), shape: 'link', color: 'gold' });
          if (t % 2 === 0) s.fire({ ang: a + dir * 0.05, spd: s.sp(1.8), shape: 'link', color: 'yellow' });
          yield 2;
        }
        s.spread(s.lv(3, 3, 5, 5, 7), s.aim(), 0.16, { spd: s.sp(3.6), shape: 'knife', color: 'white' });
        yield s.wait(26);
        if (w % 2 === 1) s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.5), shape: 'small', color: 'white' });
        if (w % 6 === 5) yield* s.wander();
      }
    },
  },
  {
    name: '스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고',
    type: 'spell', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 3400, time: 45, start: [192, 90],
    *run(s) {
      // 등불이 화면 가운데 줄에 걸려 제자리에서 도는 불씨를 뿜음 → 흐려지며 불씨가 끊김 → 다시 타올라 흩어짐.
      // 등불마다 도는 방향이 달라 불씨 줄이 엇갈림
      for (let cycle = 0; ; cycle++) {
        const light = s.task(function* () {
          for (;;) { s.spread(1, s.aim(), 0.3, { spd: s.sp(2.2), shape: 'small', color: 'white' }); yield s.wait(40); }
        }());
        yield* castGap(s);
        yield* s.chant('SPIRITUS1', { by: s.boss });
        light.return();
        if (cycle < 3) s.extendTime(5);
        const n = s.lv(3, 3, 4, 4, 5), lamps = [];
        for (let i = 0; i < n; i++) {
          const tx = s.W * (i + 0.5) / n, ty = s.rand(150, 210);
          lamps.push(s.fire({ x: s.boss.x, y: s.boss.y, spd: 0, shape: 'big', color: 'orange',
            fn: b => { if (b.t <= 40) { const k = b.t / 40; b.x = b.x + (tx - b.x) * k * 0.2; b.y = b.y + (ty - b.y) * k * 0.2; } } }));
        }
        yield 45;
        for (let t = 0; t < 150; t += 6) {
          lamps.forEach((L, i) => {
            if (L.dead) return;
            const a = t * 0.07 * (i % 2 ? -1 : 1) + i;
            for (let j = 0; j < 4; j++) s.fire({ x: L.x, y: L.y, ang: a + j * s.TAU / 4, spd: s.sp(1.5), shape: 'small', color: 'orange' });
          });
          yield 6;
        }
        for (let t = 0; t < 50; t++) { for (const L of lamps) L.alpha = 1 - 0.65 * t / 50; yield 1; }
        yield 24;
        for (const L of lamps) {
          if (L.dead) continue;
          s.ring(s.cnt(18), { x: L.x, y: L.y, offset: s.rand(0, s.TAU), spd: 0.6, accel: 0.03, maxSpd: s.sp(2.4), shape: 'rice', color: 'yellow' });
          L.dead = true;
          yield 10;
        }
        yield 50;
      }
    },
  },
  {
    name: '논스펠 · 예로니모 2',
    type: 'nonspell', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 3000, time: 42, start: [192, 100],
    *run(s) {
      // 쌍둥이 나선: 보스 양옆 두 점에서 서로 반대로 도는 사슬 나선. 가운데에서 두 나선이 엇갈림(베리하드 이상은 가끔 조준 칼날)
      let a = 0;
      for (let f = 0; ; f++) {
        a += s.spin(0.07);
        for (const side of [-1, 1]) {
          const x = s.boss.x + side * 70, y = s.boss.y + 10;
          const arms = s.surge >= 2 ? 4 : 3;   // 나선이 둘이라 격화 III에서만 한 갈래 더
          for (let i = 0; i < arms; i++) s.fire({ x, y, ang: side * a + i * s.TAU / arms, spd: s.sp(2.2), shape: 'link', color: side < 0 ? 'gold' : 'yellow' });
        }
        if (s.diff >= 3 && f % 6 === 0) s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.14, { spd: s.sp(3.8), shape: 'knife', color: 'white' });
        if (f % 60 === 59) yield* s.wander(30, 40);
        yield s.lv(10, 9, 8, 8, 6);   // 나선 고리 사이 간격(약 25% 넓힘)
      }
    },
  },
  {
    name: '파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라',
    type: 'spell', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 3400, time: 52, start: [192, 100],
    *run(s) {
      // 붙드는 손: 황금 주먹이 플레이어가 있던 자리에 멈추면 그 둘레에 사슬 고리 울타리가 둘러쳐짐 →
      // 울타리가 조여들다가(고리 사이 틈으로 빠져나감) 한가운데에서 바깥으로 터져 나감
      for (;;) {
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(12), { offset: k * 0.3, spd: s.sp(1.4), shape: 'small', color: 'white' }); yield s.wait(32); }
        }());
        yield* castGap(s);
        yield* s.chant('PATER1', { by: s.boss });
        light.return();
        s.boss.glow = 300;
        for (let k = 0; k < s.lv(3, 3, 4, 4, 5); k++) {
          const tx = s.player.x, ty = s.player.y, T = 50;   // 주먹이 날아오는 시간(프레임). 너무 빠르지 않게
          s.mark({ x: tx, y: ty, dur: T });
          s.fire({ x: s.boss.x, y: s.boss.y, vx: (tx - s.boss.x) / T, vy: (ty - s.boss.y) / T, shape: 'big', color: 'gold',
            fn: (b, s) => {
              if (b.t < T) return;
              b.dead = true;
              s.shake(3);
              const n = s.lv(10, 12, 12, 14, 14);
              for (let i = 0; i < n; i++) {
                const a0 = i * s.TAU / n;
                s.fire({ x: tx, y: ty, spd: 0, shape: 'link', color: 'gold',
                  fn: c => {
                    // 0~20: 반지름 80에 둘러쳐짐, 20~80: 조여듦, 80: 바깥으로 풀려 나감
                    if (c.t <= 80) {
                      const r = c.t < 20 ? 80 : 80 - (c.t - 20) * 1.0, a = a0 + c.t * 0.015;
                      const nx = tx + Math.cos(a) * r, ny = ty + Math.sin(a) * r;
                      c.pvx = nx - c.x; c.pvy = ny - c.y;   // 회피 봇 예측용
                      c.x = nx; c.y = ny; c.ang = a + Math.PI / 2;
                    } else if (c.t === 81) { c.pvx = undefined; c.pvy = undefined; c.ang = a0 + 81 * 0.015; c.spd = s.sp(2.2); }
                  } });
              }
            } });
          yield 40;   // 울타리가 주인 큰 패턴이라 본체는 쏘지 않음
        }
        yield 70;
        yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '논스펠 · 예로니모 3',
    type: 'nonspell', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 2900, time: 42, start: [192, 90],
    *run(s) {
      // 교차 사슬: 위쪽 두 모서리에서 플레이어 자리를 지나는 사슬이 X자로 뻗고(예고선 뒤), 기체를 둘러싼 # 모양 사슬이 함께 뻗음. 칸 안에서 비키고,
      // 그사이 보스가 고리 원형탄을 천천히 깖
      s.task(function* () {
        for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.17, spd: s.sp(1.5), shape: 'link', color: 'yellow' }); yield s.wait(54); }
      }());
      for (let w = 0; ; w++) {
        const tx = s.player.x, ty = s.player.y, warn = s.lv(50, 46, 42, 40, 40);
        for (const x of [-8, s.W + 8]) {
          const y = s.rand(-8, 60);
          s.chain({ x, y, ang: Math.atan2(ty - y, tx - x), len: 760, warn, shoot: 10, hold: 12, retract: 60 });
        }
        // 우리: 기체 좌우 off 옆을 지나는 세로 사슬 둘(위에서), 위아래 off를 지나는 가로 사슬 둘(좌우 가장자리에서).
        // 모두 조금씩 기울어 기체를 가운데 둔 # 모양 칸을 만들고, 칸 안에서 X자 사슬을 피해 비킴
        const off = s.lv(120, 115, 110, 105, 100), chain = (x0, y0, px, py) => s.chain({ x: x0, y: y0, ang: Math.atan2(py - y0, px - x0), len: 800, warn, shoot: 10, hold: 12, retract: 60 });
        for (const d of [-1, 1]) {
          const px = tx + d * off;
          if (px > 4 && px < s.W - 4) chain(px + s.rand(-0.2, 0.2) * (ty + 8), -8, px, ty);
          const py = ty + d * off;
          if (py > 4 && py < s.H - 4) { const left = Math.random() < 0.5, x0 = left ? -8 : s.W + 8; chain(x0, py + s.rand(-0.2, 0.2) * Math.abs(tx - x0), tx, py); }
        }
        yield warn + 20;
        yield s.wait(40);
      }
    },
  },
  {
    name: '파테르 제2식 — 능히 일어나지 못하게 하리니',
    type: 'spell', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 3200, time: 52, start: [192, 100],
    *run(s) {
      // 연속 돌진: 제자리로 돌아가지 않고 1초 전 플레이어 자리로 세 번 이어 끝까지 달려듦. 멈출 때마다 사슬을 사방으로 뻗고,
      // 마지막 돌진 뒤에는 사슬을 두 겹(엇갈린 각도)으로 뻗음
      const hist = [];   // 플레이어 자리 기록(최근 1.5초)
      s.task(function* () { for (;;) { hist.push({ x: s.player.x, y: s.player.y }); if (hist.length > 90) hist.shift(); yield 1; } }());
      for (;;) {
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.27, spd: s.sp(1.5), shape: 'small', color: 'white' }); yield s.wait(32); }
        }());
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 44 });
        light.return();
        const dashes = 3;
        for (let k = 0; k < dashes; k++) {
          // 목표는 1초 전 플레이어 자리. 멈추지 않고 끝까지 달려듦
          const back = hist[Math.max(0, hist.length - 61)] || s.player;
          const tx = Math.max(30, Math.min(s.W - 30, back.x)), ty = Math.max(60, Math.min(s.H - 40, back.y));
          const warn = s.lv(40, 36, 32, 30, 28);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: warn });
          yield* hardAim(s, warn, 'yellow');
          s.boss.contact = true;
          yield* s.moveTo(tx, ty, 16);
          s.boss.contact = false;
          s.impact(7);
          const n = s.lv(4, 5, 6, 6, 7), off = s.rand(0, s.TAU), cw = s.lv(45, 40, 36);
          for (let i = 0; i < n; i++) s.chain({ x: tx, y: ty, ang: off + i * s.TAU / n, len: 520, warn: cw, shoot: 10, hold: 10, retract: 50 });
          if (k === dashes - 1) for (let i = 0; i < n; i++) s.chain({ x: tx, y: ty, ang: off + (i + 0.5) * s.TAU / n, len: 520, warn: cw + 50, shoot: 10, hold: 10, retract: 50 });
          yield cw + 20;   // 사슬이 뻗은 동안은 본체가 쏘지 않음
          s.ring(s.cnt(20), { offset: off + Math.PI / n, spd: 0.5, accel: 0.03, maxSpd: s.sp(2.2), shape: 'orb', color: 'gold' });
          yield 16;
        }
        yield 60;
        yield* s.moveTo(s.rand(140, 244), s.rand(80, 110), 40);
      }
    },
  },
  {
    name: 'Clavis Collata — NUNC DIMITTIS',
    type: 'spell', strong: true, cutinShot: '120', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 3000, time: 52, start: [192, 100],
    *run(s) {
      // 사슬이 걷힌 자리에 고리가 남아 양옆으로 천천히 흩어짐. 사슬이 늘어날수록 남는 고리도 늘어 화면이 조여듦
      const light = s.task(function* () {
        for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.3, spd: s.sp(1.3), shape: 'small', color: 'gold' }); yield s.wait(36); }
      }());
      yield* s.chant('NUNC_DIMITTIS', { by: s.boss, step: 29 });   // 영창 10% 빠르게
      light.return();
      function edgeChain(target) {
        const side = s.randInt(0, 2);
        const x = side === 0 ? -8 : side === 1 ? s.W + 8 : s.rand(20, s.W - 20);
        const y = side === 2 ? -8 : s.rand(20, s.H * 0.8);
        const tx = target ? target.x : s.rand(40, s.W - 40), ty = target ? target.y : s.rand(s.H * 0.4, s.H - 30);
        const ang = Math.atan2(ty - y, tx - x), warn = s.lv(64, 56, 48, 46, 44), hold = 16;
        s.chain({ x, y, ang, len: 720, warn, shoot: 12, hold, retract: 60 });
        // 사슬이 다 뻗은 뒤 그 줄을 따라 고리를 남김(34px 간격). 사슬과 수직으로 천천히 흩어짐
        s.task(function* () {
          yield warn + 12 + hold;
          for (let d = 20; d < 720; d += 34) {
            const bx = x + Math.cos(ang) * d, by = y + Math.sin(ang) * d;
            if (bx < -10 || bx > s.W + 10 || by < -10 || by > s.H + 10) continue;
            s.fire({ x: bx, y: by, ang: ang + (d / 34 % 2 < 1 ? 1 : -1) * Math.PI / 2, spd: 0, accel: 0.01, maxSpd: s.sp(1), shape: 'link', color: 'gold' });
          }
        }());
      }
      for (let w = 0; ; w++) {
        const n = Math.min(s.lv(5, 6, 6) + w, s.lv(7, 8, 8, 9, 9));   // 사슬 수를 두 차례 늘림(처음 +3, 최대 +4)
        for (let i = 0; i < n; i++) { edgeChain(i === 0 ? { x: s.player.x, y: s.player.y } : null); yield 6; }
        yield s.lv(64, 56, 48, 46, 44);
        for (let k = 0; k < 8; k++) {
          if (k % 4 === 0) s.ring(s.cnt(12), { offset: k * 0.19, spd: s.sp(1.7), shape: 'orb', color: 'yellow' });   // 남는 고리가 주인 큰 패턴이라 본체 탄은 가볍게
          yield 16;
        }
        yield 30;
        if (w % 3 === 2) yield* s.wander();
      }
    },
  },
  {
    name: 'Clavis Collata — NUNC DIMITTIS · 후반',
    type: 'spell', follow: true, extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 2800, time: 50, start: [192, 90],
    *run(s) {
      // 진심 NUNC DIMITTIS 뒤 단계(앞 단계와 한 체력바, 다시 선언하지 않음). 6스테이지 뒤 단계에 # 모양 사슬 우리를 더함. 쇄도하는 쇠사슬: 화면 가장자리(위·왼쪽·오른쪽) 여기저기서 황금 사슬이 기체의 0.5초 전 자리를 향해 짧은 예고선 뒤 연달아 뻗음.
      // 계속 움직이지 않으면 걸림(으아악! 도망쳐!). 가끔 사슬 머리 한두 개가 뱀처럼 기체를 쫓아오며 고리를 흘림(기체보다 느려 떼어 놓을 수 있음).
      // 사슬 사이 간격은 스펠이 진행될수록 짧아지다가 한계에서 멈춤(s.wait의 압박 곡선)
      const hist = [];
      s.task(function* () { for (;;) { hist.push({ x: s.player.x, y: s.player.y }); if (hist.length > 60) hist.shift(); yield 1; } }());
      const past = () => hist[Math.max(0, hist.length - 31)] || s.player;
      const edge = () => {
        const side = s.randInt(0, 2);
        return side === 0 ? { x: -8, y: s.rand(20, s.H * 0.7) } : side === 1 ? { x: s.W + 8, y: s.rand(20, s.H * 0.7) } : { x: s.rand(20, s.W - 20), y: -8 };
      };
      // 추적 사슬: 머리가 기체를 향해 조금씩 꺾으며 달려오고, 지나간 자리에 잠깐 남는 고리를 흘림
      const snake = () => {
        const o = edge(), head = s.fire({ x: o.x, y: o.y, ang: Math.atan2(s.player.y - o.y, s.player.x - o.x), spd: 2, shape: 'big', color: 'gold', margin: 40,   // 머리 속도는 난이도·격화와 상관없이 2(고속 이동 3.6으로 떼어 놓음)
          fn: (b, s) => {
            const want = Math.atan2(s.player.y - b.y, s.player.x - b.x), da = ((want - b.ang + Math.PI * 3) % s.TAU) - Math.PI;
            b.ang += Math.max(-0.03, Math.min(0.03, da));
            if (b.t % 5 === 0) s.fire({ x: b.x, y: b.y, ang: b.ang, spd: 0, shape: 'link', color: 'gold', fn: c => { if (c.t > 45) c.dead = true; } });
            if (b.t > 150) b.dead = true;
          } });
        return head;
      };
      s.task(function* () {
        yield 180;
        for (;;) { snake(); if (s.diff >= 2 && Math.random() < 0.5) { yield 20; snake(); } yield s.wait(240); }
      }());
      yield 30;
      for (let k = 0; ; k++) {
        const n = k % 4 === 3 ? 2 : 1;
        // 진심: 여섯 번에 한 번은 0.5초 전 자리를 둘러싼 # 모양 사슬 우리도 함께(세로 둘·가로 둘, 약 110px 옆)
        if (k % 6 === 3) {
          const t = past(), off = s.lv(120, 115, 110, 105, 100), warn = s.lv(44, 40, 36, 34, 33);
          const cage = (x0, y0, px, py) => s.chain({ x: x0, y: y0, ang: Math.atan2(py - y0, px - x0), len: 800, warn, shoot: 8, hold: 8, retract: 28 });
          for (const d of [-1, 1]) {
            const px = t.x + d * off, py = t.y + d * off;
            if (px > 4 && px < s.W - 4) cage(px + s.rand(-0.2, 0.2) * (t.y + 8), -8, px, t.y);
            if (py > 4 && py < s.H - 4) { const x0 = Math.random() < 0.5 ? -8 : s.W + 8; cage(x0, py + s.rand(-0.2, 0.2) * Math.abs(t.x - x0), t.x, py); }
          }
        }
        for (let j = 0; j < n; j++) {
          const o = edge(), t = past(), warn = s.lv(36, 32, 30, 30, 30);   // 베리하드·헬도 예고 0.5초
          s.chain({ x: o.x, y: o.y, ang: Math.atan2(t.y - o.y, t.x - o.x), len: 760, warn, shoot: 8, hold: 8, retract: 28 });
        }
        yield Math.max(28, s.wait(s.lv(36, 32, 30, 30, 30)));   // 사슬 사이 간격(최소 약 0.47초)
      }
    },
  },
  {
    name: '시험 스펠 「카레 발사」',
    type: 'spell', hp: 3000, time: 40, start: [192, 150],
    *run(s) {
      // 밥알(흰 쌀탄)은 위로 솟았다 중력으로 떨어지고, 카레(갈색 큰 탄)는 느리게 흘러내림
      for (let f = 0; ; f++) {
        if (f % s.lv(3, 2, 3) === 0 || (s.diff >= 2 && f % 3 === 1)) s.fire({ vx: s.rand(-2.6, 2.6), vy: s.rand(-5.5, -3.5), ay: 0.07, shape: 'rice', color: 'white', marginTop: 200 });
        if (f % s.wait(30) === 0) {
          for (let i = 0; i < s.lv(3, 4, 5); i++) s.fire({ vx: s.rand(-1.5, 1.5), vy: s.rand(-3, -1.5), ay: 0.035, shape: 'big', color: 'brown', marginTop: 200 });
        }
        if (f % 150 === 149) yield* s.wander(50, 50);
        yield 2;
      }
    },
  },
  {
    name: '내구 스펠 「회전 벽」',
    type: 'spell', survival: true, hp: 1, time: 25, start: [192, 200],
    *run(s) {
      let a = 0;
      for (;;) {
        a += s.spin(0.045);
        const arms = s.arms(s.lv(4, 5, 6));
        for (let i = 0; i < arms; i++) s.fire({ ang: a + i * s.TAU / arms, spd: s.sp(3), shape: 'orb', color: 'red' });
        yield s.lv(7, 6, 5);
      }
    },
  },
  {
    name: '잡몹 웨이브 · 날개 오르트로스',
    type: 'stage', time: 40,
    *run(s) {
      const flyer = side => function* (e, s) {
        yield 30;
        for (let k = 0; k < s.lv(2, 3, 3); k++) {
          s.spread(s.lv(1, 3, 3), s.aim(e.x, e.y), 0.2, { x: e.x, y: e.y, spd: s.sp(2.6), shape: 'small', color: 'red' });
          yield 40;
        }
        e.vx = side * 1.2; e.vy = -0.6;
      };
      for (let w = 0; ; w++) {
        const side = w % 2 ? 1 : -1;
        for (let i = 0; i < 6; i++) {
          s.enemy({ x: side < 0 ? 40 + i * 30 : s.W - 40 - i * 30, y: -20, vx: 0, vy: 1.6, hp: 20, run: flyer(side) });
          yield 12;
        }
        yield 60;
        // 중형: 원형탄
        s.enemy({ x: s.W / 2, y: -20, vy: 0.8, hp: 160, r: 20, color: 'purple', run: function* (e, s) {
          yield 60; e.vy = 0;
          for (let k = 0; k < s.lv(4, 5, 6); k++) { s.ring(s.cnt(20), { x: e.x, y: e.y, offset: k * 0.15, spd: s.sp(2), shape: 'rice', color: 'purple' }); yield 20; }
          e.vy = -1;
        } });
        yield 180;
      }
    },
  },
  {
    name: '논스펠 · 리크니스 1',
    type: 'nonspell', boss: '리크니스', bossColor: '#d8404f', hp: 2800, time: 42, start: [192, 100],
    *run(s) {
      // 사방으로 굽이치며 자라는 덩굴. 잎은 잠시 붙어 있다가 떨어짐
      for (let w = 1; ; w++) {
        const n = s.lv(3, 4, 5), base = s.rand(0, s.TAU);
        for (let i = 0; i < n; i++) s.task(ivyVine(s, { x: s.boss.x, y: s.boss.y, ang: base + i * s.TAU / n, spd: s.sp(2.2), len: 160, turn: 0.035, phase: i, stay: s.lv(70, 90, 110) }));
        for (let k = 0; k < 3; k++) { yield s.wait(30); if (k !== 1) s.spread(s.lv(1, 3, 3), s.aim(), 0.2, { spd: s.sp(3), shape: 'leaf', color: 'ivy' }); }
        yield s.wait(60);
        if (w % 3 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '「벽을 타는 덩굴」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#d8404f', hp: 3700, time: 60, start: [192, 90],
    *run(s) {
      for (;;) {
        // 양쪽 벽을 아래에서 위로 천천히 타고 오르며 안쪽으로 길게 가지를 뻗음. 가지는 크게 S자로 굽이침.
        // 좌우 가지 높이를 약 68px 엇갈려 지그재그 통로를 남김(가지 끝을 말면 통로를 막으므로 말지 않음)
        for (const side of [-1, 1]) {
          const x0 = side < 0 ? 6 : s.W - 6;
          s.task(function* () {
            let y = s.H + 10;
            const climb = s.sp(1.5), head = s.fire({ x: x0, y, spd: 0, shape: 'orb', color: 'void' });
            for (let t = 0; y > -10 && !head.dead; t++) {
              y -= climb; head.y = y;
              if (t % 7 === 0 && !s.near(x0, y, 12, 'leaf')) ivyLeaf(s, x0 + s.rand(-3, 3), y, -Math.PI / 2 + s.rand(-0.8, 0.8), s.lv(200, 240, 270));
              if (t % 90 === (side < 0 ? 0 : 45) && y < s.H - 40 && y > 60) {
                const reach = s.W * s.lv(0.42, 0.5, 0.56, 0.58, 0.6), spd = s.sp(1.6);
                s.task(ivyVine(s, { x: x0, y, ang: side < 0 ? 0 : Math.PI, spd, len: Math.round(reach / spd), turn: 0.05, wave: 0.06, phase: s.rand(0, s.TAU), stay: s.lv(170, 200, 230) }));
              }
              yield 1;
            }
            head.dead = true;
          }());
        }
        yield Math.round((s.H + 20) / s.sp(1.5));   // 벽을 다 오를 때까지. 큰 패턴이라 본체는 쏘지 않음(덩굴에 집중)
        yield s.wait(90);
      }
    },
  },
  {
    name: '논스펠 · 리크니스 2',
    type: 'nonspell', boss: '리크니스', bossColor: '#d8404f', hp: 3000, time: 40, start: [192, 110],
    *run(s) {
      // 잎 소용돌이 + 꽃잎 원형탄(노말 이상)
      let a = 0;
      for (let f = 0; ; f++) {
        a += s.spin(0.11);
        const arms = s.arms(s.lv(2, 3, 4));   // 격화마다 한 갈래씩 더
        for (let i = 0; i < arms; i++) s.fire({ ang: a + i * s.TAU / arms, spd: s.sp(2.2), angVel: 0.006, shape: 'leaf', color: 'ivy' });
        if (f % 40 === 0 && s.diff > 0) s.ring(s.cnt(16), { offset: -a, spd: s.sp(1.4), shape: 'small', color: 'red' });
        if (f % 300 === 299) yield* s.wander(40, 50);
        yield s.lv(6, 5, 4);
      }
    },
  },
  {
    name: '「뿌리를 찾는 덩굴」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#d8404f', hp: 3600, time: 50, start: [192, 90],
    *run(s) {
      // 뿌리를 찾는 덩굴: 잎을 만드는 빛나는 덩굴 머리가 기체와 약 110px 거리를 두고 천천히(최대 0.9px/프레임) 계속 쫓아오며
      // 지나간 자리에 잎을 남기고, 가끔 느린 유도탄을 쏨(노말까지 머리 하나, 하드부터 둘).
      // 가운데에서는 리크니스에게서 뻗은 빔 세 줄이 켜진 채 천천히 빙글빙글 돎(화면 끝에서도 약 1.8px/프레임, 약 8초마다 방향이 바뀜)
      const keep = 110, chase = s.sp(0.9);
      const makeHead = (x, y) => {
        const head = s.fire({ x, y, spd: 0, shape: 'orb', color: 'void', margin: 60,
          fn: (b, s) => {
            const p = s.player, dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
            const tx = p.x + dx / d * keep, ty = p.y + dy / d * keep, mx = tx - b.x, my = ty - b.y, md = Math.hypot(mx, my);
            if (md > 1) { const k = Math.min(chase, md) / md; b.pvx = mx * k; b.pvy = my * k; b.x += b.pvx; b.y += b.pvy; }
            if (b.t % 18 === 0 && !s.near(b.x, b.y, 12, 'leaf')) ivyLeaf(s, b.x, b.y, s.rand(0, s.TAU), s.lv(150, 170, 190));
            if (b.t % s.wait(80) === 40) {
              // 느린 유도탄: 기체 쪽으로 조금씩 꺾으며 날아오다 3초 뒤 사라짐
              s.fire({ x: b.x, y: b.y, ang: Math.atan2(p.y - b.y, p.x - b.x), spd: s.sp(1.3), shape: 'leaf', color: 'ivy',
                fn: (c, s) => {
                  const want = Math.atan2(s.player.y - c.y, s.player.x - c.x), da = ((want - c.ang + Math.PI * 3) % s.TAU) - Math.PI;
                  if (c.t < 120) c.ang += Math.max(-0.02, Math.min(0.02, da));
                  if (c.t > 180) c.dead = true;
                } });
            }
          } });
        return head;
      };
      makeHead(20, s.H * 0.4);
      if (s.diff >= 2) makeHead(s.W - 20, s.H * 0.6);
      // 가운데 나선 빔
      const st = { rot: 0 }, n = 3, omega = 0.005;
      for (let i = 0; i < n; i++) {
        s.laser({ x: s.boss.x, y: s.boss.y, ang: i * s.TAU / n, len: 700, w: 12, warn: 70, dur: 99999, color: 'red',
          fn: l => { l.ang = i * s.TAU / n + st.rot; l.x = s.boss.x; l.y = s.boss.y; } });
      }
      yield 70;
      for (let k = 0; ; k++) {
        const dir = k % 2 ? -1 : 1;
        for (let t = 0; t < 480; t++) { st.rot += dir * s.spin(omega); yield 1; }
      }
    },
  },
  {
    name: '논스펠 · 리크니스 3',
    type: 'nonspell', boss: '리크니스', bossColor: '#d8404f', hp: 3000, time: 42, start: [192, 100],
    *run(s) {
      // 덩굴 채찍: 보스 양옆에서 덩굴 한 쌍이 크게 휘어 돌며 휘몰아침 + 꽃잎 조준탄. 판마다 바깥으로 도는 쌍과 아래로 도는 쌍을
      // 번갈아 쓰고(한 번에 한 쌍만), 휘는 각도가 조금씩 달라 같은 모양이 겹쳐 쌓이지 않음
      for (let w = 1; ; w++) {
        const [a0, len] = w % 2 ? [1.2, 170] : [0.55, 150], jit = s.rand(-0.12, 0.12);
        for (const side of [-1, 1]) s.task(ivyVine(s, {
          x: s.boss.x + side * 20, y: s.boss.y, ang: Math.PI / 2 - side * (a0 + jit), spd: s.sp(3.3), len,
          curl: side * s.lv(0.02, 0.022, 0.024, 0.026, 0.028), turn: 0.01, stay: s.lv(70, 90, 110),
        }));
        for (let k = 0; k < 2; k++) { yield s.wait(26); s.spread(s.lv(3, 3, 5, 5, 7), s.aim(), 0.16, { spd: s.sp(3), shape: 'small', color: 'red' }); }
        yield s.wait(40);
        if (w % 3 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '「덩굴에 핀 꽃」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#d8404f', hp: 3400, time: 50, start: [192, 80],
    *run(s) {
      // 덩굴이 위에서 굽이치며 바닥까지 천천히 늘어지는 동안 곳곳에 꽃봉오리(큰 분홍 탄)가 맺히고,
      // 덩굴이 바닥에 닿으면 봉오리가 위에서부터 차례로 꽃잎으로 터짐
      for (let w = 0; ; w++) {
        const n = s.lv(2, 2, 3, 3, 3), budEvery = s.lv(56, 48, 42, 38, 34), spd = s.sp(1.4), len = Math.round((s.H + 30) / spd);
        let longest = 0;
        for (let i = 0; i < n; i++) {
          const st = { doneAt: 0 }, buds = [];
          const bloom = (b, s) => {
            if (!st.doneAt || s.frame < st.doneAt + 20 + b.data.k * 10) return;
            b.dead = true;
            s.ring(s.lv(6, 8, 9, 10, 11), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: 0.5, accel: 0.03, maxSpd: s.sp(2), shape: 'rice', color: 'red' });
          };
          s.task(function* () {
            yield* ivyVine(s, {
              x: s.W * (i + 0.5) / n + s.rand(-20, 20), y: -10, ang: Math.PI / 2, spd, len, turn: 0.04, wave: 0.05, phase: i + w,
              stay: s.lv(140, 160, 180), margin: 40,
              step: (x, y, t) => { if (t % budEvery === 20) buds.push(s.fire({ x, y, spd: 0, shape: 'big', color: 'red', data: { k: buds.length }, fn: bloom })); },
            });
            st.doneAt = s.frame;
          }());
          longest = Math.max(longest, len);
        }
        yield longest + 20 + 10 * 12 + s.wait(80);   // 다 늘어지고 꽃이 다 필 때까지. 큰 패턴이라 본체는 쏘지 않음
      }
    },
  },
  {
    name: '「휘감는 덩굴」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#d8404f', hp: 3600, time: 55, start: [192, 80],
    *run(s) {
      // 플레이어를 둘러싸는 원을 덩굴 둘이 틈의 양 끝에서 그려 나가 반대쪽에서 만남. 원이 닫히면 둘레에서
      // 가운데를 향해 가시가 조여 옴. 트인 쪽으로 빠져나가거나, 둘레 쪽 넓은 틈에서 가시를 흘려보냄.
      // 원 윗부분 잎은 모양을 유지한 채 원 안으로 떨어짐
      for (;;) {
        const cx = Math.max(90, Math.min(s.W - 90, s.player.x)), cy = Math.max(170, Math.min(s.H - 90, s.player.y));
        const R = s.lv(120, 110, 100, 95, 90), gapAt = s.rand(0, s.TAU), gap = s.lv(1.2, 1.0, 0.85, 0.75, 0.7);
        const pts = [], warn = s.lv(50, 45, 40, 38, 36);
        for (let k = 0; k <= 16; k++) { const a = gapAt + gap / 2 + (s.TAU - gap) * k / 16; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
        for (let k = 0; k < 16; k++) s.warnLine({ x: pts[k][0], y: pts[k][1], x2: pts[k + 1][0], y2: pts[k + 1][1], dur: warn });
        yield warn;
        const spd = s.sp(3.4), len = Math.round((s.TAU - gap) / 2 * R / spd), stay = s.lv(110, 120, 130);
        const a0 = gapAt + gap / 2, a1 = gapAt - gap / 2, gapPx = s.lv(24, 21, 19, 18, 17);
        s.task(ivyVine(s, { x: cx + Math.cos(a0) * R, y: cy + Math.sin(a0) * R, ang: a0 + Math.PI / 2, spd, len, curl: spd / R, turn: 0, gapPx, skip: 0, stay, margin: 200 }));
        s.task(ivyVine(s, { x: cx + Math.cos(a1) * R, y: cy + Math.sin(a1) * R, ang: a1 - Math.PI / 2, spd, len, curl: -spd / R, turn: 0, gapPx, skip: 0, stay, margin: 200 }));
        yield len;
        // 조임: 둘레(틈 제외)에서 가운데로 가시
        const n = s.lv(10, 14, 18, 22, 26);
        for (let i = 0; i < n; i++) {
          const a = gapAt + gap / 2 + (s.TAU - gap) * (i + 0.5) / n;
          s.fire({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, ang: a + Math.PI, spd: 0.3, accel: 0.03, maxSpd: s.sp(2.2), shape: 'rice', color: 'red' });
        }
        for (let k = 0; k < 3; k++) { yield s.wait(40); if (k === 1) s.spread(s.lv(1, 1, 3, 3, 3), s.aim(), 0.25, { spd: s.sp(2.4), shape: 'leaf', color: 'ivy' }); }
        yield s.wait(60);
      }
    },
  },
  {
    name: '「담쟁이 정원」(가칭)',
    type: 'spell', strong: true, boss: '리크니스', bossColor: '#d8404f', hp: 3800, time: 55, start: [192, 90],
    *run(s) {
      // 담쟁이 정원: 예고선을 따라 사선 격자를 딱 한 번 만들고(움직여도 가장자리가 비지 않게 화면보다 넓게), 이후 그 구조가
      // 통째로 대각선으로 천천히 오르내림(진폭 60px, 약 7초 주기, 최대 약 1.05px/프레임). 칸 안에서 함께 움직이며 버티고,
      // 리크니스가 가끔 조준탄으로 방해함. 잎 사이는 17px 이상이라 잎 줄 사이로 옆 칸에 옮길 수도 있음
      const tilt = 0.6, gap = s.lv(130, 118, 105, 100, 95), step = s.lv(26, 22, 20, 19, 18), A = 60, pad = A + gap;
      const warn = 60, lines = [], mv = { x: 0, y: 0 };
      const dirs = s.diff >= 1 ? [1, -1] : [1];
      for (const dir of dirs) {
        const ang = Math.PI / 2 - dir * tilt, span = (s.H + 2 * pad) * Math.tan(tilt), off = s.rand(0, gap);
        for (let x0 = -pad - (dir > 0 ? span : 0) + off; x0 < s.W + pad + (dir > 0 ? 0 : span); x0 += gap) {
          s.warnLine({ x: x0, y: -pad, x2: x0 + Math.cos(ang) * 900, y2: -pad + Math.sin(ang) * 900, dur: warn });
          lines.push([x0, ang]);
        }
      }
      yield warn;
      // 격자 깔기: 줄마다 잎을 step 간격으로(겹치는 교차점은 건너뜀). 잎은 공통 이동량 mv를 따라 움직임
      let li = 0;
      for (const [x0, ang] of lines) {
        for (let d = 0, k = 0; d < 1100; d += step, k++) {
          const x = x0 + Math.cos(ang) * d, y = -pad + Math.sin(ang) * d;
          if (x < -pad || x > s.W + pad || y < -pad || y > s.H + pad) continue;
          if (s.near(x + mv.x, y + mv.y, 10, 'leaf')) continue;
          s.fire({ x, y, spd: 0, ang: ang + (k % 2 ? 0.9 : -0.9), shape: 'leaf', color: 'ivy', margin: pad + 40, data: { x, y }, keep: true,
            fn: b => { b.x = b.data.x + mv.x; b.y = b.data.y + mv.y; } });
        }
        if (++li % 2 === 0) yield 1;
      }
      // 대각선(오른쪽 아래 ↔ 왼쪽 위)으로 통째로 오르내림
      s.task(function* () { for (let t = 0; ; t++) { const k = A * Math.sin(t * s.TAU / 420); mv.x = k * 0.707; mv.y = k * 0.707; yield 1; } }());
      for (;;) {
        yield s.wait(80);
        s.spread(s.lv(1, 1, 3, 3, 3), s.aim(), 0.2, { spd: s.sp(2.2), shape: 'small', color: 'red' });
      }
    },
  },
  {
    name: '논스펠 · 이즘 1',
    type: 'nonspell', boss: '이즘', bossColor: '#8fe8ff', hp: 2600, time: 36, start: [192, 100],
    *run(s) {
      // 데이터 묶음: 정사각형으로 뭉친 탄 덩어리(한 변 28~56px)가 통째로 빙글빙글 돌면서 기체 쪽으로 천천히 방향을 틀며 다가옴.
      // 덩어리 중심이 처음 약 1.7초 동안 조금씩(프레임당 0.02) 꺾으며 속도 1.3으로 움직이고 그 뒤로는 곧게 날아감
      for (let w = 1; ; w++) {
        const n = s.lv(3, 3, 4, 4, 4), gap = 14, st = { x: s.boss.x, y: s.boss.y, ang: s.aim() + s.rand(-0.3, 0.3), rot: s.rand(0, s.TAU), f: -1, age: 0 };
        const spin = (w % 2 ? 1 : -1) * s.spin(0.02), spd = s.sp(1.3);   // 도는 속도는 예전(0.04)의 절반
        const tick = () => {
          if (st.f === s.frame) return;
          st.f = s.frame; st.age++;
          const want = Math.atan2(s.player.y - st.y, s.player.x - st.x), da = ((want - st.ang + Math.PI * 3) % s.TAU) - Math.PI;
          if (st.age < 100) st.ang += Math.max(-0.02, Math.min(0.02, da));   // 처음 약 1.7초만 쫓고 그 뒤로는 곧게(기체 둘레를 맴돌지 않게)
          st.x += Math.cos(st.ang) * spd; st.y += Math.sin(st.ang) * spd; st.rot += spin;
        };
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const ox = (i - (n - 1) / 2) * gap, oy = (j - (n - 1) / 2) * gap;
          s.fire({ x: st.x + ox, y: st.y + oy, spd: 0, shape: 'small', color: 'cyan', margin: 60,
            fn: b => {
              tick();
              const c = Math.cos(st.rot), sn = Math.sin(st.rot), nx = st.x + ox * c - oy * sn, ny = st.y + ox * sn + oy * c;
              b.pvx = nx - b.x; b.pvy = ny - b.y; b.x = nx; b.y = ny;   // pvx·pvy: 회피 봇 예측용
              if (b.t > 600) b.dead = true;
            } });
        }
        yield s.wait(40);
        if (w % 3 === 0) s.ring(s.cnt(22), { offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'rice', color: 'white' });
        if (w % 6 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '「순차 격자 타격」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3200, time: 45, start: [192, 60],
    *run(s) {
      // 순서 기억: 화면을 세로로 세 칸으로 나눔(난이도와 상관없이 3칸). 한 판에 칸이 번호와 함께 차례로 빛나며 순서를 알려 주고
      // (번호가 높을수록 높은 효과음), 곧바로 그 순서대로 한 칸씩 터짐. 같은 칸이 연달아 나오지는 않지만 다시 나올 수 있으므로
      // 다음에 터질 칸을 기억해 계속 비킴. 난이도는 한 판에 터지는 횟수(이지 3 … 헬 7)와 속도로 나뉨. 4판, 판마다 약 10%씩 빨라짐.
      // 칸 경계를 넘어 옆 칸으로 옮기는 데 드는 시간을 생각해 터지는 간격은 26프레임 아래로 내리지 않음. 터지기 전 예고는 약 0.5~0.7초
      const cols = 3, rows = 1, cw = s.W / cols, ch = s.H / rows, len = s.lv(3, 4, 5, 6, 7);
      const cell = c => ({ x: (c % cols) * cw, y: Math.floor(c / cols) * ch, w: cw, h: ch });
      // 스프링클러(곁다리): 이즘을 중심으로 조금씩 돌아가는 방향으로 작은 탄 세 발짜리 덩어리를 뿜음.
      // 약 0.5초 뿜고 약 1초 쉬기를 반복하며, 순서를 알려 주는 동안과 터지는 동안에도 계속 나옴
      s.task(function* () {
        let a = s.rand(0, s.TAU);
        for (;;) {
          for (let k = 0; k < 4; k++) {
            for (let j = -1; j <= 1; j++) s.fire({ ang: a + j * 0.06, spd: s.sp(1.5 + Math.abs(j) * 0.15), shape: 'small', color: 'white' });
            a += s.spin(0.45); yield 8;
          }
          yield 60;
        }
      }());
      for (;;) {
        for (let round = 0; round < 4; round++) {
          const f = Math.pow(0.9, round), order = [];
          for (let i = 0; i < len; i++) { let c; do c = s.randInt(0, cols - 1); while (c === order[i - 1]); order.push(c); }
          const n = order.length;
          // 순서 알려 주기: 판 첫 칸 앞에 잠깐 틈
          const show = Math.max(14, Math.round(s.lv(34, 30, 24, 22, 20) * f));
          yield 16;
          for (let i = 0; i < n; i++) {
            s.area({ ...cell(order[i]), warn: show, dur: 0, label: i + 1, color: '#35d6ff' });
            s.sound('beep', n > 1 ? 0.2 + 0.8 * i / (n - 1) : 0.6);
            yield show;
          }
          yield Math.round(24 * f);
          // 순서대로 터짐. 칸마다 터지기 warn프레임 전부터 번호와 노란 테두리로 예고하고 효과음(판이 빨라져도 예고 길이는 그대로).
          // 예고가 터지는 간격보다 길어서, 한 칸이 터지기 전에 다음 칸 예고가 먼저 떠 늘 다음 칸이 보임
          const step = Math.max(26, Math.round(s.lv(46, 42, 36, 32, 30) * f)), warn = s.lv(42, 38, 34, 32, 30);
          for (let i = 0; i < n; i++) {
            const c = cell(order[i]);
            s.task(function* () {
              yield i * step;
              s.area({ ...c, warn, dur: 16, label: i + 1, color: '#ffd23a' });
              s.sound('beep', 0.9);
            }());
          }
          yield (n - 1) * step + warn + 16;
        }
        // 4판이 끝나면 잠깐 쉬며 조준탄
        for (let k = 0; k < 3; k++) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.4), shape: 'small', color: 'white' }); yield s.wait(40); }
        yield s.wait(30);
      }
    },
  },
  {
    name: '논스펠 · 이즘 2',
    type: 'nonspell', boss: '이즘', bossColor: '#8fe8ff', hp: 2800, time: 36, start: [192, 80],
    *run(s) {
      // 스캔: 가로 레이저 스캔선이 화면 위에서 아래로(다음엔 아래에서 위로) 훑고 지나감. 선에는 한 칸 빈 틈이 있고,
      // 켜지기 전 예고 단계부터 틈 위치가 보이므로 그 틈으로 가 있으면 통과. 노말부터 두 번째, 베리하드부터 세 번째 스캔선이
      // 다른 틈을 갖고 뒤따름(앞 틈에서 180px 안쪽). 틈 폭은 이지 72 … 헬 50px, 훑는 속도 약 2.2px/프레임.
      // 노말부터 위에서 느린 이진수 비(작은 하늘색 탄)가 내리고 가끔 조준탄
      const scan = (dir, delay, gx) => s.task(function* () {
        yield delay;
        const gapW = s.lv(72, 64, 58, 54, 50), spd = s.sp(2.2) * dir, warn = 50;
        const st = { y: dir > 0 ? 4 : s.H - 4 }, dur = Math.ceil((s.H - 8) / Math.abs(spd));
        const move = l => { if (l.t > warn) st.y += spd / 2; l.y = st.y; };   // 두 레이저가 같은 st를 반씩 옮김
        s.laser({ x: 0, y: st.y, ang: 0, len: gx - gapW / 2, w: 10, warn, dur, color: 'cyan', fn: move });
        s.laser({ x: gx + gapW / 2, y: st.y, ang: 0, len: s.W - gx - gapW / 2, w: 10, warn, dur, color: 'cyan', fn: move });
        s.mark({ x: gx, y: st.y + dir * 18, dur: warn });   // 틈 자리 표시
      }());
      if (s.diff >= 1) s.task(function* () {
        for (let k = 0; ; k++) {
          s.fire({ x: s.rand(10, s.W - 10), y: -8, ang: Math.PI / 2, spd: s.sp(1.3), shape: 'small', color: 'cyan' });
          if (k % 5 === 4) s.fire({ ang: s.aim(), spd: s.sp(2.3), shape: 'small', color: 'white' });
          yield s.lv(30, 20, 16, 14, 12);
        }
      }());
      for (let w = 0; ; w++) {
        const dir = w % 2 ? -1 : 1, lines = s.lv(1, 2, 2, 3, 3), gap = s.lv(72, 64, 58, 54, 50), delay = s.lv(110, 90, 80, 76, 72);
        let gx = s.rand(gap, s.W - gap);
        for (let i = 0; i < lines; i++) {
          scan(dir, i * delay, gx);
          gx = Math.max(gap, Math.min(s.W - gap, gx + s.rand(-180, 180)));
        }
        const len = 50 + Math.ceil((s.H - 8) / s.sp(2.2)) + (lines - 1) * delay;
        yield len;
        yield s.wait(30);
      }
    },
  },
  {
    name: '「예측 사격」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 45, start: [192, 70],
    *run(s) {
      // 저격(predictShot)을 연달아. 보스전에서는 빠졌고 세이브 포인트에서 저격 시스템을 씀
      for (let w = 0; ; w++) {
        for (let k = 0; k < s.lv(3, 4, 5, 6, 6); k++) {
          yield* predictShot(s);
          if (s.diff >= 3) s.ring(s.cnt(10), { offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'small', color: 'cyan' });
          yield s.lv(24, 20, 16, 14, 12);
        }
        yield s.wait(60);
        if (w % 3 === 2) yield* s.wander();
      }
    },
  },
  {
    name: '논스펠 · 이즘 3',
    type: 'nonspell', boss: '이즘', bossColor: '#8fe8ff', hp: 2800, time: 36, start: [192, 90],
    *run(s) {
      // 프레임 스킵: 탄이 잠깐 멈칫했다가 진행 방향으로 한 번에 튀어 나감. 튄 자리에 잔상이 남음
      const skip = (b, s) => {
        const k = b.t % 36;
        if (k === 24) { b.data.spd = b.spd; b.spd = 0; }
        else if (k === 32) {
          s.ghost(b.x, b.y, b.color);
          b.spd = b.data.spd; b.x += Math.cos(b.ang) * b.spd * 10; b.y += Math.sin(b.ang) * b.spd * 10;
        }
      };
      for (let w = 1; ; w++) {
        const off = s.rand(0, s.TAU), n = s.cnt(26);
        for (let i = 0; i < n; i++) s.fire({ ang: off + i * s.TAU / n, spd: s.sp(2.2), shape: 'small', color: 'cyan', fn: skip });
        yield s.wait(24);
        if (w % 2 === 0) s.spread(s.lv(1, 3, 3, 5), s.aim(), 0.2, { spd: s.sp(3), shape: 'rice', color: 'white', fn: skip });
        if (w % 8 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '「가상 전투 시뮬레이션」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3200, time: 50, start: [192, 80],
    *run(s) {
      // 이즘이 반투명 사본을 띄워 같은 공격을 여러 자리에서 흉내 냄. 사본은 맞지 않고, 조금씩 늦게 쏨(어긋남)
      const n = s.lv(2, 2, 3, 3, 4), clones = [];
      for (let i = 0; i < n; i++) { const c = s.partner({ name: '', x: s.boss.x, y: s.boss.y, color: '#8fe8ff' }); c.ghost = true; clones.push(c); }
      for (let w = 0; ; w++) {
        clones.forEach((c, i) => s.move(s.W * (i + 1) / (n + 1), s.rand(60, 150), 40, c));
        yield 50;
        for (let k = 0; k < 4; k++) {
          for (const src of [s.boss, ...clones]) {
            const real = src === s.boss, delay = real ? 1 : 1 + (clones.indexOf(src) + 1) * s.lv(10, 8, 6, 5);
            s.task(function* () {
              yield delay;
              s.spread(s.lv(3, 5, 5, 7, 7), s.aim(src.x, src.y), 0.2, { x: src.x, y: src.y, spd: s.sp(2.6), shape: real ? 'rice' : 'small', color: real ? 'white' : 'cyan' });
              if (!real && k % 2) s.ring(s.cnt(10), { x: src.x, y: src.y, offset: s.rand(0, s.TAU), spd: s.sp(1.5), shape: 'small', color: 'cyan' });
            }());
          }
          yield s.wait(36);
        }
        s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.5), shape: 'rice', color: 'white' });
        yield s.wait(40);
        if (w % 2 === 1) yield* s.wander(60, 40);
      }
    },
  },
  {
    name: '「감정 학습」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 48, start: [192, 70],
    *run(s) {
      // 이즘은 감정을 학습하며 자라는 AI. 플레이어가 머문 가로 자리를 기록해 두었다가 자주 머문 곳을 노림.
      // 한곳에 오래 버티면 점점 그 자리가 위험해짐
      const bins = 12, bw = s.W / bins, heat = Array(bins).fill(0);
      s.task(function* () {
        for (;;) {
          heat[Math.min(bins - 1, Math.floor(s.player.x / bw))] += 1;
          for (let i = 0; i < bins; i++) heat[i] *= 0.997;
          yield 1;
        }
      }());
      yield 90;
      for (let w = 0; ; w++) {
        const hot = [...heat.keys()].sort((a, b) => heat[b] - heat[a]).slice(0, s.lv(1, 2, 2, 3, 3));
        const ty = s.H - 60;
        for (const b of hot) s.mark({ x: (b + 0.5) * bw, y: ty, dur: s.lv(46, 40, 34) });
        yield s.lv(46, 40, 34);
        for (const b of hot) {
          const tx = (b + 0.5) * bw;
          s.spread(s.lv(5, 7, 7, 9, 9), Math.atan2(ty - s.boss.y, tx - s.boss.x), 0.045, { spd: s.sp(4.5), shape: 'knife', color: 'pink' });
        }
        s.ring(s.cnt(28), { offset: s.rand(0, s.TAU), spd: s.sp(1.5), shape: 'small', color: 'cyan' });
        yield s.wait(44);
        if (w % 4 === 3) yield* s.wander();
      }
    },
  },
  {
    name: '「오버클럭」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', bgmFollow: 1, hp: 3000, time: 48, start: [192, 80],
    *run(s) {
      // 불렛타임의 반대: 경고 뒤 잠깐 적 탄 시계만 확 빨라짐(2.4~3.4배). 평소엔 아주 느린 원형탄과 두 갈래 나선을 깔아 두었다가
      // 한꺼번에 몰아침
      for (let w = 0; ; w++) {
        const dir = w % 2 ? -1 : 1;
        for (let k = 0; k < 14; k++) {
          if (k % 2 === 0) s.ring(s.cnt(22), { offset: s.rand(0, s.TAU), spd: s.sp(0.75), shape: 'orb', color: 'cyan' });
          for (let i = 0; i < 2; i++) s.fire({ ang: dir * k * 0.33 + i * Math.PI, spd: s.sp(0.9), shape: 'rice', color: 'blue' });
          if (s.diff >= 3 && k % 4 === 1) s.spread(3, s.aim(), 0.25, { spd: s.sp(1.1), shape: 'rice', color: 'white' });
          yield s.wait(16);
        }
        s.say(s.boss, 'OVERCLOCK', 50);
        yield 45;
        s.bulletTime(s.lv(2.4, 2.7, 3, 3.2, 3.4), 180);   // 오버클럭 약 3초
        yield 180;
        yield 30;
      }
    },
  },
  {
    name: '「세이브 포인트」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 50, start: [192, 60],
    *run(s) {
      // 안전지대 하나를 기체 근처에 먼저 보여 준 뒤 빰! 나머지 화면을 탄으로 채움. 이후 안전지대가 탄막째 느린 곡선을 그리며
      // 끊기지 않고 계속 움직이고(최대 약 1.35px/프레임, 반복되는 곡선이라 채운 탄막이 비는 곳 없이 유지), 이즘이 예측 저격(predictShot)을
      // 계속 쏨. 약 1.5초마다 곧 향할 방향 화살표가 안전지대에 뜸(헬은 없음). 안전지대를 따라가기만 하면 저격에 걸리므로 안전지대 안에서 옆으로 비켜야 함
      const R = s.lv(52, 48, 44, 40, 38), pad = 150, ph = s.rand(0, s.TAU), c0x = 192, c0y = 250;
      const path = t => ({ x: c0x + 110 * Math.sin(t * 0.009 + ph), y: c0y + 70 * Math.sin(t * 0.013 + ph * 1.7) });
      // 시작 자리를 기체에 가깝게: 경로에서 기체와 가장 가까운 점부터
      let t0 = 0, best = 1e9;
      for (let t = 0; t < 1400; t += 10) { const q = path(t), d = Math.hypot(q.x - s.player.x, q.y - s.player.y); if (d < best) { best = d; t0 = t; } }
      const start = path(t0), zone = s.safeZone({ x: start.x, y: start.y, r: R, label: '', dur: 1e9 });
      s.sound('beep', 0.5);
      yield 80;
      const motion = { vx: 0, vy: 0 };
      fillField(s, { holes: [{ x: start.x, y: start.y, r: R }], spacing: s.lv(22, 21, 20, 19, 18), color: 'blue', motion, pad });
      let prev = start;
      s.task(function* () {
        for (let t = 1; ; t++) {
          const q = path(t0 + t);
          motion.vx = q.x - prev.x; motion.vy = q.y - prev.y; prev = q;
          zone.x = q.x; zone.y = q.y;
          // 이동 방향 전조: 약 1.5초마다 0.6초 뒤에 향할 방향 화살표를 안전지대에(헬은 없음)
          if (s.diff < 4 && t % 90 === 1) { const a = path(t0 + t + 36), b = path(t0 + t + 40); s.arrow(zone, Math.atan2(b.y - a.y, b.x - a.x), 44); }
          yield 1;
        }
      }());
      yield 50;
      for (;;) {
        yield* predictShot(s);
        yield s.lv(40, 34, 30, 28, 26);
      }
    },
  },
  {
    name: '「열흘 같은 하루」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 60, start: [192, 70],
    *run(s) {
      // 불렛타임 동안 위에서 미로 띠가 약 14초 동안 이어져 내려옴. 좁은 통로를 따라 빠져나가야 함.
      // 줄(12px 간격) 사이에는 기체가 설 자리가 없으므로 이웃한 두 줄의 통로가 겹쳐야 지나갈 수 있음.
      // 통로 폭 gapW는 통로 양쪽 탄 중심 사이 거리. 기체가 설 수 있는 폭은 gapW - 2×(탄 반지름 3 + 판정 2.4) = gapW - 10.8.
      // 줄마다 옮겨 가는 폭(shift)을 그보다 7px 이상 작게 둬서 어느 난이도에서도 두 줄의 통로가 겹침(막힌 미로 금지).
      // 한 줄이 기체를 지나가는 동안(약 8.6프레임) 다음 줄 통로로 옮겨야 하는 거리는 shift 이하라 저속 이동(1.6px/프레임)으로도 따라갈 수 있음
      const cell = 12, fall = 5, k = 0.25, v = fall * k, top = -10;
      for (;;) {
        const gapW = s.lv(48, 40, 32, 28, 26), shift = s.lv(8, 9, 10, 9, 8);
        const rows = Math.round(840 * v / cell);          // 미로가 기체를 지나가는 시간 약 14초
        const pre = 10;                                   // 처음 10줄은 한꺼번에 깔아 둠(y 110 → -10)
        const total = 20 + Math.ceil(((rows - pre) * cell + s.H + 40) / v) + 20;
        s.bulletTime(k, total);
        yield 20;                                         // 느려지기를 기다림(속도가 바뀌는 동안 줄 간격이 흐트러지지 않게)
        // 통로 경로: 첫 줄은 플레이어 바로 위. 한 방향으로 흐르다가 벽에 닿거나 가끔(20%) 방향을 틂
        const path = [];
        let cx = Math.max(gapW, Math.min(s.W - gapW, s.player.x)), dir = cx < s.W / 2 ? 1 : -1;
        for (let r = 0; r < rows; r++) {
          path.push(cx);
          if (Math.random() < 0.2) dir = -dir;
          if (cx + dir * shift < gapW || cx + dir * shift > s.W - gapW) dir = -dir;
          cx += dir * shift * s.rand(0.6, 1);
        }
        // 한 줄: 통로 가장자리(cx ± gapW/2)에서 바깥으로 cell 간격. 첫 탄을 돌려줘 다음 줄 간격의 기준으로 씀
        const row = (r, y) => {
          let first = null;
          for (const side of [-1, 1]) for (let x = path[r] + side * gapW / 2; x > -cell && x < s.W + cell; x += side * cell) {
            const b = s.fire({ x, y, ang: Math.PI / 2, spd: fall, shape: 'small', color: r % 2 ? 'cyan' : 'blue', marginTop: 200 });
            first = first || b;
          }
          return first;
        };
        // 기준 탄의 y를 따라 다음 줄을 정확히 cell 아래 간격으로 붙임. 폭탄 등으로 기준 탄이 지워지면 속도 v로 어림함
        let last = null, refY = 0;
        const tick = () => { refY = last.dead ? refY + v : last.y; };
        for (let r = 0; r < pre; r++) last = row(r, 110 - r * cell);
        refY = last.y;
        for (let r = pre; r < rows; r++) {
          while (refY - cell < top) { yield 1; tick(); }
          last = row(r, refY - cell); refY = last.y;
        }
        while (refY < s.H + 20) { yield 1; tick(); }
        s.clear();
        yield 90;   // 미로를 빠져나온 뒤 숨 돌릴 틈
        yield 60;
      }
    },
  },
  {
    name: '「백일몽」(가칭)',
    type: 'spell', strong: true, boss: '이즘', bossColor: '#8fe8ff', bgmFollow: 0.25, noSurgeExtra: true, hp: 3200, time: 70, start: [192, 70],
    *run(s) {
      // 「열흘 같은 하루」의 강화판: 느려진 시간(0.25배) 속 미로가 끊기지 않고 계속 이어짐. 필드 하단 오버클럭 게이지가 약 4초에 걸쳐
      // 차고, 가득 차면 경고 뒤 약 1.8초 동안 0.75배(평소의 3배)로 빨라지고, 직후 3초 동안은 0.1배로 엄청 느려졌다가 평소로 돌아옴.
      // 빨라져도 따라갈 수 있게 통로가 줄마다 옮겨 가는 폭(shift)을 4px 이하로 둠: 빨라진 동안 한 줄이 기체를 지나는 시간
      // 약 2.9프레임 × 저속 1.6px ≈ 4.6px > 4px.
      // 통로 폭은 열흘 같은 하루보다 조금 넓게(기체가 설 수 있는 폭 gapW - 10, 이웃 줄과 헬에서도 11px 이상 겹침)
      const cell = 12, fall = 5, slowK = 0.25, fastK = 0.75, calmK = 0.1, top = -10;
      const gapW = s.lv(50, 42, 36, 32, 28), shift = 4;
      s.bulletTime(slowK, 1e9);
      yield 20;
      let cx = Math.max(gapW, Math.min(s.W - gapW, s.player.x)), dir = cx < s.W / 2 ? 1 : -1, r = 0;
      const row = y => {
        let first = null;
        for (const side of [-1, 1]) for (let x = cx + side * gapW / 2; x > -cell && x < s.W + cell; x += side * cell) {
          const b = s.fire({ x, y, ang: Math.PI / 2, spd: fall, shape: 'small', color: r % 2 ? 'purple' : 'cyan', marginTop: 200 });
          first = first || b;
        }
        r++;
        if (Math.random() < 0.2) dir = -dir;
        if (cx + dir * shift < gapW || cx + dir * shift > s.W - gapW) dir = -dir;
        cx += dir * shift * s.rand(0.6, 1);
        return first;
      };
      // 오버클럭 쿨타임: 하단 게이지가 약 4초에 걸쳐 차오름 → 가득 차면 0.75초 경고(말풍선·빨라지는 경고음) → 1.8초 동안 오버클럭
      // → 3초 동안 아주 느려짐 → 평소 속도로 돌아오고 게이지가 다시 참
      const gauge = s.setGauge({ v: 0, color: '#ff4a5a' });
      const cycle = () => s.task(function* () {
        for (;;) {
          for (let t = 0; t < 240; t++) { gauge.v = t / 240; yield 1; }
          gauge.v = 1; gauge.flash = true;
          s.say(s.boss, 'OVERCLOCK', 45);
          for (let t = 0; t < 45; t += 9) { s.sound('beep', t / 45); yield 9; }
          s.bulletTime(fastK, 1e9);
          for (let t = 0; t < 108; t++) { gauge.v = 1 - t / 108; yield 1; }
          gauge.flash = false; gauge.v = 0;
          s.bulletTime(calmK, 1e9);
          yield 180;
          s.bulletTime(slowK, 1e9);
        }
      }());
      let cyc = cycle();
      // 발악: 격화 III에 닿으면 하던 오버클럭 주기를 멈추고 1초 경고 뒤 8초 동안 오버클럭(게이지가 8초에 걸쳐 줄어듦).
      // 처음부터 최고 속도가 아니라 5초에 걸쳐 평소 속도에서 오버클럭 속도까지 서서히 빨라지고, 남은 3초는 최고 속도.
      // 헬은 10초: 더 느리게(0.15배) 시작해 7초에 걸쳐 더 빠르게(0.85배) 올라가고 남은 3초는 최고 속도
      // 끝나면 3초 동안 아주 느려졌다가 평소 주기로 돌아감
      s.task(function* () {
        while (s.surge < 2) yield 1;
        cyc.return();
        gauge.v = 1; gauge.flash = true;
        s.say(s.boss, 'OVERCLOCK!!', 60); s.shake(6);
        for (let t = 0; t < 60; t += 6) { s.sound('beep', t / 60); yield 6; }
        const hell = s.diff >= 4, total = hell ? 600 : 480, ramp = hell ? 420 : 300, k0 = hell ? 0.15 : slowK, k1 = hell ? 0.85 : fastK;
        for (let t = 0; t < total; t++) {
          if (t % 10 === 0 && t <= ramp) s.bulletTime(k0 + (k1 - k0) * t / ramp, 1e9);
          gauge.v = 1 - t / total; yield 1;
        }
        gauge.flash = false; gauge.v = 0;
        s.bulletTime(calmK, 1e9);
        yield 180;
        s.bulletTime(slowK, 1e9);
        cyc = cycle();
      }());
      // 기준 탄의 y를 따라 다음 줄을 정확히 cell 위에 붙임(폭탄 등으로 지워지면 지금 속도로 어림)
      let last = null, refY = 0;
      for (let i = 0; i < 10; i++) last = row(110 - i * cell);
      refY = last.y;
      for (;;) {
        while (refY - cell < top) { yield 1; refY = last.dead ? refY + fall * s.slow : last.y; }
        last = row(refY - cell); refY = last.y;
      }
    },
  },
];

// ── 엑스트라: 진심 예로니모 ──
// 엑스트라 패턴은 extra: true로 표시만 함. 난이도는 본편과 같이 고른 그대로 계산

// ── 화면 채우기(발악·안전지대 패턴) ──
// 안전지대(holes: [{x, y, r}])만 비우고 화면 전체를 엇갈린 격자로 탄을 깖. motion을 주면 모든 탄이 motion.vx·vy로
// 함께 움직여 모양(=안전지대 자리)을 그대로 유지함. 움직일 만큼(pad) 화면 밖까지 미리 깔아 둠.
// 안전지대 안에서 기체 중심이 r - 2.4까지는 닿지 않음. 돌려받은 탄 목록은 s.pop으로 한꺼번에 지움
function fillField(s, o) {
  const sp = o.spacing ?? 18, pad = o.pad ?? 0, holes = o.holes || [], motion = o.motion;
  const out = [];
  let row = 0;
  for (let y = -pad + sp / 2; y < s.H + pad; y += sp, row++) {
    for (let x = -pad + (row % 2 ? sp : sp / 2); x < s.W + pad; x += sp) {
      if (holes.some(h => (x - h.x) ** 2 + (y - h.y) ** 2 < (h.r + 3) ** 2)) continue;
      out.push(s.fire({
        x, y, vx: 0, vy: 0, shape: o.shape ?? 'small', color: o.color ?? 'red', margin: pad + 40, keep: true,   // 폭탄에 지워지지 않는 구조물
        fn: motion ? (b => { b.vx = motion.vx; b.vy = motion.vy; }) : undefined,
      }));
    }
  }
  s.sound('fillIn');
  return out;
}

// CONFITEOR에서 부르는 일곱 죄.
// latin=화면 가운데 크게 뜨는 이름, hx·hy=안전지대 시작 자리, v(t)=채운 탄막 전체의 움직임,
// call=이름을 부르는 순간부터 화면을 채우기 직전까지 나오는 그 죄다운 탄막(안전지대로 가는 길을 막지 않을 만큼 가볍게),
// shot=채운 동안 본체가 쏘는, 안전지대 안에서도 피할 수 있는 간단한 탄
// 일곱 죄: 호명하는 순간부터 화면을 채우기 직전까지 그 죄다운 탄막(call). 채운 뒤에는 탄막 전체의 움직임(v)만으로 버팀
const SINS = [
  { latin: 'SUPERBIA', color: 'purple', hx: 192, hy: 190, v: t => [0, 0.5],
    // 교만: 위에서 내려다보듯 큰 탄이 줄지어 내려오고, 줄 사이로 작은 탄이 떨어짐
    *call(s) { for (let k = 0; ; k++) { const n = s.lv(5, 6, 6, 7, 7, 8), gap = s.W / n; for (let i = 0; i < n; i++) s.fire({ x: gap * (i + (k % 2 ? 0.75 : 0.25)), y: -10, ang: Math.PI / 2, spd: s.sp(1.8), shape: 'big', color: 'purple' });
      if (s.diff >= 1) for (let i = 0; i < n; i++) s.fire({ x: gap * (i + (k % 2 ? 0.25 : 0.75)), y: -10, ang: Math.PI / 2, spd: s.sp(2.4), shape: 'small', color: 'purple' });
      yield 34; } } },
  { latin: 'AVARITIA', color: 'gold', hx: 192, hy: 370, v: t => [0, -0.45],
    // 탐욕: 흩뿌린 금화가 다시 본체에게 모여듦(두 겹, 겹마다 되돌아오는 때가 다름)
    *call(s) { for (let k = 0; ; k++) { const off = s.rand(0, s.TAU);
      s.ring(s.cnt(22), { offset: off, spd: s.sp(3), accel: -0.06, minSpd: -s.sp(2.2), shape: 'orb', color: 'gold' });
      s.ring(s.cnt(14), { offset: off + 0.12, spd: s.sp(2.2), accel: -0.035, minSpd: -s.sp(1.8), shape: 'small', color: 'yellow' });
      yield 30; } } },
  { latin: 'LUXURIA', color: 'pink', hx: 192, hy: 300, v: t => [Math.cos(t * 0.021) * 1.1, 0],
    // 색욕: 번갈아 휘어 도는 꽃잎(더 촘촘하게)
    *call(s) { for (let k = 0; ; k++) { const n = s.cnt(18), dir = k % 2 ? 1 : -1; for (let i = 0; i < n; i++) s.fire({ ang: i * s.TAU / n + k * 0.2, spd: s.sp(2.3), angVel: dir * 0.013, shape: 'rice', color: 'pink' }); yield 14; } } },
  { latin: 'INVIDIA', color: 'green', hx: 192, hy: 310, holes: 2, v: t => [t < 150 ? 0.45 : -0.45, 0],
    // 질투: 좌우를 뒤집은 자리의 나와 진짜 나를 번갈아 노림(더 넓고 빠르게)
    *call(s) { for (let k = 0; ; k++) { const x = k % 2 ? s.W - s.player.x : s.player.x; s.spread(s.lv(5, 5, 7, 7, 7, 9), Math.atan2(s.player.y - s.boss.y, x - s.boss.x), 0.12, { spd: s.sp(3.3), shape: 'orb', color: 'green', fixed: true }); yield 14; } } },
  { latin: 'GULA', color: 'orange', hx: 192, hy: 290, v: t => [-Math.sin(t * 0.021), Math.cos(t * 0.021)],
    // 탐식: 솟구쳤다 떨어지는 덩어리(더 자주, 가끔 한꺼번에 게워 냄)
    *call(s) { for (let k = 0; ; k++) {
      s.fire({ vx: s.rand(-2.4, 2.4), vy: s.rand(-5, -3), ay: 0.06, shape: s.pick(['orb', 'small', 'big']), color: 'orange', marginTop: 200 });
      if (k % 25 === 24) for (let i = 0; i < s.lv(6, 8, 10, 10, 12, 12); i++) s.fire({ vx: s.rand(-3, 3), vy: s.rand(-6, -3.5), ay: 0.06, shape: 'small', color: 'orange', marginTop: 200 });
      yield s.lv(5, 4, 3, 3, 3, 2); } } },
  // 분노: 채운 뒤에는 1초마다 삐 소리 뒤 한 방향으로 확 끌려감
  { latin: 'IRA', color: 'red', hx: 192, hy: 290, v: t => {
      const k = t % 60, dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [-1, 0]], d = dirs[Math.floor(t / 60) % 5];
      return k >= 40 ? [d[0] * 1.6, d[1] * 1.6] : [0, 0];
    },
    // 분노: 빠른 칼날 연사 두 줄기 + 원형 폭발
    *call(s) { for (;;) { const a = s.aim(); for (let k = 0; k < s.lv(5, 6, 7, 8, 9, 10); k++) { for (const d of [-0.1, 0.1]) s.fire({ ang: a + d, spd: s.sp(6.5), shape: 'knife', color: 'red' }); yield 3; } s.ring(s.cnt(24), { offset: s.rand(0, s.TAU), spd: s.sp(2.5), shape: 'rice', color: 'red' }); yield 26; } } },
  { latin: 'ACEDIA', color: 'blue', hx: 230, hy: 250, small: 6, v: t => [-0.15, 0.2],
    // 나태: 뿌린 탄이 멈췄다가 한참 뒤 느릿느릿 흩어짐(더 많이)
    *call(s) { for (;;) { const n = s.cnt(22), off = s.rand(0, s.TAU); for (let i = 0; i < n; i++) s.fire({ ang: off + i * s.TAU / n, spd: s.sp(3), accel: -0.1, minSpd: 0, shape: 'orb', color: 'blue', fn: b => { if (b.t === 90) { b.accel = 0.01; b.maxSpd = s.sp(1.3); b.ang += s.rand(-0.5, 0.5); } } }); yield 28; } } },
];

SPELLS.push({
  name: 'Clavis Communis, 스피리투스 제10식 — CONFITEOR. 내 죄가 항상 내 앞에 있나이다',
  type: 'spell', strong: true, survival: true, extra: true, noSurgeExtra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 1, time: 75, start: [192, 110],
  *run(s) {
    const C = CHANTS.CONFITEOR;
    // 발악: 마리·마르코, 예로니모가 차례로 쓰러진 뒤의 비상 상황이라 입회·승인 절차 없이 곧바로 개방(시험판 연출)
    s.boss.chantColor = '#ffe6a0';
    s.impact(8);
    yield 30;
    yield* s.chant(C.slice(0, 6), { by: s.boss, step: 28 });
    const R = s.lv(48, 44, 40, 36, 34, 32), preview = s.lv(100, 90, 80, 72, 66, 60), hold = 300;
    // 일곱 죄: 이름 → 초록 안전지대 미리 보기 → 안전지대만 빼고 화면을 채움 → 탄막 전체가 천천히 움직임 → 빰! 지움
    for (let i = 0; i < 7; i++) {
      const sin = SINS[i];
      // 호명: 가운데에 라틴어 이름이 크게 뜨고, 그 죄다운 탄막이 곧바로 시작돼 채우기 직전까지 이어짐
      s.title(sin.latin, sin.color);
      s.shake(6);
      const call = s.task(sin.call(s));
      yield* s.chant([C[6 + i]], { by: s.boss, step: 30, hold: 0 });
      const r = R - (sin.small || 0);
      const holes = sin.holes === 2 ? [{ x: sin.hx - 90, y: sin.hy, r }, { x: sin.hx + 90, y: sin.hy, r }] : [{ x: sin.hx, y: sin.hy, r }];
      const zones = holes.map(h => s.safeZone({ x: h.x, y: h.y, r, dur: preview + hold + 10 }));
      // 전조: 안전지대가 움직이기 시작하거나 방향을 바꾸기 약 0.6초 전에 그 방향 화살표를 안전지대에 띄움
      let said = null;
      const foretell = t => {
        const [vx, vy] = sin.v(Math.max(0, t + 36)), m = Math.hypot(vx, vy);
        if (m < 0.05) { said = null; return; }
        const ang = Math.atan2(vy, vx);
        if (said !== null && Math.abs(((ang - said + Math.PI * 3) % s.TAU) - Math.PI) < 1.2) return;
        said = ang;
        for (const z of zones) s.arrow(z, ang, 44);
        s.sound('beep', 0.4);
      };
      for (let t = -preview; t < 0; t++) { if (t >= -36) foretell(t); yield 1; }
      call.return();
      const motion = { vx: 0, vy: 0 };
      const list = fillField(s, { holes, motion, pad: 160, spacing: s.lv(20, 19, 18, 17, 16, 16), color: sin.color });
      for (let t = 0; t < hold; t++) {
        const [vx, vy] = sin.v(t);
        motion.vx = vx; motion.vy = vy;
        for (const z of zones) { z.x += vx; z.y += vy; }
        if (i === 5 && t % 60 === 36) s.sound('beep', 0.8);
        foretell(t);
        yield 1;
      }
      s.pop(list);
      yield 16;   // 빰! 하고 곧바로 다음 이름으로
    }
    s.clear();
    // 대답하라 ~ 호명: 응답한 이름에 못박혀 잠시 둔해진 채 일곱 색의 탄을 버팀
    yield* s.chant(C.slice(13, 16), { by: s.boss, step: 36, hold: 0 });
    s.player.stun = 150;
    s.impact(10);
    s.task(function* () {
      const colors = ['purple', 'gold', 'pink', 'green', 'orange', 'red', 'blue'];
      for (let k = 0; ; k++) { s.ring(s.cnt(21), { offset: k * 0.15, spd: s.sp(1.5), shape: 'small', color: colors[k % 7] }); yield s.wait(26); }
    }());
    // 발악 사슬: 화면 가장자리 여기저기서 기체를 겨눈 사슬이 3점사(헬 6점사)로 쇄도. 천천히 뻗어 비킬 수 있음
    s.task(function* () {
      yield 150;   // 둔해진(stun) 동안은 사슬 없음
      for (;;) {
        for (let k = 0; k < s.lv(3, 3, 3, 3, 6); k++) {
          const side = s.randInt(0, 2), x = side === 0 ? -8 : side === 1 ? s.W + 8 : s.rand(20, s.W - 20), y = side === 2 ? -8 : s.rand(20, s.H * 0.6);
          s.chain({ x, y, ang: Math.atan2(s.player.y - y, s.player.x - x), len: 760, warn: 44, shoot: 40, hold: 12, retract: 60 });
          yield 22;   // 점사 사이
        }
        yield s.lv(110, 100, 90, 85, 80);
      }
    }());
    yield* s.chant([C[16]], { by: s.boss, step: 60 });
    for (;;) yield 60;
  },
});

// ── 격화 III 추가 탄막 ──
// 패턴이 격화 III(진행도 2/3)에 닿으면 그 보스다운 가벼운 탄막이 그 패턴이 끝날 때까지 함께 나옴(엔진이 붙임).
// 보스 이름의 괄호 앞부분으로 찾음(예로니모(진심) → 예로니모). noSurgeExtra: true인 패턴은 제외
const edgePoint = s => { const side = s.randInt(0, 2); return side === 0 ? { x: -8, y: s.rand(20, s.H * 0.6) } : side === 1 ? { x: s.W + 8, y: s.rand(20, s.H * 0.6) } : { x: s.rand(20, s.W - 20), y: -8 }; };
const SURGE_EXTRA = {
  // 경광등: 화면 양옆에서 빨강·파랑 조준탄이 번갈아
  '윤도연': function* (s) { for (let k = 0; ; k++) { const x = k % 2 ? s.W - 6 : 6, y = s.rand(60, 200); s.spread(3, Math.atan2(s.player.y - y, s.player.x - x), 0.15, { x, y, spd: s.sp(2.4), shape: 'rice', color: k % 2 ? 'blue' : 'red', fixed: true }); yield s.lv(90, 80, 70, 64, 60); } },
  // 관통탄: 기체 x 위로 예고선 뒤 위에서 칼날 줄기가 내리꽂힘
  '고현성': function* (s) { for (;;) { const x = s.player.x; s.warnLine({ x, y: 0, x2: x, y2: s.H, dur: 40, band: 8 }); yield 40; for (let i = 0; i < 6; i++) { s.fire({ x, y: -8, ang: Math.PI / 2, spd: s.sp(5), shape: 'knife', color: 'cyan' }); yield 3; } yield s.lv(110, 100, 90, 84, 80); } },
  // 황금 충격파: 느린 큰 원형탄
  '마르코': function* (s) { for (;;) { s.ring(s.lv(8, 10, 12, 12, 14), { offset: s.rand(0, s.TAU), spd: s.sp(1.3), shape: 'big', color: 'gold' }); s.shake(2); yield s.lv(130, 120, 110, 100, 95); } },
  // 플래시: 화면 위 여기저기서 별 원형탄이 터짐
  '김예나': function* (s) { for (;;) { const x = s.rand(40, s.W - 40), y = s.rand(40, 160); s.mark({ x, y, dur: 24 }); yield 24; s.ring(s.lv(8, 10, 12, 12, 14), { x, y, offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'star', color: 'pink' }); yield s.lv(80, 70, 60, 56, 52); } },
  // 음파: 박자마다 보스에서 퍼지는 작은 탄 부채
  '차서린': function* (s) { for (let k = 0; ; k++) { s.spread(s.lv(7, 9, 9, 11, 11), Math.PI / 2 + (k % 2 ? 0.25 : -0.25), 0.16, { spd: s.sp(1.8), shape: 'small', color: 'cyan', fixed: true }); yield s.lv(84, 76, 72, 68, 64); } },
  // 히어로 대시: 양옆에서 기체를 향한 칼날 두 발
  '고태웅': function* (s) { for (;;) { for (const x of [4, s.W - 4]) { const y = s.rand(80, s.H * 0.6); s.fire({ x, y, ang: Math.atan2(s.player.y - y, s.player.x - x), spd: s.sp(3.4), shape: 'knife', color: 'orange' }); } yield s.lv(90, 80, 70, 64, 60); } },
  // 코스모: 착각 — 좌우가 뒤바뀐 자리로 가는 조준탄
  '코스모': function* (s) { for (;;) { const x = s.W - s.player.x; s.fire({ ang: Math.atan2(s.player.y - s.boss.y, x - s.boss.x), spd: s.sp(2.4), shape: 'orb', color: 'pink' }); yield s.lv(60, 50, 44, 40, 36); } },
  // 진: 위에서 떨어지는 보라 결정이 바닥 근처에서 증기로 흩어짐
  '진': function* (s) { for (;;) { const x = s.rand(30, s.W - 30); s.fire({ x, y: -10, ang: Math.PI / 2, spd: s.sp(1.6), shape: 'star', color: 'purple', fn: (b, s) => { if (b.t === 140) { b.dead = true; s.ring(5, { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: s.sp(0.8), shape: 'small', color: 'purple' }); } } }); yield s.lv(70, 60, 54, 50, 46); } },
  // 검은 비가 더 내림
  '아즈라엘': function* (s) { yield* azRain(s, { every: s.lv(26, 22, 20, 18, 16), spd: 1.0, shape: 'orb', color: 'void', sway: 0.4 }); },
  // 가장자리에서 기체를 겨눈 사슬
  '예로니모': function* (s) { for (;;) { const o = edgePoint(s); s.chain({ x: o.x, y: o.y, ang: Math.atan2(s.player.y - o.y, s.player.x - o.x), len: 760, warn: 50, shoot: 24, hold: 10, retract: 50 }); yield s.lv(140, 120, 110, 100, 90); } },
  // 가장자리에서 기어 들어오는 덩굴
  '리크니스': function* (s) { for (;;) { const o = edgePoint(s); s.task(ivyVine(s, { x: o.x, y: o.y, ang: Math.atan2(s.player.y - o.y, s.player.x - o.x), spd: s.sp(2), len: 150, seek: 0.02, seekFor: 50, turn: 0.02, stay: 90 })); yield s.lv(170, 150, 140, 130, 120); } },
  // 예측 저격
  '이즘': function* (s) { for (;;) { yield* predictShot(s); yield s.lv(150, 130, 120, 110, 100); } },
};

// 보스전: 목숨·폭탄·파워를 이어 가며 패턴을 순서대로. name은 오른쪽 표시용 짧은 이름, power는 시작 파워,
// hpScale은 체력·제한시간 배율. 목록은 스테이지 순서. 1스테이지는 홍마향처럼 중간 보스(윤도연) 뒤에 보스(고현성)
// 3스테이지는 세 보스전(3-1·3-2·3-3)으로 나눔. 각각 노말에서 약 4분(회피 봇·아리엘 실측으로 맞춘 hpScale)
// 캐릭터별 스펠은 1~3장. 예측 사격은 뺐지만 시스템(이동 예측 저격)은 나중에 쓰려고 남겨 둠. 나중에 한 보스전 안에서 모든 스펠이 나오는 구조로 바꿀 예정.
// 본게임에 쓰는 스펠은 여기 보스전 순서에 든 것만(2026-09-27 추림). 필리우스 제1식(내구)·휘감는 덩굴·감정 학습·오버클럭·
// 열흘 같은 하루와 시험 패턴은 빠졌으며 단일 패턴 연습에서만 볼 수 있다
// 길이(노말, 실제 플레이 기준 = 보스 밑 약 70%): 풀딜 기준으로 중간 보스 약 1.05분, 일반 보스 약 1.9분, 5스테이지부터 약 2.4분.
// bossScale: 한 보스전 안에서 보스별 추가 배율(중간 보스를 따로 맞춤)
// pages: 페이즈마다 패턴 수. 보스 하나가 체력바 하나이고, 페이즈 경계(큰 전환점)에 표시선과 전환 연출. 페이즈 안 패턴은 결과 화면 없이 이어짐.
// 보스는 2페이즈(중간 보스는 1페이즈). 5스테이지 전은 스테이지 전체 2페이즈 이하
// 본게임에서는 앞에 도중(잡몹 구간)이 붙고, 패턴 테스트 룸의 보스전은 보스부터. 시작 파워는 그 스테이지에 닿았을 때쯤의 값
function spellOf(name, boss) {
  const sp = SPELLS.find(x => x.name === name && (!boss || x.boss === boss));
  if (!sp) throw new Error('보스전 패턴 없음: ' + name);
  return sp;
}
const BOSS_RUNS = [
  {
    title: '1스테이지 · 괴이사건대책반', name: '대책반', pages: [2, 2], power: 0, hpScale: 4.23, bossScale: { '윤도연': 0.72 },
    seq: [
      spellOf('논스펠 · 윤도연'),
      spellOf('「발포 점착제」(가칭)'),
      spellOf('논스펠 · 고현성 1'),
      spellOf('「성스러운 수류탄」(가칭)'),   // 5스테이지 전은 스테이지마다 2페이지(강선 그물·고현성 논스펠 2는 패턴 테스트 룸에서)
    ],
  },
  {
    title: '2스테이지 · 마리와 마르코', name: '마리·마르코', pages: [2, 2], power: 1.5, hpScale: 4.5, bossScale: { '마리': 1.61 },
    seq: [
      // 5스테이지 전은 스테이지마다 2페이지: 마리·마르코 합류 → 마르코 폭주(마리 단독·마르코 파테르 제1식은 패턴 테스트 룸에서)
      spellOf('논스펠 · 마리와 마르코'),
      spellOf('필리우스 제2식 — 그의 백성을 두르시리로다'),
      spellOf('논스펠 · 마르코 (폭주)'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니', '마르코'),
    ],
  },
  {
    title: '3스테이지-1 · 김예나', name: '김예나', pages: [2, 2], power: 2, hpScale: 6.08,
    seq: [
      spellOf('논스펠 · 김예나 1'),
      spellOf('「셔터 찬스」(가칭)'),
      spellOf('논스펠 · 김예나 2'),
      spellOf('「스펙타클」(가칭)'),
    ],
  },
  {
    title: '3스테이지-2 · 고태웅', name: '고태웅', pages: [2, 2], power: 2.25, hpScale: 5.08,
    seq: [
      spellOf('논스펠 · 고태웅 1'),
      spellOf('「히어로 킥」(가칭)'),
      spellOf('논스펠 · 고태웅 2'),
      spellOf('「정의의 파도」(가칭)'),
    ],
  },
  {
    // 코스모(중간 보스, 1페이즈: 논스펠 → 꿈의 재현) → 진(보스, 2페이즈: 논스펠 → 승화 | 연쇄 반응)
    title: '4스테이지 · NYMPH', name: 'NYMPH', pages: [2, 2, 1], power: 2.5, hpScale: 8.75, bossScale: { '코스모': 1 },
    seq: [
      spellOf('논스펠 · 코스모'),
      spellOf('「꿈의 재현」(가칭)'),
      spellOf('논스펠 · 진'),
      spellOf('「승화」(가칭)'),
      spellOf('「연쇄 반응」(가칭)'),
    ],
  },
  {
    title: '5스테이지 · 아즈라엘', name: '아즈라엘', pages: [2, 2], power: 2.75, hpScale: 4.98,
    seq: [
      // 명암은 뺌(패턴 테스트 룸에서만). 1페이즈 논스펠 1 → 검은 안개, 2페이즈 논스펠 3 → 아인
      spellOf('논스펠 · 아즈라엘 1'),
      spellOf('「검은 안개」(가칭)'),
      spellOf('논스펠 · 아즈라엘 3'),
      spellOf('「아인」(가칭)'),
    ],
  },
  {
    title: '6스테이지 · 예로니모', name: '예로니모', pages: [4, 2], power: 3, hpScale: 3.81,
    seq: [
      spellOf('논스펠 · 예로니모 1'),
      spellOf('스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고'),
      spellOf('논스펠 · 예로니모 2'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니', '예로니모'),
      spellOf('Clavis Collata — NUNC DIMITTIS'),
      spellOf('Clavis Collata — NUNC DIMITTIS · 후반'),
    ],
  },
  {
    title: '7스테이지 · 리크니스', name: '리크니스', pages: [2, 3], power: 3.5, hpScale: 4.09,
    seq: [
      spellOf('논스펠 · 리크니스 2'),
      spellOf('「뿌리를 찾는 덩굴」(가칭)'),
      spellOf('논스펠 · 리크니스 3'),
      spellOf('「덩굴에 핀 꽃」(가칭)'),
      spellOf('「담쟁이 정원」(가칭)'),
    ],
  },
  {
    title: '엑스트라 · 진심 예로니모', name: '진심 예로니모', pages: [3, 3], power: 4, hpScale: 2.7,
    seq: [
      spellOf('논스펠 · 예로니모 3', '예로니모(진심)'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니', '예로니모(진심)'),
      spellOf('논스펠 · 예로니모 2', '예로니모(진심)'),
      spellOf('Clavis Collata — NUNC DIMITTIS', '예로니모(진심)'),
      spellOf('Clavis Collata — NUNC DIMITTIS · 후반', '예로니모(진심)'),
      spellOf('Clavis Communis, 스피리투스 제10식 — CONFITEOR. 내 죄가 항상 내 앞에 있나이다'),
    ],
  },
  {
    title: '엑스트라 2 · 이즘', name: '이즘', pages: [2, 3], power: 4, hpScale: 4.6,
    seq: [
      spellOf('논스펠 · 이즘 1'),
      spellOf('「순차 격자 타격」(가칭)'),
      spellOf('논스펠 · 이즘 2'),
      spellOf('「세이브 포인트」(가칭)'),
      spellOf('「백일몽」(가칭)'),
    ],
  },
];

// ── 도중(잡몹 구간): 날개 달린 오르트로스 ──
// 본게임에서 보스전 앞에 약 30초. 파워를 모으는 구간이라 탄은 가볍고 읽기 쉬운 것만(조준탄·작은 부채꼴·성긴 원형탄).
// 스테이지마다 세기 T(0~0.5)로 적 수·탄속·체력이 조금씩 오름. 끝나기 약 5초 전부터는 새 웨이브를 부르지 않아 화면이 비고 보스가 등장함.
// 부채꼴은 fixed라 하드 이상·격화의 줄 추가를 받지 않음
const MOB_HP = (T, big) => Math.round(big ? 200 + 400 * T : 10 + 16 * T);
// 작은 개체는 다섯에 셋은 작은 P 둘, 둘은 하나(평균 1.6개). 중형은 작은 P 하나와 큰 P 하나.
// 회피 봇 기준 30초에 약 +0.5~0.6. 보스 패턴 종료 때도 스테이지마다 약 +1.3~1.6을 얻어 3스테이지 무렵 MAX
let mobCount = 0;
const mobDrop = () => [mobCount++ % 5 < 3 ? 2 : 1, 0], MOB_DROP_BIG = [1, 1];
const MOB_WAVES = {
  // 줄지어 내려오다 반대쪽으로 꺾으며 조준탄 한 번
  *line(s, T, col, side) {
    const n = 5 + Math.round(2 * T);
    for (let i = 0; i < n; i++) {
      s.enemy({ x: side < 0 ? 50 + i * 4 : s.W - 50 - i * 4, y: -16, vy: 1.9, hp: MOB_HP(T), drop: mobDrop(), run: function* (e, s) {
        yield 34;
        e.vx = -side * 1.3; e.vy = 0.8;
        yield 12;
        s.spread(s.lv(1, 1, 1, 3, 3), s.aim(e.x, e.y), 0.24, { x: e.x, y: e.y, spd: s.sp(2 + 0.5 * T), shape: 'small', color: col, fixed: true });
        e.vy = -0.3;
      } });
      yield 14;
    }
    yield 50;
  },
  // V자 편대: 내려와 멈춰 조준탄 한 발(이지는 한 칸 건너) → 위로 물러남
  *vee(s, T, col) {
    const n = 5, mid = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i - mid), ty = 60 + d * 16;
      s.enemy({ x: s.W / 2 + (i - mid) * 44, y: -16 - d * 20, vy: 2.2, hp: MOB_HP(T), drop: mobDrop(), run: function* (e, s) {
        while (e.y < ty) yield 1;
        e.vy = 0;
        yield 24 + d * 8;
        if (s.diff >= 1 || i % 2 === 0) s.fire({ x: e.x, y: e.y, ang: s.aim(e.x, e.y), spd: s.sp(2.2 + 0.5 * T), shape: 'rice', color: col });
        yield 60;
        e.vy = -1.2;
      } });
    }
    yield 150;
  },
  // 양옆 협공: 좌우에서 들어와 멈추고 성긴 원형탄 한 번, 위로 빠짐
  *pincer(s, T, col) {
    const n = 3;
    for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
      const y = 130 + i * 28, tx = side < 0 ? 50 + i * 22 : s.W - 50 - i * 22;
      s.enemy({ x: side < 0 ? -20 : s.W + 20, y, vx: -side * 2.4, hp: MOB_HP(T), drop: mobDrop(), run: function* (e, s) {
        while (Math.abs(e.x - tx) > 3) { e.vx = (tx - e.x) * 0.06; yield 1; }
        e.vx = 0;
        yield 20 + i * 12;
        s.ring(s.lv(5, 6, 7, 8, 8), { x: e.x, y: e.y, offset: s.aim(e.x, e.y) + Math.PI / 8, spd: s.sp(1.5 + 0.4 * T), shape: 'orb', color: col });
        yield 50;
        e.vx = side * 0.6; e.vy = -1.4;
      } });
    }
    yield 160;
  },
  // 중형: 크게 내려와 잠깐 머물며 느린 원형탄(짝수 번은 조준 부채꼴 섞음), 큰 P를 떨어뜨림
  *medium(s, T, col, kind) {
    const x0 = kind % 2 ? s.W * 0.35 : s.W * 0.65;
    s.enemy({ x: x0, y: -30, vy: 1.4, hp: MOB_HP(T, true), r: 22, color: col, drop: MOB_DROP_BIG, run: function* (e, s) {
      while (e.y < 96) yield 1;
      e.vy = 0;
      yield 20;
      for (let k = 0; k < 4; k++) {
        s.ring(s.lv(10, 12, 14, 16, 16), { x: e.x, y: e.y, offset: k * 0.2, spd: s.sp(1.4 + 0.4 * T), shape: 'orb', color: col });
        if (kind % 2 === 0 && k % 2) s.spread(3, s.aim(e.x, e.y), 0.25, { x: e.x, y: e.y, spd: s.sp(2.2), shape: 'small', color: 'white', fixed: true });
        yield 45;
      }
      e.vy = -0.8;
    } });
    yield 150;
  },
};
// 도중 웨이브 순서(약 25초 동안 차례로)
const MOB_PLAN = [['line', -1], ['line', 1], ['vee'], ['medium'], ['pincer'], ['line', -1], ['vee'], ['line', 1]];
function mobStage(run, o) {
  const [label] = run.title.split(' · ');
  return {
    name: `${label} 도중 · 날개 달린 오르트로스`, type: 'stage', time: o.time ?? 30, bgm: '잡몹전',   // 도중 곡: bgm/잡몹전/ 폴더(모든 스테이지 공통)
    *run(s) {
      const end = (o.time ?? 30) * 60 - 300;
      let med = o.kind ?? 0;
      for (let i = 0; s.frame < end; i++) {
        const [name, arg0] = MOB_PLAN[i % MOB_PLAN.length];
        s.task(MOB_WAVES[name](s, o.T, o.col, name === 'medium' ? med++ : arg0));
        yield 170;
      }
    },
  };
}
// 보스전마다 도중: 세기, 탄 색(길이는 모두 30초)
const MOB_STAGES = {
  '대책반': { T: 0, col: 'red' },
  '마리·마르코': { T: 0.05, col: 'yellow', kind: 1 },
  '김예나': { T: 0.1, col: 'pink' },
  '고태웅': { T: 0.2, col: 'orange' },
  'NYMPH': { T: 0.22, col: 'purple', kind: 1 },
  '아즈라엘': { T: 0.25, col: 'white', kind: 1 },
  '예로니모': { T: 0.3, col: 'gold' },
  '리크니스': { T: 0.35, col: 'red', kind: 1 },
  '진심 예로니모': { T: 0.5, col: 'gold' },
  '이즘': { T: 0.5, col: 'cyan', kind: 1 },
};
for (const r of BOSS_RUNS) {
  const o = MOB_STAGES[r.name];
  if (!o) continue;
  r.stage = mobStage(r, o);
  SPELLS.push(r.stage);
}

// 본게임 순서(보스전 이름). 만들어진 스테이지만 이음. 4·5스테이지는 만들면 끼워 넣음
const STORY = {
  main: ['대책반', '마리·마르코', '김예나', '고태웅', 'NYMPH', '아즈라엘', '예로니모', '리크니스'],
  extra: ['진심 예로니모'],
  extra2: ['이즘'],
};
