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
//   player_id, custom_name, bound_name, email, google_id, photo_url,
//   line_user_id, avatar_url, referrer, is_bound, can_create_events,
//   is_admin, created_at
// player_id 才是真正的主鍵——一個 UUID(Utilities.getUuid())，註冊當下
// 產生一次、永不變動，其他表以後要關聯球員也是用這個，不是用
// google_id/line_user_id(那兩個只是「目前綁定了哪些登入方式」)。故意
// 不用循序數字，Apps Script 沒有跨併發請求的原子遞增，循序 ID 也容易被
// 列舉猜測。
//   google_id / email / photo_url 是 Google 那組綁定欄位，
//   line_user_id / avatar_url 是 LINE 那組，兩組互相獨立、都可以是空的，
//   但一個 player_id 兩組都可以同時綁——見 linkProviderProfile。頭像要
//   顯示哪一張由「這次用哪個 provider 登入」決定(photo_url 或
//   avatar_url)，不是另外存一個「目前頭像」。provider 給的原始顯示名稱
//   故意不存(以前叫 line_display_name/google_display_name，已移除)——
//   custom_name 註冊當下就會用那個名稱頂著，沒必要再多存一份重複資料。
//   custom_name 跟 bound_name 是兩個不同用途、故意分開的欄位：
//     custom_name 是「目前顯示用的暱稱」，註冊當下就會填好(沒特別選就先
//       用 Google/LINE 顯示名稱頂著)，之後如果做了改名功能，改的是這個
//       欄位，同名會被擋掉(見 registerLineProfile/registerGoogleProfile)。
//     bound_name 是「真正拿去比對 members/signups 舊資料的鍵值」，只有
//       綁定舊資料時才會寫入(見 bindCustomName)，寫入後就固定不再變，
//       就算之後 custom_name 改名也不會影響舊資料的對應關係。
//     兩者故意不互相覆蓋——custom_name 可以自由改而不動到歷史資料的
//     對應，bound_name 一旦綁定就是穩定的歷史鍵值。
//     同一個 bound_name 最多允許兩列共用：一列用 google_id 綁的、一列用
//     line_id 綁的(同一人跨帳號連結前，分別用兩個 provider 各自綁了同一
//     個舊暱稱)。已跨帳號連結(google_id 和 line_id 都有)的列視為佔滿兩
//     個名額，見 bindCustomName/playerProviderSlots_。
//   is_bound：bound_name 是否已經填好(已完成舊資料綁定)。新註冊的列
//     一律是 false，只有 bindCustomName 成功之後才會變 true。
// line_user_id/google_id 這兩個 column 沒加的話對應的 login/register
// action 會直接回錯誤，不會壞掉其他功能。
// 加綁第二個 provider(例如已經用 LINE 註冊過的人想再多綁 Gmail)一定要
// 先登入，在前端「帳號綁定」面板操作(linkProviderProfile)，不是在匿名
// 的註冊流程用同名自動合併——同名自動合併等於任何人都能打別人的暱稱去
// 「認領」別人的帳號，故意不做。
// 這個表原本叫 profiles、用 Google 帳號登入，後來一度改成只用 LINE、
// line_user_id 當主鍵，2026-08-10 再改回「Google + LINE 雙軌都能綁」，
// player_id 才是主鍵。既有列(改欄位之前建的)如果沒有 player_id，
// login/register 這幾支 function 會自動補一個寫回去(見 ensurePlayerId)，
// 不用另外跑遷移腳本。
// ============================================

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const WEEKS_SHEET = 'weeks';
const MEMBERS_SHEET = 'members';
const EVENTS_SHEET = 'events';
const SIGNUPS_SHEET = 'signups';
const PLAYERS_SHEET = 'players';
// 前端 identity-picker.js 用的同一組 Google OAuth Client ID，驗證 ID token
// 時要確認 token 的 aud 等於這個值，不然任何 Google 專案簽出來的 token 都會過。
const GOOGLE_CLIENT_ID = '702772011583-5g00roumo9mgruijtn3jhg525bot1cja.apps.googleusercontent.com';
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
  } else if (action === 'googleLogin') {
    result = googleLogin(body.data);
  } else if (action === 'registerGoogleProfile') {
    result = registerGoogleProfile(body.data);
  } else if (action === 'linkProviderProfile') {
    result = linkProviderProfile(body.data);
  } else if (action === 'bindCustomName') {
    result = bindCustomName(body.data);
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

// 驗證前端 Google Identity Services 送來的 ID token(JWT)，不能只信任前端
// 解出來的內容 —— 打 Google 官方的 tokeninfo endpoint，讓 Google 幫忙驗簽章
// 跟過期時間，這邊只要再確認 aud 是我們自己的 Client ID、email 有驗證過即可。
// 驗證失敗回傳 null。
function verifyGoogleCredential(credential) {
  if (!credential) return null;
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) return null;
  const info = JSON.parse(res.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID) return null;
  if (info.email_verified !== 'true' && info.email_verified !== true) return null;
  if (!info.email || !info.sub) return null;
  return { sub: info.sub, name: info.name || '', picture: info.picture || '', email: info.email };
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

// 球員身分主檔(一人一列，player_id 當主鍵),跟 members 那種每月覆寫的
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

// 用某個欄位(line_user_id/google_id/player_id)比對 players，找到就回傳
// { player, rowIndex, headers, sheet }(rowIndex 是試算表列號，1-based，
// 含標題列)，找不到回傳 null。回傳 rowIndex/headers/sheet 是為了
// ensurePlayerId/linkProviderProfile 可以直接寫回那一列，不用再查一次。
// 這個欄位還沒手動加進表格的話直接回傳 null，不要噴錯。
function findPlayerRowByField(fieldName, value) {
  if (!value) return null;
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PLAYERS_SHEET);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const col = headers.indexOf(fieldName);
  if (col < 0) return null;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][col] && String(rows[i][col]) === String(value)) {
      const player = {};
      headers.forEach((h, j) => { player[h] = rows[i][j]; });
      return { player: player, rowIndex: i + 2, headers: headers, sheet: sheet };
    }
  }
  return null;
}

// 既有列(schema 改成 player_id 當主鍵之前建的)可能沒有 player_id，
// login 的時候順手補一個寫回去，不用另外跑遷移腳本。player_id 這個
// column 還沒手動加的話就不硬寫，回傳空字串。
function ensurePlayerId(found) {
  if (found.player.player_id) return found.player.player_id;
  const idCol = found.headers.indexOf('player_id');
  if (idCol < 0) return '';
  const id = Utilities.getUuid();
  found.sheet.getRange(found.rowIndex, idCol + 1).setValue(id);
  found.player.player_id = id;
  return id;
}

// 「登入」用的 LINE 快速登入：只認已經綁定過的帳號(line_user_id 對得到)，
// 對不到就請前端導去「註冊」流程，不在這裡自動配對/建檔(那是註冊的事)。
function lineLogin(data) {
  const account = verifyLineIdToken(data && data.idToken);
  if (!account) return { success: false, reason: 'invalid_token' };

  const found = findPlayerRowByField('line_user_id', account.sub);
  if (!found) return { success: true, matched: false, account: account };
  ensurePlayerId(found);
  return { success: true, matched: true, profile: found.player };
}

// 「登入」用的 Google 快速登入，跟 lineLogin 對稱。
function googleLogin(data) {
  const account = verifyGoogleCredential(data && data.credential);
  if (!account) return { success: false, reason: 'invalid_token' };

  const found = findPlayerRowByField('google_id', account.sub);
  if (!found) return { success: true, matched: false, account: account };
  ensurePlayerId(found);
  return { success: true, matched: true, profile: found.player };
}

// 合併「members 歷史上出現過的所有姓名」跟「players 目前的綁定狀態」，
// 給球員清單(member.html)、手動建活動的出席名單(index.html)、註冊時的
// 「舊暱稱」選單(identity-picker.js)這種需要分辨「哪些舊球員還沒被真人
// 登入認領」的畫面用。撈全部 members 出現過的姓名，再對照
// players.bound_name(不是 custom_name——custom_name 只是顯示用的暱稱，
// 還沒綁定舊資料的人也會有，不代表「這個歷史姓名已經被認領」)補上是否
// 已綁定/大頭貼/管理員等資訊。bound_name 已綁定但可能還沒出現在 members
// 裡的人(例如剛註冊、還沒繳過月費)也會被列進去。
// 這裡回傳的 is_bound 故意不是「players 表有沒有這一列」，而是「這一列
// 有沒有 google_id/line_user_id(真的有人登入過)」：migrate_names_to_
// players.gs 會幫每個舊姓名先建一筆佔位列(只填 bound_name，方便掛
// wallet_balance/is_monthly_member 之類的未來欄位)，這種佔位列不代表
// 真的有人登入認領了這個名字，如果直接拿「有沒有這一列」當 is_bound，
// 佔位列建完之後這個舊姓名就會從「舊暱稱」選單消失、member.html 也會
// 誤標成「已註冊」，兩邊都是錯的。
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
    const boundNameCol = playerHeaders.indexOf('bound_name');
    if (boundNameCol >= 0) {
      playerRows.forEach(r => {
        const boundName = r[boundNameCol];
        if (!boundName) return;
        allNames.add(String(boundName));
        const entry = {};
        playerHeaders.forEach((h, i) => { entry[h] = r[i]; });
        boundByName[String(boundName)] = entry;
      });
    }
  }

  // 故意不重新排序——維持 allNames 塞入的順序(members 分頁列出現的
  // 先後，再接 players 分頁裡還沒出現在 members 過的 bound_name)，讓
  // 前端拿到的順序就是 Sheet 本身的順序，需要別種排序(例如 member.html
  // 的字母排序)由各自畫面自己排，不要在這裡幫全部呼叫端決定。
  const roster = Array.from(allNames).map(name => {
    const bound = boundByName[name];
    const hasLogin = !!(bound && (bound.google_id || bound.line_user_id));
    return {
      name: name,
      is_bound: hasLogin,
      line_user_id: bound ? bound.line_user_id : '',
      google_id: bound ? bound.google_id : '',
      display_name: bound ? bound.custom_name : '',
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

// 沒有指定暱稱時（新版註冊流程：選完 Google/LINE 驗證身分就直接建檔、
// 進畫面，暱稱綁定是後面可以略過的一步）用 provider 給的顯示名稱頂著
// 用；撞到已經有人在用的 custom_name 就自動加數字尾碼，不要因為撞名
// 擋住「直接進畫面」——這是系統自動選的，不是使用者自己打的，不用像
// 使用者手動輸入暱稱（見 bindCustomName）那樣嚴格擋掉重來。
function pickUniqueCustomName(rows, customNameCol, desired) {
  const base = String(desired || '').trim() || '玩家';
  const existing = new Set(rows.slice(1).map(r => r[customNameCol]).filter(Boolean).map(String));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(base + i)) i++;
  return base + i;
}

// 註冊流程：驗證 Google/LINE 身分就直接建一筆新的 players(player_id 是
// 主鍵，這個 LINE 帳號不可能已經有列卻沒被 lineLogin 比對到)：
//   - 這個 LINE 帳號(line_user_id)已經有列 -> already_bound，請改用「登入」
//   - 前端有帶暱稱(data.name，使用者自己選擇要綁)且撞到別人已經綁走的
//     bound_name -> name_taken，換一個
//   - 都沒問題 -> 新增一列。有帶暱稱的話 custom_name/bound_name 都設成
//     這個名字、is_bound:true(等於註冊當下就順便綁了)；沒帶暱稱的話
//     custom_name 用 LINE 顯示名稱頂著、bound_name 留空、is_bound:false，
//     之後可以用 bindCustomName 補真正要綁的暱稱。
// 「已經用 Google 註冊過的人想再多綁 LINE」不是這裡處理——那要先登入，
// 到「帳號綁定」面板用 linkProviderProfile，不是靠同名自動合併(同名
// 自動合併等於任何人都能打別人的暱稱去「認領」別人的帳號)。
function registerLineProfile(data) {
  const account = verifyLineIdToken(data && data.idToken);
  if (!account) return { success: false, reason: 'invalid_token' };

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PLAYERS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = sheet.getDataRange().getValues();
  const customNameCol = headers.indexOf('custom_name');
  const boundNameCol = headers.indexOf('bound_name');
  const lineIdCol = headers.indexOf('line_user_id');
  const googleIdCol = headers.indexOf('google_id');
  if (lineIdCol < 0) return { success: false, reason: 'missing_line_user_id_column' };
  // player_id 是主鍵，這欄位如果不存在，headers.map() 寫新列時會靜默漏
  // 寫這一格(不會噴錯)，後面 bindCustomName/linkProviderProfile 都靠這個
  // 欄位找人，漏寫會變成「明明剛註冊，綁暱稱卻找不到 player_not_found」
  // 這種難查的狀況——寧可在這裡直接擋掉，也不要默默建一筆壞資料。
  if (headers.indexOf('player_id') < 0) return { success: false, reason: 'missing_player_id_column' };

  const alreadyBound = rows.slice(1).some(r => r[lineIdCol] && String(r[lineIdCol]) === String(account.sub));
  if (alreadyBound) return { success: false, reason: 'already_bound' };

  const typedName = String((data && data.name) || '').trim();

  // 有帶暱稱的話，先看這個暱稱是不是剛好對到一筆遷移腳本建的舊球員
  // 佔位列(bound_name 對得上、完全沒綁過任何 provider)——有的話直接把
  // 這次登入的 LINE 資訊寫回那一列，不要另外新開一列，不然佔位列上以後
  // 掛的資料(is_monthly_member/wallet_balance 之類)就永遠接不回本人。
  if (typedName && boundNameCol >= 0) {
    const claim = findClaimablePlaceholder_(rows, boundNameCol, googleIdCol, lineIdCol, typedName, 'line');
    if (!claim.ok) return { success: false, reason: 'name_taken' };
    if (claim.rowIndex > 0) {
      const claimUpdates = { line_user_id: account.sub, avatar_url: account.picture || '' };
      Object.keys(claimUpdates).forEach(h => {
        const col = headers.indexOf(h);
        if (col >= 0) sheet.getRange(claim.rowIndex, col + 1).setValue(claimUpdates[h]);
      });
      const profile = {};
      headers.forEach((h, i) => { profile[h] = claimUpdates[h] !== undefined ? claimUpdates[h] : rows[claim.rowIndex - 1][i]; });
      return { success: true, claimed: true, profile: profile };
    }
  }

  let customName, boundName = '', isBound = false;
  if (typedName) {
    customName = typedName;
    boundName = typedName;
    isBound = true;
  } else {
    customName = pickUniqueCustomName(rows, customNameCol, account.name);
  }

  const updates = {
    player_id: Utilities.getUuid(),
    line_user_id: account.sub,
    custom_name: customName,
    bound_name: boundName,
    avatar_url: account.picture || '',
    is_bound: isBound,
    can_create_events: false,
    is_admin: false,
    created_at: new Date()
  };

  const newRow = headers.map(h => updates[h] !== undefined ? updates[h] : '');
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([newRow]);

  return { success: true, profile: updates };
}

// 註冊流程（Google 版），邏輯跟 registerLineProfile 對稱，只是換一組
// 欄位(google_id/email/photo_url)寫入，同一套 player_id/custom_name/
// bound_name 規則（含「沒帶暱稱就用顯示名稱頂著」）。
function registerGoogleProfile(data) {
  const account = verifyGoogleCredential(data && data.credential);
  if (!account) return { success: false, reason: 'invalid_token' };

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PLAYERS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = sheet.getDataRange().getValues();
  const customNameCol = headers.indexOf('custom_name');
  const boundNameCol = headers.indexOf('bound_name');
  const googleIdCol = headers.indexOf('google_id');
  const lineIdCol = headers.indexOf('line_user_id');
  if (googleIdCol < 0) return { success: false, reason: 'missing_google_id_column' };
  if (headers.indexOf('player_id') < 0) return { success: false, reason: 'missing_player_id_column' };

  const alreadyBound = rows.slice(1).some(r => r[googleIdCol] && String(r[googleIdCol]) === String(account.sub));
  if (alreadyBound) return { success: false, reason: 'already_bound' };

  const typedName = String((data && data.name) || '').trim();

  // 跟 registerLineProfile 對稱：暱稱剛好對到一筆還沒綁過任何 provider
  // 的舊佔位列，就直接認領那一列，不要另開新列。
  if (typedName && boundNameCol >= 0) {
    const claim = findClaimablePlaceholder_(rows, boundNameCol, googleIdCol, lineIdCol, typedName, 'google');
    if (!claim.ok) return { success: false, reason: 'name_taken' };
    if (claim.rowIndex > 0) {
      const claimUpdates = { google_id: account.sub, email: account.email || '', photo_url: account.picture || '' };
      Object.keys(claimUpdates).forEach(h => {
        const col = headers.indexOf(h);
        if (col >= 0) sheet.getRange(claim.rowIndex, col + 1).setValue(claimUpdates[h]);
      });
      const profile = {};
      headers.forEach((h, i) => { profile[h] = claimUpdates[h] !== undefined ? claimUpdates[h] : rows[claim.rowIndex - 1][i]; });
      return { success: true, claimed: true, profile: profile };
    }
  }

  let customName, boundName = '', isBound = false;
  if (typedName) {
    customName = typedName;
    boundName = typedName;
    isBound = true;
  } else {
    customName = pickUniqueCustomName(rows, customNameCol, account.name);
  }

  const updates = {
    player_id: Utilities.getUuid(),
    google_id: account.sub,
    email: account.email || '',
    photo_url: account.picture || '',
    custom_name: customName,
    bound_name: boundName,
    is_bound: isBound,
    can_create_events: false,
    is_admin: false,
    created_at: new Date()
  };

  const newRow = headers.map(h => updates[h] !== undefined ? updates[h] : '');
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([newRow]);

  return { success: true, profile: updates };
}

// 註冊當下略過暱稱綁定的人，之後在「要不要綁定暱稱」畫面補真正要用的
// 舊資料暱稱——寫的是 bound_name，不是 custom_name，兩者故意分開(見
// 檔案開頭欄位說明)：bound_name 才是 members/signups 比對用的鍵值，
// 一綁定就固定，不會因為 custom_name 之後改名而跟著變動。只認
// player_id（前端已登入才知道這個值），bound_name 撞到別人（不是自己
// 這個 player_id）已經綁走的名字就擋掉。
// 同一個 bound_name 最多只能被兩列佔用：一列用 google_id 綁的、一列用
// line_id 綁的(同一個人在跨帳號連結之前，用兩個 provider 分別註冊、各自
// 綁了同一個舊暱稱)。已經跨帳號連結(google_id 和 line_id 都有)的列視為
// 一次佔滿兩個名額，不能再讓任何其他列共用同一個 bound_name。
function playerProviderSlots_(row, googleIdCol, lineIdCol) {
  const hasGoogle = googleIdCol >= 0 && !!row[googleIdCol];
  const hasLine = lineIdCol >= 0 && !!row[lineIdCol];
  if (hasGoogle && hasLine) return ['google', 'line'];
  if (hasGoogle) return ['google'];
  if (hasLine) return ['line'];
  return [];
}

// 註冊時(registerLineProfile/registerGoogleProfile)判斷某個要綁的
// bound_name 該怎麼處理：
//   { ok: false } —— 這個 provider 的名額已經被佔走，註冊要擋下來(name_taken)
//   { ok: true, rowIndex: -1 } —— 沒有衝突，正常新增一列就好
//   { ok: true, rowIndex: N } —— 對到一筆完全沒綁過任何 provider 的舊
//     佔位列(遷移腳本建的)，rowIndex 是該列的試算表列號(1-based)，呼叫端
//     應該直接把這次登入的 provider 資訊寫回那一列，不要新增列。
// rows 是含標題列的完整陣列(sheet.getDataRange().getValues() 的原始輸出)。
function findClaimablePlaceholder_(rows, boundNameCol, googleIdCol, lineIdCol, name, provider) {
  const takenSlots = [];
  let placeholderRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[boundNameCol] !== name) continue;
    const slots = playerProviderSlots_(r, googleIdCol, lineIdCol);
    takenSlots.push.apply(takenSlots, slots);
    if (slots.length === 0 && placeholderRowIndex < 0) placeholderRowIndex = i + 1;
  }
  if (takenSlots.indexOf(provider) >= 0) return { ok: false };
  return { ok: true, rowIndex: placeholderRowIndex };
}

function bindCustomName(data) {
  const playerId = String((data && data.player_id) || '').trim();
  const name = String((data && data.name) || '').trim();
  if (!playerId) return { success: false, reason: 'missing_player_id' };
  if (!name) return { success: false, reason: 'missing_name' };

  const target = findPlayerRowByField('player_id', playerId);
  if (!target) return { success: false, reason: 'player_not_found' };

  const boundNameCol = target.headers.indexOf('bound_name');
  if (boundNameCol < 0) return { success: false, reason: 'missing_bound_name_column' };
  const googleIdCol = target.headers.indexOf('google_id');
  const lineIdCol = target.headers.indexOf('line_user_id');
  const rows = target.sheet.getDataRange().getValues();
  rows.shift();
  const playerIdCol = target.headers.indexOf('player_id');

  const selfSlots = (target.player.google_id && target.player.line_user_id) ? ['google', 'line']
    : target.player.google_id ? ['google']
    : target.player.line_user_id ? ['line'] : [];
  const takenSlots = [];
  let placeholderRowIndex = -1; // 對到的舊佔位列(完全沒綁過任何 provider)的試算表列號，找不到是 -1
  rows.forEach((r, i) => {
    if (r[boundNameCol] !== name || String(r[playerIdCol]) === playerId) return;
    const slots = playerProviderSlots_(r, googleIdCol, lineIdCol);
    takenSlots.push(...slots);
    if (slots.length === 0 && placeholderRowIndex < 0) placeholderRowIndex = i + 2; // rows 已經 shift 掉標題列，陣列 index 0 對應試算表第 2 列
  });
  const nameTaken = selfSlots.some(slot => takenSlots.includes(slot)) || takenSlots.length + selfSlots.length > 2;
  if (nameTaken) return { success: false, reason: 'name_taken' };

  target.sheet.getRange(target.rowIndex, boundNameCol + 1).setValue(name);
  const isBoundCol = target.headers.indexOf('is_bound');
  if (isBoundCol >= 0) target.sheet.getRange(target.rowIndex, isBoundCol + 1).setValue(true);
  target.player.bound_name = name;
  target.player.is_bound = true;

  // 這個名字剛好對到一筆舊佔位列(遷移腳本建的、還沒被任何人登入認領)——
  // 把佔位列上「本人這一列還是空的」欄位搬過去(以後 is_monthly_member/
  // wallet_balance 這類欄位就是靠這裡接回本人)，再刪掉佔位列，避免同一個
  // 人留著兩列、佔位列上的資料變成永遠接不回來的孤兒。
  if (placeholderRowIndex > 0) {
    mergePlaceholderIntoTarget_(target, rows[placeholderRowIndex - 2], placeholderRowIndex);
  }

  return { success: true, profile: target.player };
}

// 把佔位列裡，本人那一列目前還是空值的欄位補過去(已經有值的欄位不覆蓋)，
// 然後刪掉佔位列。身分相關欄位(player_id/google_id/line_user_id/
// custom_name/bound_name/is_bound/created_at/avatar_url/photo_url/email)
// 故意跳過不搬——這些本人那一列已經是正確的值，不該被佔位列的空值蓋掉。
function mergePlaceholderIntoTarget_(target, placeholderRow, placeholderRowIndex) {
  const skip = ['player_id', 'google_id', 'line_user_id', 'custom_name', 'bound_name', 'is_bound', 'created_at', 'avatar_url', 'photo_url', 'email'];
  target.headers.forEach((h, i) => {
    if (skip.indexOf(h) >= 0) return;
    const current = target.player[h];
    const placeholderVal = placeholderRow[i];
    const currentIsEmpty = current === '' || current === undefined || current === null;
    const placeholderHasValue = placeholderVal !== '' && placeholderVal !== undefined && placeholderVal !== null;
    if (currentIsEmpty && placeholderHasValue) {
      target.sheet.getRange(target.rowIndex, i + 1).setValue(placeholderVal);
      target.player[h] = placeholderVal;
    }
  });
  target.sheet.deleteRow(placeholderRowIndex);
}

// 已登入狀態下，在個人頁「帳號綁定」面板多綁一個 provider(例如已經用
// LINE 註冊過的人想再多綁 Gmail)。前端直接送 player_id 指定要綁到哪一
// 列——跟 signupEvent 這些 action 一樣，是整個後端採用的信任等級(前端
// 傳什麼 ID 就信什麼，沒有伺服器端 session 可以再驗證「這個 player_id
// 真的是你」)，不是這裡特別鬆。真正擋壞事的是：要綁定的那個 provider
// 帳號一定要能通過 verifyGoogleCredential/verifyLineIdToken，不能亂填
// google_id/line_user_id，而且那個帳號不能是「別人已經綁走的」。
function linkProviderProfile(data) {
  const playerId = String((data && data.player_id) || '').trim();
  const provider = data && data.provider;
  if (!playerId) return { success: false, reason: 'missing_player_id' };
  if (provider !== 'google' && provider !== 'line') return { success: false, reason: 'invalid_provider' };

  const account = provider === 'google'
    ? verifyGoogleCredential(data && data.token)
    : verifyLineIdToken(data && data.token);
  if (!account) return { success: false, reason: 'invalid_token' };

  const idField = provider === 'google' ? 'google_id' : 'line_user_id';
  const boundElsewhere = findPlayerRowByField(idField, account.sub);
  if (boundElsewhere && String(boundElsewhere.player.player_id) !== playerId) {
    return { success: false, reason: 'already_bound' };
  }

  const target = findPlayerRowByField('player_id', playerId);
  if (!target) return { success: false, reason: 'player_not_found' };

  const updates = provider === 'google'
    ? { google_id: account.sub, email: account.email || '', photo_url: account.picture || '' }
    : { line_user_id: account.sub, avatar_url: account.picture || '' };

  Object.keys(updates).forEach(h => {
    const col = target.headers.indexOf(h);
    if (col >= 0) target.sheet.getRange(target.rowIndex, col + 1).setValue(updates[h]);
  });
  Object.assign(target.player, updates);

  return { success: true, profile: target.player };
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
