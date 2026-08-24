/* 에셋 기대치 모형 — 메인과 갤러리가 같은 값을 쓰도록 한 곳에 둔다.
   확정 분모와 예상 상한을 구분한다. 예상 상한은 진행률의 분모로 쓰지 않는다. */
window.SER = (function () {
  /* 세력 = 필터 호수. 연조에서 경조 순. */
  const GROUPS = [
    { id: 'church',     label: '성당교회',       grade: '0'   },
    { id: 'seraph',     label: '세라프',         grade: '1'   },
    { id: 'seraphian',  label: '세라피안',       grade: '2'   },
    { id: 'task-force', label: '괴이사건대책반', grade: '2.5' },
    { id: 'nymph',      label: 'NYMPH',          grade: '3.5' },
    { id: 'gardener',   label: '가드너',         grade: '5'   },
    { id: 'core',       label: '핵심 존재',      grade: '—'   },
  ];

  const CURVE = {
    '0':   'M3 35 L 7 34 L 33 7 L 37 5',
    '1':   'M3 35 L 9 34 L 31 7 L 37 5',
    '2':   'M3 35 L 12 34 L 28 7 L 37 5',
    '2.5': 'M3 35 L 14 34 L 26 7 L 37 5',
    '3.5': 'M3 35 L 16 34 L 24 7 L 37 5',
    '5':   'M3 35 L 18 34 L 22 7 L 37 5',
    '—':   'M20 36 L 20 4',
  };

  /* 변신·전투 대역은 집단마다 다르다. 변신하지 않는 집단에는 101 칸을 만들지 않는다. */
  const BATTLE_BY_GROUP = {
    seraph:   ['102'],
    gardener: ['102', '103'],
    core:     ['130'],
    church:   ['102', '103', '104', '105', '106'],
  };
  const BATTLE_OWN = { JR: ['120'] };
  const EMOTION = Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, '0'));

  /* 확정된 번호만. 201 과 301 은 각각 대역의 첫 확정 번호다. */
  const DAILY_FIXED = ['201'];
  const NSFW_FIXED = ['301'];
  /* 예상 상한 — 아직 번호가 배정되지 않은 물량. 별도 표시용이며 분모가 아니다. */
  const DAILY_EST = 7;
  const NSFW_EST = 36;

  const battleSet = (character) =>
    (BATTLE_BY_GROUP[character.group] || ['101', '102', '103']).concat(BATTLE_OWN[character.code] || []);

  const isFemale = (sex) => sex === 'f' || sex === '여성' || sex === 'female';

  /* 이 인물에게 확정된 상황번호 전부. */
  const fixedShots = (character, sex) =>
    EMOTION.concat(battleSet(character), DAILY_FIXED, isFemale(sex) ? NSFW_FIXED : []);

  /* 아직 번호가 없는 예상 추가분. */
  const estimateExtra = (sex) =>
    (DAILY_EST - DAILY_FIXED.length) + (isFemale(sex) ? NSFW_EST - NSFW_FIXED.length : 0);

  const curveSvg = (grade, extraClass) =>
    `<svg class="curve${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 40 40" aria-hidden="true">` +
    '<rect x="2.5" y="2.5" width="35" height="35"/><line x1="2.5" y1="20" x2="37.5" y2="20"/>' +
    `<line x1="20" y1="2.5" x2="20" y2="37.5"/><path d="${CURVE[grade] || CURVE['2']}"/></svg>`;

  return {
    GROUPS, CURVE, EMOTION, BATTLE_BY_GROUP, BATTLE_OWN,
    DAILY_FIXED, NSFW_FIXED, DAILY_EST, NSFW_EST,
    battleSet, isFemale, fixedShots, estimateExtra, curveSvg,
  };
})();
