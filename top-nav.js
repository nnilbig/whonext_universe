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
            '<button type="button" class="role-toggle-btn" data-action="register">註冊</button>' +
            '<button type="button" class="role-toggle-btn" data-action="login">登入</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(nav, document.body.firstChild);

    // 管理員身分沒有另外的登入入口——是不是管理員直接看目前登入的球員
    // 本人在 profiles 的 is_admin，nav 上會多出一顆「管理員」按鈕切換
    // 視角（見 auth.js updateNavRoleToggle）。這裡只需要球員登入用的
    // overlay，跟 profile.html 共用同一份 identity-picker.js。
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
