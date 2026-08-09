// ============================================
// 一次性遷移任務：把 weeks 分頁的舊制出席資料（present_names / dropin_names）
// 整理進 events + signups 分頁，讓舊資料也能用新制的方式被讀取。
//
// 用法：
// 1. 把這個檔案內容貼到 Apps Script 編輯器（跟 Code.gs 同一個專案，新增一個檔案）
// 2. 上方函式選單選 migrateWeeksToSignups，執行
// 3. 執行紀錄（查看 > 記錄）會印出新增了幾筆 events / signups
// 4. 確認 Sheet 資料正確後，這個檔案可以刪除，不影響網站運作
//
// 只會「新增」資料，不會刪除或修改 weeks 分頁，也不會動到既有的 events/signups，
// 可以放心重複執行 —— 已經匯入過的週（用 events.title 判斷）會自動跳過。
// ============================================

function migrateWeeksToSignups() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const weeksSheet = ss.getSheetByName(WEEKS_SHEET);
  const eventsSheet = ss.getSheetByName(EVENTS_SHEET);
  const signupsSheet = ss.getSheetByName(SIGNUPS_SHEET);

  const weekRows = weeksSheet.getDataRange().getValues();
  const weekHeaders = weekRows.shift();
  const weekDateCol = weekHeaders.indexOf('week_date');
  const presentCol = weekHeaders.indexOf('present_names');
  const dropinCol = weekHeaders.indexOf('dropin_names');

  const eventHeaders = eventsSheet.getRange(1, 1, 1, eventsSheet.getLastColumn()).getValues()[0];
  const signupHeaders = signupsSheet.getRange(1, 1, 1, signupsSheet.getLastColumn()).getValues()[0];
  const titleCol = eventHeaders.indexOf('title');

  // 用 title 當作「這週是否已經匯入過」的記號，避免重複執行時重複塞資料
  const existingEventRows = eventsSheet.getDataRange().getValues();
  existingEventRows.shift();
  const existingTitles = {};
  if (titleCol >= 0) {
    existingEventRows.forEach(function (r) {
      if (r[titleCol]) existingTitles[r[titleCol]] = true;
    });
  }

  const newEventRows = [];
  const newSignupRows = [];

  weekRows.forEach(function (r) {
    const rawDate = r[weekDateCol];
    if (!rawDate) return;

    const weekDate = normalizeDateValue(rawDate);
    const dateKey = String(weekDate).replace(/-/g, '');
    const title = '舊制匯入・' + weekDate;
    if (existingTitles[title]) return; // 已經匯入過，跳過

    const eventId = 'ev_' + dateKey + randHex(6);

    newEventRows.push(eventHeaders.map(function (h) {
      if (h === 'id') return eventId;
      if (h === 'title') return title;
      if (h === 'type') return '練習';
      if (h === 'date') return weekDate;
      if (h === 'status') return 'closed';
      if (h === 'capacity') return 0;
      if (h === 'overflow_mode') return 'reject';
      return '';
    }));

    splitNames(r[presentCol]).forEach(function (name) {
      newSignupRows.push(buildMigratedSignupRow(signupHeaders, dateKey, eventId, 'member', name, '', '', weekDate));
    });

    splitNames(r[dropinCol]).forEach(function (entry) {
      const parsed = parseDropinEntryLocal(entry);
      newSignupRows.push(buildMigratedSignupRow(signupHeaders, dateKey, eventId, 'guest', '', parsed.name, parsed.referrer, weekDate));
    });
  });

  if (newEventRows.length > 0) {
    eventsSheet.getRange(eventsSheet.getLastRow() + 1, 1, newEventRows.length, eventHeaders.length).setValues(newEventRows);
  }
  if (newSignupRows.length > 0) {
    signupsSheet.getRange(signupsSheet.getLastRow() + 1, 1, newSignupRows.length, signupHeaders.length).setValues(newSignupRows);
  }

  Logger.log('遷移完成：新增 ' + newEventRows.length + ' 筆 events, ' + newSignupRows.length + ' 筆 signups');
}

function buildMigratedSignupRow(signupHeaders, dateKey, eventId, type, memberName, guestName, referrer, createdAt) {
  const id = 'su_' + dateKey + randHex(6);
  return signupHeaders.map(function (h) {
    if (h === 'id') return id;
    if (h === 'event_id') return eventId;
    if (h === 'type') return type;
    if (h === 'member_name') return memberName;
    if (h === 'guest_name') return guestName;
    if (h === 'referrer') return referrer;
    if (h === 'status') return 'confirmed';
    if (h === 'created_at') return createdAt;
    return '';
  });
}

function randHex(len) {
  return Utilities.getUuid().replace(/-/g, '').slice(0, len);
}

function splitNames(val) {
  return String(val || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function parseDropinEntryLocal(entry) {
  const m = String(entry || '').match(/^(.*?)\(([^()]+)\)$/);
  return m ? { name: m[1].trim(), referrer: m[2].trim() } : { name: String(entry || '').trim(), referrer: '' };
}
