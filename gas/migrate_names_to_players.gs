// ============================================
// 一次性遷移任務：把 members / signups / weeks 裡出現過的所有球員姓名，
// 去重後在 players 分頁補一筆「佔位列」（沒有 google_id/line_user_id，
// 只有 bound_name/custom_name），讓 is_monthly_member/wallet_balance 這類
// 未來要掛在 players 上的欄位，也能套用到「還沒登入過」的舊球員身上，
// 不用等對方本人註冊才有列可以掛資料。
//
// 用法：
// 1. 把這個檔案內容貼到 Apps Script 編輯器（跟 Code.gs 同一個專案，新增一個檔案）
// 2. 上方函式選單選 migrateNamesToPlayers，執行
// 3. 執行紀錄（查看 > 記錄）會印出掃到幾個不重複姓名、新增了幾筆 players
// 4. 確認 Sheet 資料正確後，這個檔案可以刪除，不影響網站運作
//
// 只會「新增」players 裡缺少的人（用 bound_name 判斷是否已經有列，比對時
// 大小寫視為同一人，例如「TonyH」跟「tonyh」不會被當成兩個不同的人），
// 不會修改任何既有列，也不會動到 members/signups/weeks，可以放心重複執行。
//
// 姓名來源與取法：
//   - members.name：直接取
//   - signups.member_name（只算 type === 'member'，guest 不是球員身分，
//     不建佔位列）
//   - weeks.present_names / leave_names：逗號分隔，直接取。理論上是當月
//     members 名單的子集，這裡當保險一起掃，不會多出東西
//   - weeks.dropin_names：逗號分隔，格式是「姓名(介紹人)」，要先拆出
//     姓名部分——介紹人不是身分資料，不能直接拿整串去建 bound_name
//
// 新建的佔位列 is_bound 設 true（bound_name 已經填好，符合 is_bound 原本
// 「bound_name 是否已填」的定義），但不會有 google_id/line_user_id，本人
// 還是登不進去，要等之後補上「認領佔位列」的邏輯，讓真正登入時把
// google_id/line_user_id 寫回這一列，而不是另外新開一列。
// ============================================

function migrateNamesToPlayers() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const playersSheet = ss.getSheetByName(PLAYERS_SHEET);
  if (!playersSheet) {
    Logger.log('找不到 players 分頁');
    return;
  }

  const playerHeaders = playersSheet.getRange(1, 1, 1, playersSheet.getLastColumn()).getValues()[0];
  const boundNameCol = playerHeaders.indexOf('bound_name');
  if (boundNameCol < 0) {
    Logger.log('players 分頁找不到 bound_name 欄位');
    return;
  }
  if (playerHeaders.indexOf('player_id') < 0) {
    Logger.log('players 分頁找不到 player_id 欄位');
    return;
  }

  const existingRows = playersSheet.getDataRange().getValues();
  existingRows.shift();
  const existingBoundNames = {};
  existingRows.forEach(function (r) {
    if (r[boundNameCol]) existingBoundNames[String(r[boundNameCol]).trim().toLowerCase()] = true;
  });

  // key 用小寫比對（同一個人「TonyH」「tonyh」不要被當成兩個人），但
  // value 保留第一次看到的原始大小寫，不然新建的佔位列顯示名稱會整個變小寫。
  const namesByKey = {};
  collectMemberNames_(ss, namesByKey);
  collectSignupNames_(ss, namesByKey);
  collectWeekNames_(ss, namesByKey);

  const distinctNames = Object.keys(namesByKey)
    .filter(function (key) { return !existingBoundNames[key]; })
    .map(function (key) { return namesByKey[key]; });

  const newRows = distinctNames.map(function (name) {
    const updates = {
      player_id: Utilities.getUuid(),
      custom_name: name,
      bound_name: name,
      is_bound: true,
      can_create_events: false,
      is_admin: false,
      created_at: new Date()
    };
    return playerHeaders.map(function (h) { return updates[h] !== undefined ? updates[h] : ''; });
  });

  if (newRows.length > 0) {
    playersSheet.getRange(playersSheet.getLastRow() + 1, 1, newRows.length, playerHeaders.length).setValues(newRows);
  }

  const scannedCount = Object.keys(namesByKey).length;
  Logger.log('遷移完成：掃到 ' + scannedCount + ' 個不重複姓名（大小寫視為同一人），新增 ' + newRows.length + ' 筆 players（跳過 ' + (scannedCount - newRows.length) + ' 筆已存在）');
}

// 第一次看到某個 key（小寫）才記錄，之後同一個 key 再出現(不管大小寫怎麼寫)一律忽略，
// 保留最早那次的原始大小寫當顯示用名稱。
function addName_(namesByKey, name) {
  if (!name) return;
  const key = name.toLowerCase();
  if (!(key in namesByKey)) namesByKey[key] = name;
}

function collectMemberNames_(ss, namesByKey) {
  const sheet = ss.getSheetByName(MEMBERS_SHEET);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const nameCol = headers.indexOf('name');
  if (nameCol < 0) return;
  rows.forEach(function (r) {
    addName_(namesByKey, String(r[nameCol] || '').trim());
  });
}

function collectSignupNames_(ss, namesByKey) {
  const sheet = ss.getSheetByName(SIGNUPS_SHEET);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const typeCol = headers.indexOf('type');
  const nameCol = headers.indexOf('member_name');
  if (nameCol < 0) return;
  rows.forEach(function (r) {
    if (typeCol >= 0 && r[typeCol] !== 'member') return;
    addName_(namesByKey, String(r[nameCol] || '').trim());
  });
}

function collectWeekNames_(ss, namesByKey) {
  const sheet = ss.getSheetByName(WEEKS_SHEET);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const presentCol = headers.indexOf('present_names');
  const leaveCol = headers.indexOf('leave_names');
  const dropinCol = headers.indexOf('dropin_names');

  rows.forEach(function (r) {
    if (presentCol >= 0) splitNamesLocal_(r[presentCol]).forEach(function (n) { if (!isFriendPlaceholder_(n)) addName_(namesByKey, n); });
    if (leaveCol >= 0) splitNamesLocal_(r[leaveCol]).forEach(function (n) { if (!isFriendPlaceholder_(n)) addName_(namesByKey, n); });
    if (dropinCol >= 0) {
      splitNamesLocal_(r[dropinCol]).forEach(function (entry) {
        const name = parseDropinEntryLocal_(entry);
        if (name && !isFriendPlaceholder_(name)) addName_(namesByKey, name);
      });
    }
  });
}

// weeks 的出席/臨打名單裡，含有「友」字的是臨時帶友人這種泛稱佔位
// （不是真正球員的姓名），不該建成 players 佔位列。
function isFriendPlaceholder_(name) {
  return String(name || '').indexOf('友') >= 0;
}

function splitNamesLocal_(val) {
  return String(val || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

// 只取姓名部分，忽略「(介紹人)」——跟 finance.html 的 parseDropinEntry 同一套規則。
function parseDropinEntryLocal_(entry) {
  const m = String(entry || '').match(/^(.*?)\(([^()]+)\)$/);
  return m ? m[1].trim() : String(entry || '').trim();
}
