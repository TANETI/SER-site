'use strict';
// 효과음. 파일 없이 Web Audio로 합성한다. 브라우저 정책상 첫 키 입력·클릭 뒤에 켜짐.

const SFX = {
  ctx: null, master: null, noise: null, muted: false, volume: 0.5,
  last: {},   // 종류별 마지막 재생 시각(너무 잦은 재생 억제)

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; },

  // 같은 소리는 gap초 안에 한 번만
  ok(kind, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[kind] ?? -1) < gap) return false;
    this.last[kind] = now;
    return true;
  },
  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  hiss(dur, vol, filter, f0, f1 = f0, q = 1) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(), bf = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; bf.type = filter; bf.Q.value = q;
    bf.frequency.setValueAtTime(f0, t); bf.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bf).connect(g).connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  },

  hit()     { if (this.ok('hit', 0.07)) this.tone('square', 880, 660, 0.04, 0.05); },
  block()   { if (this.ok('block', 0.09)) this.tone('sine', 2400, 2200, 0.06, 0.06); },
  kill()    { if (this.ok('kill', 0.05)) { this.hiss(0.18, 0.25, 'lowpass', 2400, 300); this.tone('triangle', 520, 260, 0.12, 0.08); } },
  graze()   { if (this.ok('graze', 0.05)) this.hiss(0.03, 0.08, 'highpass', 6000); },
  die()     { if (this.ok('die', 0.3)) { this.tone('sawtooth', 700, 70, 0.5, 0.18); this.hiss(0.5, 0.3, 'lowpass', 3000, 200); } },
  hurt()    { if (this.ok('hurt', 0.15)) this.tone('square', 300, 150, 0.1, 0.07); },
  bomb()    { if (this.ok('bomb', 0.3)) { this.hiss(0.9, 0.35, 'bandpass', 300, 3000, 0.8); this.tone('sine', 110, 55, 0.8, 0.25); } },
  empty()   { if (this.ok('empty', 0.2)) this.tone('square', 180, 180, 0.06, 0.05); },
  spell()   { if (this.ok('spell', 0.3)) { this.tone('sine', 880, 880, 0.5, 0.12); this.tone('sine', 1320, 1320, 0.6, 0.08, 0.08); } },
  capture() { if (this.ok('capture', 0.5)) [660, 880, 1100, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.1, i * 0.07)); },
  chain()   { if (this.ok('chain', 0.08)) { this.hiss(0.22, 0.2, 'highpass', 1200, 5000); this.tone('square', 1500, 900, 0.05, 0.04); } },
  strike()  { if (this.ok('strike', 0.06)) { this.hiss(0.15, 0.25, 'lowpass', 1800, 200); this.tone('square', 220, 110, 0.1, 0.06); } },
  slowIn()  { if (this.ok('slowIn', 0.3)) this.tone('sine', 900, 120, 0.6, 0.15); },
  slowOut() { if (this.ok('slowOut', 0.3)) this.tone('sine', 120, 900, 0.4, 0.12); },
  extend()  { if (this.ok('extend', 0.3)) [520, 780].forEach((f, i) => this.tone('sine', f, f, 0.3, 0.09, i * 0.1)); },
};
