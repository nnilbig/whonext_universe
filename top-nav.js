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
            '<button type="button" class="role-toggle-btn" data-role="player">球員</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(nav, document.body.firstChild);

    var overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'adminLoginOverlay';
    overlay.innerHTML =
      '<div class="auth-box">' +
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
      '</div>';
    document.body.appendChild(overlay);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();
