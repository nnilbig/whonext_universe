(function(){
  var ROLE_KEY = 'whonext_role';
  var PLAYER_NAME_KEY = 'whonext_player_name';
  var IDLE_LIMIT_MS = 5 * 60 * 1000;
  var idleTimer = null;

  function getRole(){ return localStorage.getItem(ROLE_KEY) || 'player'; }

  function setRole(role){
    localStorage.setItem(ROLE_KEY, role);
    applyAdminClass();
    updateNavRoleToggle();
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

  function applyAdminClass(){
    document.body.classList.toggle('is-admin', getRole() === 'admin');
  }

  // Top nav 的「球員／管理員」切換鈕，反映目前角色的 active 狀態。
  function updateNavRoleToggle(){
    var isAdmin = getRole() === 'admin';
    document.querySelectorAll('#navRoleToggle .role-toggle-btn').forEach(function(btn){
      btn.classList.toggle('active', (btn.dataset.role === 'admin') === isAdmin);
    });
  }

  function openAdminLogin(){
    var overlay = document.getElementById('adminLoginOverlay');
    if(!overlay) return;
    document.getElementById('adminLoginUser').value = '';
    document.getElementById('adminLoginPass').value = '';
    document.getElementById('adminLoginError').style.display = 'none';
    overlay.classList.add('open');
  }

  function closeAdminLogin(){
    var overlay = document.getElementById('adminLoginOverlay');
    if(overlay) overlay.classList.remove('open');
  }

  async function submitAdminLogin(){
    var user = document.getElementById('adminLoginUser').value.trim();
    var pass = document.getElementById('adminLoginPass').value;
    var errorEl = document.getElementById('adminLoginError');
    errorEl.style.display = 'none';
    if(!user || !pass){
      errorEl.textContent = '請輸入帳號密碼';
      errorEl.style.display = 'block';
      return;
    }
    var btn = document.getElementById('adminLoginSubmit');
    btn.disabled = true;
    btn.textContent = '登入中…';
    try{
      var result = await apiPost('login', { username: user, password: pass });
      if(result && result.success){
        setRole('admin');
        closeAdminLogin();
      } else {
        errorEl.textContent = '帳號或密碼錯誤';
        errorEl.style.display = 'block';
      }
    } catch(e){
      errorEl.textContent = '無法連線後台，請稍後再試';
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '登入';
    }
  }

  // 點「球員」直接切回去（等同登出管理員）；點「管理員」跳帳密驗證，
  // 通過才切換，取消或失敗都留在原本身分。
  function wireNavRoleToggle(){
    var toggle = document.getElementById('navRoleToggle');
    if(!toggle) return;
    toggle.addEventListener('click', function(e){
      var btn = e.target.closest('.role-toggle-btn');
      if(!btn) return;
      var role = btn.dataset.role;
      if(role === 'admin'){
        if(getRole() === 'admin') return;
        openAdminLogin();
      } else {
        if(getRole() === 'player') return;
        localStorage.removeItem(PLAYER_NAME_KEY);
        setRole('player');
      }
    });

    var cancelBtn = document.getElementById('adminLoginCancel');
    if(cancelBtn) cancelBtn.addEventListener('click', closeAdminLogin);
    var submitBtn = document.getElementById('adminLoginSubmit');
    if(submitBtn) submitBtn.addEventListener('click', submitAdminLogin);
    var overlay = document.getElementById('adminLoginOverlay');
    if(overlay){
      overlay.addEventListener('click', function(e){ if(e.target === overlay) closeAdminLogin(); });
      var passInput = document.getElementById('adminLoginPass');
      if(passInput) passInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') submitAdminLogin(); });
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    applyAdminClass();
    updateNavRoleToggle();
    wireNavRoleToggle();
    if(getRole() === 'admin') resetIdleTimer();
  });

  window.WhonextAuth = { ROLE_KEY: ROLE_KEY, getRole: getRole, setRole: setRole };
})();
