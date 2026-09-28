'use strict';
// 회피 봇: 패턴이 피할 수 있는지 거칠게 재는 개발용 도구. 게임 화면에서는 쓰지 않는다.
// 매 프레임 17가지 이동(정지 + 8방향 × 고속 3.6·저속 1.6)을 15프레임 앞까지 굴려 보고
// 탄과의 여유가 가장 큰 쪽을 고른다. 탄은 지금 속도·가속도로 곧게 간다고 가정한다.
// 사용: 콘솔에서 dodgeTest(패턴 번호, 난이도, 프레임 수) → 피탄 수
const BOT_MOVES = [[0, 0, 0]];
for (const sp of [1.6, 3.6]) for (let i = 0; i < 8; i++) {
  const a = i * Math.PI / 4;
  BOT_MOVES.push([Math.round(Math.cos(a) * 1e6) / 1e6 * sp, Math.round(Math.sin(a) * 1e6) / 1e6 * sp, sp]);
}

// lookHaz: 예고가 있는 위험(레이저·사슬·구역·보스 돌진·벌어지는 균열)은 이만큼 더 멀리 봄(사람이 예고를 보고 미리 비키듯)
function botChoose(G, look = 15, cap = Infinity, lookHaz = 60) {
  const p = G.player;
  // 가까운 탄만 추림(cap을 주면 가장 가까운 cap발만: 탄이 수천 발인 패턴에서도 빠르게)
  let near = G.bullets.filter(b => Math.abs(b.x - p.x) < 140 && Math.abs(b.y - p.y) < 140);
  if (near.length > cap) near = near.map(b => [b, (b.x - p.x) ** 2 + (b.y - p.y) ** 2]).sort((u, v) => u[1] - v[1]).slice(0, cap).map(u => u[0]);
  const k = G.slowFactor();   // 불렛타임이면 탄이 느리게 움직임
  let best = null, bestScore = -Infinity;
  // 레이저가 돌고 있으면 지난 프레임과의 각도 차로 회전을 이어서 예측
  for (const l of G.lasers) { l._av = l._pa === undefined ? 0 : ((l.ang - l._pa + Math.PI * 3) % (Math.PI * 2)) - Math.PI; l._pa = l.ang; }
  // 보스 몸통(돌진 등): 이동 계획대로의 자리
  const b0 = G.boss, bossAt = t => {
    const m = b0.move;
    if (!m) return [b0.x, b0.y];
    const k = Math.min(1, (m.t + t) / m.dur), e = 1 - Math.pow(1 - k, 3);
    return [m.x0 + (m.x1 - m.x0) * e, m.y0 + (m.y1 - m.y0) * e];
  };
  for (const [mx, my] of BOT_MOVES) {
    let x = p.x, y = p.y, worst = Infinity;
    for (let t = 1; t <= Math.max(look, lookHaz); t++) {
      const far = t > look;   // 먼 미래는 예고 있는 위험만
      x = Math.max(8, Math.min(W - 8, x + mx)); y = Math.max(16, Math.min(H - 16, y + my));
      if (!far) for (const b of near) {
        let bx, by;
        const tt = t * k;
        if (b.pvx !== undefined) { bx = b.x + b.pvx * t; by = b.y + b.pvy * t; }   // 패턴이 직접 옮기는 탄(덩굴 머리 등)
        else if (b.cart) { bx = b.x + b.vx * tt + b.ax * tt * tt / 2; by = b.y + b.vy * tt + b.ay * tt * tt / 2; }
        else { const s = b.spd + b.accel * tt / 2; bx = b.x + Math.cos(b.ang) * s * tt; by = b.y + Math.sin(b.ang) * s * tt; }
        const d = Math.hypot(bx - x, by - y) - b.r - HIT_R;
        // 가까운 미래일수록 무겁게
        const w = d * (1 + t * 0.04);
        if (w < worst) worst = w;
      }
      // 레이저·사슬·구역: t프레임 뒤에 켜져 있을 것을 이 걸음에서 확인(실제 판정 폭 기준)
      for (const l of G.lasers) {
        const lt = l.t + t;
        if (l.kind === 'chain' ? lt <= l.warn : (lt <= l.warn || lt > l.warn + l.dur + 12)) continue;
        const half = l.kind === 'chain' ? l.w / 2 : l.w * 0.35;
        const la = l.ang + (l._av || 0) * t;
        const d = segDist(x, y, l.x, l.y, l.x + Math.cos(la) * l.len, l.y + Math.sin(la) * l.len) - half - HIT_R;
        if (d < worst) worst = d;
      }
      for (const a of G.areas) {
        const at = a.t + t;
        if (at > a.warn && at <= a.warn + a.dur && x > a.x - 4 && x < a.x + a.w + 4 && y > a.y - 4 && y < a.y + a.h + 4) worst = Math.min(worst, -5);
      }
      if (b0.contact && !b0.hidden) { const [bx, by] = bossAt(t); const d = Math.hypot(bx - x, by - y) - 16 - HIT_R; if (d < worst) worst = d; }
      // 벌어지는 순간 피탄인 균열(종언의 시·차원절단 베기)
      if (G.rifts) for (const r of G.rifts) {
        if (!r.lethal || r.t + t !== r.warn + r.tear) continue;
        const d = Math.abs(r.nx * x + r.ny * y - r.c) - r.w - HIT_R;
        if (d < worst) worst = d;
      }
    }
    const home = -Math.abs(x - W / 2) * 0.01 - Math.abs(y - (H - 70)) * 0.01;   // 아래 가운데를 조금 선호
    const score = Math.min(worst, 40) + home;
    if (score > bestScore) { bestScore = score; best = [mx, my]; }
  }
  return best;
}

// 봇으로 패턴을 돌려 피탄 수를 셈(무적 상태에서 맞은 횟수). 결과: {hits, perMin}
function dodgeTest(index, diff = 1, frames = 3600) {
  const keep = { inv: G.invincible, diff: G.difficulty, paused: G.paused };
  G.paused = true; G.invincible = true; G.difficulty = diff; G.keys.clear();
  G.startSingle(index);
  let hits = 0, active = 0;
  for (let f = 0; f < frames; f++) {
    if (G.phase === 'active') {
      active++;
      const [mx, my] = botChoose(G);
      G.player.x = Math.max(8, Math.min(W - 8, G.player.x + mx));
      G.player.y = Math.max(16, Math.min(H - 16, G.player.y + my));
    }
    const before = G.stats.hits;
    G.update();
    hits += G.stats.hits - before;
    if (G.phase === 'result') G.startSingle(index);
  }
  Object.assign(G, { invincible: keep.inv, difficulty: keep.diff, paused: keep.paused });
  return { hits, perMin: +(hits / (active / 3600)).toFixed(1) };
}

// 사람에 가까운 봇: 매 프레임 완벽하게 읽는 봇은 헬에서도 거의 안 맞아 난이도 비교가 안 되므로,
// every 프레임마다 한 번만 판단하고(그사이엔 정한 방향 유지) 판단은 delay 프레임 늦게 반영됨(반응 속도). 가장 가까운 탄 120발만 봄.
// 프로필: 초보 { every: 12, delay: 12 }, 숙련 { every: 6, delay: 7 }
const BOT_PROFILES = { beginner: { every: 12, delay: 12, look: 22 }, skilled: { every: 6, delay: 7, look: 20 } };
// 한 패턴을 사람 봇으로 돌림. drain: 보스 체력을 이 프레임에 걸쳐 깎아 격화 I→III(발악 포함)를 거치게 함. 결과 {hits, perMin, sec}
function humanTest(index, diff, profile = 'skilled', { frames = 3600, seed = 1, drain = 1800 } = {}) {
  const pr = BOT_PROFILES[profile] || profile;
  const keep = { inv: G.invincible, diff: G.difficulty, paused: G.paused, seed: G.fixedSeed };
  G.paused = true; G.invincible = true; G.difficulty = diff; G.fixedSeed = seed; G.keys.clear(); G.run = null; G.story = null;
  G.startSingle(index);
  const sp = G.spell, queue = [];
  let hits = 0, active = 0, move = [0, 0];
  for (let f = 0; f < frames; f++) {
    if (G.phase === 'active') {
      active++;
      if (!sp.survival && !G.desperate) G.boss.hp = Math.max(1, G.boss.maxHp * (1 - G.frame / drain));
      if (G.frame % pr.every === 0) queue.push({ at: f + pr.delay, m: botChoose(G, pr.look, 120) });
      while (queue.length && queue[0].at <= f) move = queue.shift().m;
      G.player.x = Math.max(8, Math.min(W - 8, G.player.x + move[0]));
      G.player.y = Math.max(16, Math.min(H - 16, G.player.y + move[1]));
    }
    const before = G.stats.hits;
    G.update();
    hits += G.stats.hits - before;
    if (G.phase === 'result') break;
    if (!sp.survival && !G.desperate && G.phase === 'active' && G.frame > drain + 60) break;
  }
  Object.assign(G, { invincible: keep.inv, difficulty: keep.diff, paused: keep.paused, fixedSeed: keep.seed });
  return { hits, sec: active / 60, perMin: active ? +(hits / (active / 3600)).toFixed(1) : null };
}
