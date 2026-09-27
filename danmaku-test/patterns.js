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
//   *run(s) { ... }                          // 제너레이터. yield n = n프레임 대기
// }
//
// 난이도 (0=이지 1=노말 2=하드 3=베리하드 4=헬. 패턴에 적은 기준값이 하드)
//   s.lv(이지, 노말, 하드, ...)   난이도별 값 고르기. 값이 모자라면 마지막 값을 씀
//   s.cnt(n)   탄 개수 배율(이지 55%, 노말 80%, 베리하드 120%, 헬 140%). 스펠카드는 보스 체력이 줄수록 최대 20% 더
//   s.heat      스펠 진행도 0→1(스펠카드는 깎인 체력 비율, 내구 스펠은 지난 시간 비율)
//   s.wait(f)  발사 간격 배율(이지 1.6배 … 헬 0.78배)
//   s.sp(v)    탄속 배율(이지 82% … 헬 112%)
//   체력·제한시간은 엔진이 배율을 곱해 적용(보스전은 hpScale, 단일 연습은 2.2배. 내구 스펠·잡몹 구간 제외)
//
// s 주요 함수
//   s.fire({ang, spd, shape, color, accel, angVel, maxSpd, minSpd, x, y, fn, alpha})
//   s.fire({vx, vy, ax, ay, ...})             // 직교 좌표 운동(중력 등)
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
//   s.shield(대상, 프레임)                    보호막. 통상탄은 막고 봄은 통과
//   s.zone({x, y, r, dur})                    고정 구역 보호막. 들어온 자기 탄을 지움
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
//   extra: true                               엑스트라 패턴. 고른 난이도보다 한 단계 위로 계산 (chants.js, 세계관 원문 그대로)
//   탄의 alpha는 판정이 그대로이므로 0.35 아래로 내리지 않는다
//
// shape: small orb big rice knife star link leaf
// color: red orange yellow green ivy cyan blue purple pink white gold brown black

// ── 성당교회 공통 ──
// 2스테이지 가운데 구간: 마르코가 합류해 마리와 함께 싸움. 마르코가 보스, 마리는 동료. 영창 색은 마르코=금빛, 마리=하늘빛
function churchDuo(s, at = [80, 70]) {
  s.boss.chantColor = '#ffe6a0';
  const mari = s.partner({ name: '마리', x: -30, y: 40, to: at, color: '#cfe8ff' });
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
      b.x += Math.sin(ft * 0.08 + (group ? group.phase : 0)) * 0.5;
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
  const head = s.fire({ x, y, spd: 0, shape: 'orb', color: 'green', margin: m + 20 });
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
        a += 0.13 + 0.05 * Math.sin(f * 0.01);
        for (let i = 0; i < s.lv(3, 4, 4); i++) s.fire({ ang: a + i * s.TAU / s.lv(3, 4, 4), spd: s.sp(2.6), shape: 'rice', color: 'purple' });
        if (s.diff >= 2 || (s.diff === 1 && f % 2 === 0)) for (let i = 0; i < 3; i++) s.fire({ ang: -a * 0.7 + i * s.TAU / 3, spd: s.sp(1.8), shape: 'small', color: 'pink' });
        yield s.wait(5);
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
        for (let k = 0; k < 3; k++) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.14, { spd: s.sp(3.4), shape: 'rice', color: 'blue' }); yield 6; }
        yield s.wait(24);
        s.ring(s.cnt(20), { offset: w * 0.13, spd: s.sp(1.6), shape: 'small', color: 'white' });
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
      // 떨어질 자리를 십자선으로 먼저 보여 주고, 플레이어 바로 위에는 떨어뜨리지 않음. 붙은 덩어리 사이로 조준 사격을 피함
      const stick = s.lv(200, 180, 160, 150, 140);
      for (let w = 0; ; w++) {
        for (let i = 0; i < s.lv(3, 4, 5, 5, 6); i++) {
          let tx, ty, tries = 0;
          do { tx = s.rand(40, s.W - 40); ty = s.rand(220, s.H - 40); } while (Math.hypot(tx - s.player.x, ty - s.player.y) < 60 && ++tries < 20);
          const T = 50, g = 0.12;
          s.mark({ x: tx, y: ty, dur: T });
          s.fire({
            vx: (tx - s.boss.x) / T, vy: (ty - s.boss.y) / T - 0.5 * g * T, ay: g, shape: 'big', color: '#f0e6a0', marginTop: 200,
            fn: b => { if (b.t === T) { b.vx = 0; b.vy = 0; b.ay = 0; } if (b.t > T + stick) b.dead = true; },
          });
          yield 8;
        }
        for (let k = 0; k < 4; k++) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.2, { spd: s.sp(2.8), shape: 'rice', color: 'blue' }); yield s.wait(22); }
        yield s.wait(50);
      }
    },
  },
  {
    name: '논스펠 · 고현성 1',
    type: 'nonspell', boss: '고현성', bossColor: '#c8d4e8', hp: 1800, time: 34, start: [192, 100],
    *run(s) {
      // E4 관통탄 연사: 조준한 방향 둘레를 좌우로 훑는 칼날 줄기 + 사이사이 원형탄
      for (let w = 1; ; w++) {
        const a0 = s.aim();
        for (let k = 0; k < s.lv(8, 10, 12, 14, 14); k++) {
          s.spread(s.lv(3, 3, 5, 5, 7), a0 + Math.sin(k * 0.4) * 0.25, 0.2, { spd: s.sp(4.2), shape: 'knife', color: 'cyan' });
          yield 4;
        }
        yield s.wait(30);
        s.ring(s.cnt(24), { offset: s.rand(0, s.TAU), spd: s.sp(1.8), shape: 'orb', color: 'blue' });
        yield s.wait(40);
        if (w % 2 === 0) yield* s.wander(80, 45);
      }
    },
  },
  {
    name: '「강선 그물」(가칭)',
    type: 'spell', boss: '고현성', bossColor: '#c8d4e8', hp: 2200, time: 45, start: [192, 90],
    *run(s) {
      // 강선 그물: 플레이어 둘레에 45도 격자로 예고선이 깔리고, 강선이 한꺼번에 팽팽해짐. 마름모 칸 한가운데로 옮기면 안전
      for (let w = 0; ; w++) {
        const gap = s.lv(110, 96, 86, 80, 76), warn = s.lv(62, 54, 48, 44, 40);
        const cx = s.player.x, cy = s.player.y, off = s.rand(-gap / 2, gap / 2);
        for (const ang of [Math.PI / 4, Math.PI * 3 / 4]) {
          const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
          for (let k = -4; k <= 4; k++) {
            const px = cx + nx * (k * gap + off), py = cy + ny * (k * gap + off);
            s.laser({ x: px - Math.cos(ang) * 640, y: py - Math.sin(ang) * 640, ang, len: 1280, w: 10, warn, dur: 60, color: 'white' });
          }
        }
        yield warn;
        for (let k = 0; k < 3; k++) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.6), shape: 'rice', color: 'cyan' }); yield 18; }
        yield s.wait(70);
      }
    },
  },
  {
    name: '논스펠 · 고현성 2',
    type: 'nonspell', boss: '고현성', bossColor: '#c8d4e8', hp: 2000, time: 36, start: [192, 100],
    *run(s) {
      // 충격탄: 느려지며 멈춘 자리에서 터져 작은 탄을 사방으로
      for (let w = 1; ; w++) {
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
    type: 'spell', boss: '고현성', bossColor: '#c8d4e8', hp: 2400, time: 48, start: [192, 90],
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
      // 보통 탄)을 "딱!" 하고 튕김. 옆으로 섞여 오는 하늘색 탄을 함께 피함. 두 번에 한 번은 필리우스 제1식으로 자기에게 보호막
      s.boss.chantColor = '#cfe8ff';
      for (let cycle = 0; ; cycle++) {
        yield* castGap(s);
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.3, spd: s.sp(1.5), shape: 'orb', color: 'cyan' }); yield s.wait(34); }
        }());
        if (cycle % 2 === 1) { yield* s.chant('FILIUS1', { by: s.boss }); s.shield(s.boss, s.lv(150, 180, 200, 210, 220)); }
        yield* s.chant('PATER1', { by: s.boss });
        light.return();
        s.boss.glow = 170;
        for (let k = 0; k < s.lv(4, 5, 6, 6, 7); k++) {
          const a = s.aim();
          s.spread(s.lv(3, 5, 5, 7, 7), a, 0.26, { spd: s.sp(2.2), shape: 'big', color: 'yellow' });
          if (k % 2 === 0) { s.say(s.boss, '딱!', 24); s.sound('flick'); }
          for (const side of [-1, 1]) s.spread(s.lv(1, 1, 3, 3, 3), a + side * 0.6, 0.18, { spd: s.sp(2.8), shape: 'small', color: 'cyan' });
          yield 22;
        }
      }
    },
  },
  {
    name: '논스펠 · 마리와 마르코',
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', hp: 1100, time: 35, start: [240, 100],
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
          yield 420;
          yield* s.chant('FILIUS2', { by: mari });
          holding = true;
          s.zone({ x: s.boss.x, y: s.boss.y, r: 52, dur: 300 });
          yield 300;
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
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 1200, time: 70, start: [232, 95],
    *run(s) {
      // 마리가 둘을 감싸는 구역 보호막을 세움. 보호막이 서 있는 동안은 자기 탄이 들어가지 않음
      // → 마리가 다시 영창하는 동안(보호막이 없는 동안)이 공격할 때
      const mari = churchDuo(s, [152, 95]);
      for (;;) {
        s.task(function* () {   // 영창 중에도 가벼운 견제
          for (let k = 0; k < 4; k++) { s.spread(s.lv(1, 3, 3), s.aim(), 0.35, { spd: s.sp(2.4), shape: 'small', color: 'orange' }); yield s.wait(45); }
        }());
        yield* castGap(s);
        yield* s.chant('FILIUS2', { by: mari });
        const dur = s.lv(240, 300, 360);
        s.zone({ x: 192, y: 95, r: 82, dur });
        // 보호막 안의 마르코: 황금 탄을 보호막 밖으로 크게 돌려 던짐. 마리는 유지하느라 쏘지 않음
        for (let t = 0; t < dur; t += s.wait(50)) {
          const a = s.aim();
          s.fire({ ang: a, spd: s.sp(3.6), shape: 'big', color: 'gold' });
          s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.8), shape: 'rice', color: 'gold' });
          yield s.wait(50);
        }
        yield 30;
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
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', hp: 1800, time: 36, start: [192, 100],
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
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 2100, time: 50, start: [192, 100],
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
          s.ring(s.cnt(18), { offset: s.rand(0, s.TAU), spd: s.sp(2.2), shape: 'rice', color: 'gold' });
          s.impact(4);
          yield s.wait(40);
        }
        yield 50;
      }
    },
  },
  {
    name: '논스펠 · 마르코 2 (폭주)',
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', hp: 2000, time: 36, start: [192, 100],
    *run(s) {
      // 뛰어올랐다 내리찍는 발구름: 착지 자리에서 처음엔 느린 충격파가 두 겹 퍼지고, 그 사이로 조준탄
      marcoRage(s);
      for (let w = 1; ; w++) {
        const tx = Math.max(90, Math.min(s.W - 90, s.player.x + s.rand(-80, 80))), ty = s.rand(90, 150);
        s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: 26 });
        yield* aimWhile(s, 26, 'yellow');
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
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 2500, time: 58, start: [192, 100],
    *run(s) {
      // 폭주한 마르코의 마지막 스펠: 달려드는 제압. 돌진 횟수가 늘고 멈춘 자리에서 충격파가 두 겹
      marcoRage(s);
      for (;;) {
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 50 });
        for (let k = 0; k < s.lv(3, 3, 4, 4, 5); k++) {
          // 플레이어 위치에서 70px 앞에 멈춤. 도착 지점에서 퍼지는 탄을 피할 거리를 남김
          const px = s.player.x, py = s.player.y, d = Math.hypot(px - s.boss.x, py - s.boss.y) || 1;
          const stop = Math.max(0, d - 70);
          const tx = s.boss.x + (px - s.boss.x) / d * stop, ty = Math.min(s.boss.y + (py - s.boss.y) / d * stop, s.H - 120);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: s.lv(48, 40, 32) });
          yield* aimWhile(s, s.lv(48, 40, 32), 'yellow');
          // 사거리가 없으므로 직접 달려듦. 돌진 중에는 몸에 닿아도 피격
          s.boss.contact = true;
          yield* s.moveTo(tx, ty, 18);
          s.boss.contact = false;
          s.impact(7);
          s.ring(s.cnt(20), { spd: 0.6, accel: 0.04, maxSpd: s.sp(2.2), shape: 'orb', color: 'gold' });
          if (s.diff > 0) s.ring(s.cnt(20), { offset: Math.PI / 20, spd: 0.4, accel: 0.03, maxSpd: s.sp(1.4), shape: 'small', color: 'yellow' });
          yield 36;   // 붙든 자리에서 잠시 멈춤 = 공격 기회
          yield* s.moveTo(s.rand(140, 244), s.rand(80, 110), 36);
        }
        yield 30;
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
        const lamps = [], n = s.lv(3, 4, 5);
        for (let i = 0; i < n; i++) lamps.push(s.fire({ ang: Math.PI / 2 + (i - (n - 1) / 2) * 0.45, spd: 2.2, accel: -0.04, minSpd: 0.25, shape: 'big', color: 'orange' }));
        for (let t = 0; t < 6; t++) {
          for (const L of lamps) if (!L.dead) s.ring(s.lv(4, 5, 6), { x: L.x, y: L.y, offset: t * 0.4, spd: s.sp(1.2), shape: 'small', color: 'orange' });
          yield 25;
        }
        // 꺼져 감: 흐려지며 멈춤. 판정은 남으므로 완전히 사라지지 않게 35%까지만
        for (let t = 0; t < 60; t++) { for (const L of lamps) { L.alpha = 1 - 0.65 * t / 60; L.spd *= 0.95; } yield 1; }
        yield 30;
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
      // 느리게 도는 사슬 팔 셋(고리 사이 간격을 넓혀 팔을 가로지를 수 있음) + 하드 이상에서 반대로 도는 가는 팔 셋 + 가끔 조준 칼날
      let a = 0;
      for (let f = 0; ; f++) {
        a += 0.05;
        for (let i = 0; i < 3; i++) s.fire({ ang: a + i * s.TAU / 3, spd: s.sp(2.4), shape: 'link', color: 'gold' });
        if (s.diff >= 2 && f % 2 === 0) for (let i = 0; i < 3; i++) s.fire({ ang: -a * 1.2 + i * s.TAU / 3 + Math.PI / 3, spd: s.sp(1.8), shape: 'small', color: 'yellow' });
        if (f % 5 === 0) s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.15, { spd: s.sp(4), shape: 'knife', color: 'white' });
        if (f % 40 === 39) yield* s.wander(40, 50);
        yield s.lv(9, 8, 7, 7, 6);
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
        // 황금빛 오른손으로 던진 큰 탄이 멈춰 선 자리에서 사슬 고리가 번져 나감(붙드는 손)
        s.boss.glow = 220;
        for (let k = 0; k < s.lv(2, 3, 3); k++) {
          s.fire({
            ang: s.aim() + s.rand(-0.25, 0.25), spd: 5, accel: -0.1, minSpd: 0, shape: 'big', color: 'gold',
            fn: (b, s) => {
              if (b.spd > 0) return;
              b.dead = true;
              s.ring(s.cnt(14), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: 0.6, accel: 0.03, maxSpd: s.sp(2.4), shape: 'link', color: 'gold' });
              if (s.diff > 0) s.ring(s.cnt(14), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: 0.4, accel: 0.02, maxSpd: s.sp(1.6), shape: 'small', color: 'yellow' });
            },
          });
          yield 30;
        }
        yield 70;
        yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '논스펠 · 예로니모 3',
    type: 'nonspell', boss: '예로니모', bossColor: '#e8e0c8', hp: 2900, time: 42, start: [192, 110],
    *run(s) {
      // 사슬 고리가 보스 둘레를 돌며 원을 넓히다가 바깥으로 풀려 나감. 틈은 고리 사이 각도로 생김
      for (let w = 1; ; w++) {
        const n = s.cnt(16), a0 = s.rand(0, s.TAU), dir = w % 2 ? 1 : -1, cx = s.boss.x, cy = s.boss.y;
        for (let i = 0; i < n; i++) {
          const base = a0 + i * s.TAU / n;
          s.fire({
            x: cx, y: cy, spd: 0, shape: 'link', color: 'gold',
            fn: b => {
              if (b.t < 50) {
                const r = 20 + b.t * 1.4, a = base + dir * b.t * 0.05;
                b.x = cx + Math.cos(a) * r; b.y = cy + Math.sin(a) * r; b.ang = a + dir * Math.PI / 2;
              } else if (b.t === 50) { b.ang = base + dir * 2.5 + dir * 0.35; b.spd = s.sp(2.2); }
            },
          });
        }
        yield s.wait(35);
        s.spread(s.lv(1, 3, 3, 5), s.aim(), 0.2, { spd: s.sp(3.2), shape: 'knife', color: 'white' });
        yield s.wait(35);
        if (w % 4 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '논스펠 · 예로니모 4',
    type: 'nonspell', boss: '예로니모', bossColor: '#e8e0c8', hp: 2900, time: 42, start: [192, 110],
    *run(s) {
      // 빛의 십자: 네 갈래 줄기가 천천히 돌고, 가끔 대각으로 한 번 비틀림. 줄기 사이가 안전 지대
      let a = 0;
      for (let f = 0; ; f++) {
        a += 0.014 * (Math.floor(f / 90) % 2 ? -1 : 1);
        for (let i = 0; i < 4; i++) s.fire({ ang: a + i * Math.PI / 2, spd: s.sp(2.8), shape: 'rice', color: 'yellow' });
        if (f % 24 === 0) s.ring(s.cnt(12), { offset: a + Math.PI / 4, spd: s.sp(1.4), shape: 'small', color: 'white' });
        if (f % 18 === 9) s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.12, { spd: s.sp(3.6), shape: 'knife', color: 'white' });
        if (f % 300 === 299) yield* s.wander(40, 50);
        yield s.lv(8, 6, 5, 4);
      }
    },
  },
  {
    name: '파테르 제2식 — 능히 일어나지 못하게 하리니',
    type: 'spell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3200, time: 52, start: [192, 100],
    *run(s) {
      // 예로니모의 파테르 제2식: 돌진해 멈춘 자리에서 황금 사슬을 사방으로 뻗어 붙들어 둠(사슬 사이 대각선 방향이 틈)
      for (;;) {
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 50 });
        for (let k = 0; k < s.lv(2, 2, 3, 3); k++) {
          const px = s.player.x, py = s.player.y, d = Math.hypot(px - s.boss.x, py - s.boss.y) || 1;
          const stop = Math.max(0, d - 110);
          const tx = s.boss.x + (px - s.boss.x) / d * stop, ty = Math.min(s.boss.y + (py - s.boss.y) / d * stop, s.H - 160);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: s.lv(48, 40, 34) });
          yield* aimWhile(s, s.lv(48, 40, 34), 'yellow');
          s.boss.contact = true;
          yield* s.moveTo(tx, ty, 20);
          s.boss.contact = false;
          s.impact(7);
          const n = s.lv(4, 4, 6, 6, 8), off = s.rand(0, s.TAU);
          for (let i = 0; i < n; i++) s.chain({ x: tx, y: ty, ang: off + i * s.TAU / n, len: 520, warn: s.lv(45, 40, 34), shoot: 10, hold: 14, retract: 70 });
          yield s.lv(45, 40, 34) + 30;
          s.ring(s.cnt(18), { spd: 0.5, accel: 0.03, maxSpd: s.sp(2), shape: 'orb', color: 'gold' });
          yield 50;
          yield* s.moveTo(s.rand(140, 244), s.rand(80, 110), 45);
        }
        yield 30;
      }
    },
  },
  {
    name: 'Clavis Collata — NUNC DIMITTIS',
    type: 'spell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3600, time: 60, start: [192, 100],
    *run(s) {
      // 전조: 고유 클라비스 영창. 읊는 동안은 느린 원형탄만
      const light = s.task(function* () {
        for (let k = 0; ; k++) { s.ring(s.cnt(12), { offset: k * 0.3, spd: s.sp(1.3), shape: 'small', color: 'gold' }); yield s.wait(40); }
      }());
      yield* s.chant('NUNC_DIMITTIS', { by: s.boss, step: 32 });
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
        const n = Math.min(s.lv(2, 3, 3) + w, s.lv(3, 4, 5));
        for (let i = 0; i < n; i++) {
          edgeChain(i === 0 ? { x: s.player.x, y: s.player.y } : null);   // 첫 사슬은 플레이어 조준
          yield 5;
        }
        yield s.lv(70, 60, 50) - 5;
        // 사슬이 뻗어 있는 동안 탄막
        for (let k = 0; k < 9; k++) {
          if (k % s.lv(3, 2, 1) === 0) s.ring(s.cnt(12), { offset: k * 0.19, spd: s.sp(1.7), shape: 'orb', color: 'yellow' });
          if (k % 3 === 2 && s.diff > 0) s.spread(s.lv(3, 3, 5), s.aim(), 0.14, { spd: s.sp(3.2), shape: 'rice', color: 'gold' });
          yield 16;
        }
        yield 20;
        if (w % 3 === 2) yield* s.wander();
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
      const arms = s.lv(4, 5, 6);
      for (;;) {
        a += 0.045;
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
    type: 'nonspell', boss: '리크니스', bossColor: '#e8b4c8', hp: 2800, time: 42, start: [192, 100],
    *run(s) {
      // 사방으로 굽이치며 자라는 덩굴. 잎은 잠시 붙어 있다가 떨어짐
      for (let w = 1; ; w++) {
        const n = s.lv(3, 4, 5), base = s.rand(0, s.TAU);
        for (let i = 0; i < n; i++) s.task(ivyVine(s, { x: s.boss.x, y: s.boss.y, ang: base + i * s.TAU / n, spd: s.sp(2.2), len: 160, turn: 0.035, phase: i, stay: s.lv(70, 90, 110) }));
        for (let k = 0; k < 3; k++) { yield s.wait(30); s.spread(s.lv(1, 3, 3), s.aim(), 0.2, { spd: s.sp(3), shape: 'leaf', color: 'ivy' }); }
        yield s.wait(60);
        if (w % 3 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '「벽을 타는 덩굴」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#e8b4c8', hp: 3400, time: 52, start: [192, 90],
    *run(s) {
      for (;;) {
        // 양쪽 벽을 아래에서 위로 타고 오르며 안쪽으로 가지를 뻗음. 좌우 가지 높이를 엇갈려 지그재그 통로를 남김
        for (const side of [-1, 1]) {
          const x0 = side < 0 ? 6 : s.W - 6;
          s.task(function* () {
            let y = s.H + 10;
            const head = s.fire({ x: x0, y, spd: 0, shape: 'orb', color: 'green' });
            for (let t = 0; y > -10 && !head.dead; t++) {
              y -= s.sp(2.4); head.y = y;
              if (t % 5 === 0 && !s.near(x0, y, 12, 'leaf')) ivyLeaf(s, x0 + s.rand(-3, 3), y, -Math.PI / 2 + s.rand(-0.8, 0.8), s.lv(150, 190, 220));
              if (t % 50 === (side < 0 ? 0 : 25) && y < s.H - 40 && y > 60) {
                const reach = s.W * s.lv(0.35, 0.45, 0.55);
                s.task(ivyVine(s, { x: x0, y, ang: side < 0 ? 0 : Math.PI, spd: s.sp(2.6), len: Math.round(reach / s.sp(2.6)), turn: 0.02, wave: 0.12, stay: s.lv(110, 140, 170) }));
              }
              yield 1;
            }
            head.dead = true;
          }());
        }
        for (let k = 0; k < 6; k++) { s.spread(s.lv(3, 4, 5), s.aim(), 0.25, { spd: s.sp(2.6), shape: 'leaf', color: 'ivy' }); yield s.wait(35); }
        yield s.wait(120);
      }
    },
  },
  {
    name: '논스펠 · 리크니스 2',
    type: 'nonspell', boss: '리크니스', bossColor: '#e8b4c8', hp: 3000, time: 40, start: [192, 110],
    *run(s) {
      // 잎 소용돌이 + 꽃잎 원형탄(노말 이상)
      let a = 0;
      for (let f = 0; ; f++) {
        a += 0.11;
        const arms = s.lv(2, 3, 4);
        for (let i = 0; i < arms; i++) s.fire({ ang: a + i * s.TAU / arms, spd: s.sp(2.2), angVel: 0.006, shape: 'leaf', color: 'ivy' });
        if (f % 20 === 0 && s.diff > 0) s.ring(s.cnt(16), { offset: -a, spd: s.sp(1.4), shape: 'small', color: 'pink' });
        if (f % 300 === 299) yield* s.wander(40, 50);
        yield s.lv(6, 5, 4);
      }
    },
  },
  {
    name: '「뿌리를 찾는 덩굴」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#e8b4c8', hp: 3600, time: 50, start: [192, 90],
    *run(s) {
      // 2급 이상 오르트로스를 만들 수 있는 것은 리크니스뿐 → 고등급 날개 오르트로스를 불러냄
      s.task(function* () {
        for (;;) {
          yield 240;
          for (const side of [-1, 1]) s.enemy({
            x: s.W / 2 + side * 120, y: -20, vy: 1.2, hp: s.lv(120, 180, 240), r: 18, color: 'red', label: '2급',
            run: function* (e, s) {
              yield 50; e.vy = 0;
              for (let k = 0; k < 5; k++) { s.ring(s.cnt(18), { x: e.x, y: e.y, offset: k * 0.17, spd: s.sp(1.8), shape: 'rice', color: 'red' }); yield s.wait(40); }
              e.vy = -1.2;
            },
          });
          yield 360;
        }
      }());
      // 플레이어를 더듬어 찾는 덩굴. 잎은 짧게 붙어 있음
      for (;;) {
        const n = s.lv(2, 2, 3);
        for (let i = 0; i < n; i++) s.task(ivyVine(s, {
          x: s.boss.x + (i - (n - 1) / 2) * 40, y: s.boss.y, ang: Math.PI / 2 + (i - (n - 1) / 2) * 0.8,
          spd: s.sp(2.4), len: 200, seek: s.lv(0.012, 0.018, 0.024), turn: 0.02, stay: s.lv(50, 70, 90),
          seekOffX: (i - (n - 1) / 2) * 80 + s.rand(-15, 15),   // 덩굴마다 플레이어 좌우로 어긋난 곳을 노려 한곳에 모이지 않게
        }));
        yield s.wait(150);
      }
    },
  },
  {
    name: '논스펠 · 리크니스 3',
    type: 'nonspell', boss: '리크니스', bossColor: '#e8b4c8', hp: 3000, time: 42, start: [192, 100],
    *run(s) {
      // 덩굴 채찍: 보스 양옆에서 크게 휘어 도는 덩굴 + 꽃잎 조준탄
      for (let w = 1; ; w++) {
        for (const side of [-1, 1]) s.task(ivyVine(s, {
          x: s.boss.x + side * 20, y: s.boss.y, ang: Math.PI / 2 - side * 1.2, spd: s.sp(3), len: 140,
          curl: side * s.lv(0.018, 0.02, 0.022, 0.024, 0.026), turn: 0.01, stay: s.lv(60, 80, 100),
        }));
        for (let k = 0; k < 3; k++) { yield s.wait(25); s.spread(s.lv(3, 5, 5, 7), s.aim(), 0.16, { spd: s.sp(3), shape: 'small', color: 'pink' }); }
        yield s.wait(50);
        if (w % 3 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '「덩굴에 핀 꽃」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#e8b4c8', hp: 3400, time: 50, start: [192, 80],
    *run(s) {
      // 위에서 굽이치며 내려오는 덩굴 곳곳에 꽃봉오리(큰 분홍 탄)가 맺혔다가 잠시 뒤 꽃잎으로 터짐
      const bloomAt = s.lv(100, 90, 80, 75, 70);
      const bloom = (b, s) => {
        if (b.t !== bloomAt) return;
        b.dead = true;
        s.ring(s.lv(6, 8, 9, 10, 11), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: 0.5, accel: 0.03, maxSpd: s.sp(2), shape: 'rice', color: 'pink' });
      };
      for (let w = 0; ; w++) {
        const n = s.lv(2, 2, 3, 3, 3), budEvery = s.lv(56, 48, 42, 38, 34);
        for (let i = 0; i < n; i++) {
          s.task(ivyVine(s, {
            x: s.W * (i + 0.5) / n + s.rand(-20, 20), y: -10, ang: Math.PI / 2, spd: s.sp(2.2), len: 160, turn: 0.04, wave: 0.07, phase: i + w,
            stay: s.lv(60, 70, 80), margin: 40,
            step: (x, y, t) => { if (t % budEvery === 20) s.fire({ x, y, spd: 0, shape: 'big', color: 'pink', fn: bloom }); },
          }));
        }
        for (let k = 0; k < 3; k++) { yield s.wait(60); if (s.diff > 0) s.spread(3, s.aim(), 0.3, { spd: s.sp(2.6), shape: 'leaf', color: 'ivy' }); }
        yield s.wait(40);
      }
    },
  },
  {
    name: '「휘감는 덩굴」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#e8b4c8', hp: 3600, time: 55, start: [192, 80],
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
          s.fire({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, ang: a + Math.PI, spd: 0.3, accel: 0.03, maxSpd: s.sp(2.2), shape: 'rice', color: 'pink' });
        }
        for (let k = 0; k < 3; k++) { yield s.wait(40); s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.4), shape: 'leaf', color: 'ivy' }); }
        yield s.wait(60);
      }
    },
  },
  {
    name: '「담쟁이 정원」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#e8b4c8', hp: 3800, time: 55, start: [192, 90],
    *run(s) {
      // 예고선을 따라 덩굴이 빠르게 뻗어 사선 격자(이지는 한 방향 줄무늬)를 만들고,
      // 격자는 모양을 유지한 채 통째로 내려옴. 칸 안에서 함께 내려가다 잎 사이 틈으로 빠져나감
      const tilt = 0.6, span = s.H * Math.tan(tilt);
      for (let w = 0; ; w++) {
        const gap = s.lv(130, 118, 105, 100, 95), warn = s.lv(56, 48, 42, 40, 38), lines = [];
        const dirs = s.diff >= 1 ? [1, -1] : [w % 2 ? 1 : -1];
        for (const dir of dirs) {
          const ang = Math.PI / 2 - dir * tilt, off = s.rand(0, gap);
          for (let x0 = (dir > 0 ? -span : 0) + off; x0 < (dir > 0 ? s.W : s.W + span); x0 += gap) {
            s.warnLine({ x: x0, y: 0, x2: x0 + Math.cos(ang) * 700, y2: Math.sin(ang) * 700, dur: warn });
            lines.push([x0, ang]);
          }
        }
        yield warn;
        for (const [x0, ang] of lines) s.task(ivyVine(s, { x: x0, y: -5, ang, spd: 6, len: 150, turn: 0, gapPx: s.lv(26, 22, 20, 19, 18), skip: 0, stay: s.lv(80, 90, 100), margin: 400 }));
        for (let k = 0; k < 4; k++) { yield s.wait(36); s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.3, { spd: s.sp(3), shape: 'small', color: 'pink' }); }
        yield s.wait(110);
      }
    },
  },
  {
    name: '논스펠 · 이즘 1',
    type: 'nonspell', boss: '이즘', bossColor: '#8fe8ff', hp: 2600, time: 36, start: [192, 100],
    *run(s) {
      // 데이터 묶음: 정사각형으로 뭉친 탄 덩어리를 조준해 보냄
      for (let w = 1; ; w++) {
        const a = s.aim() + s.rand(-0.3, 0.3), n = s.lv(2, 3, 3);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          s.fire({ x: s.boss.x + (i - (n - 1) / 2) * 10, y: s.boss.y + (j - (n - 1) / 2) * 10, ang: a, spd: s.sp(3), shape: 'small', color: 'cyan' });
        }
        yield s.wait(26);
        if (w % 4 === 0) s.ring(s.cnt(22), { offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'rice', color: 'white' });
        if (w % 8 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '「순차 격자 타격」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3200, time: 45, start: [192, 60],
    *run(s) {
      // 화면 전체 칸(4×5=20)에 번호를 한꺼번에 띄우고 번호 순서대로 터뜨림. 이미 터진 칸은 곧바로 안전.
      // 1번 칸이 터지기 전에 그 옆에서 기다렸다가 터진 뒤 들어가는 식으로 피함. 난이도가 오를수록 터지는 간격이 짧아짐
      const cols = 4, rows = 5, cw = s.W / cols, ch = s.H / rows;
      const first = s.lv(100, 85, 70, 62, 56), step = s.lv(24, 18, 14, 12, 10);
      for (let w = 0; ; w++) {
        const order = [...Array(cols * rows).keys()].sort(() => Math.random() - 0.5);
        order.forEach((c, i) => s.area({ x: (c % cols) * cw, y: Math.floor(c / cols) * ch, w: cw, h: ch, warn: first + i * step, dur: 16, label: i + 1, color: w % 2 ? '#ffd23a' : '#35d6ff' }));
        const total = first + order.length * step + 20;
        for (let t = 0; t < total; t += s.wait(45)) {
          if (s.diff >= 2) s.spread(3, s.aim(), 0.3, { spd: s.sp(2.4), shape: 'small', color: 'white' });
          yield s.wait(45);
        }
        yield s.wait(60);
      }
    },
  },
  {
    name: '논스펠 · 이즘 2',
    type: 'nonspell', boss: '이즘', bossColor: '#8fe8ff', hp: 2800, time: 36, start: [192, 80],
    *run(s) {
      // 스캔: 세로 레이저가 한쪽 끝에서 반대쪽으로 차례로 훑음. 이미 훑고 지나간 쪽으로 피하거나 레이저 사이 틈(약 21px)에 섬.
      // 훑는 동안 느린 조준탄이 섞임(노말 이상)
      for (let w = 0; ; w++) {
        const col = 40, dir = w % 2 ? 1 : -1;
        for (let i = 0; i < s.W / col; i++) {
          if (s.diff > 0 && i % 3 === 0) s.spread(3, s.aim(), 0.3, { spd: s.sp(2), shape: 'small', color: 'white' });
          const x = dir > 0 ? i * col + col / 2 : s.W - i * col - col / 2;
          s.laser({ x, y: 0, ang: Math.PI / 2, len: s.H, w: 20, warn: s.lv(50, 42, 36), dur: 14, color: 'cyan' });
          yield s.lv(12, 10, 8, 7, 6);
        }
        for (let k = 0; k < 3; k++) { s.ring(s.cnt(20), { offset: k * 0.2, spd: s.sp(1.8), shape: 'small', color: 'white' }); yield s.wait(25); }
        yield s.wait(50);
      }
    },
  },
  {
    name: '「예측 사격」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 45, start: [192, 70],
    *run(s) {
      // 저격: 가는 방향을 읽어 도착할 자리에 십자선과 조준선을 띄우고, 점점 빨라지는 경고음(삐비비빅) 뒤
      // 그 줄을 따라 칼날을 한 줄로 주르륵 쏨. 멈추거나 방향을 틀면 빗나감. 한 줄이니 옆으로 비키면 됨
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      for (let w = 0; ; w++) {
        for (let k = 0; k < s.lv(3, 4, 5, 6, 6); k++) {
          const p = s.player, delay = s.lv(48, 42, 36, 32, 28), travel = s.lv(20, 18, 16, 14, 13), lead = delay + travel;
          const tx = clamp(p.x + (p.vx || 0) * lead, 10, s.W - 10), ty = clamp(p.y + (p.vy || 0) * lead, 10, s.H - 10);
          const a = Math.atan2(ty - s.boss.y, tx - s.boss.x), dist = Math.hypot(tx - s.boss.x, ty - s.boss.y);
          s.mark({ x: tx, y: ty, dur: lead });
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: s.boss.x + Math.cos(a) * 700, y2: s.boss.y + Math.sin(a) * 700, dur: delay, band: 10 });
          // 삐… 삐… 삐비비빅: 간격이 점점 짧아지는 경고음
          for (let t = 0, gap = 12; t < delay;) {
            s.sound('beep', t / delay);
            const g = Math.max(2, Math.min(delay - t, Math.round(gap)));
            yield g; t += g; gap *= 0.78;
          }
          const spd = Math.max(5, dist / travel), n = s.lv(6, 8, 10, 12, 14);
          for (let i = 0; i < n; i++) { s.fire({ ang: a, spd, shape: 'knife', color: 'red' }); yield 2; }
          s.ring(s.cnt(14), { offset: s.rand(0, s.TAU), spd: s.sp(1.5), shape: 'small', color: 'cyan' });
          yield s.lv(24, 20, 16, 14, 12);
        }
        s.ring(s.cnt(24), { offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'small', color: 'cyan' });
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
    name: '논스펠 · 이즘 4',
    type: 'nonspell', boss: '이즘', bossColor: '#8fe8ff', hp: 2800, time: 40, start: [192, 70],
    *run(s) {
      // 바이너리 비: 세로 8줄이 켜짐(1)·꺼짐(0)으로 바뀜. 켜질 줄을 먼저 표시하고 그 줄에만 데이터 비가 쏟아짐.
      // 이전 비가 다 내린 뒤 다음 신호가 오도록 사이를 둠
      const lanes = 8, lw = s.W / lanes;
      for (let w = 0; ; w++) {
        const on = s.lv(3, 4, 4, 5, 5), pick = [...Array(lanes).keys()].sort(() => Math.random() - 0.5).slice(0, on);
        const warn = s.lv(50, 42, 36);
        for (const i of pick) s.area({ x: i * lw + 2, y: 0, w: lw - 4, h: s.H, warn, dur: 0, label: '1', color: '#35d6ff' });
        yield warn;
        for (let t = 0; t < 120; t += 3) {
          for (const i of pick) if (Math.random() < s.lv(0.45, 0.6, 0.7, 0.8, 0.9)) {
            s.fire({ x: i * lw + s.rand(6, lw - 6), y: -6, ang: Math.PI / 2, spd: s.sp(s.rand(3, 4.5)), shape: 'small', color: 'cyan' });
          }
          yield 3;
        }
        if (s.diff > 0) s.spread(3, s.aim(), 0.3, { spd: s.sp(2.4), shape: 'rice', color: 'white' });
        yield 70;
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
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 48, start: [192, 80],
    *run(s) {
      // 불렛타임의 반대: 경고 뒤 잠깐 적 탄 시계만 빨라짐. 평소엔 느긋한 탄을 깔아 두었다가 한꺼번에 몰아침
      for (;;) {
        for (let k = 0; k < 7; k++) {
          s.ring(s.cnt(22), { offset: s.rand(0, s.TAU), spd: s.sp(1.1), shape: 'orb', color: 'cyan' });
          s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(1.5), shape: 'rice', color: 'white' });
          yield s.wait(32);
        }
        s.say(s.boss, 'OVERCLOCK', 50);
        yield 45;
        s.bulletTime(s.lv(1.5, 1.7, 1.9, 2, 2.1), 120);
        yield 150;
      }
    },
  },
  {
    name: '「세이브 포인트」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 50, start: [192, 60],
    *run(s) {
      // 안전지대 셋에 1·2·3 번호를 차례로 미리 보여 준 뒤, 빰! 1번만 남기고 화면이 탄막으로 찼다가 터져 사라지고,
      // 빰! 2번만 남기고 … 번호 순서대로 옮겨 다니면 됨. 안전지대는 한 번에 옮길 수 있는 거리로만 이어짐
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const R = s.lv(50, 44, 40, 36, 34), hold = s.lv(34, 30, 26, 24, 22), move = s.lv(52, 46, 40, 36, 34);
      for (let w = 0; ; w++) {
        const pts = [];
        let px = clamp(s.player.x, 60, s.W - 60), py = clamp(s.player.y, 190, s.H - 60);
        for (let k = 0; k < 3; k++) {
          const a = s.rand(0, s.TAU), d = s.rand(90, 140);
          px = clamp(px + Math.cos(a) * d, 60, s.W - 60); py = clamp(py + Math.sin(a) * d, 190, s.H - 60);
          pts.push({ x: px, y: py, r: R });
        }
        const preview = s.lv(110, 96, 86, 78, 72), stagger = 22, gap = hold + move;
        pts.forEach((p, k) => s.task(function* () {
          yield k * stagger;
          s.safeZone({ x: p.x, y: p.y, r: R, label: k + 1, dur: preview - k * stagger + k * gap + hold + 6 });
          s.sound('beep', k / 3);
        }()));
        yield preview;
        for (let k = 0; k < 3; k++) {
          const list = fillField(s, { holes: [pts[k]], spacing: s.lv(20, 19, 18, 17, 16), color: k % 2 ? 'cyan' : 'blue' });
          yield hold;
          s.pop(list);
          yield move;
        }
        for (let k = 0; k < 2; k++) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.2), shape: 'small', color: 'white' }); yield s.wait(40); }
        yield s.wait(50);
      }
    },
  },
  {
    name: '「열흘 같은 하루」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 60, start: [192, 70],
    *run(s) {
      // 불렛타임 동안 위에서 미로 띠가 내려옴. 좁은 통로를 따라 빠져나가야 함
      const cell = 12, fall = 5, k = 0.22;
      for (;;) {
        // 줄 사이 간격(12px)에는 기체가 설 자리가 없으므로 이웃한 두 줄의 통로가 겹쳐야 지나갈 수 있음.
        // 통로의 안전 폭은 gapW - 11 정도이므로 줄마다 옮겨 가는 폭(shift)을 그보다 작게 둠
        const rows = s.lv(14, 18, 22, 24, 26), gapW = s.lv(46, 36, 28, 26, 24), shift = s.lv(8, 10, 12, 12, 11);
        const dur = Math.round((s.H + rows * cell + 40) / (fall * k));
        s.bulletTime(k, dur + 40);
        yield 20;
        let cx = s.player.x;   // 첫 줄의 통로는 플레이어 바로 위에서 시작
        for (let r = 0; r < rows; r++) {
          cx = Math.max(gapW, Math.min(s.W - gapW, cx + s.rand(-1, 1) * shift));
          for (let x = cell / 2; x < s.W; x += cell) {
            if (Math.abs(x - cx) < gapW / 2) continue;
            s.fire({ x, y: -10 - r * cell, ang: Math.PI / 2, spd: fall, shape: 'small', color: r % 2 ? 'cyan' : 'blue', marginTop: rows * cell + 40 });
          }
        }
        yield dur;
        s.clear();
        yield 90;   // 미로를 빠져나온 뒤 숨 돌릴 틈
        // 재동기화: 세로 줄(32px 간격)에 맞춰 성긴 데이터 비가 잠깐 내림. 줄 사이로 피함
        for (let t = 0; t < 150; t += 5) {
          if (Math.random() < s.lv(0.5, 0.6, 0.7, 0.8, 0.9)) s.fire({ x: s.randInt(0, 11) * 32 + 16, y: -6, ang: Math.PI / 2, spd: s.sp(2.6), shape: 'small', color: 'cyan' });
          yield 5;
        }
        s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.4), shape: 'rice', color: 'white' });
        yield 90;
      }
    },
  },
];

// ── 엑스트라: 진심 예로니모 ──
// 엑스트라 패턴은 extra: true로 표시하며 고른 난이도보다 한 단계 위로 계산된다(하드는 그 위의 엑스트라 하드)
function exOf(sp) {
  const c = { ...sp, extra: true, boss: sp.boss ? '예로니모(진심)' : sp.boss };
  SPELLS.push(c);
  return c;
}

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
        x, y, vx: 0, vy: 0, shape: o.shape ?? 'small', color: o.color ?? 'red', margin: pad + 40,
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
const SINS = [
  { latin: 'SUPERBIA', color: 'purple', hx: 192, hy: 190, v: t => [0, 0.5],
    // 교만: 위에서 내려다보듯 큰 탄이 줄지어 내려옴
    *call(s) { for (let k = 0; ; k++) { const n = s.lv(4, 5, 5, 6, 6, 7), gap = s.W / n; for (let i = 0; i < n; i++) s.fire({ x: gap * (i + (k % 2 ? 0.75 : 0.25)), y: -10, ang: Math.PI / 2, spd: s.sp(1.6), shape: 'big', color: 'purple' }); yield 40; } },
    shot: s => s.spread(s.lv(1, 1, 3, 3, 3, 3), s.aim(), 0.12, { spd: s.sp(2.2), shape: 'knife', color: 'white' }) },
  { latin: 'AVARITIA', color: 'gold', hx: 192, hy: 370, v: t => [0, -0.45],
    // 탐욕: 흩뿌린 금화가 다시 본체에게 모여듦
    *call(s) { for (;;) { s.ring(s.cnt(18), { offset: s.rand(0, s.TAU), spd: s.sp(3), accel: -0.06, minSpd: -s.sp(2.2), shape: 'orb', color: 'gold' }); yield 36; } },
    shot: s => s.spread(s.lv(1, 1, 3, 3, 3, 3), s.aim(), 0.3, { spd: s.sp(1.8), shape: 'orb', color: 'gold' }) },
  { latin: 'LUXURIA', color: 'pink', hx: 192, hy: 300, v: t => [Math.cos(t * 0.021) * 1.1, 0],
    // 색욕: 번갈아 휘어 도는 꽃잎
    *call(s) { for (let k = 0; ; k++) { const n = s.cnt(14), dir = k % 2 ? 1 : -1; for (let i = 0; i < n; i++) s.fire({ ang: i * s.TAU / n + k * 0.2, spd: s.sp(2.2), angVel: dir * 0.012, shape: 'rice', color: 'pink' }); yield 16; } },
    shot: s => s.spread(s.lv(1, 1, 3, 3, 3, 3), s.aim(), 0.25, { spd: s.sp(2), shape: 'rice', color: 'pink' }) },
  { latin: 'INVIDIA', color: 'green', hx: 192, hy: 310, holes: 2, v: t => [t < 150 ? 0.45 : -0.45, 0],
    // 질투: 좌우를 뒤집은 자리의 나와 진짜 나를 번갈아 노림
    *call(s) { for (let k = 0; ; k++) { const x = k % 2 ? s.W - s.player.x : s.player.x; s.spread(s.lv(3, 3, 5, 5, 5, 7), Math.atan2(s.player.y - s.boss.y, x - s.boss.x), 0.12, { spd: s.sp(3), shape: 'orb', color: 'green' }); yield 16; } },
    shot: s => s.spread(s.lv(1, 1, 3, 3, 3, 3), s.aim(), 0.25, { spd: s.sp(2), shape: 'small', color: 'green' }) },
  { latin: 'GULA', color: 'orange', hx: 192, hy: 290, v: t => [-Math.sin(t * 0.021), Math.cos(t * 0.021)],
    // 탐식: 솟구쳤다 떨어지는 덩어리
    *call(s) { for (;;) { s.fire({ vx: s.rand(-2.4, 2.4), vy: s.rand(-5, -3), ay: 0.06, shape: s.pick(['orb', 'small', 'big']), color: 'orange', marginTop: 200 }); yield s.lv(6, 5, 4, 4, 3, 3); } },
    shot: s => s.spread(s.lv(1, 1, 3, 3, 3, 3), s.aim(), 0.25, { spd: s.sp(2), shape: 'orb', color: 'orange' }) },
  // 분노: 채운 뒤에는 1초마다 삐 소리 뒤 한 방향으로 확 끌려감
  { latin: 'IRA', color: 'red', hx: 192, hy: 290, v: t => {
      const k = t % 60, dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [-1, 0]], d = dirs[Math.floor(t / 60) % 5];
      return k >= 40 ? [d[0] * 1.6, d[1] * 1.6] : [0, 0];
    },
    // 분노: 빠른 칼날 연사 + 원형 폭발
    *call(s) { for (;;) { const a = s.aim(); for (let k = 0; k < s.lv(4, 5, 6, 7, 8, 9); k++) { s.fire({ ang: a, spd: s.sp(6.5), shape: 'knife', color: 'red' }); yield 3; } s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(2.4), shape: 'rice', color: 'red' }); yield 30; } },
    shot: s => s.spread(s.lv(1, 1, 3, 3, 3, 3), s.aim(), 0.15, { spd: s.sp(2.6), shape: 'knife', color: 'red' }) },
  { latin: 'ACEDIA', color: 'blue', hx: 230, hy: 250, small: 6, v: t => [-0.15, 0.2],
    // 나태: 뿌린 탄이 멈췄다가 한참 뒤 느릿느릿 흩어짐
    *call(s) { for (;;) { const n = s.cnt(16), off = s.rand(0, s.TAU); for (let i = 0; i < n; i++) s.fire({ ang: off + i * s.TAU / n, spd: s.sp(3), accel: -0.1, minSpd: 0, shape: 'orb', color: 'blue', fn: b => { if (b.t === 90) { b.accel = 0.01; b.maxSpd = s.sp(1.2); b.ang += s.rand(-0.5, 0.5); } } }); yield 34; } },
    shot: s => s.ring(s.lv(6, 8, 10, 10, 12, 12), { offset: s.rand(0, s.TAU), spd: s.sp(1.2), shape: 'small', color: 'blue' }) },
];

SPELLS.push({
  name: 'Clavis Communis, 스피리투스 제10식 — CONFITEOR. 내 죄가 항상 내 앞에 있나이다',
  type: 'spell', survival: true, extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 1, time: 75, start: [192, 110],
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
      yield preview;
      call.return();
      const motion = { vx: 0, vy: 0 };
      const list = fillField(s, { holes, motion, pad: 160, spacing: s.lv(20, 19, 18, 17, 16, 16), color: sin.color });
      for (let t = 0; t < hold; t++) {
        const [vx, vy] = sin.v(t);
        motion.vx = vx; motion.vy = vy;
        for (const z of zones) { z.x += vx; z.y += vy; }
        if (i === 5 && t % 60 === 36) s.sound('beep', 0.8);
        if (t % s.lv(70, 64, 56, 50, 46, 42) === 30) sin.shot(s);
        yield 1;
      }
      s.pop(list);
      yield 16;   // 빰! 하고 곧바로 다음 이름으로
    }
    s.clear();
    // 대답하라 ~ 호명: 응답한 이름에 못박혀 잠시 둔해진 채 일곱 색의 탄을 버팀
    yield* s.chant(C.slice(13, 17), { by: s.boss, step: 36, hold: 0 });
    s.player.stun = 150;
    s.impact(10);
    s.task(function* () {
      const colors = ['purple', 'gold', 'pink', 'green', 'orange', 'red', 'blue'];
      for (let k = 0; ; k++) { s.ring(s.cnt(21), { offset: k * 0.15, spd: s.sp(1.5), shape: 'small', color: colors[k % 7] }); yield s.wait(26); }
    }());
    yield* s.chant([C[17]], { by: s.boss, step: 60 });
    for (;;) yield 60;
  },
});

// 보스전: 목숨·폭탄·파워를 이어 가며 패턴을 순서대로. name은 오른쪽 표시용 짧은 이름, power는 시작 파워,
// hpScale은 체력·제한시간 배율. 목록은 스테이지 순서. 1스테이지는 홍마향처럼 중간 보스(윤도연) 뒤에 보스(고현성)
// 보스전은 잡몹 구간 없이 보스부터 시작한다. 시작 파워는 그 스테이지에 닿았을 때쯤의 값이고, 패턴이 끝날 때 떨어지는 P로 오른다
function spellOf(name, boss) {
  const sp = SPELLS.find(x => x.name === name && (!boss || x.boss === boss));
  if (!sp) throw new Error('보스전 패턴 없음: ' + name);
  return sp;
}
const BOSS_RUNS = [
  {
    title: '1스테이지 · 괴이사건대책반', name: '대책반', power: 0, hpScale: 1.6,
    seq: [
      spellOf('논스펠 · 윤도연'),
      spellOf('「발포 점착제」(가칭)'),
      spellOf('논스펠 · 고현성 1'),
      spellOf('「강선 그물」(가칭)'),
      spellOf('논스펠 · 고현성 2'),
      spellOf('「성스러운 수류탄」(가칭)'),
    ],
  },
  {
    title: '2스테이지 · 마리와 마르코', name: '마리·마르코', power: 1.5, hpScale: 2.8,
    seq: [
      spellOf('논스펠 · 마리'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '마리'),
      spellOf('논스펠 · 마리와 마르코'),
      spellOf('필리우스 제2식 — 그의 백성을 두르시리로다'),
      spellOf('필리우스 제1식 — 불꽃이 너를 사르지 못하리니'),
      spellOf('논스펠 · 마르코 (폭주)'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '마르코'),
      spellOf('논스펠 · 마르코 2 (폭주)'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니', '마르코'),
    ],
  },
  {
    title: '6스테이지 · 예로니모', name: '예로니모', power: 3, hpScale: 1.95,
    seq: [
      spellOf('논스펠 · 예로니모 1'),
      spellOf('스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고'),
      spellOf('논스펠 · 예로니모 2'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '예로니모'),
      spellOf('논스펠 · 예로니모 3'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니', '예로니모'),
      spellOf('논스펠 · 예로니모 4'),
      spellOf('Clavis Collata — NUNC DIMITTIS'),
    ],
  },
  {
    title: '7스테이지 · 리크니스', name: '리크니스', power: 3.5, hpScale: 1.95,
    seq: [
      spellOf('논스펠 · 리크니스 1'),
      spellOf('「벽을 타는 덩굴」(가칭)'),
      spellOf('논스펠 · 리크니스 2'),
      spellOf('「뿌리를 찾는 덩굴」(가칭)'),
      spellOf('논스펠 · 리크니스 3'),
      spellOf('「덩굴에 핀 꽃」(가칭)'),
      spellOf('「휘감는 덩굴」(가칭)'),
      spellOf('「담쟁이 정원」(가칭)'),
    ],
  },
  {
    title: '엑스트라 · 진심 예로니모', name: '진심 예로니모', power: 4, hpScale: 1.7,
    seq: [
      exOf(spellOf('논스펠 · 예로니모 1')),
      exOf(spellOf('스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고')),
      exOf(spellOf('논스펠 · 예로니모 2')),
      exOf(spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '예로니모')),
      exOf(spellOf('논스펠 · 예로니모 3')),
      exOf(spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니', '예로니모')),
      exOf(spellOf('Clavis Collata — NUNC DIMITTIS')),
      spellOf('Clavis Communis, 스피리투스 제10식 — CONFITEOR. 내 죄가 항상 내 앞에 있나이다'),
    ],
  },
  {
    title: '엑스트라 2 · 이즘', name: '이즘', power: 4, hpScale: 1.85,
    seq: [
      spellOf('논스펠 · 이즘 1'),
      spellOf('「순차 격자 타격」(가칭)'),
      spellOf('논스펠 · 이즘 2'),
      spellOf('「예측 사격」(가칭)'),
      spellOf('논스펠 · 이즘 3'),
      spellOf('「가상 전투 시뮬레이션」(가칭)'),
      spellOf('논스펠 · 이즘 4'),
      spellOf('「감정 학습」(가칭)'),
      spellOf('「오버클럭」(가칭)'),
      spellOf('「세이브 포인트」(가칭)'),
      spellOf('「열흘 같은 하루」(가칭)'),
    ],
  },
];
