'use strict';
// 회피 봇: 패턴이 피할 수 있는지 거칠게 재는 개발용 도구. 게임 화면에서는 쓰지 않는다.
// 매 프레임 17가지 이동(정지 + 8방향 × 고속·저속)을 15프레임 앞까지 굴려 보고
// 탄과의 여유가 가장 큰 쪽을 고른다. 탄은 지금 속도·가속도로 곧게 간다고 가정한다.
// 사용: 콘솔에서 dodgeTest(패턴 번호, 난이도, 프레임 수) → 피탄 수
const BOT_MOVES = [[0, 0, 0]];
for (const sp of [2, 4.5]) for (let i = 0; i < 8; i++) {
  const a = i * Math.PI / 4;
  BOT_MOVES.push([Math.round(Math.cos(a) * 1e6) / 1e6 * sp, Math.round(Math.sin(a) * 1e6) / 1e6 * sp, sp]);
}

function botChoose(G, look = 15) {
  const p = G.player;
  // 가까운 탄만 추림
  const near = G.bullets.filter(b => Math.abs(b.x - p.x) < 140 && Math.abs(b.y - p.y) < 140);
  const k = G.slowFactor();   // 불렛타임이면 탄이 느리게 움직임
  let best = null, bestScore = -Infinity;
  for (const [mx, my] of BOT_MOVES) {
    let x = p.x, y = p.y, worst = Infinity;
    for (let t = 1; t <= look; t++) {
      x = Math.max(8, Math.min(W - 8, x + mx)); y = Math.max(16, Math.min(H - 16, y + my));
      for (const b of near) {
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
        const d = segDist(x, y, l.x, l.y, l.x + Math.cos(l.ang) * l.len, l.y + Math.sin(l.ang) * l.len) - half - HIT_R;
        if (d < worst) worst = d;
      }
      for (const a of G.areas) {
        const at = a.t + t;
        if (at > a.warn && at <= a.warn + a.dur && x > a.x - 4 && x < a.x + a.w + 4 && y > a.y - 4 && y < a.y + a.h + 4) worst = Math.min(worst, -5);
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
