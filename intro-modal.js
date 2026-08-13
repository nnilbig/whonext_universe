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
          '<div class="intro-modal-eyebrow">GUIDE</div>' +
          '<div class="intro-modal-title">使用介紹</div>' +

          '<div class="intro-section-label">登入身分</div>' +
          '<div class="intro-guide-card">' +
            '<div class="g-title">快速用 LINE 或 Google 登入</div>' +
            '<ul class="g-list">' +
              '<li>可以透過畫面右上角的「球員登入」，選擇 LINE 登入即可。</li>' +
              '<li>瀏覽器開啟可以另外選擇 Google 登入。</li>' +
              '<li>如果之前有報名羽球活動，註冊當下可以選擇以前用過的暱稱，系統就會把你的報名紀錄接回這個帳號；或是之後在「個人」分頁補綁。</li>' +
            '</ul>' +
          '</div>' +

          '<div class="intro-section-label">主要功能</div>' +
          '<div class="intro-tab-row">' +
            introTab('home', '⌂', '活動', '活動的報名入口，可以報名發起活動。') +
            introTab('profile', '☺', '個人', '個人的活動紀錄跟帳號綁定。') +
            introTab('finance', '$', '錢包', '自己的錢包餘額、儲值與扣款紀錄。') +
            introTab('rank', '★', '排行', '歷屆賽事的冠軍榜、賽季挑戰排行榜。') +
            introTab('match', '⚑', '卡牌', '卡牌賽限定的比賽系統。') +
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
