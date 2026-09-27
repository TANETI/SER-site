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
//   bgmRate: 1.2,                            // 선택. 배경음악 재생 속도(폭주 마르코처럼 같은 곡을 빠르게)
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

// ── 세라피안 공통 ──
// 3-3: 구석에서 시연이 구경만 함(공격하지 않음, 엑스트라 2 복선)
function siyeonWatch(s) {
  s.partner({ name: '시연', x: s.W - 36, y: 40, color: '#c9b8f0' });
}

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
      // 떨어질 자리를 십자선으로 먼저 보여 주고, 플레이어 바로 위에는 떨어뜨리지 않음. 붙는 순간 작은 방울이 튀고,
      // 붙은 덩어리 사이로 조준 사격을 피함
      const stick = s.lv(200, 180, 160, 150, 140);
      for (let w = 0; ; w++) {
        for (let i = 0; i < s.lv(4, 5, 6, 6, 7); i++) {
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
      // 강선 그물: 플레이어 둘레에 격자로 예고선이 깔리고, 강선이 한꺼번에 팽팽해짐. 칸 한가운데로 옮기면 안전.
      // 45도 마름모 격자와 가로세로 격자를 번갈아 치고, 예고하는 동안 느린 원형탄이 지나가 칸으로 가는 길을 골라야 함
      for (let w = 0; ; w++) {
        const gap = s.lv(110, 96, 86, 80, 76), warn = s.lv(62, 54, 48, 44, 40);
        const cx = s.player.x, cy = s.player.y, off = s.rand(-gap / 2, gap / 2);
        s.ring(s.cnt(18), { offset: s.rand(0, s.TAU), spd: s.sp(1.5), shape: 'small', color: 'white' });
        const tilt = w % 2 ? 0 : Math.PI / 4;
        for (const ang of [tilt, tilt + Math.PI / 2]) {
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
        s.zone({ x: 192, y: 95, r: 82, dur });
        // 보호막 안의 마르코: 황금 탄을 던지고, 한 번은 시계방향·한 번은 반시계방향으로 휘는 원형탄을 번갈아 깖.
        // 마리는 유지하느라 쏘지 않음
        for (let t = 0, k = 0; t < dur; t += s.wait(40), k++) {
          s.fire({ ang: s.aim(), spd: s.sp(3.6), shape: 'big', color: 'gold' });
          s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.8), angVel: (k % 2 ? 1 : -1) * 0.006, shape: 'rice', color: 'gold' });
          if (k % 2) s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.2, { spd: s.sp(2.8), shape: 'rice', color: 'orange' });
          yield s.wait(40);
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
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', bgmRate: 1.2, hp: 1800, time: 36, start: [192, 100],
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
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', bgmRate: 1.2, hp: 2100, time: 50, start: [192, 100],
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
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', bgmRate: 1.2, hp: 2000, time: 36, start: [192, 100],
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
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', bgmRate: 1.2, hp: 2500, time: 58, start: [192, 100],
    *run(s) {
      // 폭주한 마르코의 마지막 스펠: 달려드는 제압. 돌진 횟수가 늘고 멈춘 자리에서 충격파가 두 겹
      marcoRage(s);
      for (;;) {
        const light = s.task(function* () {   // 영창하는 동안 느린 원형탄과 조준탄
          for (let k = 0; ; k++) {
            s.ring(s.cnt(14), { offset: k * 0.29, spd: s.sp(1.5), shape: 'small', color: 'yellow' });
            if (k % 2) s.spread(3, s.aim(), 0.25, { spd: s.sp(2.4), shape: 'rice', color: 'orange' });
            yield s.wait(34);
          }
        }());
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 50 });
        light.return();
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
          yield 30;   // 붙든 자리에서 잠시 멈춤 = 공격 기회
          // 제자리로 물러나며 발을 굴러 느린 원형탄, 그 사이 조준탄
          s.move(s.rand(140, 244), s.rand(80, 110), 36);
          for (let t = 0; t < 36; t += 12) { s.spread(s.lv(3, 3, 5, 5, 7), s.aim(), 0.2, { spd: s.sp(2.6), shape: 'rice', color: 'gold' }); yield 12; }
          s.ring(s.cnt(16), { offset: s.rand(0, s.TAU), spd: s.sp(1.4), shape: 'small', color: 'yellow' });
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
    type: 'nonspell', boss: '김예나', bossColor: '#ffb3d9', hp: 1900, time: 36, start: [192, 100],
    *run(s) {
      // 생방송: 머리 위 시청자 수가 오를수록 별 탄이 한 발씩 늘어남(재미·자극). 원형 별탄과 조준 3점사를 번갈아
      for (let w = 0; ; w++) {
        const viewers = Math.min(8, w);
        s.say(s.boss, `시청자 ${(1.2 + w * 0.7).toFixed(1)}만`, 50);
        s.ring(s.cnt(14 + viewers), { offset: w * 0.17, spd: s.sp(1.7), shape: 'star', color: 'pink' });
        yield s.wait(26);
        for (let k = 0; k < 3; k++) { s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.16, { spd: s.sp(3.2), shape: 'rice', color: 'white' }); yield 7; }
        yield s.wait(26);
        if (w % 4 === 3) yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '「셔터 찬스」(가칭)',
    type: 'spell', boss: '김예나', bossColor: '#ffb3d9', hp: 2300, time: 42, start: [192, 90],
    *run(s) {
      // 촬영: 플레이어 자리에 뷰파인더(십자선)가 잡히고, 찰칵(경고음) 하는 순간의 자리로 부채꼴 연사가 날아감.
      // 세 장을 연달아 찍으므로 찍힌 자리에서 계속 비켜야 함. 뒤로는 느린 별 원형탄
      s.task(function* () {
        for (let k = 0; ; k++) { s.ring(s.cnt(16), { offset: k * 0.21, spd: s.sp(1.4), shape: 'star', color: 'pink' }); yield s.wait(44); }
      }());
      for (let w = 0; ; w++) {
        for (let k = 0; k < s.lv(3, 3, 4, 4, 5); k++) {
          const tx = s.player.x, ty = s.player.y, lead = s.lv(40, 34, 30, 28, 26);
          s.mark({ x: tx, y: ty, dur: lead });
          s.task(function* () {
            yield lead;
            s.sound('beep', 1);
            s.shake(1);
            const a = Math.atan2(ty - s.boss.y, tx - s.boss.x);
            for (let i = 0; i < 4; i++) { s.spread(s.lv(3, 5, 5, 7, 7), a, 0.13, { spd: s.sp(3.6 + i * 0.3), shape: 'rice', color: 'white' }); yield 3; }
          }());
          yield s.lv(22, 20, 18, 16, 15);
        }
        yield s.wait(60);
        if (w % 2 === 1) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '논스펠 · 김예나 2',
    type: 'nonspell', boss: '김예나', bossColor: '#ffb3d9', hp: 2000, time: 36, start: [192, 100],
    *run(s) {
      // 텐션 업: 세 갈래 별 나선이 돌다가 약 1.5초마다 갑자기 반대로 꺾임(자극). 꺾일 때마다 조준 부채꼴
      let a = 0, dir = 1;
      for (let f = 0; ; f++) {
        if (f % 18 === 17) { dir = -dir; s.spread(s.lv(3, 3, 5, 5, 7), s.aim(), 0.2, { spd: s.sp(3), shape: 'rice', color: 'white' }); }
        a += dir * 0.13;
        for (let i = 0; i < 3; i++) s.fire({ ang: a + i * s.TAU / 3, spd: s.sp(2.2), shape: 'star', color: i % 2 ? 'pink' : 'yellow' });
        if (f % 12 === 6) s.fire({ ang: s.aim(), spd: s.sp(3), shape: 'rice', color: 'white' });
        if (f % 90 === 89) yield* s.wander(40, 40);
        yield s.lv(7, 6, 5, 5, 4);
      }
    },
  },
  {
    name: '「스펙타클」(가칭)',
    type: 'spell', boss: '김예나', bossColor: '#ffb3d9', hp: 2600, time: 48, start: [192, 80],
    *run(s) {
      // 불꽃놀이: 폭죽이 화면 위쪽 여기저기로 날아가(터질 자리에 십자선) 별 원형탄으로 터지고, 불똥이 흩날려 떨어짐.
      // 터지는 자리는 플레이어에게서 90px 넘게 떨어진 곳만
      for (let w = 0; ; w++) {
        for (let k = 0; k < s.lv(3, 4, 5, 5, 6); k++) {
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
              s.ring(s.cnt(18), { x: b.x, y: b.y, offset: s.rand(0, s.TAU), spd: s.sp(1.9), shape: 'star', color: col });
              for (let i = 0; i < s.lv(4, 6, 8, 8, 10); i++) s.fire({ x: b.x, y: b.y, vx: s.rand(-1.2, 1.2), vy: s.rand(-1.4, -0.2), ay: 0.03, shape: 'small', color: 'orange', marginTop: 120,
                fn: c => { if (c.vy > 1.8) c.vy = 1.8; } });
            } });
          yield s.lv(20, 18, 16, 15, 14);
        }
        s.spread(s.lv(3, 3, 5, 5, 7), s.aim(), 0.18, { spd: s.sp(2.8), shape: 'rice', color: 'white' });
        yield s.wait(50);
        if (w % 3 === 2) yield* s.wander(60, 50);
      }
    },
  },
  {
    name: '논스펠 · 차서린 1',
    type: 'nonspell', boss: '차서린', bossColor: '#9fc8ff', hp: 1900, time: 36, start: [192, 100],
    *run(s) {
      // 4박: 박자(24프레임)마다 틱 소리와 작은 원형탄, 강박(1박)에는 큰 탄 조준 부채꼴
      for (let beat = 0; ; beat++) {
        const strong = beat % 4 === 0;
        s.sound('beep', strong ? 0.9 : 0.3);
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
          s.sound('beep', 0.4 + (i % 4 === 0 ? 0.5 : 0));
          const a = Math.PI / 2 + riff[i] * (bar % 2 ? -1 : 1);
          s.spread(s.lv(3, 5, 5, 7, 7), a, 0.09, { spd: s.sp(2.6), shape: 'knife', color: 'cyan' });
          if (i % 4 === 3) s.spread(s.lv(1, 1, 3, 3, 3), s.aim(), 0.2, { spd: s.sp(3), shape: 'rice', color: 'white' });
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
      // 음파: 물결 모양으로 늘어선 탄 줄이 화면 아래로 퍼져 내려감. 물결의 골(가장 높은 곳)에 한 칸 틈.
      // 박자마다 틱 소리, 줄 사이로 조준탄
      for (let w = 0; ; w++) {
        const ph = s.rand(0, s.TAU), gapX = s.rand(50, s.W - 50), n = 24;
        s.sound('beep', 0.6);
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * s.W / n;
          if (Math.abs(x - gapX) < s.lv(34, 28, 24, 22, 20)) continue;
          s.fire({ x, y: s.boss.y + 20 + Math.sin(x * 0.03 + ph) * 26, ang: Math.PI / 2, spd: s.sp(1.5), shape: 'small', color: 'cyan' });
        }
        yield s.wait(24);
        s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.2, { spd: s.sp(2.8), shape: 'rice', color: 'white' });
        yield s.wait(24);
        if (w % 6 === 5) yield* s.wander(40, 40);
      }
    },
  },
  {
    name: '「시선」(가칭)',
    type: 'spell', boss: '차서린', bossColor: '#9fc8ff', hp: 2600, time: 48, start: [192, 90],
    *run(s) {
      // 아인(눈·보다·빛): 화면 양옆 높이에 눈 표식 둘이 뜨고 플레이어를 바라봄 → 예고선 뒤 그 시선을 따라 빛줄기.
      // 두 눈이 번갈아 보므로 한쪽을 피한 자리를 다른 쪽이 노림. 박자에 맞춘 원형탄이 함께
      s.task(function* () {
        for (let beat = 0; ; beat++) {
          s.sound('beep', beat % 4 ? 0.3 : 0.8);
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
        s.spread(s.lv(3, 3, 5, 5, 7), s.aim(), 0.2, { spd: s.sp(2.6), shape: 'rice', color: 'white' });
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
      // 별 원형탄 두 겹과 조준 연사. 구석에서 시연이 구경함
      siyeonWatch(s);
      for (let w = 0; ; w++) {
        s.say(s.boss, 'POSE', 50);
        s.boss.glow = 60;
        yield 60;
        s.impact(3);
        s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(2), shape: 'star', color: 'yellow' });
        s.ring(s.cnt(20), { offset: s.rand(0, s.TAU), spd: s.sp(1.4), shape: 'star', color: 'orange' });
        for (let k = 0; k < 5; k++) { s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.15, { spd: s.sp(3.2), shape: 'rice', color: 'white' }); yield 10; }
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
      // 뛰어올라(화면 위로 사라짐) 비스듬히 내리꽂는 발차기. 예고선 끝(플레이어 70px 앞)에서 멈추고 착지 충격파 두 겹.
      // 뛰어오르는 동안 떨어지는 별 탄. 돌진 중에는 몸에 닿아도 피격
      siyeonWatch(s);
      for (let w = 0; ; w++) {
        s.boss.glow = 40;
        yield* s.moveTo(s.boss.x, -40, 24);
        for (let k = 0; k < 6; k++) { s.fire({ x: s.rand(20, s.W - 20), y: -8, ang: Math.PI / 2, spd: s.sp(2.2), shape: 'star', color: 'yellow' }); yield 4; }
        const sx = s.player.x < s.W / 2 ? s.W - 40 : 40, sy = -30;
        s.boss.x = sx; s.boss.y = sy;
        const px = s.player.x, py = s.player.y, d = Math.hypot(px - sx, py - sy) || 1, stop = Math.max(0, d - 70);
        const tx = sx + (px - sx) / d * stop, ty = Math.min(sy + (py - sy) / d * stop, s.H - 110);
        const warn = s.lv(50, 44, 38, 36, 34);
        s.warnLine({ x: sx, y: sy, x2: tx, y2: ty, band: 32, dur: warn });
        yield* aimWhile(s, warn, 'yellow');
        s.boss.contact = true;
        yield* s.moveTo(tx, ty, 16);
        s.boss.contact = false;
        s.impact(7);
        s.ring(s.cnt(20), { spd: 0.6, accel: 0.04, maxSpd: s.sp(2.2), shape: 'star', color: 'yellow' });
        if (s.diff > 0) s.ring(s.cnt(20), { offset: Math.PI / 20, spd: 0.4, accel: 0.03, maxSpd: s.sp(1.5), shape: 'small', color: 'orange' });
        yield 36;
        s.move(s.rand(140, 244), s.rand(80, 110), 40);
        for (let t = 0; t < 40; t += 10) { s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.2, { spd: s.sp(2.6), shape: 'rice', color: 'white' }); yield 10; }
        yield s.wait(30);
      }
    },
  },
  {
    name: '논스펠 · 고태웅 2',
    type: 'nonspell', boss: '고태웅', bossColor: '#ffcf6b', hp: 2300, time: 38, start: [192, 100],
    *run(s) {
      // 형 따라 하기: 1스테이지 형(고현성)의 관통탄 칼날 줄기를 흉내 냄. 흉내라 줄기가 조금씩 삐뚤빼뚤 흔들림.
      // 줄기 사이로 별 원형탄
      siyeonWatch(s);
      for (let w = 0; ; w++) {
        const base = s.aim();
        for (let k = 0; k < s.lv(2, 3, 3, 4, 4); k++) {
          const a = base + (k - (s.lv(2, 3, 3, 4, 4) - 1) / 2) * 0.35;
          s.task(function* () {
            for (let i = 0; i < 8; i++) { s.fire({ ang: a + Math.sin(i * 0.9) * 0.05, spd: s.sp(4), shape: 'knife', color: 'yellow' }); yield 3; }
          }());
        }
        yield s.wait(30);
        s.ring(s.cnt(18), { offset: w * 0.3, spd: s.sp(1.6), shape: 'star', color: 'orange' });
        yield s.wait(30);
        if (w % 4 === 3) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「점멸」(가칭)',
    type: 'spell', boss: '고태웅', bossColor: '#ffcf6b', hp: 3000, time: 52, start: [192, 80],
    *run(s) {
      // 변신 벨트 불빛처럼 깜빡이는 격자. 엇갈린 세로 줄들이 고정 간격(가로 40px, 세로 dy, 이웃 줄은 반 칸 엇갈림)을 지키며
      // 왼쪽에서 오른쪽으로 함께 진행하고, 격자 전체가 같은 박자로 켜졌다 꺼짐. 꺼진 동안은 자리만 아주 흐리게 보이고
      // 판정이 없음. 처음엔 느리게 깜빡이다가 점점 빨라짐. 켜진 동안은 탄 사이 틈에 머무르며 격자와 함께 흘러가고,
      // 꺼진 동안 자리를 옮김. 보스는 가끔 느린 조준 별탄을 쏘고, 두 번에 한 번 양옆으로 부채꼴을 뿌림
      siyeonWatch(s);
      const dx = 40, dy = s.lv(46, 42, 40, 38, 38), v = s.sp(0.9), top = 130, grid = { on: true };
      // 깜빡임: 켜짐 약 1.6초·꺼짐 1초에서 시작해 14번에 걸쳐 켜짐 약 0.5초·꺼짐 0.35초까지 빨라짐. 켜질 때 높은 틱, 꺼질 때 낮은 틱
      s.task(function* () {
        for (let k = 0; ; k++) {
          const p = Math.min(1, k / 14);
          const on = Math.round(s.lv(100, 96, 92, 90, 88) * (1 - p) + s.lv(40, 34, 30, 28, 26) * p);
          const off = Math.round(60 * (1 - p) + s.lv(28, 24, 22, 20, 20) * p);
          grid.on = true; s.sound('beep', 0.9);
          yield on;
          grid.on = false; s.sound('beep', 0.2);
          yield off;
        }
      }());
      // 격자 줄: 왼쪽 밖에서 dx/v 프레임마다 한 줄씩 들어옴. 모두 같은 속도라 줄 사이 간격이 그대로 유지됨
      s.task(function* () {
        for (let c = 0; ; c++) {
          const off = (c % 2) * dy / 2;
          for (let y = top + off; y < s.H + 10; y += dy) s.fire({ x: -10, y, ang: 0, spd: v, shape: 'orb', color: 'yellow', margin: 20, fn: b => { b.off = !grid.on; } });
          yield Math.round(dx / v);
        }
      }());
      // 격자는 화면 위쪽(top 위)에 없으므로, 두 번에 한 번 양옆으로 약간 아래를 향한 부채꼴을 뿌려 위쪽 빈 곳을 쓸어 줌
      for (let k = 0; ; k++) {
        yield s.wait(70);
        s.spread(s.lv(1, 1, 3, 3, 3), s.aim(), 0.25, { spd: s.sp(1.8), shape: 'star', color: 'orange' });
        if (k % 2 === 1) for (const a of [0.3, Math.PI - 0.3]) s.spread(s.lv(5, 6, 7, 8, 9), a, 0.14, { spd: s.sp(2.2), shape: 'rice', color: 'orange' });
      }
    },
  },
  // ── 5스테이지 · 세라프: 아즈라엘(보스). 이즘의 시뮬레이션이 불러낸 사본이라 실루엣과 모티브 문자만, 대사 없음 ──
  // 모티브 문자 아인(ע): 눈·보다·빛. 탄은 빛나는 검은색(void)과 흰색 위주
  {
    name: '논스펠 · 아즈라엘 1',
    type: 'nonspell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 2400, time: 38, start: [192, 90],
    *run(s) {
      // 흑백 교차: 흰 쌀알탄 원형(조금씩 시계 방향으로 휨)과 검은 구슬 원형(반시계로 휨)이 박자를 엇갈려 나감. 두 번에 한 번 검은 조준탄
      for (let w = 0; ; w++) {
        s.ring(s.cnt(18), { offset: w * 0.19, spd: s.sp(1.8), angVel: 0.004, shape: 'rice', color: 'white' });
        yield s.wait(22);
        s.ring(s.cnt(12), { offset: -w * 0.23, spd: s.sp(1.3), angVel: -0.004, shape: 'orb', color: 'void' });
        yield s.wait(22);
        if (w % 2) s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.18, { spd: s.sp(2.8), shape: 'orb', color: 'void' });
        if (w % 5 === 4) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「명암」(가칭)',
    type: 'spell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 3000, time: 48, start: [192, 70],
    *run(s) {
      // 빛과 그림자: 위에서 흰 빛줄기(쌀알탄)가 성기게 내리고, 좌우 가장자리에서 검은 구슬 줄이 가로로 흘러 들어옴(줄마다 방향이 바뀜).
      // 가로 줄은 들어올 높이를 옅은 띠로 먼저 보여 줌. 구슬 사이 44px라 줄을 비스듬히 지나갈 수 있음
      s.task(function* () {
        for (;;) { s.fire({ x: s.rand(8, s.W - 8), y: -8, ang: Math.PI / 2, spd: s.sp(2.2), shape: 'rice', color: 'white' }); yield s.wait(s.lv(9, 7, 6, 5, 5)); }
      }());
      for (let w = 0; ; w++) {
        const dir = w % 2 ? -1 : 1, y = s.rand(160, s.H - 40), warn = s.lv(44, 40, 36, 34, 32);
        s.warnLine({ x: 0, y, x2: s.W, y2: y, band: 16, dur: warn });
        yield warn;
        for (let i = 0; i < 9; i++) {
          s.fire({ x: dir > 0 ? -10 - i * 44 : s.W + 10 + i * 44, y, ang: dir > 0 ? 0 : Math.PI, spd: s.sp(1.6), shape: 'orb', color: 'void', margin: 420 });
        }
        yield s.wait(s.lv(60, 52, 46, 42, 40));
        if (w % 4 === 3) yield* s.wander(40, 50);
      }
    },
  },
  {
    name: '논스펠 · 아즈라엘 2',
    type: 'nonspell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 2500, time: 38, start: [192, 100],
    *run(s) {
      // 홍채: 흰 탄 고리가 보스 둘레로 펼쳐져 잠깐 멈췄다가(눈동자가 조여들 듯) 한꺼번에 바깥으로 풀려 나감.
      // 풀리는 순간 검은 조준탄. 고리마다 조금씩 돌아간 자리
      for (let w = 0; ; w++) {
        const n = s.cnt(24), list = [];
        for (let i = 0; i < n; i++) list.push(s.fire({ ang: i * s.TAU / n + w * 0.13, spd: s.sp(2.2), accel: -0.08, minSpd: 0, shape: 'small', color: w % 2 ? 'void' : 'white' }));
        yield 40;
        for (const b of list) { b.accel = 0.035; b.maxSpd = s.sp(2.2); }
        s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.2, { spd: s.sp(2.8), shape: 'orb', color: 'void' });
        yield s.wait(34);
        if (w % 5 === 4) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '「섬광」(가칭)',
    type: 'spell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 3100, time: 50, start: [192, 110],
    *run(s) {
      // 섬광: 보스가 빛을 모으는 동안 방사형 예고선 → 흰 레이저가 사방으로. 레이저 사이 각도로 비킴.
      // 다음 섬광은 반 칸 돌아간 자리라 같은 틈에 머물 수 없음. 레이저가 꺼진 뒤 그 사이로 검은 구슬 원형탄
      for (let w = 0; ; w++) {
        const n = s.lv(6, 8, 8, 10, 10), off = w * Math.PI / n + s.rand(-0.08, 0.08), warn = s.lv(56, 50, 46, 42, 40);
        s.boss.glow = warn;
        for (let i = 0; i < n; i++) s.laser({ x: s.boss.x, y: s.boss.y, ang: off + i * s.TAU / n, len: 700, w: 14, warn, dur: 30, color: 'white' });
        yield warn + 30;
        s.ring(s.cnt(16), { offset: off + Math.PI / n, spd: s.sp(1.4), shape: 'orb', color: 'void' });
        yield s.wait(24);
        s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.2, { spd: s.sp(2.6), shape: 'rice', color: 'white' });
        yield s.wait(36);
        if (w % 2 === 1) yield* s.wander(50, 50);
      }
    },
  },
  {
    name: '논스펠 · 아즈라엘 3',
    type: 'nonspell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 2100, time: 36, start: [192, 90],
    *run(s) {
      // 잔상: 검은 조준탄 셋이 지나간 자리에 흰 잔상이 남았다가 천천히 흘러내림. 잔상 사이로 다음 조준탄을 피함
      for (let w = 0; ; w++) {
        for (let k = 0; k < 3; k++) {
          s.fire({ ang: s.aim() + (k - 1) * 0.3, spd: s.sp(2.4), shape: 'orb', color: 'void',
            // 잔상은 날아가기 시작한 뒤 1초 동안만(기체 가까이에는 쌓이지 않게) 16프레임마다
            fn: (b, s) => { if (b.t < 60 && b.t % 16 === 8) s.fire({ x: b.x, y: b.y, ang: Math.PI / 2, spd: 0.4, accel: 0.02, maxSpd: s.sp(1.6), shape: 'small', color: 'white' }); } });
        }
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
      // 보스 양옆을 검은 안개로 막아 들어갈 수 없는 구역을 만듦(판정 있음). 남는 곳은 보스 밑 통로와 화면 아래 띠뿐이고,
      // 그 좁은 곳으로 흰 원형탄과 검은 조준탄이 옴. 안개는 1초 예고(깜빡이는 흰 테두리) 뒤 짙어지고, 보스가 옮기면 다시 깔림
      for (let w = 0; ; w++) {
        yield* s.moveTo(s.rand(140, s.W - 140), s.rand(70, 100), 40);
        const cx = s.boss.x, gap = s.lv(84, 74, 66, 62, 58), bottom = s.lv(290, 300, 310, 316, 320);
        const warn = 60, dur = s.lv(330, 360, 390, 400, 420);
        s.area({ x: 0, y: 0, w: cx - gap, h: bottom, warn, dur, color: '#16141f', fog: true });
        s.area({ x: cx + gap, y: 0, w: s.W - cx - gap, h: bottom, warn, dur, color: '#16141f', fog: true });
        s.sound('beep', 0.2);
        yield warn;
        for (let t = 0, k = 0; t < dur; t += s.wait(30), k++) {
          s.ring(s.cnt(14), { offset: k * 0.21, spd: s.sp(1.6), shape: 'rice', color: 'white' });
          if (k % 2) s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.2, { spd: s.sp(2.4), shape: 'orb', color: 'void' });
          yield s.wait(30);
        }
        yield 30;
      }
    },
  },
  {
    name: '「아인」(가칭)',
    type: 'spell', boss: '아즈라엘', bossColor: '#e8e8f4', hp: 5600, time: 84, start: [192, 70],
    *run(s) {
      // 엇갈린 격자(0-0-0 / -0-0- / 0-0-0)가 세 줄씩 묶여 천천히 내려옴. 한 줄 안의 틈과 엇갈린 이웃 줄의 틈을 이어
      // 비스듬히 빠져나감. 동시에 표적(시선)이 약 4초 동안 기체를 천천히 따라오다가 멈춰 조여든 뒤 그 자리에서 좁게
      // 폭발하고 탄이 적당히 퍼짐. 표적은 기체보다 느려서 떼어 놓을 수 있지만 격자 사이를 누비며 떼어 놓아야 함
      s.title('ע', '#e8e8f4');
      // 한 줄 탄 수: 이지 11 … 헬 13. 한 줄 안 기체가 지날 틈 = 간격 - 2×(탄 반지름 6 + 판정 2.4) = 헬에서도 약 12.7px
      const cols = s.lv(11, 12, 12, 13, 13), gap = s.W / cols, fall = s.sp(0.6);
      const rowGap = s.lv(34, 32, 30, 28, 28), bandGap = s.lv(110, 96, 86, 80, 74);
      // 격자: 세 줄 묶음을 이어서 내려보냄. 이웃 줄은 반 칸 엇갈림
      s.task(function* () {
        for (;;) {
          for (let r = 0; r < 3; r++) {
            const off = (r % 2 ? gap / 2 : 0) + gap / 4;
            for (let i = 0; i < cols; i++) s.fire({ x: off + i * gap, y: -8, ang: Math.PI / 2, spd: fall, shape: 'orb', color: 'void', marginTop: 20 });
            yield Math.round(rowGap / fall);
          }
          yield Math.round((bandGap - rowGap) / fall);
        }
      }());
      yield 90;
      for (;;) {
        // 표적: 3.5초 동안 기체를 천천히 따라오고, 마지막 0.5초는 멈춰서 경고음이 빨라짐(폭발 예고)
        let mx = s.boss.x, my = s.boss.y + 40;
        const follow = 210, lock = 30, chase = s.lv(0.6, 0.7, 0.8, 0.85, 0.9);
        for (let t = 0; t < follow + lock; t++) {
          if (t < follow) {
            const dx = s.player.x - mx, dy = s.player.y - my, d = Math.hypot(dx, dy);
            if (d > 1) { mx += dx / d * Math.min(chase, d); my += dy / d * Math.min(chase, d); }
          }
          if (t % 4 === 0) s.mark({ x: mx, y: my, dur: 5 });
          if (t >= follow && t % 6 === 0) s.sound('beep', (t - follow) / lock);
          yield 1;
        }
        // 좁은 폭발: 반지름 약 36px까지만 번지고 사라지는 흰 탄 원 + 적당한 양의 흩어지는 탄
        s.impact(4);
        const R = 36;
        for (let i = 0; i < 20; i++) s.fire({ x: mx, y: my, ang: i * s.TAU / 20, spd: 3, shape: 'small', color: 'white', fn: b => { if (b.t * 3 > R) b.dead = true; } });
        s.ring(s.cnt(s.lv(8, 10, 12, 12, 14)), { x: mx, y: my, offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'rice', color: 'white' });
        s.ring(s.cnt(s.lv(6, 6, 8, 8, 10)), { x: mx, y: my, offset: s.rand(0, s.TAU), spd: s.sp(1.1), shape: 'orb', color: 'void' });
        yield s.wait(40);
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
      let a = 0;
      for (let f = 0; ; f++) {
        a += 0.05 * (Math.floor(f / 40) % 2 ? -1 : 1);
        const arms = s.lv(3, 3, 4, 4, 4);
        for (let i = 0; i < arms; i++) s.fire({ ang: a + i * s.TAU / arms, spd: s.sp(2.4), shape: 'link', color: 'gold' });
        if (s.diff >= 1 && f % 2 === 0) for (let i = 0; i < 3; i++) s.fire({ ang: -f * 0.06 + i * s.TAU / 3 + Math.PI / 3, spd: s.sp(1.8), shape: 'small', color: 'yellow' });
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
    name: '논스펠 · 예로니모 4',
    type: 'nonspell', boss: '예로니모', bossColor: '#e8e0c8', hp: 2900, time: 42, start: [192, 110],
    *run(s) {
      // 빛의 십자 두 개: 빠른 황금 십자는 천천히 돌다 방향을 바꾸고, 느린 흰 십자는 반대로 돎.
      // 두 십자가 엇갈리며 마름모 틈이 계속 옮겨 가므로 틈을 따라 움직여야 함. 가끔 조준 칼날
      let a = 0, b = Math.PI / 4;
      for (let f = 0; ; f++) {
        a += 0.016 * (Math.floor(f / 90) % 2 ? -1 : 1);
        b -= 0.011;
        for (let i = 0; i < 4; i++) s.fire({ ang: a + i * Math.PI / 2, spd: s.sp(2.8), shape: 'rice', color: 'yellow' });
        if (f % 2 === 0) for (let i = 0; i < 4; i++) s.fire({ ang: b + i * Math.PI / 2, spd: s.sp(1.6), shape: 'small', color: 'white' });
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
      // 예로니모의 파테르 제2식: 돌진해 멈춘 자리에서 황금 사슬을 사방으로 뻗어 붙들어 둠(사슬 사이 대각선 방향이 틈).
      // 사슬이 뻗어 있는 동안 조준탄이 이어지고, 걷힐 때 원형탄 두 겹
      for (;;) {
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.27, spd: s.sp(1.5), shape: 'small', color: 'white' }); yield s.wait(34); }
        }());
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 50 });
        light.return();
        for (let k = 0; k < s.lv(2, 3, 3, 4, 4); k++) {
          const px = s.player.x, py = s.player.y, d = Math.hypot(px - s.boss.x, py - s.boss.y) || 1;
          const stop = Math.max(0, d - 110);
          const tx = s.boss.x + (px - s.boss.x) / d * stop, ty = Math.min(s.boss.y + (py - s.boss.y) / d * stop, s.H - 160);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: s.lv(48, 40, 34) });
          yield* aimWhile(s, s.lv(48, 40, 34), 'yellow');
          s.boss.contact = true;
          yield* s.moveTo(tx, ty, 20);
          s.boss.contact = false;
          s.impact(7);
          const n = s.lv(4, 6, 8, 8, 10), off = s.rand(0, s.TAU), warn = s.lv(45, 40, 34);
          for (let i = 0; i < n; i++) s.chain({ x: tx, y: ty, ang: off + i * s.TAU / n, len: 520, warn, shoot: 10, hold: 14, retract: 70 });
          yield warn + 30;   // 사슬이 뻗은 동안은 본체가 쏘지 않음(사슬에 집중)
          s.ring(s.cnt(20), { offset: off + Math.PI / n, spd: 0.5, accel: 0.03, maxSpd: s.sp(2.2), shape: 'orb', color: 'gold' });
          yield 10;
          s.ring(s.cnt(20), { offset: off, spd: 0.4, accel: 0.025, maxSpd: s.sp(1.5), shape: 'small', color: 'yellow' });
          yield 30;
          s.move(s.rand(140, 244), s.rand(80, 110), 40);
          yield 40;
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
  // ── 엑스트라 · 진심 예로니모: 6스테이지와 같은 술식을 다른 모양으로. extra라 한 단계 위 난이도로 계산 ──
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
      // 쌍둥이 나선: 보스 양옆 두 점에서 서로 반대로 도는 사슬 나선. 가운데에서 두 나선이 엇갈림. 가끔 조준 칼날
      let a = 0;
      for (let f = 0; ; f++) {
        a += 0.07;
        for (const side of [-1, 1]) {
          const x = s.boss.x + side * 70, y = s.boss.y + 10;
          for (let i = 0; i < 3; i++) s.fire({ x, y, ang: side * a + i * s.TAU / 3, spd: s.sp(2.2), shape: 'link', color: side < 0 ? 'gold' : 'yellow' });
        }
        if (f % 6 === 0) s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.14, { spd: s.sp(3.8), shape: 'knife', color: 'white' });
        if (f % 60 === 59) yield* s.wander(30, 40);
        yield s.lv(8, 7, 6, 6, 5);
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
          const tx = s.player.x, ty = s.player.y, T = 30;
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
      // 교차 사슬: 위쪽 두 모서리에서 플레이어 자리를 지나는 사슬이 X자로 뻗음(예고선 뒤). 옆으로 비키고,
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
        yield warn + 20;
        s.spread(s.lv(3, 3, 5, 5, 7), s.aim(), 0.18, { spd: s.sp(3.4), shape: 'knife', color: 'white' });
        yield s.wait(40);
      }
    },
  },
  {
    name: '파테르 제2식 — 능히 일어나지 못하게 하리니',
    type: 'spell', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 3200, time: 52, start: [192, 100],
    *run(s) {
      // 연속 돌진: 제자리로 돌아가지 않고 세 번 이어 달려듦. 멈출 때마다 사슬을 사방으로 뻗고,
      // 마지막 돌진 뒤에는 사슬을 두 겹(엇갈린 각도)으로 뻗음
      for (;;) {
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.27, spd: s.sp(1.5), shape: 'small', color: 'white' }); yield s.wait(32); }
        }());
        yield* castGap(s);
        yield* s.chant('PATER2', { by: s.boss, step: 44 });
        light.return();
        const dashes = 3;
        for (let k = 0; k < dashes; k++) {
          const px = s.player.x, py = s.player.y, d = Math.hypot(px - s.boss.x, py - s.boss.y) || 1;
          const stop = Math.max(0, d - 110);
          const tx = Math.max(30, Math.min(s.W - 30, s.boss.x + (px - s.boss.x) / d * stop)), ty = Math.max(60, Math.min(s.boss.y + (py - s.boss.y) / d * stop, s.H - 160));
          const warn = s.lv(40, 36, 32, 30, 28);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, band: 32, dur: warn });
          yield* aimWhile(s, warn, 'yellow');
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
    type: 'spell', extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 3600, time: 60, start: [192, 100],
    *run(s) {
      // 사슬이 걷힌 자리에 고리가 남아 양옆으로 천천히 흩어짐. 사슬이 늘어날수록 남는 고리도 늘어 화면이 조여듦
      const light = s.task(function* () {
        for (let k = 0; ; k++) { s.ring(s.cnt(14), { offset: k * 0.3, spd: s.sp(1.3), shape: 'small', color: 'gold' }); yield s.wait(36); }
      }());
      yield* s.chant('NUNC_DIMITTIS', { by: s.boss, step: 32 });
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
        const n = Math.min(s.lv(2, 3, 3) + w, s.lv(3, 4, 4, 5, 5));
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
        for (let k = 0; k < 3; k++) { yield s.wait(30); if (k !== 1) s.spread(s.lv(1, 3, 3), s.aim(), 0.2, { spd: s.sp(3), shape: 'leaf', color: 'ivy' }); }
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
        yield s.wait(35) * 6;   // 큰 패턴이라 본체는 쏘지 않음(덩굴에 집중)
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
        if (f % 40 === 0 && s.diff > 0) s.ring(s.cnt(16), { offset: -a, spd: s.sp(1.4), shape: 'small', color: 'pink' });
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
        for (let k = 0; k < 3; k++) { yield s.wait(25); if (k !== 1) s.spread(s.lv(1, 3, 3, 5), s.aim(), 0.16, { spd: s.sp(3), shape: 'small', color: 'pink' }); }
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
        yield s.wait(60) * 3;   // 큰 패턴이라 본체는 쏘지 않음(꽃에 집중)
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
        for (let k = 0; k < 3; k++) { yield s.wait(40); if (k === 1) s.spread(s.lv(1, 1, 3, 3, 3), s.aim(), 0.25, { spd: s.sp(2.4), shape: 'leaf', color: 'ivy' }); }
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
        yield s.wait(36) * 4;   // 큰 패턴이라 본체는 쏘지 않음
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
      // 순서 기억: 화면을 큰 칸으로 나눔(이지·노말 3칸, 하드 9칸, 베리하드·헬 12칸). 칸이 하나씩 번호와 함께 빛나며
      // 순서를 알려 주고(번호가 높을수록 높은 효과음), 곧바로 그 순서대로 한 칸씩 터짐. 터진 칸은 그 판 동안 안전하므로
      // 다음에 터질 칸을 기억해 미리 비킴. 끝나면 바로 새 순서를 알려 주고, 이렇게 4판. 판마다 약 10%씩 빨라짐.
      // 칸 하나를 벗어나는 데 고속 이동으로 약 20프레임이 드므로 터지는 간격은 22프레임 아래로 내리지 않음. 터지기 전 예고는 약 0.5~0.7초
      const [cols, rows] = s.lv([3, 1], [3, 1], [3, 3], [3, 4], [3, 4]), n = cols * rows, cw = s.W / cols, ch = s.H / rows;
      const cell = c => ({ x: (c % cols) * cw, y: Math.floor(c / cols) * ch, w: cw, h: ch });
      for (;;) {
        for (let round = 0; round < 4; round++) {
          const f = Math.pow(0.9, round), order = [...Array(n).keys()].sort(() => Math.random() - 0.5);
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
          const step = Math.max(22, Math.round(s.lv(46, 40, 32, 30, 28) * f)), warn = s.lv(42, 38, 34, 32, 30);
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
      // 배경: 위에서 성긴 데이터 비가 비스듬히 내림. 가만히 서서 저격만 기다릴 수 없게
      s.task(function* () {
        for (;;) {
          s.fire({ x: s.rand(0, s.W + 80), y: -6, ang: Math.PI / 2 + 0.35, spd: s.sp(1.6), shape: 'small', color: 'cyan' });
          yield s.wait(s.lv(14, 10, 8, 7, 6));
        }
      }());
      for (let w = 0; ; w++) {
        for (let k = 0; k < s.lv(3, 4, 5, 6, 6); k++) {
          const p = s.player, delay = s.lv(48, 42, 36, 32, 28), travel = s.lv(20, 18, 16, 14, 13), lead = delay + travel;
          const tx = clamp(p.x + (p.vx || 0) * lead, 10, s.W - 10), ty = clamp(p.y + (p.vy || 0) * lead, 10, s.H - 10);
          const a = Math.atan2(ty - s.boss.y, tx - s.boss.x), dist = Math.hypot(tx - s.boss.x, ty - s.boss.y);
          s.mark({ x: tx, y: ty, dur: lead });
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: s.boss.x + Math.cos(a) * 700, y2: s.boss.y + Math.sin(a) * 700, dur: delay, band: 10 });
          // 하드 이상: 가는 쪽과 지금 자리가 30px 넘게 떨어지면 지금 자리에도 한 줄(그대로 가도, 멈춰도 맞으므로 방향을 틀어야 함).
          // 가만히 서 있으면 조금 벌어진 두 줄 사이 틈이 아니라 옆으로 한 칸 크게 비껴 쏨 → 서 있던 자리 좌우 한쪽이 막힘
          const moving = Math.hypot(tx - p.x, ty - p.y) > 30;
          const a2 = moving ? Math.atan2(p.y - s.boss.y, p.x - s.boss.x) : a + (Math.random() < 0.5 ? -1 : 1) * 0.16;
          const two = s.diff >= 2;
          if (two) s.warnLine({ x: s.boss.x, y: s.boss.y, x2: s.boss.x + Math.cos(a2) * 700, y2: s.boss.y + Math.sin(a2) * 700, dur: delay, band: 10 });
          // 삐… 삐… 삐비비빅: 간격이 점점 짧아지는 경고음
          for (let t = 0, gap = 12; t < delay;) {
            s.sound('beep', t / delay);
            const g = Math.max(2, Math.min(delay - t, Math.round(gap)));
            yield g; t += g; gap *= 0.78;
          }
          const spd = Math.max(5, dist / travel), n = s.lv(6, 8, 10, 12, 14);
          for (let i = 0; i < n; i++) { s.fire({ ang: a, spd, shape: 'knife', color: 'red' }); if (two) s.fire({ ang: a2, spd, shape: 'knife', color: 'red' }); yield 2; }
          s.ring(s.cnt(16), { offset: s.rand(0, s.TAU), spd: s.sp(1.7), shape: 'small', color: 'cyan' });
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
        const on = s.lv(3, 4, 4, 5, 5), warn = s.lv(50, 42, 36);
        const pickLanes = () => [...Array(lanes).keys()].sort(() => Math.random() - 0.5).slice(0, on);
        let pick = pickLanes();
        for (const i of pick) s.area({ x: i * lw + 2, y: 0, w: lw - 4, h: s.H, warn, dur: 0, label: '1', color: '#35d6ff' });
        yield warn;
        // 두 번 내림: 첫 비가 내리는 끝무렵에 다음 줄을 예고하고, 이어서 그 줄에 비가 내림
        for (let round = 0; round < 2; round++) {
          let next = null;
          for (let t = 0; t < 120; t += 3) {
            if (round === 0 && t === 120 - warn - (warn % 3)) {
              // 다음 줄은 지금 서 있는 줄을 반드시 포함하고, 비가 안 오는 이웃 칸(비 줄을 건너지 않고 갈 수 있는 곳) 하나는 비워 둠.
              // 그런 칸이 없으면 두 번째 비는 없음
              const pl = Math.max(0, Math.min(lanes - 1, Math.floor(s.player.x / lw))), seg = [];
              if (!pick.includes(pl)) {
                for (let i = pl - 1; i >= 0 && !pick.includes(i); i--) seg.push(i);
                for (let i = pl + 1; i < lanes && !pick.includes(i); i++) seg.push(i);
              }
              if (seg.length) {
                const keep = s.pick(seg);
                next = [pl, ...[...Array(lanes).keys()].filter(i => i !== pl && i !== keep).sort(() => Math.random() - 0.5).slice(0, on - 1)];
                for (const i of next) s.area({ x: i * lw + 2, y: 0, w: lw - 4, h: s.H, warn, dur: 0, label: '0', color: '#8fe8ff' });
              }
            }
            for (const i of pick) if (Math.random() < s.lv(0.45, 0.6, 0.7, 0.8, 0.9)) {
              s.fire({ x: i * lw + s.rand(6, lw - 6), y: -6, ang: Math.PI / 2, spd: s.sp(s.rand(3, 4.5)), shape: 'small', color: 'cyan' });
            }
            // 빈 줄에 서 있어도 조준탄이 와서 줄 안에서 비켜야 함
            if (t % 24 === 12) s.spread(s.lv(1, 3, 3, 3, 5), s.aim(), 0.14, { spd: s.sp(2.6), shape: 'rice', color: 'white' });
            yield 3;
          }
          if (!next) break;
          pick = next;
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
      // 불렛타임의 반대: 경고 뒤 잠깐 적 탄 시계만 확 빨라짐(2.4~3.4배). 평소엔 아주 느린 원형탄과 두 갈래 나선을 깔아 두었다가
      // 한꺼번에 몰아침. 빨라진 동안에도 조준탄을 쏘므로(함께 빨라짐) 깔린 탄 사이에서 계속 움직여야 함
      for (let w = 0; ; w++) {
        const dir = w % 2 ? -1 : 1;
        for (let k = 0; k < 14; k++) {
          if (k % 2 === 0) s.ring(s.cnt(22), { offset: s.rand(0, s.TAU), spd: s.sp(0.75), shape: 'orb', color: 'cyan' });
          for (let i = 0; i < 2; i++) s.fire({ ang: dir * k * 0.33 + i * Math.PI, spd: s.sp(0.9), shape: 'rice', color: 'blue' });
          if (k % 3 === 1) s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(1.1), shape: 'rice', color: 'white' });
          yield s.wait(16);
        }
        s.say(s.boss, 'OVERCLOCK', 50);
        yield 45;
        s.bulletTime(s.lv(2.4, 2.7, 3, 3.2, 3.4), 120);
        for (let t = 0; t < 120; t += 30) { s.spread(3, s.aim(), 0.3, { spd: s.sp(1.1), shape: 'small', color: 'white' }); yield 30; }
        yield 30;
      }
    },
  },
  {
    name: '「세이브 포인트」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3000, time: 50, start: [192, 60],
    *run(s) {
      // 안전지대 셋에 1·2·3 번호를 차례로 미리 보여 준 뒤, 빰! 1번만 남기고 화면이 탄막으로 찼다가 터져 사라지고,
      // 빰! 2번만 남기고 … 번호 순서대로 옮겨 다니면 됨. 안전지대는 한 번에 옮길 수 있는 거리로만 이어짐.
      // 채워진 동안 탄막이 안전지대째 다음 번호 쪽으로 천천히 흘러가므로 안전지대를 따라 움직여야 하고,
      // 그사이 보스가 안전지대 안에서 비킬 수 있는 느린 조준탄을 쏨
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const R = s.lv(50, 44, 40, 36, 34), hold = s.lv(72, 66, 60, 56, 52), move = s.lv(52, 46, 40, 36, 34);
      for (let w = 0; ; w++) {
        const pts = [];
        let px = clamp(s.player.x, 60, s.W - 60), py = clamp(s.player.y, 190, s.H - 60);
        for (let k = 0; k < 3; k++) {
          const a = s.rand(0, s.TAU), d = s.rand(90, 140);
          px = clamp(px + Math.cos(a) * d, 60, s.W - 60); py = clamp(py + Math.sin(a) * d, 190, s.H - 60);
          pts.push({ x: px, y: py, r: R });
        }
        const preview = s.lv(110, 96, 86, 78, 72), stagger = 22, gap = hold + move;
        const zones = [];
        pts.forEach((p, k) => s.task(function* () {
          yield k * stagger;
          zones[k] = s.safeZone({ x: p.x, y: p.y, r: R, label: k + 1, dur: preview - k * stagger + k * gap + hold + 6 });
          s.sound('beep', k / 3);
        }()));
        // 번호를 외우는 동안 조준탄 줄기를 피하며 움직여야 함
        for (let t = 0; t < preview; t += 12) {
          s.spread(s.lv(1, 1, 3, 3, 3), s.aim(), 0.18, { spd: s.sp(3), shape: 'rice', color: 'white' });
          if (t % 36 === 0) s.ring(s.cnt(14), { offset: s.rand(0, s.TAU), spd: s.sp(1.8), shape: 'small', color: 'cyan' });
          yield Math.min(12, preview - t);
        }
        s.clear();
        for (let k = 0; k < 3; k++) {
          // 흐를 방향: 다음 번호 쪽(마지막은 화면 가운데 쪽). 흐르는 거리는 다음 번호까지 거리의 절반 이하, 45px 이하
          const to = pts[k + 1] || { x: s.W / 2, y: s.H - 120 }, dx = to.x - pts[k].x, dy = to.y - pts[k].y, d = Math.hypot(dx, dy) || 1;
          const spd = Math.min(45, d * 0.5) / hold, motion = { vx: dx / d * spd, vy: dy / d * spd };
          const list = fillField(s, { holes: [pts[k]], spacing: s.lv(20, 19, 18, 17, 16), color: k % 2 ? 'cyan' : 'blue', motion, pad: 50 });
          for (let t = 0; t < hold; t++) {
            if (zones[k]) { zones[k].x += motion.vx; zones[k].y += motion.vy; }
            if (t % s.lv(36, 30, 26, 24, 22) === 12) s.spread(s.lv(1, 1, 1, 3, 3), s.aim(), 0.16, { spd: s.sp(1.8), shape: 'rice', color: 'white' });
            yield 1;
          }
          s.pop(list);
          yield move;
        }
        for (let k = 0; k < 4; k++) {
          s.spread(s.lv(1, 3, 3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.4), shape: 'small', color: 'white' });
          s.ring(s.cnt(16), { offset: k * 0.4, spd: s.sp(1.6), shape: 'small', color: 'blue' });
          yield s.wait(28);
        }
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
  {
    name: '「백일몽」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3200, time: 70, start: [192, 70],
    *run(s) {
      // 「열흘 같은 하루」의 강화판: 느려진 시간 속 미로 도중에 OVERCLOCK 경고가 뜨고 약 1.2초 동안 시간이 두 배로 빨라짐
      // (미로가 두 배 빠르게 흘러옴). 빨라져도 따라갈 수 있게 통로가 줄마다 옮겨 가는 폭(shift)을 6px 이하로 둠:
      // 빨라진 동안 한 줄이 기체를 지나는 시간 약 4.3프레임 × 저속 1.6px ≈ 6.9px > 6px.
      // 통로 폭은 열흘 같은 하루보다 조금 넓게(기체가 설 수 있는 폭 gapW - 10.8, 이웃 줄과 헬에서도 11px 이상 겹침)
      const cell = 12, fall = 5, slowK = 0.25, fastK = 0.5, top = -10;
      for (;;) {
        const gapW = s.lv(50, 42, 36, 32, 28), shift = s.lv(5, 6, 6, 6, 6);
        const rows = s.lv(64, 72, 80, 84, 88);
        s.bulletTime(slowK, 99999);
        yield 20;
        const path = [];
        let cx = Math.max(gapW, Math.min(s.W - gapW, s.player.x)), dir = cx < s.W / 2 ? 1 : -1;
        for (let r = 0; r < rows; r++) {
          path.push(cx);
          if (Math.random() < 0.2) dir = -dir;
          if (cx + dir * shift < gapW || cx + dir * shift > s.W - gapW) dir = -dir;
          cx += dir * shift * s.rand(0.6, 1);
        }
        const row = (r, y) => {
          let first = null;
          for (const side of [-1, 1]) for (let x = path[r] + side * gapW / 2; x > -cell && x < s.W + cell; x += side * cell) {
            const b = s.fire({ x, y, ang: Math.PI / 2, spd: fall, shape: 'small', color: r % 2 ? 'purple' : 'cyan', marginTop: 200 });
            first = first || b;
          }
          return first;
        };
        // 오버클럭: 미로가 기체에 닿은 뒤부터 약 3.5초마다. 0.75초 동안 경고(말풍선·빨라지는 경고음) → 1.2초 동안 두 배
        let alive = true;
        s.task(function* () {
          yield 200;
          while (alive) {
            s.say(s.boss, 'OVERCLOCK', 45);
            for (let t = 0; t < 45; t += 9) { s.sound('beep', t / 45); yield 9; }
            if (!alive) break;
            s.bulletTime(fastK, 99999);
            yield 72;
            s.bulletTime(slowK, 99999);
            yield 210;
          }
        }());
        let last = null, refY = 0;
        const v = () => fall * s.slow;
        const tick = () => { refY = last.dead ? refY + v() : last.y; };
        for (let r = 0; r < 10; r++) last = row(r, 110 - r * cell);
        refY = last.y;
        for (let r = 10; r < rows; r++) {
          while (refY - cell < top) { yield 1; tick(); }
          last = row(r, refY - cell); refY = last.y;
        }
        while (refY < s.H + 20) { yield 1; tick(); }
        alive = false;
        s.clear();
        s.bulletTime(1, 40);
        yield 110;
        // 숨 돌린 뒤: 느린 원형탄을 깔고 한 번 오버클럭(「오버클럭」의 압축판)
        for (let k = 0; k < 5; k++) { s.ring(s.cnt(18), { offset: s.rand(0, s.TAU), spd: s.sp(0.75), shape: 'orb', color: 'cyan' }); yield s.wait(22); }
        s.say(s.boss, 'OVERCLOCK', 45);
        yield 45;
        s.bulletTime(s.lv(2.2, 2.4, 2.6, 2.8, 3), 100);
        yield 130;
        s.clear();   // 남은 원형탄이 다음 미로와 겹치지 않게 지움
        yield 30;
      }
    },
  },
];

// ── 엑스트라: 진심 예로니모 ──
// 엑스트라 패턴은 extra: true로 표시하며 고른 난이도보다 한 단계 위로 계산된다(하드는 그 위의 엑스트라 하드)

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
// 3스테이지는 세 보스전(3-1·3-2·3-3)으로 나눔. 각각 노말에서 약 4분(회피 봇·아리엘 실측으로 맞춘 hpScale)
// 본게임에 쓰는 스펠은 여기 보스전 순서에 든 것만(2026-09-27 추림). 필리우스 제1식(내구)·휘감는 덩굴·감정 학습·오버클럭·
// 열흘 같은 하루와 시험 패턴은 빠졌으며 단일 패턴 연습에서만 볼 수 있다
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
      spellOf('논스펠 · 마르코 (폭주)'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '마르코'),
      spellOf('논스펠 · 마르코 2 (폭주)'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니', '마르코'),
    ],
  },
  {
    title: '3스테이지-1 · 김예나', name: '김예나', power: 2, hpScale: 3.56,   // 전체 너프에 더해 5% 추가 너프(3.75×0.95)
    seq: [
      spellOf('논스펠 · 김예나 1'),
      spellOf('「셔터 찬스」(가칭)'),
      spellOf('논스펠 · 김예나 2'),
      spellOf('「스펙타클」(가칭)'),
    ],
  },
  {
    title: '3스테이지-2 · 차서린', name: '차서린', power: 2.25, hpScale: 3.5,
    seq: [
      spellOf('논스펠 · 차서린 1'),
      spellOf('「리프」(가칭)'),
      spellOf('논스펠 · 차서린 2'),
      spellOf('「시선」(가칭)'),
    ],
  },
  {
    title: '3스테이지-3 · 고태웅', name: '고태웅', power: 2.5, hpScale: 2.9,
    seq: [
      spellOf('논스펠 · 고태웅 1'),
      spellOf('「히어로 킥」(가칭)'),
      spellOf('논스펠 · 고태웅 2'),
      spellOf('「점멸」(가칭)'),
    ],
  },
  {
    title: '5스테이지 · 아즈라엘', name: '아즈라엘', power: 2.75, hpScale: 2.5,
    seq: [
      spellOf('논스펠 · 아즈라엘 1'),
      spellOf('「명암」(가칭)'),
      spellOf('논스펠 · 아즈라엘 2'),
      spellOf('「섬광」(가칭)'),
      spellOf('논스펠 · 아즈라엘 3'),
      spellOf('「검은 안개」(가칭)'),
      spellOf('「아인」(가칭)'),
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
      spellOf('「담쟁이 정원」(가칭)'),
    ],
  },
  {
    title: '엑스트라 · 진심 예로니모', name: '진심 예로니모', power: 4, hpScale: 1.7,
    seq: [
      spellOf('논스펠 · 예로니모 1', '예로니모(진심)'),
      spellOf('스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고', '예로니모(진심)'),
      spellOf('논스펠 · 예로니모 2', '예로니모(진심)'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '예로니모(진심)'),
      spellOf('논스펠 · 예로니모 3', '예로니모(진심)'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니', '예로니모(진심)'),
      spellOf('Clavis Collata — NUNC DIMITTIS', '예로니모(진심)'),
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
      spellOf('「세이브 포인트」(가칭)'),
      spellOf('「백일몽」(가칭)'),
    ],
  },
];

// 본게임 순서(보스전 이름). 만들어진 스테이지만 이음. 4·5스테이지는 만들면 끼워 넣음
const STORY = {
  main: ['대책반', '마리·마르코', '김예나', '차서린', '고태웅', '아즈라엘', '예로니모', '리크니스'],
  extra: ['진심 예로니모'],
  extra2: ['이즘'],
};
