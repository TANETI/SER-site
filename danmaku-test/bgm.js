'use strict';
// 배경음악. 보스마다 bgm/<보스 이름>/ 폴더에 mp3·wav·ogg를 넣으면 그 보스 패턴에서 나온다(폴더에 여럿이면 이름순 첫 곡).
// 파일을 Web Audio 버퍼로 디코드해 샘플 단위로 이음매 없이 반복한다
// (HTML audio의 loop는 반복 지점에서 끊김이 생김. mp3는 파일 앞뒤에 인코더 무음이 붙어 있어 wav·ogg가 더 매끄러움).
// 효과음과 같은 AudioContext를 쓰며 첫 키 입력·클릭으로 소리가 켜진 뒤에 재생된다. 음소거(M)를 함께 따르고 음량은 따로.
//
// 폴더 안 곡 찾기: 배포판은 빌드가 만든 bgm/manifest.json을, 로컬 개발 서버(python http.server)는 폴더 목록 페이지를 읽음.
// 그래서 로컬에서는 파일을 넣고 새로고침만 하면 반영된다. 곡이 없거나 불러오지 못하면 조용히 넘어간다.
//
// 반복 구간을 곡마다 정하려면 BGM_LOOPS에 '보스/파일명': { loopStart, loopEnd } (초). loopStart 앞(인트로)은 처음에 한 번만 나옴
const BGM_LOOPS = {
  // '김예나/theme.wav': { loopStart: 4.2 },
};
const BGM_EXT = /\.(mp3|wav|ogg|m4a|opus)$/i;

const BGM = {
  volume: 0.5, want: null, cur: null, src: null, gain: null, out: null,
  buffers: {}, loading: {}, failed: {}, lists: {}, missAt: {}, manifest: undefined,

  // 보스 이름으로 곡을 고름. 폴더가 비어 있으면 keep=true일 때 지금 곡을 그대로 두고(중간에 곡 없는 보스),
  // 아니면 지금 곡을 줄이고 멈춤. 같은 곡이 이미 나오고 있으면 처음으로 돌리지 않고 이어 감
  playBoss(boss, keep = false) {
    const token = this.token = (this.token || 0) + 1;
    this.listFor(boss).then(files => {
      if (token !== this.token) return;   // 그사이 다른 보스로 바뀜
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
    if (this.want === this.cur) return;
    if (this.cur) this.fade(1);   // 다른 곡으로 바뀔 때는 1초에 걸쳐 줄이고 넘어감
    const name = this.want;
    if (!name) return;
    const buf = this.buffers[name];
    if (!buf) { this.load(name); return; }
    const t = BGM_LOOPS[name] || {}, src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; src.loop = true;
    src.loopStart = t.loopStart || 0; src.loopEnd = t.loopEnd || buf.duration;
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
    if (this.loading[name] || this.failed[name] || !SFX.ctx) return;
    this.loading[name] = true;
    fetch('bgm/' + name.split('/').map(encodeURIComponent).join('/'))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(a => SFX.ctx.decodeAudioData(a))
      .then(b => { this.buffers[name] = b; this.loading[name] = false; this.sync(); })
      .catch(e => { this.failed[name] = true; this.loading[name] = false; console.warn('배경음악을 불러오지 못함:', name, e); });
  },
};
