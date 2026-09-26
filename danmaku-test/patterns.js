'use strict';
// 패턴 목록. 새 패턴은 아래 형식으로 SPELLS에 추가한다.
//
// {
//   name: '표시 이름',
//   type: 'spell' | 'nonspell' | 'stage',   // spell=선언 배너·획득 판정, stage=보스 없이 잡몹만
//   hp: 3000, time: 40,                      // 보스 체력, 제한시간(초)
//   survival: false,                         // true면 보스 무적, 시간까지 버티면 획득
//   start: [192, 110],                       // 보스 시작 위치
//   *run(s) { ... }                          // 제너레이터. yield n = n프레임 대기
// }
//
// s 주요 함수
//   s.fire({ang, spd, shape, color, accel, angVel, maxSpd, minSpd, x, y, fn})
//   s.fire({vx, vy, ax, ay, ...})             // 직교 좌표 운동(중력 등)
//   s.ring(n, {offset, spd, shape, color})    // 원형 n발
//   s.spread(n, 중심각, 간격, {...})           // 부채꼴 n발
//   s.laser({x, y, ang, len, w, warn, dur, color})
//   s.chain({x, y, ang, len, w, warn, shoot, hold, retract})   // 빨간 예고선 → 황금 사슬이 뻗었다 걷힘
//   s.aim(x?, y?)      자기 위치(기본 보스)에서 플레이어 방향 각도
//   yield* s.moveTo(x, y, 프레임)    보스 이동을 기다림.  s.move(...)는 기다리지 않음
//   s.task(function* () {...}())     병렬 작업
//   s.enemy({x, y, vx, vy, hp, run: function* (e, s) {...}})
//   s.rand(a, b) · s.randInt(a, b) · s.pick(arr) · s.frame · s.hpRate · s.TAU · s.W · s.H
//
// shape: small orb big rice knife star link
// color: red orange yellow green cyan blue purple pink white gold brown black

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
      for (;;) {
        for (let k = 0; k < 3; k++) {
          s.spread(5, s.aim(), 0.18, { spd: 3.4, shape: 'rice', color: 'blue' });
          yield 8;
        }
        s.ring(28, { offset: s.rand(0, s.TAU), spd: 1.8, shape: 'small', color: 'white' });
        s.ring(28, { offset: s.rand(0, s.TAU), spd: 2.4, shape: 'small', color: 'cyan' });
        yield 30;
        yield* s.moveTo(s.rand(110, 274), s.rand(80, 140), 40);
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
        for (let i = 0; i < 4; i++) {
          s.fire({ ang: a + i * s.TAU / 4, spd: 2.6, shape: 'rice', color: 'purple' });
          s.fire({ ang: -a * 0.7 + i * s.TAU / 4, spd: 1.8, shape: 'small', color: 'pink' });
        }
        yield 4;
      }
    },
  },
  {
    name: '시험 스펠 「휘어 피는 꽃잎」',
    type: 'spell', hp: 3400, time: 40, start: [192, 120],
    *run(s) {
      for (let w = 0; ; w++) {
        const dir = w % 2 ? 1 : -1, off = s.rand(0, s.TAU);
        for (let i = 0; i < 36; i++) {
          s.fire({
            ang: off + i * s.TAU / 36, spd: 4, accel: -0.08, minSpd: 1.2,
            shape: 'orb', color: dir > 0 ? 'pink' : 'green',
            // 감속하는 동안만 휘고, 이후 직진
            fn: b => { b.angVel = b.t < 40 ? dir * 0.03 : 0; },
          });
        }
        yield 40;
        if (w % 3 === 2) yield* s.moveTo(s.rand(120, 264), s.rand(90, 140), 30);
      }
    },
  },
  {
    name: '시험 스펠 「격자 레이저」',
    type: 'spell', hp: 3000, time: 45, start: [192, 90],
    *run(s) {
      for (let w = 0; ; w++) {
        const off = s.rand(0, 48);
        for (let x = off; x < s.W; x += 64) s.laser({ x, y: 0, ang: Math.PI / 2, len: s.H, w: 14, warn: 50, dur: 50, color: 'cyan' });
        yield 40;
        for (let k = 0; k < 6; k++) { s.spread(3, s.aim(), 0.25, { spd: 4.5, shape: 'knife', color: 'blue' }); yield 6; }
        yield 20;
        const offY = s.rand(160, 200);
        for (let y = offY; y < s.H; y += 72) s.laser({ x: 0, y, ang: 0, len: s.W, w: 14, warn: 50, dur: 50, color: 'yellow' });
        yield 90;
      }
    },
  },
  {
    name: '시험 스펠 「조준 칼날과 느린 비」',
    type: 'spell', hp: 3000, time: 40, start: [192, 100],
    *run(s) {
      s.task(function* () {
        for (;;) {
          s.fire({ x: s.rand(0, s.W), y: -8, ang: Math.PI / 2 + s.rand(-0.2, 0.2), spd: s.rand(1, 1.8), shape: 'small', color: 'blue' });
          yield 3;
        }
      }());
      for (;;) {
        yield 50;
        const a = s.aim();
        for (let k = 0; k < 8; k++) { s.fire({ ang: a, spd: 7, shape: 'knife', color: 'red' }); yield 3; }
        s.move(s.rand(100, 284), s.rand(80, 130), 40);
      }
    },
  },
  {
    name: 'Clavis Collata — NUNC DIMITTIS (패턴 시험)',
    type: 'spell', hp: 3600, time: 50, start: [192, 100],
    *run(s) {
      // 화면 가장자리의 한 점에서 목표점을 지나는 사슬. 목표를 주지 않으면 필드 안 무작위 지점
      function edgeChain(target) {
        const side = s.randInt(0, 2);
        const x = side === 0 ? -8 : side === 1 ? s.W + 8 : s.rand(20, s.W - 20);
        const y = side === 2 ? -8 : s.rand(20, s.H * 0.8);
        const tx = target ? target.x : s.rand(40, s.W - 40), ty = target ? target.y : s.rand(s.H * 0.4, s.H - 30);
        s.chain({ x, y, ang: Math.atan2(ty - y, tx - x), len: 720, warn: 50, shoot: 12, hold: 24, retract: 150 });
      }
      for (let w = 0; ; w++) {
        const n = Math.min(3 + w, 7);
        for (let i = 0; i < n; i++) {
          edgeChain(i === 0 ? { x: s.player.x, y: s.player.y } : null);   // 첫 사슬은 플레이어 조준
          yield 5;
        }
        yield 50 - 5;
        // 사슬이 뻗어 있는 동안 탄막
        for (let k = 0; k < 9; k++) {
          s.ring(16, { offset: k * 0.19, spd: 1.9, shape: 'orb', color: 'yellow' });
          if (k % 3 === 2) s.spread(5, s.aim(), 0.14, { spd: 3.2, shape: 'rice', color: 'gold' });
          yield 16;
        }
        yield 20;
        if (w % 2) yield* s.moveTo(s.rand(120, 264), s.rand(80, 120), 30);
      }
    },
  },
  {
    name: '시험 스펠 「카레 발사」',
    type: 'spell', hp: 3000, time: 40, start: [192, 150],
    *run(s) {
      // 밥알(흰 쌀탄)은 위로 솟았다 중력으로 떨어지고, 카레(갈색 큰 탄)는 느리게 흘러내림
      for (let f = 0; ; f++) {
        for (let i = 0; i < 3; i++) {
          s.fire({ vx: s.rand(-2.6, 2.6), vy: s.rand(-5.5, -3.5), ay: 0.07, shape: 'rice', color: 'white', marginTop: 200 });
        }
        if (f % 20 === 0) {
          for (let i = 0; i < 5; i++) s.fire({ vx: s.rand(-1.5, 1.5), vy: s.rand(-3, -1.5), ay: 0.035, shape: 'big', color: 'brown', marginTop: 200 });
        }
        if (f % 90 === 45) yield* s.moveTo(s.rand(100, 284), s.rand(130, 170), 30);
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
        a += 0.045;
        for (let i = 0; i < 6; i++) s.fire({ ang: a + i * s.TAU / 6, spd: 3, shape: 'orb', color: 'red' });
        yield 5;
      }
    },
  },
  {
    name: '잡몹 웨이브 · 날개 오르트로스',
    type: 'stage', time: 40,
    *run(s) {
      const flyer = side => function* (e, s) {
        yield 30;
        for (let k = 0; k < 3; k++) {
          s.spread(3, s.aim(e.x, e.y), 0.2, { x: e.x, y: e.y, spd: 2.6, shape: 'small', color: 'red' });
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
          for (let k = 0; k < 6; k++) { s.ring(20, { x: e.x, y: e.y, offset: k * 0.15, spd: 2, shape: 'rice', color: 'purple' }); yield 20; }
          e.vy = -1;
        } });
        yield 180;
      }
    },
  },
];
