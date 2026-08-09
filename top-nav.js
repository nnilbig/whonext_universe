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
            '<button type="button" class="role-toggle-btn" data-role="player">登入</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(nav, document.body.firstChild);

    // nav 上不再放「管理員」按鈕，管理員登入從「我的錢包」／「我的活動」
    // 的登入選單裡的「我是管理員」進去（identity-picker.js）。這裡的
    // overlay／流程還是共用的，只是不再由 nav 上的按鈕直接觸發。
    // 管理員登入分兩步：先跟球員登入一樣走 Google 驗證（現在還是假的），
    // 通過才進到真正會打後端 login API 的帳密表單。一個人可以同時是
    // 球員又是管理員，身分各自獨立登入/切換，互不影響。
    var overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'adminLoginOverlay';
    overlay.innerHTML =
      '<div class="auth-box">' +
        '<div id="adminLoginStart">' +
          '<div class="nav-login-title">管理員登入</div>' +
          '<div class="whoami-sub">先用 Google 驗證身份，再輸入管理員帳號密碼。</div>' +
          '<button type="button" class="gbtn" id="adminGoogleBtn">' +
            '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>' +
            '<span>使用 Google 繼續</span>' +
          '</button>' +
          '<button type="button" class="whoami-secondary-btn" id="adminLoginCancelStart">取消</button>' +
        '</div>' +
        '<div id="adminLoginVerifying" style="display:none">' +
          '<div class="whoami-spinner-wrap">' +
            '<div class="whoami-spinner"></div>' +
            '<div class="whoami-spinner-text">驗證中…</div>' +
          '</div>' +
        '</div>' +
        '<div id="adminLoginForm" style="display:none">' +
          '<div class="nav-login-title">管理員登入</div>' +
          '<div class="nav-login-field-label">帳號</div>' +
          '<input type="text" id="adminLoginUser" class="nav-login-input" autocomplete="username">' +
          '<div class="nav-login-field-label">密碼</div>' +
          '<input type="password" id="adminLoginPass" class="nav-login-input" autocomplete="current-password">' +
          '<div class="auth-error" id="adminLoginError" style="display:none">帳號或密碼錯誤</div>' +
          '<div class="nav-login-actions">' +
            '<button type="button" class="nav-login-cancel" id="adminLoginCancel">取消</button>' +
            '<button type="button" class="nav-login-submit" id="adminLoginSubmit">登入</button>' +
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
