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
        playerBtn.innerHTML = '<span class="nav-id-avatar">' + avatarInitial(name) + '</span><span class="nav-id-name">' + name + '</span>';
      } else {
        playerBtn.classList.remove('has-identity');
        playerBtn.textContent = '登入';
      }
    }
  }

  // 管理員登入永遠從「Google 驗證」這步開始，帳密表單只是第二步，
  // 每次重開都要重置，不然會停在上次登入到一半的畫面。
  function openAdminLogin(){
    var overlay = document.getElementById('adminLoginOverlay');
    if(!overlay) return;
    document.getElementById('adminLoginStart').style.display = '';
    document.getElementById('adminLoginVerifying').style.display = 'none';
    document.getElementById('adminLoginForm').style.display = 'none';
    document.getElementById('adminLoginUser').value = '';
    document.getElementById('adminLoginPass').value = '';
    document.getElementById('adminLoginError').style.display = 'none';
    overlay.classList.add('open');
  }

  function closeAdminLogin(){
    var overlay = document.getElementById('adminLoginOverlay');
    if(overlay) overlay.classList.remove('open');
  }

  // 「使用 Google 繼續」目前還是假的（沒有真的 OAuth），驗證中轉場後
  // 直接進到真正會打後端 login API 的帳密表單，實際登入判斷還是靠那步。
  function startAdminGoogleVerify(){
    document.getElementById('adminLoginStart').style.display = 'none';
    document.getElementById('adminLoginVerifying').style.display = '';
    setTimeout(function(){
      document.getElementById('adminLoginVerifying').style.display = 'none';
      document.getElementById('adminLoginForm').style.display = '';
      var userInput = document.getElementById('adminLoginUser');
      if(userInput) userInput.focus();
    }, 500);
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

  // nav 上只剩「登入／頭像」這顆按鈕（管理員登入從我的錢包／我的活動
  // 的登入選單「我是管理員」進去，見 identity-picker.js）。點這顆按鈕：
  // 如果目前正在看管理員視角，只是切回球員視角，已經綁定的球員身分
  // 保留，不用重選；如果本來就是球員身分，點一下代表想更換身分，
  // 才會清空重選。
  function wireNavRoleToggle(){
    var toggle = document.getElementById('navRoleToggle');
    if(!toggle) return;
    toggle.addEventListener('click', function(e){
      var btn = e.target.closest('.role-toggle-btn');
      if(!btn) return;
      if(getRole() === 'admin'){
        setRole('player');
        return;
      }
      setPlayerName('');
      var page = location.pathname.split('/').pop();
      if(page !== 'profile.html') location.href = 'profile.html';
    });

    var googleBtn = document.getElementById('adminGoogleBtn');
    if(googleBtn) googleBtn.addEventListener('click', startAdminGoogleVerify);
    var cancelStartBtn = document.getElementById('adminLoginCancelStart');
    if(cancelStartBtn) cancelStartBtn.addEventListener('click', closeAdminLogin);
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
    getPlayerName: getPlayerName, setPlayerName: setPlayerName,
    openAdminLogin: openAdminLogin
  };
})();
