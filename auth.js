(function(){
  var ROLE_KEY = 'whonext_role';
  var PLAYER_NAME_KEY = 'whonext_player_name';
  var IS_ADMIN_KEY = 'whonext_player_is_admin';
  var PHOTO_KEY = 'whonext_player_photo';
  var IDLE_LIMIT_MS = 5 * 60 * 1000;
  var idleTimer = null;

  // 管理員身分不再另外登入，直接看目前綁定的球員本人在 profiles 裡的
  // is_admin——「管理員視角」只是同一個人切換看到的畫面（見 setRole）。
  function getRole(){ return localStorage.getItem(ROLE_KEY) || 'player'; }
  function getPlayerIsAdmin(){ return localStorage.getItem(IS_ADMIN_KEY) === '1'; }

  function getPlayerName(){ return localStorage.getItem(PLAYER_NAME_KEY) || ''; }
  function getPlayerPhoto(){ return localStorage.getItem(PHOTO_KEY) || ''; }

  // 設定/清除目前綁定的球員身分，並同步更新 top nav 的頭像顯示，
  // 讓正在看 profile.html 的頁面也能透過事件即時重繪。isAdmin／photoUrl
  // 都來自登入/註冊回傳的 player 資料（is_admin、avatar_url），換身分或
  // 登出一律重置回球員視角，管理員視角要重新點一次「管理員」才會切換過去。
  function setPlayerName(name, isAdmin, photoUrl){
    if(name){
      localStorage.setItem(PLAYER_NAME_KEY, name);
      localStorage.setItem(IS_ADMIN_KEY, isAdmin ? '1' : '0');
      if(photoUrl) localStorage.setItem(PHOTO_KEY, photoUrl);
      else localStorage.removeItem(PHOTO_KEY);
    } else {
      localStorage.removeItem(PLAYER_NAME_KEY);
      localStorage.removeItem(IS_ADMIN_KEY);
      localStorage.removeItem(PHOTO_KEY);
    }
    setRole('player');
    document.dispatchEvent(new CustomEvent('whonext:playername-change'));
  }

  // 只有目前綁定的球員本人具備 is_admin 才能真的切到管理員視角，
  // 就算 localStorage 被亂改成 admin，這裡還是會被拉回 player。
  function setRole(role){
    var next = (role === 'admin' && getPlayerIsAdmin()) ? 'admin' : 'player';
    localStorage.setItem(ROLE_KEY, next);
    applyAdminClass();
    updateNavRoleToggle();
    if(next === 'admin') resetIdleTimer();
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

  // Top nav 的身分區塊整個從狀態重繪，比較好處理三種情況：
  //   沒登入：「註冊」「登入」。
  //   已登入、不是管理員：頭像＋姓名（點一下跳去我的活動）、「登出」。
  //   已登入、是管理員：頭像＋姓名、「管理員」（切換管理員視角，目前
  //   在管理員視角就反白）、「登出」——順序照這樣排，不用另外用 CSS
  //   order 換位。
  function updateNavRoleToggle(){
    var toggle = document.getElementById('navRoleToggle');
    if(!toggle) return;
    var name = getPlayerName();

    if(!name){
      toggle.innerHTML =
        '<button type="button" class="role-toggle-btn" data-action="register">註冊</button>' +
        '<button type="button" class="role-toggle-btn" data-action="login">登入</button>';
      return;
    }

    var html = '<button type="button" class="role-toggle-btn has-identity" data-action="identity">' +
      navAvatarHTML(name) + '<span class="nav-id-name">' + name + '</span>' +
    '</button>';
    if(getPlayerIsAdmin()){
      html += '<button type="button" class="role-toggle-btn' + (getRole() === 'admin' ? ' active' : '') + '" data-action="admin-toggle">管理員</button>';
    }
    html += '<button type="button" class="role-toggle-btn" data-action="logout">登出</button>';
    toggle.innerHTML = html;

    // 有綁定 LINE 頭像照片就優先顯示，載入失敗（連結失效／被擋）就
    // 退回原本的姓名縮寫圓圈，不留一格空白圖示。
    var avatarImg = toggle.querySelector('img.nav-id-avatar');
    if(avatarImg){
      avatarImg.addEventListener('error', function(){
        var fallback = document.createElement('span');
        fallback.className = 'nav-id-avatar';
        fallback.textContent = avatarInitial(name);
        avatarImg.replaceWith(fallback);
      }, { once:true });
    }
  }

  function navAvatarHTML(name){
    var photo = getPlayerPhoto();
    if(photo) return '<img class="nav-id-avatar" src="' + photo + '" referrerpolicy="no-referrer" alt="">';
    return '<span class="nav-id-avatar">' + avatarInitial(name) + '</span>';
  }

  // 球員登入用 identity-picker.js 同一套流程，塞進 nav 自己的 overlay，
  // 留在目前頁面完成登入，不用跳去 profile.html。nav 上「註冊」「登入」
  // 兩顆按鈕分別直接開對應畫面，不用先經過起始選擇畫面。
  function openNavLogin(entry){
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

  // 管理員不再另外登入——直接點「管理員」在目前已登入的球員身分上切換
  // 視角，是不是真的有權限看 setRole() 裡的 getPlayerIsAdmin() 守著。
  function wireNavRoleToggle(){
    var toggle = document.getElementById('navRoleToggle');
    if(!toggle) return;
    toggle.addEventListener('click', function(e){
      var btn = e.target.closest('.role-toggle-btn');
      if(!btn) return;
      var action = btn.dataset.action;
      if(action === 'admin-toggle'){
        setRole(getRole() === 'admin' ? 'player' : 'admin');
        return;
      }
      if(action === 'logout'){
        setPlayerName('');
        return;
      }
      if(action === 'identity'){
        window.location.href = 'profile.html';
        return;
      }
      openNavLogin(action);
    });

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
    // 用 setRole 重新驗證一次，而不是直接信任 localStorage 存的值——
    // 萬一目前綁定的球員身分已經不是管理員了，這裡會被拉回 player。
    setRole(getRole());
    wireNavRoleToggle();
  });

  window.WhonextAuth = {
    ROLE_KEY: ROLE_KEY, getRole: getRole, setRole: setRole,
    getPlayerName: getPlayerName, setPlayerName: setPlayerName,
    getPlayerIsAdmin: getPlayerIsAdmin, getPlayerPhoto: getPlayerPhoto
  };
})();
