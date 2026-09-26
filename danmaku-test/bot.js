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
  let best = null, bestScore = -Infinity;
  for (const [mx, my] of BOT_MOVES) {
    let x = p.x, y = p.y, worst = Infinity;
    for (let t = 1; t <= look; t++) {
      x = Math.max(8, Math.min(W - 8, x + mx)); y = Math.max(16, Math.min(H - 16, y + my));
      for (const b of near) {
        let bx, by;
        if (b.cart) { bx = b.x + b.vx * t + b.ax * t * t / 2; by = b.y + b.vy * t + b.ay * t * t / 2; }
        else { const s = b.spd + b.accel * t / 2; bx = b.x + Math.cos(b.ang) * s * t; by = b.y + Math.sin(b.ang) * s * t; }
        const d = Math.hypot(bx - x, by - y) - b.r - HIT_R;
        // 가까운 미래일수록 무겁게
        const w = d * (1 + t * 0.04);
        if (w < worst) worst = w;
      }
    }
    // 레이저·구역·몸통도 조금 반영
    for (const a of G.areas) if (x > a.x - 6 && x < a.x + a.w + 6 && y > a.y - 6 && y < a.y + a.h + 6 && a.t > a.warn - 25) worst = Math.min(worst, -5);
    for (const l of G.lasers) {
      if (l.kind === 'chain' ? l.t < l.warn - 10 : l.t < l.warn - 15) continue;
      const len = l.kind === 'chain' ? l.len : l.len;
      const half = l.kind === 'chain' ? l.w / 2 : l.w * 0.35;   // 실제 판정 폭
      const d = segDist(x, y, l.x, l.y, l.x + Math.cos(l.ang) * len, l.y + Math.sin(l.ang) * len) - half - HIT_R;
      worst = Math.min(worst, d);
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
