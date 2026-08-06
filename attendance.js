// ---------------------------------------------------------------
// 共用出席資料（尚未串接後台，僅供視覺呈現）— 帳務頁與成員頁共用同一份紀錄
// ---------------------------------------------------------------
const BALLS_PER_TUBE = 12;
const MEMBERS = ['忠','安','Jessica','韶恩','孟翰','儒','扯翔','煒'];
const WEEKLY_FEE = 210;
const DROPIN_FEE = 210;

const WEEKS = [
  { date:'2026-07-05', present:['忠','安','Jessica','韶恩','孟翰','儒','扯翔','煒'], leave:[], dropins:['Vic','TonyH'], balls:10, tube:980, court:2200, actExp:0, actInc:0, note:'' },
  { date:'2026-07-12', present:['忠','安','韶恩','孟翰','儒','扯翔','煒'], leave:['Jessica'], dropins:['Vic'], balls:9, tube:980, court:2200, actExp:0, actInc:0, note:'' },
  { date:'2026-07-19', present:['忠','安','Jessica','韶恩','孟翰','儒','煒'], leave:['扯翔'], dropins:['TonyH','Tony','學承'], balls:11, tube:980, court:2200, actExp:800, actInc:0, note:'生日聚餐' },
  { date:'2026-07-26', present:['忠','安','Jessica','韶恩','孟翰','儒','扯翔','煒'], leave:[], dropins:['Vic','Tony'], balls:10, tube:980, court:2200, actExp:0, actInc:0, note:'' },
  { date:'2026-08-02', present:['忠','安','Jessica','韶恩','孟翰','儒','扯翔'], leave:['煒'], dropins:['TonyH'], balls:9, tube:980, court:2200, actExp:0, actInc:0, note:'' },
  { date:'2026-08-09', present:['忠','安','Jessica','韶恩','孟翰','儒','扯翔','煒'], leave:[], dropins:['Vic','TonyH','學承'], balls:12, tube:980, court:2200, actExp:0, actInc:0, note:'' },
];

function monthOf(w){ return w.date.slice(0,7); }
function months(){ return [...new Set(WEEKS.map(monthOf))].sort(); }
function weeksOfMonth(m){ return WEEKS.filter(w => monthOf(w) === m).sort((a,b) => a.date.localeCompare(b.date)); }
