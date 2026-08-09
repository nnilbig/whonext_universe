// ============================================
// 一次性遷移任務：把 members 分頁(每月覆寫的月繳名單)裡出現過的所有球員
// 姓名，去重後匯入 profiles 分頁(一人一列的身分主檔)，狀態設成 legacy，
// 代表「舊名冊、還沒綁定 Google 帳號」。
//
// 用法：
// 1. 把這個檔案內容貼到 Apps Script 編輯器（跟 Code.gs 同一個專案，新增一個檔案）
// 2. 先確認 profiles 分頁已存在，且第一列標題是：
//    name, email, google_id, photo_url, referrer, registered_at, status, can_create_events
// 3. 上方函式選單選 migrateMembersToProfiles，執行
// 4. 執行紀錄（查看 > 記錄）會印出新增了幾筆 profiles
//
// 只會「新增」缺少的人，不會修改已經存在 profiles 裡的列(不管 email/google_id
// 是不是已經綁過)，也不會動到 members 分頁，可以放心重複執行。
// ============================================

function migrateMembersToProfiles() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const membersSheet = ss.getSheetByName(MEMBERS_SHEET);
  const profilesSheet = ss.getSheetByName(PROFILES_SHEET);
  if (!profilesSheet) {
    Logger.log('找不到 profiles 分頁，請先手動建立並填好標題列');
    return;
  }

  const memberRows = membersSheet.getDataRange().getValues();
  const memberHeaders = memberRows.shift();
  const nameCol = memberHeaders.indexOf('name');
  if (nameCol < 0) {
    Logger.log('members 分頁找不到 name 欄位');
    return;
  }

  const profileHeaders = profilesSheet.getRange(1, 1, 1, profilesSheet.getLastColumn()).getValues()[0];
  const profileNameCol = profileHeaders.indexOf('name');
  if (profileNameCol < 0) {
    Logger.log('profiles 分頁找不到 name 欄位');
    return;
  }

  const existingRows = profilesSheet.getDataRange().getValues();
  existingRows.shift();
  const existingNames = {};
  existingRows.forEach(function (r) {
    if (r[profileNameCol]) existingNames[String(r[profileNameCol]).trim()] = true;
  });

  const allNames = memberRows
    .map(function (r) { return String(r[nameCol] || '').trim(); })
    .filter(Boolean);
  const distinctNames = [...new Set(allNames)].filter(function (n) { return !existingNames[n]; });

  const newRows = distinctNames.map(function (name) {
    return profileHeaders.map(function (h) {
      if (h === 'name') return name;
      if (h === 'status') return 'legacy';
      if (h === 'can_create_events') return false;
      return '';
    });
  });

  if (newRows.length > 0) {
    profilesSheet.getRange(profilesSheet.getLastRow() + 1, 1, newRows.length, profileHeaders.length).setValues(newRows);
  }

  const skipped = [...new Set(allNames)].length - newRows.length;
  Logger.log('遷移完成：新增 ' + newRows.length + ' 筆 profiles（跳過 ' + skipped + ' 筆已存在）');
}
