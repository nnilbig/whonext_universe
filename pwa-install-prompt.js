// ---------- PWA 加入主畫面引導提示 ----------
// 只在「一般瀏覽器分頁」出現（不是已安裝的 PWA），依環境給對應教學：
//   1. LINE / FB / IG 內建瀏覽器：這些 webview 沒辦法直接加入主畫面，
//      要先引導使用者用「在瀏覽器中開啟」跳出去。
//   2. iOS Safari：沒有 beforeinstallprompt 這種 API，只能用文字教學
//      使用者自己點分享 → 加入主畫面。
//   3. Android Chrome：攔截 beforeinstallprompt，有的話直接放「安裝」按鈕
//      一鍵觸發原生安裝流程；沒有的話一樣退回文字教學。
(function(){
  function isStandalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
  }
  if (isStandalone()) return;

  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  var isAndroid = /Android/.test(ua);
  if (!isIOS && !isAndroid) return; // 只在手機上引導

  var isInApp = /Line\//i.test(ua) || /FBAN|FBAV/i.test(ua) || /Instagram/i.test(ua) || /MicroMessenger/i.test(ua);

  var STORAGE_KEY = 'wu_pwa_prompt_dismissed_at';
  var COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  var last = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  if (Date.now() - last < COOLDOWN_MS) return;

  // 這是多頁面網站，每切一頁都是重新載入、重新跑這支 script，
  // 只靠 7 天的「已關閉」冷卻不夠 —— 使用者只要沒點 X、繼續逛，
  // 每跳一頁就會再跳出來一次。這裡加一個「這個瀏覽階段（分頁）
  // 已經跳過了」的旗標，同一次造訪最多跳一次，下次重開瀏覽器
  // /分頁才會再有機會看到。
  var SESSION_KEY = 'wu_pwa_prompt_shown_session';
  if (sessionStorage.getItem(SESSION_KEY)) return;

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
  });

  function content(){
    if (isInApp) {
      return {
        title: '請用瀏覽器打開才能安裝',
        sub: '點右上角「⋯」選單 → 選擇「在瀏覽器中開啟」，跳出去後就能加入主畫面。',
        install: false
      };
    }
    if (isIOS) {
      return {
        title: '加入主畫面，體驗全螢幕 App',
        sub: '點下方工具列的分享圖示<span class="pwa-arrow-icon">⬆️</span>，再選「加入主畫面」。',
        install: false
      };
    }
    // Android
    if (deferredPrompt) {
      return {
        title: '加入主畫面，體驗全螢幕 App',
        sub: '一鍵安裝，開啟後就像 App 一樣使用。',
        install: true
      };
    }
    return {
      title: '加入主畫面，體驗全螢幕 App',
      sub: '點右上角「⋮」選單 → 選擇「加入主畫面」。',
      install: false
    };
  }

  function dismiss(wrap){
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    wrap.classList.remove('show');
    setTimeout(function(){ wrap.remove(); }, 300);
  }

  function render(){
    var c = content();

    var wrap = document.createElement('div');
    wrap.className = 'pwa-prompt-wrap';
    wrap.innerHTML =
      '<div class="pwa-prompt">' +
        '<div class="pwa-prompt-badge"><span class="pwa-w">W</span><span class="pwa-u">U</span></div>' +
        '<div class="pwa-prompt-body">' +
          '<div class="pwa-prompt-title"></div>' +
          '<div class="pwa-prompt-sub"></div>' +
          (c.install ? '<button type="button" class="pwa-prompt-install-btn">立即安裝</button>' : '') +
        '</div>' +
        '<button type="button" class="pwa-prompt-close" aria-label="關閉">✕</button>' +
      '</div>';

    wrap.querySelector('.pwa-prompt-title').textContent = c.title;
    wrap.querySelector('.pwa-prompt-sub').innerHTML = c.sub;
    wrap.querySelector('.pwa-prompt-close').addEventListener('click', function(){ dismiss(wrap); });

    if (c.install) {
      wrap.querySelector('.pwa-prompt-install-btn').addEventListener('click', function(){
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function(){
          deferredPrompt = null;
          dismiss(wrap);
        });
      });
    }

    document.body.appendChild(wrap);
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ wrap.classList.add('show'); });
    });
  }

  sessionStorage.setItem(SESSION_KEY, '1');
  setTimeout(render, 1600);
})();
