(function(){
  var ROLE_KEY = 'whonext_role';
  var PLAYER_NAME_KEY = 'whonext_player_name';
  var IDLE_LIMIT_MS = 5 * 60 * 1000;
  var idleTimer = null;

  function getRole(){ return localStorage.getItem(ROLE_KEY) || 'player'; }

  function getPlayerName(){ return localStorage.getItem(PLAYER_NAME_KEY) || ''; }

  // 設定/清除目前綁定的球員身分，並同步更新 top nav 的頭像顯示，
  // 讓正在看 profile.html 的頁面也能透過事件即時重繪。
  function setPlayerName(name){
    if(name) localStorage.setItem(PLAYER_NAME_KEY, name);
    else localStorage.removeItem(PLAYER_NAME_KEY);
    updateNavRoleToggle();
    document.dispatchEvent(new CustomEvent('whonext:playername-change'));
  }

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

  // Top nav 的「球員／管理員」切換鈕，反映目前角色的 active 狀態；
  // 球員那顆按鈕如果已經綁定身分，改顯示頭像＋姓名取代「球員」文字。
  function updateNavRoleToggle(){
    var isAdmin = getRole() === 'admin';
    document.querySelectorAll('#navRoleToggle .role-toggle-btn').forEach(function(btn){
      btn.classList.toggle('active', (btn.dataset.role === 'admin') === isAdmin);
    });
    var playerBtn = document.querySelector('#navRoleToggle .role-toggle-btn[data-role="player"]');
    if(playerBtn){
      var name = getPlayerName();
      if(name){
        playerBtn.classList.add('has-identity');
        playerBtn.innerHTML = '<span class="nav-id-avatar">' + name.slice(0,1) + '</span><span class="nav-id-name">' + name + '</span>';
      } else {
        playerBtn.classList.remove('has-identity');
        playerBtn.textContent = '球員';
      }
    }
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

  // 點「球員／頭像」：如果目前是管理員，直接切回球員（等同登出管理員，
  // 並清空球員身分要求重新選）；如果已經是球員身分，點下去是去
  // 「我的活動」重新挑選／更換身分。點「管理員」跳帳密驗證，通過才
  // 切換，取消或失敗都留在原本身分。
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
        if(getRole() === 'admin'){
          setPlayerName('');
          setRole('player');
          return;
        }
        setPlayerName('');
        var page = location.pathname.split('/').pop();
        if(page !== 'profile.html') location.href = 'profile.html';
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

  window.WhonextAuth = {
    ROLE_KEY: ROLE_KEY, getRole: getRole, setRole: setRole,
    getPlayerName: getPlayerName, setPlayerName: setPlayerName
  };
})();
