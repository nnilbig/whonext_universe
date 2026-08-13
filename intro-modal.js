// ---------- 使用介紹彈窗 ----------
// 只在還沒登入、也還沒關過這個彈窗的情況下，於首頁品牌遮罩淡出後跳出來，
// 一次介紹登入方式跟五個主要分頁在做什麼。關掉（點 X 或點背景）之後
// 記一個 localStorage 旗標，之後就不會再自動跳出來。共用 auth.css 的
// .auth-overlay/.modal-box-wrap/.modal-close-btn 彈窗殼，跟 event 詳情/
// 編輯彈窗是同一套。
(function(){
  var STORAGE_KEY = 'whonext_intro_dismissed';

  function introTab(accent, icon, name, desc){
    return '<div class="intro-tab-card" data-accent="' + accent + '">' +
      '<div class="intro-tab-icon">' + icon + '</div>' +
      '<div class="intro-tab-body">' +
        '<div class="intro-tab-name">' + name + '</div>' +
        '<div class="intro-tab-desc">' + desc + '</div>' +
      '</div>' +
    '</div>';
  }

  function dismiss(overlay){
    localStorage.setItem(STORAGE_KEY, '1');
    overlay.classList.remove('open');
    setTimeout(function(){ overlay.remove(); }, 200);
  }

  function render(){
    var overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'introModalOverlay';
    overlay.innerHTML =
      '<div class="modal-box-wrap">' +
        '<button type="button" class="modal-close-btn" id="introModalCloseBtn" aria-label="關閉">×</button>' +
        '<div class="auth-box intro-modal-box">' +
          '<div class="intro-modal-eyebrow">WHONEXT UNIVERSE 賽事大平台</div>' +
          '<div class="intro-modal-title">系統指南</div>' +

          '<div class="intro-section-label">平台介紹</div>' +
          '<div class="intro-guide-card">' +
            '<ul class="g-list">' +
              '<li>一鍵急速報名與預約。</li>' +
              '<li>自動解鎖個人成就徽章並挑戰賽季英雄榜。</li>' +
              '<li>連動錢包自動扣款。</li>' +
              '<li>實體結合卡牌對戰系統。</li>' +
            '</ul>' +
          '</div>' +

          '<div class="intro-section-label">登入身分</div>' +
          '<div class="intro-guide-card">' +
            '<div class="g-title">快速登入與歷史對接</div>' +
            '<ul class="g-list">' +
              '<li>可以透過畫面右上角的「球員登入」，支援 LINE 或 Google 一鍵登入。</li>' +
              '<li>綁定以前的暱稱，系統就會把你的報名紀錄接回這個帳號。</li>' +
            '</ul>' +
          '</div>' +

          '<div class="intro-section-label">核心功能</div>' +
          '<div class="intro-tab-row">' +
            introTab('home', '⌂', '活動', '活動報名入口，亦可發起活動。') +
            introTab('profile', '☺', '個人', '個人的活動紀錄、成就徽章。') +
            introTab('finance', '$', '錢包', '個人儲值餘額與扣款紀錄。') +
            introTab('rank', '★', '排行', '賽季挑戰榜以及歷屆賽事排行榜。') +
            introTab('match', '⚑', '卡牌', '卡牌賽限定，結合實體與卡牌系統的比賽模式。') +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function(){ overlay.classList.add('open'); });

    overlay.querySelector('#introModalCloseBtn').addEventListener('click', function(){ dismiss(overlay); });
    overlay.addEventListener('click', function(e){ if(e.target === overlay) dismiss(overlay); });
  }

  function maybeShow(){
    if(localStorage.getItem(STORAGE_KEY)) return;
    if(window.WhonextAuth && WhonextAuth.getPlayerName()) return;
    render();
  }

  window.WhonextIntroModal = { maybeShow: maybeShow };
})();
