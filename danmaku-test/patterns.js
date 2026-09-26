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
//   s.area({x, y, w, h, warn, dur, label, color})   사각 구역 공격. 번호(label)를 붙여 순서를 보여 줌
//   s.bulletTime(배율, 프레임)                 적 탄만 느려짐(플레이어는 그대로)
//   ivyVine(s, {...}) · ivyLeaf(...)           담쟁이 덩굴·잎 (리크니스)
//   s.rand(a, b) · s.randInt(a, b) · s.pick(arr) · s.frame · s.hpRate · s.TAU · s.W · s.H
//   영창 키: FILIUS1 FILIUS2 PATER1 PATER2 SPIRITUS1 NUNC_DIMITTIS CONFITEOR. 배열을 직접 넘겨 일부 줄만 읊을 수도 있음
//   s.say(대상, '짧은 표시', 프레임)            머리 위 말풍선
//   extra: true                               엑스트라 패턴. 고른 난이도보다 한 단계 위로 계산 (chants.js, 세계관 원문 그대로)
//   s.fire({..., soft: true})  딱밤 탄: 맞아도 목숨이 줄지 않고 잠깐 느려짐
//   탄의 alpha는 판정이 그대로이므로 0.35 아래로 내리지 않는다
//
// shape: small orb big rice knife star link leaf
// color: red orange yellow green ivy cyan blue purple pink white gold brown black

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

// ── 리크니스: 담쟁이 덩굴 ──
// 잎: stay 프레임 동안 제자리에 붙어 있다가 흔들리며 떨어짐
function ivyLeaf(s, x, y, ang, stay) {
  return s.fire({
    x, y, ang, spd: 0, shape: 'leaf', color: 'ivy', margin: 40,
    fn: b => {
      if (b.t < stay) return;
      if (b.t === stay) { b.ang = Math.PI / 2; b.accel = 0.02; b.maxSpd = s.sp(1.6); }
      b.x += Math.sin(b.t * 0.08 + b.y * 0.01) * 0.5;
    },
  });
}
// 덩굴 줄기: 머리(초록 큰 탄)가 굽이치며 자라고 지나간 자리에 잎을 남김
// o: {x, y, ang, spd, len, every, stay, turn, wave, phase, curl, seek, margin}
function* ivyVine(s, o) {
  let { x, y, ang } = o;
  const spd = o.spd ?? 2.4, every = o.every ?? s.lv(7, 5, 4), m = o.margin ?? 20;
  const head = s.fire({ x, y, spd: 0, shape: 'orb', color: 'green', margin: m + 20 });
  for (let t = 0; t < o.len && !head.dead; t++) {
    ang += (o.curl ?? 0) + Math.sin(t * (o.wave ?? 0.08) + (o.phase ?? 0)) * (o.turn ?? 0.03);
    if (o.seek) {
      const want = Math.atan2(s.player.y - y, s.player.x - x);
      const da = ((want - ang + Math.PI * 3) % s.TAU) - Math.PI;
      ang += Math.max(-o.seek, Math.min(o.seek, da));
    }
    x += Math.cos(ang) * spd; y += Math.sin(ang) * spd;
    head.x = x; head.y = y;
    if (x < -m || x > s.W + m || y < -m || y > s.H + m) break;
    if (t % every === 0) ivyLeaf(s, x, y, ang + ((t / every) % 2 ? 0.9 : -0.9), (o.stay ?? 150) + t % 7);
    yield 1;
  }
  head.dead = true;
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
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', hp: 2000, time: 35, start: [240, 100],
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
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 2600, time: 50, start: [192, 100],
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
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 2800, time: 55, start: [192, 100],
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
    name: '논스펠 · 마리의 딱밤',
    type: 'nonspell', boss: '마르코', bossColor: '#e0c89a', hp: 2000, time: 35, start: [250, 100],
    *run(s) {
      const mari = churchDuo(s, [110, 80]);
      // 마르코: 묵직한 조준탄
      s.task(function* () {
        for (let w = 1; ; w++) {
          s.spread(s.lv(1, 3, 3), s.aim(), 0.3, { spd: s.sp(3.4), shape: 'orb', color: 'gold' });
          yield s.wait(60);
          if (w % 4 === 0) yield* s.wander(40, 50);
        }
      }());
      // 마리: 파테르 제1식으로 딱밤. 필리우스 전문이라 파테르의 위력이 나오지 않아 별로 아프지 않음
      // → 맞아도 목숨은 그대로, 잠깐 움직임만 둔해짐. 그 사이 마르코의 탄을 조심
      for (;;) {
        yield 150;
        yield* s.chant('PATER1', { by: mari });
        mari.glow = 140;
        for (let k = 0; k < s.lv(3, 4, 5); k++) {
          s.spread(s.lv(3, 5, 5), s.aim(mari.x, mari.y), 0.28, { x: mari.x, y: mari.y, spd: s.sp(2.6), shape: 'big', color: 'yellow', soft: true });
          yield 24;
        }
      }
    },
  },
  {
    name: '필리우스 제2식 — 그의 백성을 두르시리로다',
    type: 'spell', boss: '마르코', bossColor: '#e0c89a', hp: 1600, time: 55, start: [232, 95],
    *run(s) {
      // 마리가 둘을 감싸는 구역 보호막을 세움. 보호막이 서 있는 동안은 자기 탄이 들어가지 않음
      // → 마리가 다시 영창하는 동안(보호막이 없는 동안)이 공격할 때
      const mari = churchDuo(s, [152, 95]);
      for (;;) {
        s.task(function* () {   // 영창 중에도 가벼운 견제
          for (let k = 0; k < 4; k++) { s.spread(s.lv(1, 3, 3), s.aim(), 0.35, { spd: s.sp(2.4), shape: 'small', color: 'orange' }); yield s.wait(45); }
        }());
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
      s.task(mariRings(s, mari, 90));
      for (;;) {
        yield* s.chant('PATER2', { by: s.boss, step: 36 });
        for (let k = 0; k < 2; k++) {
          const px = s.player.x, py = s.player.y, d = Math.hypot(px - s.boss.x, py - s.boss.y) || 1;
          const stop = Math.max(0, d - 80);
          const tx = s.boss.x + (px - s.boss.x) / d * stop, ty = Math.min(s.boss.y + (py - s.boss.y) / d * stop, s.H - 130);
          s.warnLine({ x: s.boss.x, y: s.boss.y, x2: tx, y2: ty, dur: s.lv(48, 40, 34) });
          yield s.lv(48, 40, 34);
          s.boss.contact = true;
          yield* s.moveTo(tx, ty, 20);
          s.boss.contact = false;
          s.ring(s.cnt(18), { spd: 0.6, accel: 0.04, maxSpd: s.sp(2), shape: 'orb', color: 'gold' });
          yield 45;
          yield* s.moveTo(s.rand(140, 244), s.rand(80, 110), 45);
        }
        yield 40;
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
    type: 'spell', boss: '예로니모', bossColor: '#e8e0c8', hp: 3400, time: 52, start: [192, 100],
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
              if (t % 5 === 0) ivyLeaf(s, x0 + s.rand(-3, 3), y, -Math.PI / 2 + s.rand(-0.8, 0.8), s.lv(150, 190, 220));
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
        }));
        yield s.wait(150);
      }
    },
  },
  {
    name: '「담쟁이 정원」(가칭)',
    type: 'spell', boss: '리크니스', bossColor: '#e8b4c8', hp: 3800, time: 55, start: [192, 90],
    *run(s) {
      // 예고선을 따라 덩굴이 빠르게 뻗어 사선 줄무늬(하드는 격자)를 만들고, 잎이 한꺼번에 떨어짐
      const tilt = 0.6, span = s.H * Math.tan(tilt);
      for (let w = 0; ; w++) {
        const gap = s.lv(130, 110, 90), warn = s.lv(60, 50, 45), lines = [];
        const dirs = s.diff === 2 ? [1, -1] : [w % 2 ? 1 : -1];
        for (const dir of dirs) {
          const ang = Math.PI / 2 - dir * tilt, off = s.rand(0, gap);
          for (let x0 = (dir > 0 ? -span : 0) + off; x0 < (dir > 0 ? s.W : s.W + span); x0 += gap) {
            s.warnLine({ x: x0, y: 0, x2: x0 + Math.cos(ang) * 700, y2: Math.sin(ang) * 700, dur: warn });
            lines.push([x0, ang]);
          }
        }
        yield warn;
        for (const [x0, ang] of lines) s.task(ivyVine(s, { x: x0, y: -5, ang, spd: 6, len: 150, turn: 0, every: 3, stay: s.lv(90, 110, 130), margin: 400 }));
        for (let k = 0; k < 4; k++) { yield s.wait(40); if (s.diff > 0) s.spread(3, s.aim(), 0.3, { spd: s.sp(3), shape: 'small', color: 'pink' }); }
        yield s.wait(120);
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
        yield s.wait(20);
        if (w % 4 === 0) s.ring(s.cnt(24), { offset: s.rand(0, s.TAU), spd: s.sp(1.6), shape: 'rice', color: 'white' });
        if (w % 8 === 0) yield* s.wander();
      }
    },
  },
  {
    name: '「순차 격자 타격」(가칭)',
    type: 'spell', boss: '이즘', bossColor: '#8fe8ff', hp: 3200, time: 45, start: [192, 60],
    *run(s) {
      // 여러 칸에 번호 붙은 경고를 한꺼번에 띄우고 번호 순서대로 타격. 친 칸은 곧바로 다시 안전해짐
      const cols = 4, rows = 5, cw = s.W / cols, ch = s.H / rows;
      const first = s.lv(90, 75, 60), step = s.lv(40, 30, 22);
      for (let w = 0; ; w++) {
        const n = s.lv(4, 6, 8), cells = [];
        // 플레이어가 서 있는 칸을 반드시 포함해 움직이게 함
        cells.push(Math.min(cols - 1, Math.floor(s.player.x / cw)) + Math.min(rows - 1, Math.floor(s.player.y / ch)) * cols);
        while (cells.length < n) { const c = s.randInt(0, cols * rows - 1); if (!cells.includes(c)) cells.push(c); }
        cells.sort(() => Math.random() - 0.5);
        cells.forEach((c, i) => s.area({ x: (c % cols) * cw, y: Math.floor(c / cols) * ch, w: cw, h: ch, warn: first + i * step, dur: 18, label: i + 1, color: '#35d6ff' }));
        const total = first + n * step + 30;
        for (let t = 0; t < total; t += s.wait(40)) {
          if (s.diff > 0) s.spread(3, s.aim(), 0.3, { spd: s.sp(2.6), shape: 'small', color: 'white' });
          yield s.wait(40);
        }
        // 한 번 걸러 가로줄 단위 타격
        if (w % 2 === 1) {
          const order = [...Array(rows).keys()].sort(() => Math.random() - 0.5).slice(0, s.lv(2, 3, 4));
          order.forEach((r, i) => s.area({ x: 0, y: r * ch, w: s.W, h: ch, warn: first + Math.round(i * step * 1.5), dur: 18, label: i + 1, color: '#ffd23a' }));
          yield first + Math.round(order.length * step * 1.5) + 30;
        }
      }
    },
  },
  {
    name: '논스펠 · 이즘 2',
    type: 'nonspell', boss: '이즘', bossColor: '#8fe8ff', hp: 2800, time: 36, start: [192, 80],
    *run(s) {
      // 스캔: 세로 레이저가 한쪽 끝에서 반대쪽으로 차례로 훑음. 이미 훑고 지나간 쪽으로 피함
      for (let w = 0; ; w++) {
        const col = 32, dir = w % 2 ? 1 : -1;
        for (let i = 0; i < s.W / col; i++) {
          const x = dir > 0 ? i * col + col / 2 : s.W - i * col - col / 2;
          s.laser({ x, y: 0, ang: Math.PI / 2, len: s.H, w: 20, warn: s.lv(50, 42, 36), dur: 14, color: 'cyan' });
          yield s.lv(10, 8, 6);
        }
        for (let k = 0; k < 3; k++) { s.ring(s.cnt(20), { offset: k * 0.2, spd: s.sp(1.8), shape: 'small', color: 'white' }); yield s.wait(25); }
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
        const rows = s.lv(14, 18, 22), gapW = s.lv(46, 36, 28), shift = s.lv(8, 11, 14);
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
        yield 60;
        for (let i = 0; i < 4; i++) { s.ring(s.cnt(20), { offset: i * 0.2, spd: s.sp(2), shape: 'rice', color: 'white' }); yield s.wait(30); }
        yield 60;
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

// CONFITEOR에서 부르는 일곱 죄의 탄막
const SINS = [
  // Superbia 교만: 위에서 내려다보며 내려오는 큰 탄 줄 + 조준 칼날
  function* (s) {
    for (let k = 0; ; k++) {
      const n = s.lv(5, 6, 7, 8), gap = s.W / n;
      for (let i = 0; i < n; i++) s.fire({ x: gap * (i + (k % 2 ? 0.75 : 0.25)), y: -10, ang: Math.PI / 2, spd: s.sp(1.3), shape: 'big', color: 'purple' });
      for (let j = 0; j < 3; j++) { s.spread(s.lv(1, 3, 3, 5), s.aim(), 0.2, { spd: s.sp(3.2), shape: 'knife', color: 'white' }); yield s.wait(25); }
      yield s.wait(20);
    }
  },
  // Avaritia 탐욕: 흩어졌던 금화가 다시 보스에게 모여듦
  function* (s) {
    for (;;) {
      s.ring(s.cnt(24), { offset: s.rand(0, s.TAU), spd: s.sp(3), accel: -0.06, minSpd: -s.sp(2.4), shape: 'orb', color: 'gold' });
      yield s.wait(50);
    }
  },
  // Luxuria 색욕: 번갈아 휘어 도는 분홍 꽃잎
  function* (s) {
    for (let k = 0; ; k++) {
      const n = s.cnt(16), dir = k % 2 ? 1 : -1;
      for (let i = 0; i < n; i++) s.fire({ ang: i * s.TAU / n + k * 0.2, spd: s.sp(2.2), angVel: dir * 0.012, shape: 'rice', color: 'pink' });
      yield s.wait(22);
    }
  },
  // Invidia 질투: 좌우를 뒤집은 자리의 나를 노리는 탄과 진짜 나를 노리는 탄
  function* (s) {
    for (;;) {
      const mx = s.W - s.player.x;
      s.spread(s.lv(3, 5, 5, 7), Math.atan2(s.player.y - s.boss.y, mx - s.boss.x), 0.12, { spd: s.sp(3), shape: 'orb', color: 'green' });
      yield s.wait(18);
      s.spread(s.lv(1, 3, 3, 3), s.aim(), 0.2, { spd: s.sp(3.4), shape: 'small', color: 'green' });
      yield s.wait(18);
    }
  },
  // Gula 탐식: 솟구쳤다 떨어지는 덩어리들
  function* (s) {
    for (;;) {
      s.fire({ vx: s.rand(-2.4, 2.4), vy: s.rand(-5, -3), ay: 0.06, shape: s.pick(['orb', 'small', 'big']), color: 'orange', marginTop: 200 });
      yield s.lv(8, 6, 4, 3);
    }
  },
  // Ira 분노: 빠른 붉은 칼날 연사 + 원형 폭발
  function* (s) {
    for (;;) {
      const a = s.aim();
      for (let k = 0; k < s.lv(4, 6, 8, 10); k++) { s.spread(s.lv(1, 1, 3, 3), a, 0.12, { spd: s.sp(6.5), shape: 'knife', color: 'red' }); yield 3; }
      s.ring(s.cnt(28), { offset: s.rand(0, s.TAU), spd: s.sp(2.6), shape: 'rice', color: 'red' });
      yield s.wait(45);
    }
  },
  // Acedia 나태: 멈춰 버린 탄이 한참 뒤에야 느릿느릿 다가옴
  function* (s) {
    for (;;) {
      const n = s.cnt(18), off = s.rand(0, s.TAU);
      for (let i = 0; i < n; i++) s.fire({
        ang: off + i * s.TAU / n, spd: s.sp(3), accel: -0.1, minSpd: 0, shape: 'orb', color: 'blue',
        fn: b => { if (b.t === 120) { b.accel = 0.01; b.maxSpd = s.sp(1.2); b.ang = Math.atan2(s.player.y - b.y, s.player.x - b.x); } },
      });
      yield s.wait(40);
    }
  },
];

SPELLS.push({
  name: 'Clavis Communis, 스피리투스 제10식 — CONFITEOR. 내 죄가 항상 내 앞에 있나이다',
  type: 'spell', survival: true, extra: true, boss: '예로니모(진심)', bossColor: '#e8e0c8', hp: 1, time: 75, start: [192, 110],
  *run(s) {
    const C = CHANTS.CONFITEOR;
    // 제10식은 입회 성직자 과반수의 동의 없이는 열 수 없음(술자 포함 둘 이상) → 마리·마르코가 입회해 동의
    s.boss.chantColor = '#ffe6a0';
    const mari = s.partner({ name: '마리', x: -30, y: 60, to: [60, 80], color: '#cfe8ff' });
    const marco = s.partner({ name: '마르코', x: s.W + 30, y: 60, to: [324, 80], color: '#e0c89a' });
    mari.chantColor = '#cfe8ff'; marco.chantColor = '#ffe6a0';
    yield 50;
    s.say(s.boss, '개방 요청', 90); yield 80;
    s.say(marco, '동의', 80); yield 45;
    s.say(mari, '동의', 80); yield 70;
    s.say(s.boss, '과반수 동의 — 개방', 90); yield 70;
    // 여는 영창
    yield* s.chant(C.slice(0, 6), { by: s.boss, step: 36 });
    // 일곱 죄의 이름을 하나씩 부르며 그 죄의 탄막
    for (let i = 0; i < 7; i++) {
      s.clear();
      yield* s.chant([C[6 + i]], { by: s.boss, step: 30, hold: 0 });
      const t = s.task(SINS[i](s));
      yield 400;
      t.return();
    }
    s.clear();
    // 대답하라 ~ 호명: 응답한 이름에 못박혀 잠시 둔해진 채 일곱 색의 탄을 버팀
    yield* s.chant(C.slice(13, 17), { by: s.boss, step: 40, hold: 0 });
    s.player.stun = 150;
    const t = s.task(function* () {
      const colors = ['purple', 'gold', 'pink', 'green', 'orange', 'red', 'blue'];
      for (let k = 0; ; k++) { s.ring(s.cnt(21), { offset: k * 0.15, spd: s.sp(1.5), shape: 'small', color: colors[k % 7] }); yield s.wait(26); }
    }());
    yield* s.chant([C[17]], { by: s.boss, step: 60 });
    for (;;) yield 60;
  },
});

// 보스전: 목숨·폭탄·파워를 이어 가며 패턴을 순서대로. name은 오른쪽 표시용 짧은 이름, power는 시작 파워
// 엑스트라는 동방처럼 최대 파워로 시작하고, 본편 스테이지는 앞 구간의 잡몹에서 P를 모아 강화한다
function spellOf(name, boss) {
  const sp = SPELLS.find(x => x.name === name && (!boss || x.boss === boss));
  if (!sp) throw new Error('보스전 패턴 없음: ' + name);
  return sp;
}
const BOSS_RUNS = [
  {
    title: '엑스트라 · 진심 예로니모', name: '진심 예로니모', power: 4,
    seq: [
      exOf(spellOf('잡몹 웨이브 · 날개 오르트로스')),
      exOf(spellOf('논스펠 · 예로니모 1')),
      exOf(spellOf('스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고')),
      exOf(spellOf('논스펠 · 예로니모 2')),
      exOf(spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '예로니모')),
      exOf(spellOf('Clavis Collata — NUNC DIMITTIS')),
      spellOf('Clavis Communis, 스피리투스 제10식 — CONFITEOR. 내 죄가 항상 내 앞에 있나이다'),
    ],
  },
  {
    title: '6스테이지 · 예로니모', name: '예로니모', power: 2,
    seq: [
      spellOf('잡몹 웨이브 · 날개 오르트로스'),
      spellOf('논스펠 · 예로니모 1'),
      spellOf('스피리투스 제1식 — 꺼져가는 등불을 끄지 아니하고'),
      spellOf('논스펠 · 예로니모 2'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '예로니모'),
      spellOf('Clavis Collata — NUNC DIMITTIS'),
    ],
  },
  {
    title: '7스테이지 · 리크니스', name: '리크니스', power: 2.5,
    seq: [
      spellOf('잡몹 웨이브 · 날개 오르트로스'),
      spellOf('논스펠 · 리크니스 1'),
      spellOf('「벽을 타는 덩굴」(가칭)'),
      spellOf('논스펠 · 리크니스 2'),
      spellOf('「뿌리를 찾는 덩굴」(가칭)'),
      spellOf('「담쟁이 정원」(가칭)'),
    ],
  },
  {
    title: '엑스트라 2 · 이즘', name: '이즘', power: 4,
    seq: [
      spellOf('논스펠 · 이즘 1'),
      spellOf('「순차 격자 타격」(가칭)'),
      spellOf('논스펠 · 이즘 2'),
      spellOf('「열흘 같은 하루」(가칭)'),
    ],
  },
  {
    title: '2스테이지 · 마르코와 마리', name: '마르코·마리', power: 0.5,
    seq: [
      spellOf('잡몹 웨이브 · 날개 오르트로스'),
      spellOf('논스펠 · 마리와 마르코'),
      spellOf('파테르 제1식 — 나의 의로운 오른손으로 너를 붙들리라', '마르코'),
      spellOf('논스펠 · 마리의 딱밤'),
      spellOf('필리우스 제2식 — 그의 백성을 두르시리로다'),
      spellOf('파테르 제2식 — 능히 일어나지 못하게 하리니'),
      spellOf('필리우스 제1식 — 불꽃이 너를 사르지 못하리니'),
    ],
  },
];
