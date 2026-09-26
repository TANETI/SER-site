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
// 난이도 (0=이지 1=노말 2=하드. 지금까지 만든 값이 하드)
//   s.lv(이지, 노말, 하드)   난이도별 값 고르기
//   s.cnt(n)   탄 개수를 난이도에 맞게 줄임(이지 45%, 노말 70%)
//   s.wait(f)  발사 간격을 늘림(이지 1.8배, 노말 1.35배)
//   s.sp(v)    탄속을 줄임(이지 75%, 노말 88%)
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
//   s.warnLine({x, y, x2, y2, dur})           판정 없는 빨간 예고선
//   s.extendTime(초)                          제한시간 연장
//   s.rand(a, b) · s.randInt(a, b) · s.pick(arr) · s.frame · s.hpRate · s.TAU · s.W · s.H
//   영창 키: FILIUS1 FILIUS2 PATER1 PATER2 SPIRITUS1 NUNC_DIMITTIS (chants.js, 세계관 원문 그대로)
//   탄의 alpha는 판정이 그대로이므로 0.35 아래로 내리지 않는다
//
// shape: small orb big rice knife star link
// color: red orange yellow green cyan blue purple pink white gold brown black

// ── 성당교회 공통 ──
// 마르코 보스에 마리를 동료로 붙임. 영창 색은 마르코=금빛, 마리=하늘빛
function churchDuo(s, at = [80, 70]) {
  s.boss.chantColor = '#ffe6a0';
  const mari = s.partner({ name: '마리', x: -30, y: 40, to: at, color: '#cfe8ff' });
  mari.chantColor = '#cfe8ff';
  return mari;
}
// 마리가 가끔 필리우스 제1식으로 마르코에게 보호막을 씌움
function* mariShield(s, mari, every = 480, dur = 240) {
  for (;;) {
    yield every;
    yield* s.chant('FILIUS1', { by: mari });
    s.shield(s.boss, dur);
  }
}
// 마리의 느린 원형탄
function* mariRings(s, mari, every = 60) {
  for (let k = 0; ; k++) {
    s.ring(s.cnt(14), { x: mari.x, y: mari.y, offset: k * 0.23, spd: s.sp(1.5), shape: 'orb', color: 'cyan' });
    yield s.wait(every);
  }
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
        if (s.diff === 2 || (s.diff === 1 && f % 2 === 0)) for (let i = 0; i < 3; i++) s.fire({ ang: -a * 0.7 + i * s.TAU / 3, spd: s.sp(1.8), shape: 'small', color: 'pink' });
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
    name: '논스펠 · 마리와 마르코',
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', hp: 2600, time: 35, start: [240, 100],
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
          yield 200;
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
    name: '파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라',
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 3600, time: 50, start: [192, 100],
    *run(s) {
      const mari = churchDuo(s);
      s.task(mariShield(s, mari));
      s.task(mariRings(s, mari, 70));
      for (;;) {
        // 전조: 영창하는 동안은 가벼운 탄만
        const light = s.task(function* () {
          for (;;) { s.spread(s.lv(3, 5, 5), s.aim(), 0.25, { spd: s.sp(2.2), shape: 'small', color: 'orange' }); yield s.wait(30); }
        }());
        yield* s.chant('PATER1', { by: s.boss });
        light.return();
        // 오른손이 황금빛으로 빛나는 동안 플레이어 쪽으로 한 번 자리를 잡고 황금 주먹을 날림
        s.boss.glow = 220;
        yield* s.moveTo(Math.max(110, Math.min(s.W - 110, s.player.x)), 110, 40);
        for (let k = 0; k < s.lv(2, 3, 3); k++) {
          s.fire({
            ang: s.aim(), spd: s.sp(5), shape: 'big', color: 'gold',
            // 지나간 자리 양옆으로 작은 탄을 흘림(이지는 흘리지 않음)
            fn: (b, s) => {
              if (s.diff === 0 || b.t % s.lv(99, 12, 9)) return;
              for (const d of [-1, 1]) s.fire({ x: b.x, y: b.y, ang: b.ang + d * Math.PI / 2, spd: 0.5, accel: 0.015, maxSpd: s.sp(1.6), shape: 'small', color: 'yellow' });
            },
          });
          s.ring(s.cnt(18), { offset: s.rand(0, s.TAU), spd: s.sp(2.2), shape: 'rice', color: 'gold' });
          yield s.wait(45);
        }
        yield 60;
      }
    },
  },
  {
    name: '파테르 제2식 — 능히 일어나지 못하게 하리니',
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 3600, time: 55, start: [192, 100],
    *run(s) {
      const mari = churchDuo(s);
      s.task(mariShield(s, mari, 540));
      s.task(mariRings(s, mari, 75));
      for (;;) {
        // 제1식보다 봉독이 길어 발동이 느림
        yield* s.chant('PATER2', { by: s.boss, step: 50 });
        for (let k = 0; k < s.lv(2, 3, 3); k++) {
          // 플레이어 위치에서 70px 앞에 멈춤. 도착 지점에서 퍼지는 탄을 피할 거리를 남김
          const px = s.player.x, py = s.player.y, d = Math.hypot(px - s.boss.x, py - s.boss.y) || 1;
          const stop = Math.max(0, d - 70);
          const tx = s.boss.x + (px - s.boss.x) / d * stop, ty = Math.min(s.boss.y + (py - s.boss.y) / d * stop, s.H - 120);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, dur: s.lv(48, 40, 32) });
          yield s.lv(48, 40, 32);
          // 사거리가 없으므로 직접 달려듦. 돌진 중에는 몸에 닿아도 피격
          s.boss.contact = true;
          yield* s.moveTo(tx, ty, 18);
          s.boss.contact = false;
          s.ring(s.cnt(20), { spd: 0.6, accel: 0.04, maxSpd: s.sp(2.2), shape: 'orb', color: 'gold' });
          if (s.diff > 0) s.ring(s.cnt(20), { offset: Math.PI / 20, spd: 0.4, accel: 0.03, maxSpd: s.sp(1.4), shape: 'small', color: 'yellow' });
          yield 40;   // 붙든 자리에서 잠시 멈춤 = 공격 기회
          yield* s.moveTo(s.rand(140, 244), s.rand(80, 110), 40);
        }
        yield 30;
      }
    },
  },
  {
    name: '논스펠 · 예로니모 1',
    type: 'nonspell', boss: '예로니모', bossColor: '#e8e0c8', hp: 2800, time: 35, start: [192, 100],
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
    type: 'nonspell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3000, time: 35, start: [192, 110],
    *run(s) {
      // 느리게 도는 사슬 팔 셋 + 반대로 도는 가는 팔 셋(노말 이상) + 가끔 조준 칼날
      let a = 0;
      for (let f = 0; ; f++) {
        a += 0.035;
        for (let i = 0; i < 3; i++) s.fire({ ang: a + i * s.TAU / 3, spd: s.sp(2.4), shape: 'link', color: 'gold' });
        if (s.diff > 0 && f % s.lv(2, 4, 2) === 0) for (let i = 0; i < 3; i++) s.fire({ ang: -a * 1.3 + i * s.TAU / 3 + Math.PI / 3, spd: s.sp(1.8), shape: 'small', color: 'yellow' });
        if (f % 30 === 0) s.spread(s.lv(1, 3, 3), s.aim(), 0.15, { spd: s.sp(4), shape: 'knife', color: 'white' });
        if (f % 240 === 239) yield* s.wander(40, 50);
        yield s.lv(7, 5, 4);
      }
    },
  },
  {
    name: '파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라',
    type: 'spell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3400, time: 45, start: [192, 100],
    *run(s) {
      for (;;) {
        const light = s.task(function* () {
          for (let k = 0; ; k++) { s.ring(s.cnt(10), { offset: k * 0.3, spd: s.sp(1.4), shape: 'small', color: 'white' }); yield s.wait(35); }
        }());
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
        if (f % s.lv(3, 2, 3) === 0 || (s.diff === 2 && f % 3 === 1)) s.fire({ vx: s.rand(-2.6, 2.6), vy: s.rand(-5.5, -3.5), ay: 0.07, shape: 'rice', color: 'white', marginTop: 200 });
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
];

// 보스전: 목숨·폭탄을 이어 가며 패턴을 순서대로. name은 오른쪽 표시용 짧은 이름
function spellOf(name, boss) {
  const sp = SPELLS.find(x => x.name === name && (!boss || x.boss === boss));
  if (!sp) throw new Error('보스전 패턴 없음: ' + name);
  return sp;
}
const BOSS_RUNS = [
  {
    title: '6스테이지 · 예로니모', name: '예로니모',
    seq: [
      spellOf('논스펠 · 예로니모 1'),
      spellOf('스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고'),
      spellOf('논스펠 · 예로니모 2'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '예로니모'),
      spellOf('Clavis Collata — NUNC DIMITTIS'),
    ],
  },
  {
    title: '2스테이지 · 마르코와 마리', name: '마르코·마리',
    seq: [
      spellOf('논스펠 · 마리와 마르코'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '마르코'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니'),
    ],
  },
];
