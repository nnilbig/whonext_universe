(function(){
  var ROLE_KEY = 'whonext_role';
  var IDLE_LIMIT_MS = 5 * 60 * 1000;
  var idleTimer = null;

  function getRole(){ return localStorage.getItem(ROLE_KEY) || 'player'; }

  function setRole(role){
    localStorage.setItem(ROLE_KEY, role);
    updateToggleUI();
    if(role === 'admin') resetIdleTimer();
    else clearIdleTimer();
  }

  function resetIdleTimer(){
    clearTimeout(idleTimer);
    idleTimer = setTimeout(handleIdleLogout, IDLE_LIMIT_MS);
  }

  function clearIdleTimer(){
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function handleIdleLogout(){
    if(getRole() !== 'admin') return;
    setRole('player');
    showIdleToast('已閒置 5 分鐘，管理員自動登出');
  }

  function showIdleToast(msg){
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:max(24px, env(safe-area-inset-bottom));left:50%;' +
      'transform:translateX(-50%);background:rgba(30,30,32,0.92);backdrop-filter:blur(16px);' +
      '-webkit-backdrop-filter:blur(16px);color:#F5F5F7;font-size:13.5px;padding:11px 20px;' +
      'border:1px solid rgba(255,255,255,0.14);border-radius:999px;z-index:999;text-align:center;' +
      'max-width:calc(100vw - 32px);';
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 2200);
  }

  ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(function(evt){
    document.addEventListener(evt, function(){
      if(getRole() === 'admin') resetIdleTimer();
    }, { passive:true });
  });

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
    var errorEl = document.getElementById('auth-error');
    var submitBtn = document.querySelector('#admin-login-modal .auth-submit');
    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = '登入中…';

    apiPost('login', { username: user, password: pass })
      .then(function(result){
        if(result && result.success){
          setRole('admin');
          closeModal();
        } else {
          errorEl.textContent = '帳號或密碼錯誤';
          errorEl.style.display = 'block';
        }
      })
      .catch(function(){
        errorEl.textContent = '無法連線後台，請稍後再試';
        errorEl.style.display = 'block';
      })
      .finally(function(){
        submitBtn.disabled = false;
        submitBtn.textContent = '登入';
      });
  }

  function wireToggles(){
    document.querySelectorAll('.role-toggle').forEach(function(toggle){
      var playerBtn = toggle.querySelector('[data-role="player"]');
      var adminBtn = toggle.querySelector('[data-role="admin"]');
      if(playerBtn) playerBtn.addEventListener('click', function(){ setRole('player'); });
      if(adminBtn) adminBtn.addEventListener('click', function(){
        if(getRole() === 'admin') return;
        // TODO: 開發階段暫時跳過登入驗證，直接切換管理員。上線前要改回 openModal()。
        setRole('admin');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    wireToggles();
    updateToggleUI();
    if(getRole() === 'admin') resetIdleTimer();
  });
})();
