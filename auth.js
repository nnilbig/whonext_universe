(function(){
  var ROLE_KEY = 'whonext_role';
  var PLAYER_NAME_KEY = 'whonext_player_name';
  var IS_ADMIN_KEY = 'whonext_player_is_admin';
  var PHOTO_KEY = 'whonext_player_photo';
  var PLAYER_ID_KEY = 'whonext_player_id';
  var IDLE_LIMIT_MS = 5 * 60 * 1000;
  var idleTimer = null;

  // 管理員身分不再另外登入，直接看目前綁定的球員本人在 profiles 裡的
  // is_admin——「管理員視角」只是同一個人切換看到的畫面（見 setRole）。
  function getRole(){ return localStorage.getItem(ROLE_KEY) || 'player'; }
  function getPlayerIsAdmin(){ return localStorage.getItem(IS_ADMIN_KEY) === '1'; }

  function getPlayerName(){ return localStorage.getItem(PLAYER_NAME_KEY) || ''; }
  function getPlayerPhoto(){ return localStorage.getItem(PHOTO_KEY) || ''; }
  // players 表的 player_id（真正的主鍵），profile.html 的「帳號綁定」面板
  // 要用這個去比對/呼叫 linkProviderProfile，不是用 name（name 可能之後
  // 還會改）。舊的登入狀態（這個欄位加進來之前存的）會是空字串，這種情況
  // 綁定面板要請使用者重新登入一次才能用，不能瞎綁。
  function getPlayerId(){ return localStorage.getItem(PLAYER_ID_KEY) || ''; }

  // 設定/清除目前綁定的球員身分，並同步更新 top nav 的頭像顯示，
  // 讓正在看 profile.html 的頁面也能透過事件即時重繪。isAdmin／photoUrl／
  // playerId 都來自登入/註冊回傳的 player 資料（is_admin、avatar_url 或
  // photo_url 視登入用哪個 provider 而定、player_id），換身分或登出一律
  // 重置回球員視角，管理員視角要重新點一次「管理員」才會切換過去。
  function setPlayerName(name, isAdmin, photoUrl, playerId){
    if(name){
      localStorage.setItem(PLAYER_NAME_KEY, name);
      localStorage.setItem(IS_ADMIN_KEY, isAdmin ? '1' : '0');
      if(photoUrl) localStorage.setItem(PHOTO_KEY, photoUrl);
      else localStorage.removeItem(PHOTO_KEY);
      if(playerId) localStorage.setItem(PLAYER_ID_KEY, playerId);
      else localStorage.removeItem(PLAYER_ID_KEY);
    } else {
      localStorage.removeItem(PLAYER_NAME_KEY);
      localStorage.removeItem(IS_ADMIN_KEY);
      localStorage.removeItem(PHOTO_KEY);
      localStorage.removeItem(PLAYER_ID_KEY);
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

  // Top nav 的身分區塊整個從狀態重繪，比較好處理四種情況：
  //   沒登入：只留「球員登入」一顆——點下去直接走登入流程，選到還沒
  //   註冊過的帳號時，identity-picker.js 的 renderNotRegistered 會自動
  //   接手詢問要不要前往註冊，不用在 nav 這裡另外放一顆「註冊」分岔。
  //   已登入、球員視角：頭像＋姓名（點一下跳去我的活動）、「管理員」
  //   （有 is_admin 才會出現）、「登出」。
  //   已登入、管理員視角：不顯示球員本人的頭像／姓名——切到管理員等於
  //   把球員身分那個入口收起來，只留「管理員」（反白）「登出」，畫面上
  //   看起來像是純粹的管理員身分在操作，不是掛著某個人的名字。球員的
  //   登入狀態／is_admin 權限判斷還是留在背後，切回球員視角不用重新
  //   登入，「登出」也還是一次登出全部。
  function updateNavRoleToggle(){
    var toggle = document.getElementById('navRoleToggle');
    if(!toggle) return;
    var name = getPlayerName();

    if(!name){
      toggle.innerHTML = '<button type="button" class="role-toggle-btn" data-action="login">球員登入</button>';
      return;
    }

    var isAdminView = getRole() === 'admin';
    var html = '';
    if(!isAdminView){
      html += '<button type="button" class="role-toggle-btn has-identity" data-action="identity">' +
        navAvatarHTML(name) + '<span class="nav-id-name">' + name + '</span>' +
      '</button>';
    }
    if(getPlayerIsAdmin()){
      html += '<button type="button" class="role-toggle-btn' + (isAdminView ? ' active' : '') + '" data-action="admin-toggle">管理員</button>';
    }
    html += '<button type="button" class="role-toggle-btn" data-action="logout">登出</button>';
    toggle.innerHTML = html;

    if(isAdminView) return; // 管理員視角沒有頭像可顯示

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
  // 留在目前頁面完成登入，不用跳去 profile.html。選到還沒註冊過的帳號時，
  // identity-picker.js 的 handleLoginCredential／finishLineAuth 會自動
  // 接手轉去註冊，不需要另外的起始選擇畫面。
  function openNavLogin(){
    var overlay = document.getElementById('navLoginOverlay');
    var container = document.getElementById('navLoginContainer');
    if(!overlay || !container || !window.WhonextIdentityPicker) return;
    // 已經開著就不要重畫——例如個人頁/錢包頁沒登入會自動跳出這個彈窗，
    // 資料重新整理時可能再呼叫一次，這時使用者可能正在裡面操作登入流程
    // （選擇身份中／等 Google 驗證），重畫回第一步會把使用者手上的操作沖掉。
    if(overlay.classList.contains('open')) return;
    container.innerHTML = '';
    WhonextIdentityPicker.renderLoginMenu(container);
    overlay.classList.add('open');
  }

  function closeNavLogin(){
    var overlay = document.getElementById('navLoginOverlay');
    if(overlay) overlay.classList.remove('open');
  }

  // 個人／錢包分頁點下去還沒登入，或是 LINE 登入需要整頁導去 access.line.me
  // 授權再導回來（見 identity-picker.js startLineFlow）——不管哪一種，登入
  // 成功後要導去的目的地都存在這裡，不能只放記憶體變數：LINE 那趟一定會
  // 整頁重新載入，記憶體變數會被沖掉，只有 sessionStorage 撐得過去。
  var POST_LOGIN_REDIRECT_KEY = 'wu_post_login_redirect';
  function setPostLoginRedirect(url){ sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, url); }

  document.addEventListener('whonext:playername-change', function(){
    var target = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    if(!target) return;
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    if(getPlayerName()) window.location.href = target;
  });

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
        // 個人頁/錢包頁登出後畫面已經沒東西可看（會立刻跳登入彈窗擋住），
        // 直接跳回首頁比留在原地更乾脆。
        var page = location.pathname.split('/').pop();
        if(page === 'profile.html' || page === 'finance.html') window.location.href = 'index.html';
        return;
      }
      if(action === 'identity'){
        window.location.href = 'profile.html';
        return;
      }
      openNavLogin();
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
    getPlayerIsAdmin: getPlayerIsAdmin, getPlayerPhoto: getPlayerPhoto,
    getPlayerId: getPlayerId, openNavLogin: openNavLogin, closeNavLogin: closeNavLogin,
    setPostLoginRedirect: setPostLoginRedirect
  };
})();
