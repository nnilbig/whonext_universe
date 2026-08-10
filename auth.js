(function(){
  var ROLE_KEY = 'whonext_role';
  var PLAYER_NAME_KEY = 'whonext_player_name';
  var GOOGLE_CLIENT_ID = '702772011583-5g00roumo9mgruijtn3jhg525bot1cja.apps.googleusercontent.com';
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

  // Top nav 的兩顆按鈕依目前狀態切換：
  //   管理員視角：左邊顯示「管理員」badge，右邊「登出」——不管點哪顆都是
  //   結束管理員視角（跟 wireNavRoleToggle 的 admin 分支一致）。
  //   沒綁定球員身分：「註冊」「登入」。
  //   已綁定球員身分：頭像＋姓名（點一下跳去我的活動）排在左邊、
  //   「登出」排在右邊（用 CSS order 换位，見 top-nav.css）。
  function updateNavRoleToggle(){
    var isAdmin = getRole() === 'admin';
    var toggle = document.getElementById('navRoleToggle');
    var secondaryBtn = document.getElementById('navSecondaryBtn');
    var primaryBtn = document.getElementById('navPrimaryBtn');

    if(isAdmin){
      if(toggle) toggle.classList.remove('identity-active');
      if(secondaryBtn){
        secondaryBtn.classList.add('active');
        secondaryBtn.textContent = '管理員';
      }
      if(primaryBtn){
        primaryBtn.classList.remove('has-identity');
        primaryBtn.textContent = '登出';
      }
      return;
    }

    if(secondaryBtn) secondaryBtn.classList.remove('active');
    if(primaryBtn) primaryBtn.classList.remove('active');

    var name = getPlayerName();
    if(toggle) toggle.classList.toggle('identity-active', !!name);
    if(secondaryBtn){
      secondaryBtn.dataset.entry = name ? 'logout' : 'register';
      secondaryBtn.textContent = name ? '登出' : '註冊';
    }
    if(primaryBtn){
      if(name){
        primaryBtn.classList.add('has-identity');
        primaryBtn.innerHTML = '<span class="nav-id-avatar">' + avatarInitial(name) + '</span><span class="nav-id-name">' + name + '</span>';
      } else {
        primaryBtn.classList.remove('has-identity');
        primaryBtn.textContent = '登入';
      }
    }
  }

  // 球員登入用 identity-picker.js 同一套流程，塞進 nav 自己的 overlay，
  // 留在目前頁面完成登入，不用跳去 profile.html。nav 上「註冊」「登入」
  // 兩顆按鈕分別直接開對應畫面，不用先經過起始選擇畫面。
  function openNavLogin(entry){
    closeAdminLogin();
    var overlay = document.getElementById('navLoginOverlay');
    var container = document.getElementById('navLoginContainer');
    if(!overlay || !container || !window.WhonextIdentityPicker) return;
    container.innerHTML = '';
    if(entry === 'register') WhonextIdentityPicker.renderRegister(container, true);
    else WhonextIdentityPicker.renderLoginMenu(container, true);
    overlay.classList.add('open');
  }

  function closeNavLogin(){
    var overlay = document.getElementById('navLoginOverlay');
    if(overlay) overlay.classList.remove('open');
  }

  // 管理員登入用真的 Google 帳號，後端比對 email 是否在 profiles 的
  // is_admin 名單內。每次重開都要重置成起始畫面，不然會停在上次沒登入
  // 成功時顯示的錯誤訊息。
  function openAdminLogin(){
    closeNavLogin();
    var overlay = document.getElementById('adminLoginOverlay');
    if(!overlay) return;
    document.getElementById('adminLoginStart').style.display = '';
    document.getElementById('adminLoginVerifying').style.display = 'none';
    document.getElementById('adminLoginError').style.display = 'none';
    overlay.classList.add('open');
    renderAdminGoogleButton();
  }

  function closeAdminLogin(){
    var overlay = document.getElementById('adminLoginOverlay');
    if(overlay) overlay.classList.remove('open');
  }

  // 跟 identity-picker.js 同一套 GIS 按鈕邏輯，共用 backend.js 的
  // WhonextGis 載入器，不用各自注入一次 script。
  function renderAdminGoogleButton(){
    var btnWrap = document.getElementById('adminGoogleBtnWrap');
    if(!btnWrap || !window.WhonextGis) return;
    WhonextGis.onReady(function(){
      if(!document.body.contains(btnWrap)) return;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: function(response){ submitAdminGoogleLogin(response.credential); }
      });
      btnWrap.innerHTML = '';
      google.accounts.id.renderButton(btnWrap, { theme:'filled_black', shape:'pill', size:'large', text:'continue_with', width:240 });
    });
  }

  async function submitAdminGoogleLogin(credential){
    document.getElementById('adminLoginStart').style.display = 'none';
    document.getElementById('adminLoginVerifying').style.display = '';
    try{
      var result = await apiPost('googleAdminLogin', { credential: credential });
      if(result && result.success){
        setRole('admin');
        closeAdminLogin();
        return;
      }
    } catch(e){
      // 連線失敗也走下面同一套「顯示錯誤、回到起始畫面」處理
    }
    document.getElementById('adminLoginVerifying').style.display = 'none';
    document.getElementById('adminLoginStart').style.display = '';
    document.getElementById('adminLoginError').style.display = 'block';
    renderAdminGoogleButton();
  }

  // nav 上是「註冊／登出」「登入／頭像」兩顆按鈕（管理員登入從我的錢包／
  // 我的活動的登入選單「我是管理員」進去，見 identity-picker.js）。點下去：
  // 如果目前正在看管理員視角，只是切回球員視角，已經綁定的球員身分
  // 保留，不用重選；已經綁定身分時，「登入」那顆變頭像，點一下是跳去
  // 我的活動（profile.html），不會登出——登出要點旁邊借位變成「登出」
  // 的那顆按鈕；還沒登入的話依照按到的是「註冊」還是「登入」，直接開
  // 對應畫面。
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
      var entry = btn.dataset.entry;
      if(entry === 'logout'){
        setPlayerName('');
        return;
      }
      if(entry === 'login' && getPlayerName()){
        window.location.href = 'profile.html';
        return;
      }
      openNavLogin(entry);
    });

    var cancelStartBtn = document.getElementById('adminLoginCancelStart');
    if(cancelStartBtn) cancelStartBtn.addEventListener('click', closeAdminLogin);
    var overlay = document.getElementById('adminLoginOverlay');
    if(overlay){
      overlay.addEventListener('click', function(e){ if(e.target === overlay) closeAdminLogin(); });
    }

    var navLoginOverlay = document.getElementById('navLoginOverlay');
    if(navLoginOverlay){
      navLoginOverlay.addEventListener('click', function(e){ if(e.target === navLoginOverlay) closeNavLogin(); });
    }
  }

  // 選完/建完球員身份就把 nav 的登入 overlay 收起來，回到原本正在看的
  // 頁面，不用手動再關一次。
  document.addEventListener('whonext:playername-change', function(){
    if(getPlayerName()) closeNavLogin();
  });

  document.addEventListener('DOMContentLoaded', function(){
    applyAdminClass();
    updateNavRoleToggle();
    wireNavRoleToggle();
    if(getRole() === 'admin') resetIdleTimer();
  });

  window.WhonextAuth = {
    ROLE_KEY: ROLE_KEY, getRole: getRole, setRole: setRole,
    getPlayerName: getPlayerName, setPlayerName: setPlayerName,
    openAdminLogin: openAdminLogin, closeNavLogin: closeNavLogin
  };
})();
