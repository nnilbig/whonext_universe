(function(){
  var ADMIN_USER = 'www';
  var ADMIN_PASS = '888';
  var ROLE_KEY = 'whonext_role';

  function getRole(){ return localStorage.getItem(ROLE_KEY) || 'player'; }

  function setRole(role){
    localStorage.setItem(ROLE_KEY, role);
    updateToggleUI();
  }

  function updateToggleUI(){
    var role = getRole();
    document.body.classList.toggle('is-admin', role === 'admin');
    document.querySelectorAll('.role-toggle').forEach(function(toggle){
      var playerBtn = toggle.querySelector('[data-role="player"]');
      var adminBtn = toggle.querySelector('[data-role="admin"]');
      if(playerBtn) playerBtn.classList.toggle('active', role === 'player');
      if(adminBtn) adminBtn.classList.toggle('active', role === 'admin');
    });
  }

  function buildModal(){
    if(document.getElementById('admin-login-modal')) return;
    var overlay = document.createElement('div');
    overlay.id = 'admin-login-modal';
    overlay.className = 'auth-overlay';
    overlay.innerHTML =
      '<div class="auth-box">' +
        '<div class="auth-title">管理員登入</div>' +
        '<input type="text" id="auth-user" class="auth-input" placeholder="帳號" autocomplete="username">' +
        '<input type="password" id="auth-pass" class="auth-input" placeholder="密碼" autocomplete="current-password">' +
        '<div class="auth-error" id="auth-error" style="display:none">帳號或密碼錯誤</div>' +
        '<div class="auth-actions">' +
          '<button type="button" class="auth-cancel">取消</button>' +
          '<button type="button" class="auth-submit">登入</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e){ if(e.target === overlay) closeModal(); });
    overlay.querySelector('.auth-cancel').addEventListener('click', closeModal);
    overlay.querySelector('.auth-submit').addEventListener('click', trySubmit);
    overlay.querySelector('#auth-pass').addEventListener('keydown', function(e){
      if(e.key === 'Enter') trySubmit();
    });
  }

  function openModal(){
    buildModal();
    var overlay = document.getElementById('admin-login-modal');
    document.getElementById('auth-error').style.display = 'none';
    document.getElementById('auth-user').value = '';
    document.getElementById('auth-pass').value = '';
    overlay.classList.add('open');
    setTimeout(function(){ document.getElementById('auth-user').focus(); }, 50);
  }

  function closeModal(){
    var overlay = document.getElementById('admin-login-modal');
    if(overlay) overlay.classList.remove('open');
  }

  function trySubmit(){
    var user = document.getElementById('auth-user').value.trim();
    var pass = document.getElementById('auth-pass').value;
    if(user === ADMIN_USER && pass === ADMIN_PASS){
      setRole('admin');
      closeModal();
    } else {
      document.getElementById('auth-error').style.display = 'block';
    }
  }

  function wireToggles(){
    document.querySelectorAll('.role-toggle').forEach(function(toggle){
      var playerBtn = toggle.querySelector('[data-role="player"]');
      var adminBtn = toggle.querySelector('[data-role="admin"]');
      if(playerBtn) playerBtn.addEventListener('click', function(){ setRole('player'); });
      if(adminBtn) adminBtn.addEventListener('click', function(){
        if(getRole() === 'admin') return;
        openModal();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    wireToggles();
    updateToggleUI();
  });
})();
