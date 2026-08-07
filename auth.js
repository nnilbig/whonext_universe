(function(){
  var ROLE_KEY = 'whonext_role';
  var PLAYER_NAME_KEY = 'whonext_player_name';
  var IDLE_LIMIT_MS = 5 * 60 * 1000;
  var idleTimer = null;

  function getRole(){ return localStorage.getItem(ROLE_KEY) || 'player'; }

  function setRole(role){
    localStorage.setItem(ROLE_KEY, role);
    applyAdminClass();
    updateNavWelcome();
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

  // 每一頁 navbar 右上角的「歡迎 X / 登出」，取代舊的球員/管理員切換鈕。
  // 登入身分只在首頁的登入遮罩選，這裡只負責顯示目前是誰、以及登出。
  function updateNavWelcome(){
    var textEl = document.getElementById('navWelcomeText');
    if(!textEl) return;
    var role = getRole();
    var name = role === 'admin' ? '管理員'
      : role === 'guest' ? '訪客'
      : (localStorage.getItem(PLAYER_NAME_KEY) || (role === 'dropin' ? '臨打' : '球員'));
    textEl.textContent = '歡迎，' + name;
  }

  function wireLogout(){
    var btn = document.getElementById('navLogoutBtn');
    if(!btn) return;
    btn.addEventListener('click', function(){
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(PLAYER_NAME_KEY);
      location.href = 'index.html';
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    applyAdminClass();
    updateNavWelcome();
    wireLogout();
    if(getRole() === 'admin') resetIdleTimer();
  });

  window.WhonextAuth = { ROLE_KEY: ROLE_KEY, getRole: getRole, setRole: setRole };
})();
