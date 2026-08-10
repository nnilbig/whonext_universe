// ============================================
// 球隊帳戶系統 - Google Apps Script 後端
// 部署方式:Sheet 內「擴充功能 > Apps Script」貼上此檔案
// 部署為「網頁應用程式」,執行身分選你自己,存取權限選「知道連結的任何人」或限定範圍
// 修改後務必:存檔 -> 部署 -> 管理部署作業 -> 編輯(鉛筆) -> 版本選「新版本」-> 部署
//
// events 分頁需要有 id / type / capacity / overflow_mode 欄位(手動加標題即可,id 會自動補值)
// 另外需要新增一個 signups 分頁,欄位標題:
//   id, event_id, type, member_name, guest_name, referrer, status, created_at
// 還需要一個 players 分頁(一人一列的球員身分主檔,跟 members 那種每月覆寫的
// 月繳名單分開),欄位標題:
//   line_user_id, display_name, custom_name, referrer, avatar_url, is_bound, can_create_events, is_admin, created_at
// line_user_id 是主鍵——LINE 唯一的用戶 ID(如 U123456...)，一個人一定要
// 先用 LINE 登入過才會有這一列，所以這個表裡不會有「舊名冊、還沒登入過」
// 的佔位列(那種名單改成即時從 members 歷史姓名撈，見 getRoster)。
//   display_name：LINE 目前的暱稱，每次登入可能改變。
//   custom_name：綁定的本名/綽號，是 members/signups 等其他表拿來對應
//     球員的鍵值(還沒遷移成 line_user_id 之前，全部都还是用這個)，註冊當下
//     就會填好，同名會被擋掉(見 registerLineProfile)。
//   is_bound：是否已完成舊資料綁定，目前註冊當下就一定會填 custom_name，
//     所以新建的列一律是 true；保留這個欄位是因為之後如果改成「先登入、
//     再另外綁舊資料」的兩步式流程，這裡就能派上用場。
// line_user_id 這個 column 沒加的話 lineLogin/registerLineProfile 會直接
// 回錯誤，不會壞掉其他功能。
// 這個表原本叫 profiles、用 Google 帳號登入，2026-08-10 全部改成 LINE
// 登入、line_user_id 當主鍵，舊表已經不用了。
// ============================================

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const WEEKS_SHEET = 'weeks';
const MEMBERS_SHEET = 'members';
const EVENTS_SHEET = 'events';
const SIGNUPS_SHEET = 'signups';
const PLAYERS_SHEET = 'players';
// 前端 LIFF SDK 用的 LIFF ID 是「{Channel ID}-{隨機碼}」，這裡只需要前面
// 那段 Channel ID 來驗證 id_token 的 aud。LINE 的 verify endpoint 只吃
// id_token + client_id 就能驗證簽章/效期，不像換 token 那樣需要 Channel
// Secret，所以整個後端完全不用碰到 LINE 的密鑰。
const LINE_CHANNEL_ID = '2011057691';

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
  } else if (action === 'getPlayers') {
    result = getPlayers();
  } else if (action === 'getRoster') {
    result = getRoster();
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
  } else if (action === 'signupEvent') {
    result = signupEvent(body.data);
  } else if (action === 'bulkSignupEvent') {
    result = bulkSignupEvent(body.data);
  } else if (action === 'cancelSignup') {
    result = cancelSignup(body.data);
  } else if (action === 'lineLogin') {
    result = lineLogin(body.data);
  } else if (action === 'registerLineProfile') {
    result = registerLineProfile(body.data);
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

// 驗證前端 LIFF SDK(liff.getIDToken())送來的 ID token，打 LINE 官方的
// verify endpoint 讓 LINE 幫忙驗簽章跟過期時間，這邊只要再確認 aud 是
// 我們自己的 Channel ID 即可。email 只有使用者的 LINE 帳號有綁定+驗證過
// 信箱、而且這個 channel 有申請到 email 權限時才會有值，可能是空字串，
// 呼叫端要自己處理「沒有 email」的情況。驗證失敗回傳 null。
function verifyLineIdToken(idToken) {
  if (!idToken) {
    Logger.log('verifyLineIdToken: 前端沒有送 idToken 過來（liff.getIDToken() 拿到空值）');
    return null;
  }
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: LINE_CHANNEL_ID },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('verifyLineIdToken: LINE verify 回傳 ' + res.getResponseCode() + '：' + res.getContentText());
    return null;
  }
  const info = JSON.parse(res.getContentText());
  if (info.aud !== LINE_CHANNEL_ID) {
    Logger.log('verifyLineIdToken: aud 不符，token 的 aud 是「' + info.aud + '」，設定的 LINE_CHANNEL_ID 是「' + LINE_CHANNEL_ID + '」');
    return null;
  }
  if (!info.sub) {
    Logger.log('verifyLineIdToken: verify 回傳沒有 sub：' + res.getContentText());
    return null;
  }
  return { sub: info.sub, name: info.name || '', picture: info.picture || '', email: info.email || '' };
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

// 球員身分主檔(一人一列，line_user_id 當主鍵),跟 members 那種每月覆寫的
// 月繳名單分開存放，才不會每次存月繳都要記得把身分欄位一起帶回去。
function getPlayers() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PLAYERS_SHEET);
  if (!sheet) return { players: [] };
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();

  const players = rows
    .filter(r => r[0])
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = normalizeDateValue(r[i]);
      });
      return obj;
    });

  return { players };
}

// line_user_id 比對 players，找到就回傳整列資料(物件)，找不到回傳 null。
// line_user_id 這個 column 還沒手動加進表格的話直接回傳 null，不要噴錯。
function findPlayerByLineId(lineUserId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PLAYERS_SHEET);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const lineIdCol = headers.indexOf('line_user_id');
  if (lineIdCol < 0) return null;

  const row = rows.find(r => r[lineIdCol] && String(r[lineIdCol]) === String(lineUserId));
  if (!row) return null;
  const player = {};
  headers.forEach((h, i) => { player[h] = row[i]; });
  return player;
}

// 「登入」用的 LINE 快速登入：只認已經綁定過的帳號(line_user_id 對得到)，
// 對不到就請前端導去「註冊」流程，不在這裡自動配對/建檔(那是註冊的事)。
function lineLogin(data) {
  const account = verifyLineIdToken(data && data.idToken);
  if (!account) return { success: false, reason: 'invalid_token' };

  const player = findPlayerByLineId(account.sub);
  if (player) return { success: true, matched: true, profile: player };
  return { success: true, matched: false, account: account };
}

// 合併「members 歷史上出現過的所有姓名」跟「players 目前的綁定狀態」，
// 給球員清單(member.html)、手動建活動的出席名單(index.html)這種需要
// 列出「還沒登入過 LINE 的舊球員」的畫面用——players 表本身因為
// line_user_id 是主鍵，沒辦法再放「還沒綁定」的佔位列，所以這裡改成
// 即時從 members 撈全部出現過的姓名，再對照 players.custom_name 補上
// 是否已綁定/大頭貼/管理員等資訊。custom_name 已綁定但可能還沒出現在
// members 裡的人(例如剛註冊、還沒繳過月費)也會被列進去。
function getRoster() {
  const membersSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(MEMBERS_SHEET);
  const memberRows = membersSheet.getDataRange().getValues();
  const memberHeaders = memberRows.shift();
  const memberNameCol = memberHeaders.indexOf('name');
  const allNames = new Set();
  memberRows.forEach(r => { if (r[memberNameCol]) allNames.add(String(r[memberNameCol])); });

  const playersSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PLAYERS_SHEET);
  const boundByName = {};
  if (playersSheet) {
    const playerRows = playersSheet.getDataRange().getValues();
    const playerHeaders = playerRows.shift();
    const customNameCol = playerHeaders.indexOf('custom_name');
    if (customNameCol >= 0) {
      playerRows.forEach(r => {
        const customName = r[customNameCol];
        if (!customName) return;
        allNames.add(String(customName));
        const entry = {};
        playerHeaders.forEach((h, i) => { entry[h] = r[i]; });
        boundByName[String(customName)] = entry;
      });
    }
  }

  const roster = Array.from(allNames).sort((a, b) => a.localeCompare(b)).map(name => {
    const bound = boundByName[name];
    return {
      name: name,
      is_bound: !!bound,
      line_user_id: bound ? bound.line_user_id : '',
      display_name: bound ? bound.display_name : '',
      avatar_url: bound ? bound.avatar_url : '',
      is_admin: bound ? bound.is_admin : false,
      can_create_events: bound ? bound.can_create_events : false
    };
  });

  return { roster };
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

// 註冊流程：使用者在「選擇暱稱」欄位手動挑/打了一個名字(custom_name)，
// 一定是新建一筆 players(line_user_id 是主鍵，這個 LINE 帳號不可能已經
// 有列卻沒被 lineLogin 比對到)：
//   - 這個 LINE 帳號(line_user_id)已經有列 -> already_bound，請改用「登入」
//   - custom_name 撞到別人已經在用的名字 -> name_taken，換一個
//   - 都沒問題 -> 新增一列，is_bound 直接是 true(見檔案開頭欄位說明)
function registerLineProfile(data) {
  const account = verifyLineIdToken(data && data.idToken);
  if (!account) return { success: false, reason: 'invalid_token' };
  const name = String((data && data.name) || '').trim();
  if (!name) return { success: false, reason: 'missing_name' };

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PLAYERS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = sheet.getDataRange().getValues();
  const customNameCol = headers.indexOf('custom_name');
  const lineIdCol = headers.indexOf('line_user_id');
  if (lineIdCol < 0) return { success: false, reason: 'missing_line_user_id_column' };

  const alreadyBound = rows.slice(1).some(r => r[lineIdCol] && String(r[lineIdCol]) === String(account.sub));
  if (alreadyBound) return { success: false, reason: 'already_bound' };

  // custom_name 是整個系統拿來對應報名/賽事發起人的鍵值，同名會撞到別人
  // 的資料，這裡擋掉並請使用者換個暱稱，不要靜默改名造成混淆。
  const nameTaken = rows.slice(1).some(r => r[customNameCol] === name);
  if (nameTaken) return { success: false, reason: 'name_taken' };

  const updates = {
    line_user_id: account.sub,
    display_name: account.name || '',
    custom_name: name,
    avatar_url: account.picture || '',
    is_bound: true,
    can_create_events: false,
    is_admin: false,
    created_at: new Date()
  };

  const newRow = headers.map(h => updates[h] !== undefined ? updates[h] : '');
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([newRow]);

  return { success: true, profile: updates };
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

function testGetPlayers() {
  const fakeEvent = { parameter: { action: 'getPlayers' } };
  const result = doGet(fakeEvent);
  Logger.log(result.getContent());
}
