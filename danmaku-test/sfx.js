'use strict';
// 효과음. 파일 없이 Web Audio로 합성한다. 브라우저 정책상 첫 키 입력·클릭 뒤에 켜짐.
// 흐름: 각 소리 → 효과(bus) → 압축기(겹쳐도 찢어지지 않게) → 마스터 음량 → 출력.
// 잦은 소리(명중·그레이즈·발사)는 재생 간격을 두고 음높이를 조금씩 흔들어 귀가 덜 피곤하게 한다.

const SFX = {
  ctx: null, master: null, bus: null, echo: null, noise: null, muted: false, volume: 0.6,
  last: {},   // 종류별 마지막 재생 시각(너무 잦은 재생 억제)

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.bus = c.createGain();
      this.bus.connect(comp).connect(this.master).connect(c.destination);
      // 짧은 울림(큰 소리에만 보냄)
      const delay = c.createDelay(0.5), fb = c.createGain(), wet = c.createGain(), lp = c.createBiquadFilter();
      delay.delayTime.value = 0.11; fb.gain.value = 0.28; wet.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = 2500;
      delay.connect(lp).connect(fb).connect(delay); lp.connect(wet).connect(this.bus);
      this.echo = delay;
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; },
  setVolume(v) { this.volume = v; if (this.master && !this.muted) this.master.gain.value = v; },

  // 같은 소리는 gap초 안에 한 번만
  ok(kind, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[kind] ?? -1) < gap) return false;
    this.last[kind] = now;
    return true;
  },
  jitter(f, amount = 0.06) { return f * (1 + (Math.random() * 2 - 1) * amount); },
  out(node, echo) { node.connect(this.bus); if (echo) node.connect(this.echo); },
  tone(type, f0, f1, dur, vol, delay = 0, echo = false, attack = 0.004) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); this.out(g, echo); o.start(t); o.stop(t + dur + 0.03);
  },
  hiss(dur, vol, filter, f0, f1 = f0, q = 1, delay = 0, echo = false) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), bf = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true; bf.type = filter; bf.Q.value = q;
    bf.frequency.setValueAtTime(f0, t); bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bf).connect(g); this.out(g, echo); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  },

  // ── 전투 ──
  hit()     { if (this.ok('hit', 0.06)) { this.tone('triangle', this.jitter(1300), 900, 0.035, 0.035); this.hiss(0.02, 0.03, 'highpass', 5000); } },
  block()   { if (this.ok('block', 0.08)) { this.tone('sine', this.jitter(2600, 0.03), 2400, 0.08, 0.05); this.tone('sine', 3900, 3800, 0.05, 0.02); } },
  kill()    { if (this.ok('kill', 0.05)) { this.hiss(0.22, 0.22, 'lowpass', 3000, 250); this.tone('triangle', this.jitter(600), 180, 0.16, 0.08); this.tone('sine', 1800, 2400, 0.08, 0.03, 0.04); } },
  graze()   { if (this.ok('graze', 0.045)) this.hiss(0.035, 0.05, 'bandpass', this.jitter(7000, 0.15), 5000, 3); },
  // 적 발사음: 탄 크기에 따라 음높이가 다름. 자주 나므로 아주 작게
  fire(big) {
    if (!this.ok(big ? 'fireBig' : 'fire', big ? 0.12 : 0.07)) return;
    if (big) { this.tone('sine', this.jitter(260), 160, 0.12, 0.05); this.hiss(0.06, 0.03, 'lowpass', 1200, 400); }
    else this.tone('square', this.jitter(620, 0.08), 480, 0.03, 0.012);
  },
  laser()   { if (this.ok('laser', 0.1)) { this.tone('sawtooth', 180, 900, 0.12, 0.035); this.hiss(0.3, 0.08, 'bandpass', 1500, 3000, 2); } },
  chain()   { if (this.ok('chain', 0.08)) { this.hiss(0.25, 0.18, 'highpass', 1500, 6000); this.tone('square', 1700, 800, 0.05, 0.035); this.tone('triangle', 3200, 3100, 0.12, 0.02, 0.03); } },
  strike()  { if (this.ok('strike', 0.06)) { this.hiss(0.22, 0.28, 'lowpass', 2200, 150); this.tone('sine', 140, 50, 0.18, 0.14); } },
  impact()  { if (this.ok('impact', 0.15)) { this.tone('sine', 120, 40, 0.3, 0.22); this.hiss(0.25, 0.2, 'lowpass', 1500, 100); } },

  // ── 플레이어 ──
  die()     { if (this.ok('die', 0.3)) { this.tone('sawtooth', 900, 60, 0.6, 0.14, 0, true); this.hiss(0.7, 0.3, 'lowpass', 4000, 150, 1, 0, true); this.tone('sine', 90, 35, 0.5, 0.25); } },
  hurt()    { if (this.ok('hurt', 0.15)) this.tone('square', 320, 160, 0.1, 0.05); },
  bomb()    {
    if (!this.ok('bomb', 0.3)) return;
    this.tone('sine', 200, 900, 0.5, 0.06);                            // 차지
    this.hiss(1.0, 0.3, 'bandpass', 250, 3500, 0.8, 0.45, true);        // 퍼짐
    this.tone('sine', 110, 40, 0.9, 0.3, 0.45);
  },
  empty()   { if (this.ok('empty', 0.2)) this.tone('square', 180, 170, 0.07, 0.04); },
  flick()   { if (this.ok('flick', 0.2)) { this.tone('square', 2000, 1300, 0.03, 0.07); this.tone('triangle', 420, 300, 0.09, 0.06, 0.02); } },
  item()    { if (this.ok('item', 0.035)) this.tone('sine', this.jitter(1600, 0.1), 2100, 0.045, 0.03); },
  powerUp() { if (this.ok('powerUp', 0.3)) [660, 990, 1320, 1760].forEach((f, i) => this.tone('square', f, f, 0.07, 0.035, i * 0.05)); },

  // ── 진행·연출 ──
  spell()   { if (this.ok('spell', 0.3)) { this.hiss(0.5, 0.12, 'highpass', 800, 4000); [880, 1320, 1760].forEach((f, i) => this.tone('sine', f, f, 0.7, 0.07, i * 0.06, true)); } },
  chime(last) { if (this.ok('chime', 0.12)) this.tone('sine', last ? 1320 : this.jitter(990, 0.02), last ? 1318 : 988, last ? 0.9 : 0.5, last ? 0.06 : 0.035, 0, true, 0.01); },
  capture() { if (this.ok('capture', 0.5)) [660, 880, 1100, 1320, 1760].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.08, i * 0.07, true)); },
  boom()    { if (this.ok('boom', 0.5)) { this.tone('sine', 150, 30, 1.2, 0.35); this.hiss(1.4, 0.4, 'lowpass', 5000, 80, 1, 0, true); this.tone('sawtooth', 400, 60, 0.6, 0.06, 0.05); } },
  tick(last) { if (this.ok('tick', 0.5)) this.tone('square', last ? 1200 : 880, last ? 1200 : 880, 0.05, 0.04); },
  slowIn()  { if (this.ok('slowIn', 0.3)) { this.tone('sine', 900, 110, 0.7, 0.13, 0, true); this.hiss(0.7, 0.08, 'lowpass', 3000, 200); } },
  overclock() { if (this.ok('overclock', 0.3)) { this.tone('sawtooth', 200, 1400, 0.35, 0.06); this.tone('square', 1400, 1400, 0.3, 0.02, 0.35); } },
  slowOut() { if (this.ok('slowOut', 0.3)) this.tone('sine', 110, 900, 0.4, 0.1); },
  extend()  { if (this.ok('extend', 0.3)) [520, 780, 1040].forEach((f, i) => this.tone('sine', f, f, 0.3, 0.07, i * 0.09, true)); },
};
