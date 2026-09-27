'use strict';
// 배경음악. 파일을 Web Audio 버퍼로 디코드해 샘플 단위로 이음매 없이 반복한다
// (HTML audio의 loop는 mp3 앞뒤에 붙는 무음 때문에 반복 지점에서 끊김이 생김).
// 효과음과 같은 AudioContext를 쓰며 첫 키 입력·클릭으로 소리가 켜진 뒤에 재생된다. 음소거(M)를 함께 따르고 음량은 따로.
// 곡이 없거나 불러오지 못하면 조용히 넘어간다.
//
// 곡 목록: 이름 → { src, loopStart, loopEnd, volume }
//   src        tools/danmaku-test 기준 경로(bgm 폴더에 둠). ogg·wav 권장(mp3는 앞뒤 무음 때문에 반복 지점이 어긋날 수 있음)
//   loopStart  반복을 다시 시작할 자리(초). 주면 그 앞(인트로)은 처음에 한 번만 나옴. 기본 0
//   loopEnd    반복 끝(초). 기본 곡 끝
//   volume     곡별 음량 보정(기본 1)
// 보스전은 BOSS_RUNS의 bgm 이름을, 없으면 'default'를 씀. 단일 패턴 연습은 그 패턴이 속한 보스전의 곡을 씀
const BGM_TRACKS = {
  // default: { src: 'bgm/default.ogg' },
  // stage1: { src: 'bgm/stage1.ogg', loopStart: 4.2 },
};

const BGM = {
  volume: 0.5, want: null, cur: null, src: null, gain: null, out: null,
  buffers: {}, loading: {}, failed: {},

  // 곡 이름이 목록에 없으면 'default'. 둘 다 없으면 무음
  pick(name) { return BGM_TRACKS[name] ? name : BGM_TRACKS.default ? 'default' : null; },

  // 원하는 곡을 정함. 이미 그 곡이 나오고 있으면 처음으로 돌리지 않고 그대로 이어 감(보스전의 패턴이 바뀔 때)
  play(name) { this.want = this.pick(name); this.sync(); },

  // 격파 완료 등: 지금 곡을 sec초에 걸쳐 줄이고 멈춤
  fadeOut(sec = 3) { this.want = null; this.fade(sec); },

  apply() { if (this.out) this.out.gain.value = SFX.muted ? 0 : this.volume; },
  setVolume(v) { this.volume = v; this.apply(); },

  // 소리가 켜진 뒤나 곡을 다 불러온 뒤에도 불림
  sync() {
    const c = SFX.ctx;
    if (!c) return;
    if (!this.out) { this.out = c.createGain(); this.out.connect(c.destination); this.apply(); }
    if (this.want === this.cur) return;
    if (this.cur) this.fade(0.8);   // 다른 곡으로 바뀔 때는 짧게 줄이고 넘어감
    const name = this.want;
    if (!name) return;
    const buf = this.buffers[name];
    if (!buf) { this.load(name); return; }
    const t = BGM_TRACKS[name], src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; src.loop = true;
    src.loopStart = t.loopStart || 0; src.loopEnd = t.loopEnd || buf.duration;
    g.gain.value = t.volume ?? 1;
    src.connect(g).connect(this.out);
    src.start();
    this.src = src; this.gain = g; this.cur = name;
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

  load(name) {
    if (this.loading[name] || this.failed[name]) return;
    this.loading[name] = true;
    fetch(BGM_TRACKS[name].src)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(a => SFX.ctx.decodeAudioData(a))
      .then(b => { this.buffers[name] = b; this.loading[name] = false; this.sync(); })
      .catch(e => { this.failed[name] = true; this.loading[name] = false; console.warn('배경음악을 불러오지 못함:', name, e); });
  },
};
