// ============================================
// 球隊帳戶系統 - Google Apps Script 後端
// 部署方式:Sheet 內「擴充功能 > Apps Script」貼上此檔案
// 部署為「網頁應用程式」,執行身分選你自己,存取權限選「知道連結的任何人」或限定範圍
// 修改後務必:存檔 -> 部署 -> 管理部署作業 -> 編輯(鉛筆) -> 版本選「新版本」-> 部署
//
// events 分頁需要有 id / type / capacity / overflow_mode 欄位(手動加標題即可,id 會自動補值)
// 另外需要新增一個 signups 分頁,欄位標題:
//   id, event_id, type, member_name, guest_name, referrer, status, created_at
// 還需要一個 profiles 分頁(一人一列的球員身分主檔,跟 members 那種每月覆寫的
// 月繳名單分開),欄位標題:
//   name, email, google_id, photo_url, referrer, registered_at, status, can_create_events
// status: legacy(舊名冊、還沒綁 Google 帳號) / active(已綁定)
// 既有球員名字可以用 gas/migrate_members_to_profiles.gs 批次匯入成 legacy 列
// ============================================

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const WEEKS_SHEET = 'weeks';
const MEMBERS_SHEET = 'members';
const AUTH_SHEET = 'auth';
const EVENTS_SHEET = 'events';
const SIGNUPS_SHEET = 'signups';
const PROFILES_SHEET = 'profiles';

function doGet(e) {
  const action = e.parameter.action;
  let result;

  if (action === 'getWeeks') {
    result = getWeeks(e.parameter.month);
  } else if (action === 'getMembers') {
    result = getMembers(e.parameter.month);
  } else if (action === 'getEvents') {
    result = getEvents();
  } else if (action === 'getEventSignups') {
    result = getEventSignups(e.parameter.event_id);
  } else if (action === 'getProfiles') {
    result = getProfiles();
  } else {
    result = { error: '未知的 action: ' + action };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  let result;

  if (action === 'saveWeek') {
    result = saveWeek(body.data);
  } else if (action === 'saveMembers') {
    result = saveMembers(body.data);
  } else if (action === 'saveEvents') {
    result = saveEvents(body.data);
  } else if (action === 'login') {
    result = verifyLogin(body.data);
  } else if (action === 'signupEvent') {
    result = signupEvent(body.data);
  } else if (action === 'bulkSignupEvent') {
    result = bulkSignupEvent(body.data);
  } else if (action === 'cancelSignup') {
    result = cancelSignup(body.data);
  } else {
    result = { error: '未知的 action: ' + action };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// 把任何日期物件轉成固定格式的文字(yyyy-MM-dd),避免 JSON 序列化時
// 因時區偏移(UTC vs GMT+8)導致日期跑掉。不依賴欄位名稱,只要值是 Date 就轉換。
function normalizeDateValue(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'GMT+8', 'yyyy-MM-dd');
  }
  return val;
}

function generateId(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

// -------- 讀取 --------

function getWeeks(monthFilter) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(WEEKS_SHEET);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();

  let weeks = rows
    .filter(r => r[0])
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = normalizeDateValue(r[i]);
      });
      return obj;
    });

  if (monthFilter) {
    weeks = weeks.filter(w => w.week_date && String(w.week_date).slice(0, 7) === monthFilter);
  }

  return { weeks };
}

function getMembers(monthFilter) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(MEMBERS_SHEET);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();

  let members = rows
    .filter(r => r[0])
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = r[i];
        if (h === 'month' && val instanceof Date) {
          val = Utilities.formatDate(val, 'GMT+8', 'yyyy-MM');
        } else {
          val = normalizeDateValue(val);
        }
        obj[h] = val;
      });
      return obj;
    });

  if (monthFilter) {
    members = members.filter(m => String(m.month) === monthFilter);
  }

  return { members };
}

function getEvents() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(EVENTS_SHEET);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();

  const events = rows
    .filter(r => r[0])
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = normalizeDateValue(r[i]);
      });
      return obj;
    });

  const counts = getSignupCounts();
  events.forEach(ev => {
    const c = counts[ev.id] || { confirmed: 0, waitlist: 0, names: [] };
    ev.signup_count = c.confirmed;
    ev.waitlist_count = c.waitlist;
    ev.signup_names = c.names;
  });

  return { events };
}

// 依 event_id 聚合每個賽事目前 confirmed / waitlist 的人數，
// 同時收集 confirmed 名單（member_name 或 guest_name），
// 給首頁賽事卡片的頭像疊圖用，不用另外多打一次 API。
function getSignupCounts() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SIGNUPS_SHEET);
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const eventIdCol = headers.indexOf('event_id');
  const statusCol = headers.indexOf('status');
  const typeCol = headers.indexOf('type');
  const memberNameCol = headers.indexOf('member_name');
  const guestNameCol = headers.indexOf('guest_name');
  if (eventIdCol < 0 || statusCol < 0) return {};

  const counts = {};
  rows.forEach(r => {
    const eventId = r[eventIdCol];
    const status = r[statusCol];
    if (!eventId || (status !== 'confirmed' && status !== 'waitlist')) return;
    if (!counts[eventId]) counts[eventId] = { confirmed: 0, waitlist: 0, names: [] };
    counts[eventId][status]++;
    if (status === 'confirmed') {
      const name = r[typeCol] === 'guest' ? r[guestNameCol] : r[memberNameCol];
      if (name) counts[eventId].names.push(String(name));
    }
  });
  return counts;
}

function getEventSignups(eventId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SIGNUPS_SHEET);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();

  const signups = rows
    .filter(r => r[0] && String(r[headers.indexOf('event_id')]) === String(eventId))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = normalizeDateValue(r[i]);
      });
      return obj;
    })
    .filter(s => s.status !== 'cancelled');

  return { signups };
}

// 球員身分主檔(一人一列),跟 members 那種每月覆寫的月繳名單分開存放，
// 才不會每次存月繳都要記得把 email/google_id 這些身分欄位一起帶回去。
function getProfiles() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PROFILES_SHEET);
  if (!sheet) return { profiles: [] };
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();

  const profiles = rows
    .filter(r => r[0])
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = normalizeDateValue(r[i]);
      });
      return obj;
    });

  return { profiles };
}

// -------- 寫入 --------

function saveWeek(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(WEEKS_SHEET);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const weekDateCol = headers.indexOf('week_date') + 1;

  const lookupDate = data.original_week_date || data.week_date;
  let targetRow = -1;
  for (let i = 1; i < rows.length; i++) {
    const cellDate = normalizeDateValue(rows[i][0]);
    if (String(cellDate) === String(lookupDate)) {
      targetRow = i + 1;
      break;
    }
  }

  const rowValues = headers.map(h => data[h] !== undefined ? data[h] : '');
  const finalRow = targetRow > 0 ? targetRow : sheet.getLastRow() + 1;

  if (weekDateCol > 0) {
    sheet.getRange(finalRow, weekDateCol).setNumberFormat('@');
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.getRange(finalRow, 1, 1, headers.length).setValues([rowValues]);
  }

  return { success: true, week_date: data.week_date };
}

function normalizeMonthValue(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'GMT+8', 'yyyy-MM');
  return val;
}

function saveMembers(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(MEMBERS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = sheet.getDataRange().getValues();
  const monthCol = headers.indexOf('month') + 1;

  const targetMonth = data.length > 0 ? data[0].month : null;
  if (!targetMonth) return { error: '缺少 month 欄位' };

  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(normalizeMonthValue(rows[i][0])) === String(targetMonth)) {
      sheet.deleteRow(i + 1);
    }
  }

  const startRow = sheet.getLastRow() + 1;
  const newRows = data.map(m => headers.map(h => m[h] !== undefined ? m[h] : ''));
  if (newRows.length > 0) {
    if (monthCol > 0) {
      sheet.getRange(startRow, monthCol, newRows.length, 1).setNumberFormat('@');
    }
    sheet.getRange(startRow, 1, newRows.length, headers.length).setValues(newRows);
  }

  return { success: true, month: targetMonth, count: newRows.length };
}

function saveEvents(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(EVENTS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dateCol = headers.indexOf('date') + 1;

  data.forEach(ev => {
    if (!ev.id) ev.id = generateId('ev');
  });

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  const newRows = data.map(ev => headers.map(h => ev[h] !== undefined ? ev[h] : ''));
  if (newRows.length > 0) {
    if (dateCol > 0) {
      sheet.getRange(2, dateCol, newRows.length, 1).setNumberFormat('@');
    }
    sheet.getRange(2, 1, newRows.length, headers.length).setValues(newRows);
  }

  return { success: true, count: newRows.length, events: data };
}

// 賽事報名。用 LockService 避免多人同時報名時,名額判斷算錯(超賣)。
function signupEvent(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const eventsSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(EVENTS_SHEET);
    const eventRows = eventsSheet.getDataRange().getValues();
    const eventHeaders = eventRows.shift();
    const idCol = eventHeaders.indexOf('id');
    const capacityCol = eventHeaders.indexOf('capacity');
    const overflowCol = eventHeaders.indexOf('overflow_mode');
    const eventStatusCol = eventHeaders.indexOf('status');

    const eventRow = eventRows.find(r => String(r[idCol]) === String(data.event_id));
    if (!eventRow) return { success: false, reason: 'event_not_found' };

    const eventStatus = eventRow[eventStatusCol];
    if (eventStatus === 'upcoming') return { success: false, reason: 'not_open' };
    if (eventStatus === 'closed') return { success: false, reason: 'closed' };

    const capacity = Number(eventRow[capacityCol]) || 0;
    const overflowMode = eventRow[overflowCol] === 'waitlist' ? 'waitlist' : 'reject';

    const signupsSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SIGNUPS_SHEET);
    const signupHeaders = signupsSheet.getRange(1, 1, 1, signupsSheet.getLastColumn()).getValues()[0];
    const allRows = signupsSheet.getDataRange().getValues();
    allRows.shift();

    const eventIdCol = signupHeaders.indexOf('event_id');
    const statusCol = signupHeaders.indexOf('status');
    const typeCol = signupHeaders.indexOf('type');
    const memberNameCol = signupHeaders.indexOf('member_name');

    const eventSignups = allRows.filter(r => String(r[eventIdCol]) === String(data.event_id));
    const confirmedCount = eventSignups.filter(r => r[statusCol] === 'confirmed').length;

    if (data.type === 'member') {
      const alreadySignedUp = eventSignups.some(r =>
        r[typeCol] === 'member' &&
        r[memberNameCol] === data.member_name &&
        (r[statusCol] === 'confirmed' || r[statusCol] === 'waitlist')
      );
      if (alreadySignedUp) return { success: false, reason: 'duplicate' };
    }

    let status;
    if (!capacity || confirmedCount < capacity) {
      status = 'confirmed';
    } else if (overflowMode === 'waitlist') {
      status = 'waitlist';
    } else {
      return { success: false, reason: 'full' };
    }

    const newRow = signupHeaders.map(h => {
      if (h === 'id') return generateId('su');
      if (h === 'event_id') return data.event_id;
      if (h === 'type') return data.type;
      if (h === 'member_name') return data.member_name || '';
      if (h === 'guest_name') return data.guest_name || '';
      if (h === 'referrer') return data.referrer || '';
      if (h === 'status') return status;
      if (h === 'created_at') return new Date();
      return '';
    });
    signupsSheet.getRange(signupsSheet.getLastRow() + 1, 1, 1, signupHeaders.length).setValues([newRow]);

    return { success: true, status };
  } finally {
    lock.releaseLock();
  }
}

// 一次匯入多位球員報名(例如整份月繳名單)。跟 signupEvent 共用名額/候補判斷邏輯,
// 但只鎖一次、寫入一次,不用對每個人各打一次 API。
function bulkSignupEvent(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const eventsSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(EVENTS_SHEET);
    const eventRows = eventsSheet.getDataRange().getValues();
    const eventHeaders = eventRows.shift();
    const idCol = eventHeaders.indexOf('id');
    const capacityCol = eventHeaders.indexOf('capacity');
    const overflowCol = eventHeaders.indexOf('overflow_mode');
    const eventStatusCol = eventHeaders.indexOf('status');

    const eventRow = eventRows.find(r => String(r[idCol]) === String(data.event_id));
    if (!eventRow) return { success: false, reason: 'event_not_found' };

    const eventStatus = eventRow[eventStatusCol];
    if (eventStatus === 'upcoming') return { success: false, reason: 'not_open' };
    if (eventStatus === 'closed') return { success: false, reason: 'closed' };

    const capacity = Number(eventRow[capacityCol]) || 0;
    const overflowMode = eventRow[overflowCol] === 'waitlist' ? 'waitlist' : 'reject';

    const signupsSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SIGNUPS_SHEET);
    const signupHeaders = signupsSheet.getRange(1, 1, 1, signupsSheet.getLastColumn()).getValues()[0];
    const allRows = signupsSheet.getDataRange().getValues();
    allRows.shift();

    const eventIdCol = signupHeaders.indexOf('event_id');
    const statusCol = signupHeaders.indexOf('status');
    const typeCol = signupHeaders.indexOf('type');
    const memberNameCol = signupHeaders.indexOf('member_name');

    const eventSignups = allRows.filter(r => String(r[eventIdCol]) === String(data.event_id));
    let confirmedCount = eventSignups.filter(r => r[statusCol] === 'confirmed').length;
    const existingMembers = new Set(
      eventSignups
        .filter(r => r[typeCol] === 'member' && (r[statusCol] === 'confirmed' || r[statusCol] === 'waitlist'))
        .map(r => r[memberNameCol])
    );

    const names = (data.names || []).filter((n, i, arr) => n && arr.indexOf(n) === i);
    let confirmedAdded = 0, waitlistAdded = 0, skipped = 0;
    const newRows = [];

    names.forEach(name => {
      if (existingMembers.has(name)) { skipped++; return; }
      let status;
      if (!capacity || confirmedCount < capacity) {
        status = 'confirmed';
        confirmedCount++;
        confirmedAdded++;
      } else if (overflowMode === 'waitlist') {
        status = 'waitlist';
        waitlistAdded++;
      } else {
        skipped++;
        return;
      }
      existingMembers.add(name);
      newRows.push(signupHeaders.map(h => {
        if (h === 'id') return generateId('su');
        if (h === 'event_id') return data.event_id;
        if (h === 'type') return 'member';
        if (h === 'member_name') return name;
        if (h === 'status') return status;
        if (h === 'created_at') return new Date();
        return '';
      }));
    });

    if (newRows.length > 0) {
      signupsSheet.getRange(signupsSheet.getLastRow() + 1, 1, newRows.length, signupHeaders.length).setValues(newRows);
    }

    return { success: true, confirmed: confirmedAdded, waitlist: waitlistAdded, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

// 取消報名。若取消的是已確認名額且該賽事開放候補,自動遞補最早的候補者。
function cancelSignup(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SIGNUPS_SHEET);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rows = sheet.getDataRange().getValues();

    const idCol = headers.indexOf('id');
    const eventIdCol = headers.indexOf('event_id');
    const statusCol = headers.indexOf('status');
    const createdAtCol = headers.indexOf('created_at');

    let targetRowIndex = -1;
    let targetEventId = null;
    let targetStatus = null;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol]) === String(data.id)) {
        targetRowIndex = i + 1;
        targetEventId = rows[i][eventIdCol];
        targetStatus = rows[i][statusCol];
        break;
      }
    }
    if (targetRowIndex < 0) return { success: false, reason: 'not_found' };

    sheet.getRange(targetRowIndex, statusCol + 1).setValue('cancelled');

    if (targetStatus === 'confirmed') {
      let earliestRow = -1;
      let earliestTime = null;
      for (let i = 1; i < rows.length; i++) {
        if (i + 1 === targetRowIndex) continue;
        if (String(rows[i][eventIdCol]) !== String(targetEventId)) continue;
        if (rows[i][statusCol] !== 'waitlist') continue;
        const created = rows[i][createdAtCol];
        if (earliestTime === null || new Date(created) < earliestTime) {
          earliestTime = new Date(created);
          earliestRow = i + 1;
        }
      }
      if (earliestRow > 0) {
        sheet.getRange(earliestRow, statusCol + 1).setValue('confirmed');
      }
    }

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// -------- 登入驗證 --------

function verifyLogin(data) {
  const username = (data && data.username) ? String(data.username).trim() : '';
  const password = (data && data.password) ? String(data.password) : '';
  if (!username || !password) return { success: false };

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(AUTH_SHEET);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const userCol = headers.indexOf('username');
  const passCol = headers.indexOf('password');
  if (userCol < 0 || passCol < 0) return { success: false, error: 'auth 分頁欄位設定不正確' };

  const matched = rows.some(r => String(r[userCol]).trim() === username && String(r[passCol]) === password);
  return { success: matched };
}

// -------- 編輯器內測試用 --------

function testGetMembers() {
  const fakeEvent = { parameter: { action: 'getMembers', month: '2026-07' } };
  const result = doGet(fakeEvent);
  Logger.log(result.getContent());
}

function testGetWeeks() {
  const fakeEvent = { parameter: { action: 'getWeeks' } };
  const result = doGet(fakeEvent);
  Logger.log(result.getContent());
}

function testGetEvents() {
  const fakeEvent = { parameter: { action: 'getEvents' } };
  const result = doGet(fakeEvent);
  Logger.log(result.getContent());
}

function testGetProfiles() {
  const fakeEvent = { parameter: { action: 'getProfiles' } };
  const result = doGet(fakeEvent);
  Logger.log(result.getContent());
}
