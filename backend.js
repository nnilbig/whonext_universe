// ---------------------------------------------------------------
// 共用後台連線層（Google Apps Script）+ sessionStorage 快取
// 所有頁面共用同一個 BACKEND_URL，先讀快取立刻顯示，同時背景重新
// 抓取最新資料（stale-while-revalidate），首頁會預先暖機常用資料。
// ---------------------------------------------------------------
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbyZ9cXylOzoHGz6j8OIdpPOgeVimRzdVooF2PpRP8YDivyVMC0j1rCuKngjz6hiKGRJ/exec';
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
// 註冊）跟 auth.js（管理員登入）都要用到 GIS 的按鈕，共用同一份 script
// 標籤跟 ready callback queue，避免兩邊各自注入一次。
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
// 「我的錢包」餘額規則。members 表目前還沒有專門的餘額欄位，先直接
// 把 monthly_total_fee 當作錢包餘額的數字來源；之後有專門的儲值／
// 支付紀錄表時，這裡再換成真的加總算法。
// ---------------------------------------------------------------
function walletCalendarMonth(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// 月繳名單優先用快取（不分月份的 getMembers）篩本月出來，快取沒有才即時查詢。
async function getMonthlyMembersCached(month){
  const cached = getApiCache({ action:'getMembers' });
  if(cached && cached.members) return cached.members.filter(function(m){ return String(m.month) === month; });
  const result = await apiGet({ action:'getMembers', month: month });
  return result.members || [];
}

// 回傳 { amount, note, alert }，只有 player 身分且已知姓名才算真實餘額。
async function getWalletStatus(role, name){
  if(role !== 'player' || !name){
    return { amount: 0, note: '儲值功能開發中', alert: false };
  }
  try{
    const members = await getMonthlyMembersCached(walletCalendarMonth());
    const record = members.find(function(m){ return m.name === name; });
    if(!record){
      return { amount: 0, note: '本月尚無錢包紀錄', alert: false };
    }
    const balance = Number(record.monthly_total_fee) || 0;
    return { amount: balance, note: balance > 0 ? '' : '餘額不足，請洽管理員儲值', alert: balance <= 0 };
  } catch(e){
    return { amount: 0, note: '讀取錢包餘額失敗，請稍後再試', alert: false };
  }
}
