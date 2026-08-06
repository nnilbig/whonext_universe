// ---------------------------------------------------------------
// 共用後台連線層（Google Apps Script）+ sessionStorage 快取
// 所有頁面共用同一個 BACKEND_URL，先讀快取立刻顯示，同時背景重新
// 抓取最新資料（stale-while-revalidate），首頁會預先暖機常用資料。
// ---------------------------------------------------------------
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxFA7CHjW_JNJ3XLXvtcoaYKQtZyaIBaoZRISLuB5IxMOR40zYsyIKqupep0M81VZc2rA/exec';
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
