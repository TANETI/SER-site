const grid = document.querySelector('#character-grid');
const search = document.querySelector('#character-search');
const count = document.querySelector('#result-count');
const empty = document.querySelector('#empty-state');
const status = document.querySelector('#copy-status');
const filterButtons = [...document.querySelectorAll('[data-filter]')];

let characters = [];
let activeFilter = 'all';

const assetMarkdown = (code) => `![](https://issssm.com/${code}/D/01.webp)`;

function render() {
  const term = search.value.trim().toLocaleLowerCase('ko');
  const visible = characters.filter((character) => {
    const inGroup = activeFilter === 'all' || character.group === activeFilter;
    const haystack = `${character.name} ${character.code} ${character.role} ${character.groupLabel}`.toLocaleLowerCase('ko');
    return inGroup && (!term || haystack.includes(term));
  });

  grid.innerHTML = visible.map((character) => `
    <article class="character-card">
      <div class="portrait"><img src="./${character.code}/D/01.webp" alt="${character.name}" width="768" height="960" loading="lazy" decoding="async"></div>
      <div class="character-info">
        <p class="character-group">${character.groupLabel}</p>
        <h3 class="character-name">${character.name}<span>${character.code}</span></h3>
        <p class="character-role">${character.role}</p>
        <button class="copy-button" type="button" data-copy-code="${character.code}">이미지 Markdown 복사</button>
      </div>
    </article>`).join('');

  grid.setAttribute('aria-busy', 'false');
  count.textContent = `${visible.length} / ${characters.length}`;
  empty.hidden = visible.length !== 0;
}

function setFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((button) => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  render();
}

async function copyMarkdown(code) {
  const value = assetMarkdown(code);
  try {
    await navigator.clipboard.writeText(value);
    status.textContent = `${code} 이미지 주소를 복사했습니다.`;
  } catch {
    status.textContent = value;
  }
}

filterButtons.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter)));
search.addEventListener('input', render);
grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy-code]');
  if (button) copyMarkdown(button.dataset.copyCode);
});
document.querySelector('#reset-filter').addEventListener('click', () => {
  search.value = '';
  setFilter('all');
  search.focus();
});
document.querySelectorAll('[data-filter-link]').forEach((link) => link.addEventListener('click', () => setFilter(link.dataset.filterLink)));

fetch('./characters.json')
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    characters = data;
    render();
  })
  .catch(() => {
    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = '<p>인물 데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>';
  });
