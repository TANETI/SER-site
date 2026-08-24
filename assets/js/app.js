/* 메인 — 인물 명부를 세력별 컨택트 시트로 그린다. */
const sheets = document.querySelector('#sheets');
const q = document.querySelector('#q');
const count = document.querySelector('#count');
const empty = document.querySelector('#empty');
const say = document.querySelector('#say');

let characters = [];
let assets = {};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const markdown = (code) => `![](https://srp.issssm.com/${code}/D/01.webp)`;

function fail(message) {
  sheets.setAttribute('aria-busy', 'false');
  sheets.innerHTML =
    `<div class="warn"><span>${esc(message)}</span>` +
    '<button type="button" onclick="location.reload()">다시 불러오기</button></div>';
}

function frame(character) {
  const record = assets[character.code] || { shots: [], sex: null };
  const have = record.shots.length;
  const fixed = SER.fixedShots(character, record.sex).length;
  const pct = fixed ? Math.min(100, Math.round((have / fixed) * 100)) : 0;
  const extra = SER.estimateExtra(record.sex);
  const title = `${character.name} 에셋 ${have}장 · 확정 ${fixed}칸`;
  return `<li><a class="frame" href="./gallery/#${character.code}" title="${esc(title)}">
    <span class="shot"><img src="https://srp.issssm.com/${character.code}/D/01.webp" alt="${esc(character.name)} 01"
      width="1024" height="1024" loading="lazy" decoding="async"><span class="no">${character.code}</span></span>
    <span class="nm">${esc(character.name)}</span>
    <span class="en" lang="en">${esc(character.englishName)}</span>
    <span class="role">${esc(character.role)}</span>
    <span class="have"><i><b style="width:${pct}%"></b></i>${have} / ${fixed}${extra ? '+' + extra : ''}</span>
  </a>
  <button class="md" type="button" data-code="${character.code}">이미지 주소 복사</button></li>`;
}

function render() {
  const term = q.value.trim().toLocaleLowerCase('ko');
  const match = (c) =>
    !term || `${c.name} ${c.englishName} ${c.code} ${c.role} ${c.groupLabel}`.toLocaleLowerCase('ko').includes(term);
  const visible = characters.filter(match);

  sheets.innerHTML = SER.GROUPS.map((group) => {
    const members = visible.filter((c) => c.group === group.id);
    if (!members.length) return '';
    return `<section class="sheet" id="g-${group.id}" data-grade="${group.grade}" aria-labelledby="h-${group.id}">
      <div class="sheet-head">${SER.curveSvg(group.grade, group.grade === '—' ? 'solid' : '')}
        <h3 id="h-${group.id}">${esc(group.label)}</h3>
        <span class="grade"><b>${group.grade === '—' ? '필터 없음' : group.grade + '호'}</b></span>
        <span class="n">${members.length}명</span></div>
      <ul class="frames">${members.map(frame).join('')}</ul>
    </section>`;
  }).join('');

  sheets.setAttribute('aria-busy', 'false');
  count.textContent = `${visible.length} / ${characters.length}`;
  empty.hidden = visible.length !== 0;
}

async function copy(code, button) {
  const value = markdown(code);
  try {
    await navigator.clipboard.writeText(value);
    button.dataset.done = '1';
    button.textContent = '복사함';
    say.textContent = `${code} 이미지 주소를 복사했습니다.`;
    setTimeout(() => { delete button.dataset.done; button.textContent = '이미지 주소 복사'; }, 1600);
  } catch {
    say.textContent = value;
  }
}

q.addEventListener('input', render);
document.querySelector('#reset').addEventListener('click', () => { q.value = ''; render(); q.focus(); });
sheets.addEventListener('click', (event) => {
  const button = event.target.closest('[data-code]');
  if (button) copy(button.dataset.code, button);
});

/* 상단 내비가 지금 읽는 절을 표시한다. */
const links = [...document.querySelectorAll('.masthead nav a[href^="#"]')];
if (links.length && 'IntersectionObserver' in window) {
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-56px 0px -70% 0px' });
  ['world', 'factions', 'roster'].forEach((id) => {
    const target = document.getElementById(id);
    if (target) spy.observe(target);
  });
}

const json = (url) => fetch(url, { cache: 'no-cache' }).then((r) => {
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
});

Promise.all([json('./data/characters.json'), json('./data/assets.json').catch(() => null)])
  .then(([people, raw]) => {
    characters = people;
    if (raw === null) {
      say.textContent = '보유 현황을 불러오지 못해 0으로 표시합니다.';
    } else {
      assets = Object.fromEntries(Object.entries(raw)
        .map(([code, value]) => [code, Array.isArray(value) ? { shots: value, sex: null } : value]));
    }
    render();
  })
  .catch((error) => fail(`인물 데이터를 불러오지 못했습니다. (${error.message})`));
