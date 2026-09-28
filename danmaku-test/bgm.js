'use strict';
// 배경음악. 보스마다 bgm/<보스 이름>/ 폴더에 mp3·wav·ogg를 넣으면 그 보스 패턴에서 나온다(폴더에 여럿이면 이름순 첫 곡).
// 곡이 끝나면 끝 2초를 페이드아웃하고 처음부터 1초 페이드인으로 다시 시작한다(반복용으로 만들지 않은 곡도 자연스럽게).
// 이음매 없는 반복 구간이 있는 곡은 BGM_LOOPS에 loopStart를 주면 샘플 단위로 이어 붙인다.
// 효과음과 같은 AudioContext를 쓰며 첫 키 입력·클릭으로 소리가 켜진 뒤에 재생된다. 음소거(M)를 함께 따르고 음량은 따로.
//
// 폴더 안 곡 찾기: 배포판은 빌드가 만든 bgm/manifest.json을, 로컬 개발 서버(python http.server)는 폴더 목록 페이지를 읽음.
// 그래서 로컬에서는 파일을 넣고 새로고침만 하면 반영된다. 곡이 없거나 불러오지 못하면 조용히 넘어간다.
//
// 이음매 없이 반복할 곡은 BGM_LOOPS에 '보스/파일명': { loopStart, loopEnd } (초). loopStart 앞(인트로)은 처음에 한 번만 나옴
const BGM_LOOPS = {
  // '김예나/theme.wav': { loopStart: 4.2 },
};
// 박자(화면 박동용): '보스/파일명': { bpm, offset(첫 마디 첫 박 시각, 초) }. 적지 않은 곡은 처음 불러올 때 곡을 분석해 자동으로 잡음
// (자동 결과는 개발자 도구 콘솔에 '박자 분석'으로 찍힘. 어긋나면 여기에 적어 고정)
const BGM_BEATS = {
  // '차서린/Guitar vs.mp3': { bpm: 128, offset: 0.12 },
};
const BGM_EXT = /\.(mp3|wav|ogg|m4a|opus)$/i;
const BGM_FADE_IN = 1, BGM_FADE_OUT = 2;   // 곡 끝에서 반복할 때의 페이드(초)
// 다른 보스의 폴더 곡을 함께 쓰는 보스(마리는 마르코 곡). 속도는 패턴의 bgmRate(폭주 마르코 1.2배속)
const BGM_SHARE = { '마리': '마르코' };

const BGM = {
  volume: 0.5, want: null, cur: null, src: null, gain: null, out: null,
  buffers: {}, loading: {}, failed: {}, lists: {}, missAt: {}, manifest: undefined, beats: {},

  // 보스 이름으로 곡을 고름. 폴더가 비어 있으면 keep=true일 때 지금 곡을 그대로 두고(중간에 곡 없는 보스),
  // 아니면 지금 곡을 줄이고 멈춤. 같은 곡이 이미 나오고 있으면 처음으로 돌리지 않고 이어 감
  // rate: 재생 속도(1.2면 1.2배속, 음높이도 함께 오름). 같은 곡이면 이어서 속도만 바꿈
  playBoss(boss, keep = false, rate = 1) {
    const token = this.token = (this.token || 0) + 1;
    this.listFor(BGM_SHARE[boss] || boss).then(files => {
      if (token !== this.token) return;   // 그사이 다른 보스로 바뀜
      this.wantRate = rate;
      if (files.length) this.play(files[0]);
      else if (!keep) this.play(null);
    });
  },

  play(url) { this.want = url; this.sync(); },

  // 격파 완료 등: 지금 곡을 sec초에 걸쳐 줄이고 멈춤
  fadeOut(sec = 3) { this.token = (this.token || 0) + 1; this.want = null; this.fade(sec); },

  apply() { if (this.out) this.out.gain.value = SFX.muted ? 0 : this.volume; },
  setVolume(v) { this.volume = v; this.apply(); },

  // 보스 폴더의 곡 목록(이름순). 찾은 목록은 기억하고, 비어 있으면 5초 뒤에 다시 찾아봄(패턴을 자주 다시 시작해도 요청이 몰리지 않게)
  async listFor(boss) {
    if (!boss) return [];
    if (this.lists[boss]) return this.lists[boss];
    if (performance.now() - (this.missAt[boss] ?? -1e9) < 5000) return [];
    let files = [];
    try {
      if (this.manifest === undefined) {
        const r = await fetch('bgm/manifest.json', { cache: 'no-cache' });
        this.manifest = r.ok ? await r.json() : null;
      }
      if (this.manifest) files = this.manifest[boss] || [];
      else {
        // 로컬 개발 서버: 폴더 목록 페이지의 링크에서 음악 파일만 추림
        const r = await fetch(`bgm/${encodeURIComponent(boss)}/`, { cache: 'no-cache' });
        if (r.ok) {
          const html = await r.text();
          files = [...html.matchAll(/href="([^"?#]+)"/g)].map(m => decodeURIComponent(m[1]))
            .filter(f => BGM_EXT.test(f) && !f.includes('/')).map(f => `${boss}/${f}`);
        }
      }
    } catch (e) { files = []; }
    files.sort();
    if (files.length) this.lists[boss] = files; else this.missAt[boss] = performance.now();
    return files;
  },

  // 소리가 켜진 뒤나 곡을 다 불러온 뒤에도 불림
  sync() {
    const c = SFX.ctx;
    if (!c) return;
    if (!this.out) { this.out = c.createGain(); this.out.connect(c.destination); this.apply(); }
    if (this.want && this.want === this.cur) { this.setRate(this.wantRate || 1); return; }
    if (this.want === this.cur) return;
    if (this.cur) this.fade(1);   // 다른 곡으로 바뀔 때는 1초에 걸쳐 줄이고 넘어감
    const name = this.want;
    if (!name) return;
    const buf = this.buffers[name];
    if (!buf) { this.load(name); return; }
    this.startTrack(name, buf, false, 0, this.wantRate || 1);
  },

  // 재생 중인 곡의 속도를 바꿈. 곡 안 위치를 셈해서 끝 페이드 시점을 새 속도에 맞춰 다시 잡음
  setRate(rate) {
    const c = SFX.ctx;
    if (!c || !this.src || rate === this.rate) return;
    const now = c.currentTime, pos = this.pos0 + (now - this.t0) * this.rate;
    this.pos0 = pos; this.t0 = now; this.rate = rate;
    this.src.playbackRate.setValueAtTime(rate, now);
    if (this.src.loop) return;
    const g = this.gain.gain, end = now + Math.max(0, this.src.buffer.duration - pos) / rate;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1, Math.min(end, now + 0.3));
    g.setValueAtTime(1, Math.max(now + 0.3, end - BGM_FADE_OUT));
    g.linearRampToValueAtTime(0.0001, end);
  },

  // 한 번 재생. 반복 구간이 없으면 끝 BGM_FADE_OUT초를 줄이고, 끝나면 페이드인으로 처음부터 다시
  startTrack(name, buf, fadeIn, offset = 0, rate = 1) {
    const c = SFX.ctx, t = BGM_LOOPS[name], src = c.createBufferSource(), g = c.createGain(), now = c.currentTime;
    src.buffer = buf; src.playbackRate.value = rate;
    if (t && t.loopStart !== undefined) {
      src.loop = true; src.loopStart = t.loopStart; src.loopEnd = t.loopEnd || buf.duration;
    } else {
      const end = now + (buf.duration - offset) / rate;
      g.gain.setValueAtTime(fadeIn ? 0.0001 : 1, now);
      if (fadeIn) g.gain.linearRampToValueAtTime(1, now + BGM_FADE_IN);
      g.gain.setValueAtTime(1, Math.max(now + BGM_FADE_IN, end - BGM_FADE_OUT));
      g.gain.linearRampToValueAtTime(0.0001, end);
      src.onended = () => { if (this.src === src) this.startTrack(name, buf, true, 0, this.rate); };
    }
    src.connect(g).connect(this.out);
    src.start(now, offset);
    this.src = src; this.gain = g; this.cur = name;
    this.pos0 = offset; this.t0 = now; this.rate = rate;
  },

  fade(sec) {
    const c = SFX.ctx;
    if (!c || !this.src) { this.cur = null; return; }
    const now = c.currentTime, g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.0001, now + sec);
    this.src.stop(now + sec + 0.05);
    this.src = null; this.gain = null; this.cur = null;
  },

  // 지금 곡의 박: { i: 몇 번째 박(첫 마디 첫 박이 0), down: 마디 첫 박인지, quiet: 지금 곡이 안 들리는지 }. 곡이 없거나 분석 전이면 null.
  // 들리는 소리에 맞게 출력 지연만큼 늦춰 셈. quiet: 음소거·음량 0·소리 멈춤(일시정지)·페이드 중이거나, 곡 자체가 조용한 구간
  beatAt() {
    const c = SFX.ctx, name = this.cur;
    if (!c || !this.src || !name || !this.buffers[name]) return null;
    const info = this.beats[name];
    if (!info) {
      if (info === undefined) { this.beats[name] = null; setTimeout(() => { this.beats[name] = analyzeBeat(this.buffers[name]); const r = this.beats[name]; console.info('박자 분석', name, { bpm: r.bpm, offset: r.offset }); }, 0); }
      return null;
    }
    const g = BGM_BEATS[name] || info;
    const lat = (c.outputLatency || c.baseLatency || 0);
    const pos = this.pos0 + (c.currentTime - lat - this.t0) * this.rate;
    const spb = 60 / g.bpm, i0 = Math.floor((pos - g.offset) / spb);
    const shift = g.shifts ? g.shifts[Math.max(0, Math.min(g.shifts.length - 1, Math.floor(i0 / g.seg)))] || 0 : 0;   // 구간 맞춤(자동 분석)
    const i = Math.floor((pos - g.offset - shift) / spb);
    const loud = info.loud ? info.loud[Math.max(0, Math.min(info.loud.length - 1, Math.floor(pos / info.loudStep)))] : 1;
    const quiet = SFX.muted || this.volume <= 0 || c.state !== 'running' || (this.gain && this.gain.gain.value < 0.35) || loud < 0.15;
    return { i, down: ((i % 4) + 4) % 4 === 0, quiet };
  },

  load(name) {
    if (this.loading[name] || this.failed[name] || !SFX.ctx) return;
    this.loading[name] = true;
    fetch('bgm/' + name.split('/').map(encodeURIComponent).join('/'))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(a => SFX.ctx.decodeAudioData(a))
      .then(b => { this.buffers[name] = b; this.loading[name] = false; this.sync(); })
      .catch(e => { this.failed[name] = true; this.loading[name] = false; console.warn('배경음악을 불러오지 못함:', name, e); });
  },
};

// 박자 자동 분석: 저역(킥·베이스)을 강조한 소리 세기가 갑자기 커지는 순간(온셋)을 모아, 70~180BPM 중 박이 가장 잘 겹치는 빠르기와
// 첫 박 자리를 찾음(90~160BPM 쪽을 조금 우대해 반·두 배 빠르기로 잘못 잡는 것을 줄임). 마디 첫 박은 네 박마다 온셋이 가장 센 자리
function analyzeBeat(buf) {
  const sr = buf.sampleRate, hop = 512, d0 = buf.getChannelData(0), d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
  const n = Math.floor(d0.length / hop), fps = sr / hop, a = Math.exp(-2 * Math.PI * 150 / sr);
  const env = new Float32Array(n), energy = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let e = 0, el = 0;
    for (let j = i * hop, end = j + hop; j < end; j++) { const x = (d0[j] + d1[j]) * 0.5; lp = a * lp + (1 - a) * x; e += x * x; el += lp * lp; }
    env[i] = Math.log(1e-9 + e + 4 * el); energy[i] = e / hop;
  }
  // 소리 세기(0.1초마다 RMS, 곡의 80번째 백분위를 1로): 곡이 조용한 구간에서는 박동을 쉼
  const loudStep = 0.1, per = Math.max(1, Math.round(loudStep * fps)), loud = [];
  for (let i = 0; i < n; i += per) { let s = 0; for (let j = i; j < Math.min(n, i + per); j++) s += energy[j]; loud.push(Math.sqrt(s / per)); }
  const ref = [...loud].sort((p, q) => p - q)[Math.floor(loud.length * 0.8)] || 1;
  for (let i = 0; i < loud.length; i++) loud[i] = +(loud[i] / ref).toFixed(3);
  const on = new Float32Array(n);
  for (let i = 1; i < n; i++) on[i] = Math.max(0, env[i] - env[i - 1]);
  // 곡 앞뒤 3초는 빼고 봄(페이드·무음)
  const i0 = Math.min(n - 1, Math.round(3 * fps)), i1 = Math.max(i0 + 1, n - Math.round(3 * fps));
  // 박 자리의 온셋 평균(사이 값은 이웃 프레임을 섞어 읽음)
  const score = (P, ph) => { let s = 0, k = 0; for (let t = ph + Math.ceil((i0 - ph) / P) * P; t < i1 - 1; t += P, k++) { const f = Math.floor(t), r = t - f; s += on[f] * (1 - r) + on[f + 1] * r; } return k ? s / k : 0; };
  let best = { s: -1 };
  for (let bpm = 70; bpm <= 180; bpm += 0.25) {
    const P = fps * 60 / bpm, w = Math.exp(-0.5 * (Math.log2(bpm / 125) / 0.6) ** 2);
    for (let ph = 0; ph < P; ph += 1) { const s = score(P, ph) * (0.7 + 0.3 * w); if (s > best.s) best = { s, bpm, P, ph }; }
  }
  // 정밀 탐색: 거친 결과 ±0.6BPM을 0.02 간격, 첫 박 자리는 1/4 프레임 간격으로(곡 끝까지 박이 밀리지 않게).
  // 정수 BPM에 0.08 안으로 가까우면 정수로 맞춤
  const coarse = best.bpm;
  best = { s: -1 };
  for (let bpm = coarse - 0.6; bpm <= coarse + 0.6; bpm += 0.02) {
    const P = fps * 60 / bpm;
    for (let ph = 0; ph < P; ph += 0.25) { const s = score(P, ph); if (s > best.s) best = { s, bpm, P, ph }; }
  }
  if (Math.abs(best.bpm - Math.round(best.bpm)) < 0.08) {
    const bpm = Math.round(best.bpm), P = fps * 60 / bpm;
    let bs = -1, bph = 0;
    for (let ph = 0; ph < P; ph += 0.25) { const s = score(P, ph); if (s > bs) { bs = s; bph = ph; } }
    best = { s: bs, bpm, P, ph: bph };
  }
  // 마디 첫 박: 네 박 간격으로 온셋 합이 가장 큰 자리
  let bestJ = 0, bestS = -1;
  for (let j = 0; j < 4; j++) { const s = score(best.P * 4, best.ph + j * best.P); if (s > bestS) { bestS = s; bestJ = j; } }
  const ph0 = best.ph + bestJ * best.P;
  // 구간 맞춤: 16박마다 그 구간에서 박이 가장 잘 겹치는 자리를 다시 찾음(전체 박 자리 ±12% 안, 또는 반 박 밀린 자리).
  // 곡 중간에 강한 소리가 뒷박으로 옮겨 가거나 조금씩 밀려도 따라감. 뚜렷이(15% 넘게) 나을 때만 옮김
  const segs = [], SEG = 16;
  for (let s0 = 0; ph0 + s0 * best.P < n; s0 += SEG) {
    const segScore = d => { let s = 0, k = 0; for (let j = s0; j < s0 + SEG; j++) { const t = ph0 + d + j * best.P; if (t < 0 || t >= n - 1) continue; const f = Math.floor(t), r = t - f; s += on[f] * (1 - r) + on[f + 1] * r; k++; } return k ? s / k : 0; };
    const base = segScore(0);
    let bd = 0, bs = base;
    for (const c of [0, best.P / 2]) for (let d = c - 0.12 * best.P; d <= c + 0.12 * best.P; d += 0.25) { const s = segScore(d); if (s > bs) { bs = s; bd = d; } }
    segs.push(bs > base * 1.15 ? +(bd / fps).toFixed(3) : 0);
  }
  return { bpm: Math.round(best.bpm * 1000) / 1000, offset: +(ph0 / fps).toFixed(3), seg: SEG, shifts: segs, loudStep, loud };
}
