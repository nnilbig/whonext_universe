// ---------------------------------------------------------------
// 歷屆賽事得名名單，ranking.html（總表）和 profile.html（個人排名）
// 共用同一份資料，更新賽果只要改這裡一個地方。
// ---------------------------------------------------------------
const TOURNAMENT_EVENTS = [
  { label: '2026・卡牌賽', results: [
    { rank: 1, cls: 'n', members: ['喬', 'TonyH', '韶恩'] },
    { rank: 2, cls: 'e', members: ['Batman', '祈翰', '俞民'] },
    { rank: 3, cls: 'x', members: ['扯翔', '學承', 'Eden'] },
    { rank: 4, cls: '', members: ['儒', '承', '容'] }
  ]},
  { label: '2025・夏季賽', results: [
    { rank: 1, cls: 'n', members: ['Ting', '喬', '儒', '扯翔'] },
    { rank: 2, cls: 'e', members: ['霞', '孟翰', '小健', 'Jason'] },
    { rank: 3, cls: 'x', members: ['嘉偉', 'Eden', '承', '雞佛'] },
    { rank: 4, cls: '', members: ['安', '容', '博', '祈翰'] }
  ]},
  { label: '2024・年終賽', results: [
    { rank: 1, cls: 'n', members: ['博', '承', '安'] },
    { rank: 2, cls: 'e', members: ['嘉偉', '扯翔', '咖咖'] },
    { rank: 3, cls: 'x', members: ['Eden', '祈翰', '儒'] },
    { rank: 4, cls: '', members: ['孟翰', '嘉偉', '雞佛'] }
  ]}
];
