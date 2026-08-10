(function(){
  function buildNav(){
    var nav = document.createElement('div');
    nav.className = 'navbar';
    nav.innerHTML =
      '<div class="nav-inner">' +
        '<a class="nav-title" href="index.html">' +
          '<div class="eyebrow">WHONEXT</div>' +
          '<h1>UNIVERSE</h1>' +
        '</a>' +
        '<div class="nav-role">' +
          '<div class="role-toggle" id="navRoleToggle">' +
            '<button type="button" class="role-toggle-btn" id="navSecondaryBtn" data-role="player" data-entry="register">註冊</button>' +
            '<button type="button" class="role-toggle-btn" id="navPrimaryBtn" data-role="player" data-entry="login">登入</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(nav, document.body.firstChild);

    // nav 上不再放「管理員」按鈕，管理員登入從「我的錢包」／「我的活動」
    // 的登入選單裡的「管理員登入」進去（identity-picker.js）。這裡的
    // overlay／流程還是共用的，只是不再由 nav 上的按鈕直接觸發。
    // 管理員登入用真的 Google 帳號登入，後端比對 email 是否在 profiles
    // 的 is_admin 名單內，不是任何 Google 帳號都能進來。一個人可以同時是
    // 球員又是管理員，身分各自獨立登入/切換，互不影響。
    var overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'adminLoginOverlay';
    overlay.innerHTML =
      '<div class="auth-box">' +
        '<div id="adminLoginStart">' +
          '<div class="nav-login-title">管理員登入</div>' +
          '<div class="whoami-sub">用有管理員權限的 Google 帳號登入。</div>' +
          '<div class="whoami-google-btn-wrap" id="adminGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
          '<div class="auth-error" id="adminLoginError" style="display:none">這個 Google 帳號沒有管理員權限</div>' +
          '<button type="button" class="whoami-secondary-btn" id="adminLoginCancelStart">取消</button>' +
        '</div>' +
        '<div id="adminLoginVerifying" style="display:none">' +
          '<div class="whoami-spinner-wrap">' +
            '<div class="whoami-spinner"></div>' +
            '<div class="whoami-spinner-text">驗證中…</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // 球員登入也走同一份 identity-picker.js（跟 profile.html 共用），
    // 用 overlay 包起來就能留在目前頁面完成登入，不用跳去 profile.html。
    var loginOverlay = document.createElement('div');
    loginOverlay.className = 'auth-overlay';
    loginOverlay.id = 'navLoginOverlay';
    loginOverlay.innerHTML = '<div class="auth-box"><div id="navLoginContainer"></div></div>';
    document.body.appendChild(loginOverlay);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();
