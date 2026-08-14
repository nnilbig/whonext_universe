// ---------------------------------------------------------------
// 共用後台連線層（Google Apps Script）+ sessionStorage 快取
// 所有頁面共用同一個 BACKEND_URL，先讀快取立刻顯示，同時背景重新
// 抓取最新資料（stale-while-revalidate），首頁會預先暖機常用資料。
// ---------------------------------------------------------------
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbzCwIsVGD-GWldh8AyMhtcCDdmzno4YHyyA6zhHysZA8hHH4lYQ0SzNCYdUCH68alPr/exec';
const API_CACHE_PREFIX = 'whonext_api_';

function apiGet(params){
  return fetch(BACKEND_URL + '?' + new URLSearchParams(params).toString())
    .then(res=> res.json());
}
function apiPost(action, data){
  return fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, data })
  }).then(res=> res.json());
}

function apiCacheKey(params){
  return API_CACHE_PREFIX + new URLSearchParams(params).toString();
}
function getApiCache(params){
  try{
    const raw = sessionStorage.getItem(apiCacheKey(params));
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}
function setApiCache(params, result){
  try{ sessionStorage.setItem(apiCacheKey(params), JSON.stringify(result)); } catch(e){}
}

// 背景預拓：只負責把資料存進快取，呼叫方（例如首頁）不需要處理結果。
function apiPrefetch(params){
  apiGet(params).then(function(result){ setApiCache(params, result); }).catch(function(){});
}

// 頭像顯示文字：姓名開頭是「小」的話（如「小白」）跳過取下一個字（顯示「白」），
// 避免暱稱類姓名的頭像全部撞成同一個「小」字。
function avatarInitial(name){
  const n = String(name || '').trim();
  if(n.charAt(0) === '小' && n.length > 1) return n.charAt(1);
  return n.slice(0, 1);
}

// ---------------------------------------------------------------
// Google Identity Services 共用載入器。identity-picker.js（球員登入／
// 註冊／綁定）要用到 GIS 的按鈕，共用同一份 script 標籤跟 ready
// callback queue，避免重複注入。跟 WhonextLiff 對稱。
// ---------------------------------------------------------------
window.WhonextGis = (function(){
  var ready = false;
  var queue = [];
  function onReady(cb){
    if(ready){ cb(); return; }
    queue.push(cb);
  }
  if(!document.getElementById('google-identity-services')){
    // 先把 accounts.google.com 的連線（DNS/TLS）預先建好，之後不管是
    // script 本身還是按鈕渲染要用的 iframe，都不用重新握手，減少開登入
    // 視窗時 Google 按鈕從佔位文字換成真的按鈕那一下的延遲／跳動。
    ['preconnect', 'dns-prefetch'].forEach(function(rel){
      var link = document.createElement('link');
      link.rel = rel;
      link.href = 'https://accounts.google.com';
      if(rel === 'preconnect') link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
    var s = document.createElement('script');
    s.id = 'google-identity-services';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = function(){
      ready = true;
      queue.forEach(function(cb){ cb(); });
      queue = [];
    };
    document.head.appendChild(s);
  }
  return { onReady: onReady };
})();

// ---------------------------------------------------------------
// LINE LIFF SDK 共用載入器，跟 WhonextGis 對稱：identity-picker.js 需要
// 用到（點了「使用 LINE 登入/註冊」，或從 LINE 導回來要接續驗證）才動態
// 載入 script + liff.init()，不在每個頁面都預先載入。LIFF ID 裡「-」
// 前面那段數字就是 LINE Login channel 的 Channel ID，後端驗證 id_token
// 的 aud 也是用同一個值（見 gas/Code.gs 的 LINE_CHANNEL_ID）。
// ---------------------------------------------------------------
window.WhonextLiff = (function(){
  var LIFF_ID = '2011057691-idAgcBj9';
  var ready = false;
  var failed = false;
  var queue = [];

  function flush(){
    var cbs = queue; queue = [];
    cbs.forEach(function(cb){ cb(); });
  }

  function load(){
    if (document.getElementById('line-liff-sdk')) return;
    var s = document.createElement('script');
    s.id = 'line-liff-sdk';
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = function(){
      liff.init({ liffId: LIFF_ID }).then(function(){
        ready = true;
        flush();
      }).catch(function(err){
        console.error('liff.init failed:', err);
        failed = true;
        flush();
      });
    };
    s.onerror = function(){ failed = true; flush(); };
    document.head.appendChild(s);
  }

  return {
    // cb 會在 SDK 載入＋liff.init() 完成後才執行；init 失敗（例如沒網路）
    // 也會呼叫一次 cb，呼叫方要用 isReady() 判斷要不要往下走，不要假設
    // 呼叫到就代表成功。
    ensureReady: function(cb){
      if (ready || failed) { cb(); return; }
      queue.push(cb);
      load();
    },
    isReady: function(){ return ready; },
    isLoggedIn: function(){ return ready && liff.isLoggedIn(); },
    // true 只代表「這是真的透過 liff.line.me/... 連結啟動的 LIFF session」，
    // 跟「UA 裡有沒有 Line/」是兩件事——把一般網址貼到 LINE 對話裡開啟，
    // UA 一樣會有 Line/，但這裡會是 false。identity-picker.js 靠這個分辨
    // 「正常 LIFF 進站、應該放行」還是「野生網址在 LINE 內建瀏覽器打開、
    // 要請使用者跳出去」，不能只看 UA。
    isInClient: function(){ return ready && liff.isInClient(); },
    // redirectUri 必須以 LINE console 註冊的 LIFF Endpoint URL 開頭，不是
    // 同網域就好——Endpoint URL 註冊的是整個 whonext_universe/ 資料夾
    // （不是單一檔案），所以呼叫方（identity-picker.js）可以直接帶目前
    // 頁面網址，不管從哪一頁登入，LINE 授權完都會直接導回同一頁。
    login: function(redirectUri){ if (ready) liff.login({ redirectUri: redirectUri }); },
    getIDToken: function(){ return ready ? liff.getIDToken() : null; }
  };
})();

// ---------------------------------------------------------------
// 「我的錢包」餘額規則。wallet_balance／is_monthly_member 是掛在球員
// 身上的欄位（見 gas/Code.gs getRoster），不分月份、一路沿用到管理員
// 手動關掉為止，不像以前的 members 分頁要每月重新登記月繳名單。
// ---------------------------------------------------------------
async function getRosterCached(){
  const cached = getApiCache({ action:'getRoster' });
  if(cached && cached.roster) return cached.roster;
  const result = await apiGet({ action:'getRoster' });
  setApiCache({ action:'getRoster' }, result);
  return result.roster || [];
}

// 回傳 { amount, note, alert }，只有 player 身分且已知姓名才算真實餘額。
async function getWalletStatus(role, name){
  if(role !== 'player' || !name){
    return { amount: 0, note: '儲值功能開發中', alert: false };
  }
  try{
    const roster = await getRosterCached();
    const record = roster.find(function(p){ return p.name === name; });
    if(!record || !record.is_monthly_member){
      return { amount: 0, note: '尚未加入月繳，無錢包紀錄', alert: false };
    }
    const balance = Number(record.wallet_balance) || 0;
    return { amount: balance, note: balance > 0 ? '' : '餘額不足，請洽管理員儲值', alert: balance <= 0 };
  } catch(e){
    return { amount: 0, note: '讀取錢包餘額失敗，請稍後再試', alert: false };
  }
}
