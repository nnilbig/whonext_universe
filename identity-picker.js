(function(){
  // 「球員登入」入口分成「註冊」／「登入」兩支，我的活動／我的錢包／nav
  // 共用同一份畫面跟邏輯，避免各處各刻一份之後跑掉。
  //   註冊：手動選/打暱稱（可以從舊名冊挑，也能直接輸入新的）-> 綁定
  //         Google 帳號完成註冊。
  //   登入：已經綁過 Google 帳號的人一鍵登入；沒綁過的話會被導去註冊。
  //         管理員沒有另外的登入流程，是不是管理員直接看登入回傳的
  //         profile.is_admin（見 finishLogin）。
  // 沒有訪客身分——一律要綁 Google 帳號才能報名/使用功能。
  // Google 憑證一律送後端驗證（GIS 的 script 由 backend.js 的 WhonextGis
  // 共用載入）。
  // 選完/建完球員身份呼叫 WhonextAuth.setPlayerName()，會觸發
  // whonext:playername-change，呼叫方監聽這個事件重繪自己的頁面即可
  // （這個 identity picker 的容器通常也會因此被換掉，不用自己關窗）。

  var GOOGLE_CLIENT_ID = '702772011583-5g00roumo9mgruijtn3jhg525bot1cja.apps.googleusercontent.com';

  function render(container){
    renderStart(container);
  }

  function renderStart(container){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">球員登入</div>' +
        '<div class="whoami-sub">快速綁定 Google 帳號「註冊」；已經註冊過的話直接「登入」。</div>' +
        '<div class="whoami-branch-row">' +
          '<button type="button" class="whoami-branch-btn" id="wiRegisterBtn">註冊</button>' +
          '<button type="button" class="whoami-branch-btn" id="wiLoginBtn">登入</button>' +
        '</div>' +
      '</div>';
    container.querySelector('#wiRegisterBtn').addEventListener('click', function(){ renderRegister(container); });
    container.querySelector('#wiLoginBtn').addEventListener('click', function(){ renderLoginMenu(container); });
  }

  // ---------------------------------------------------------------
  // 登入
  // ---------------------------------------------------------------
  // hideBack：從 nav「登入」按鈕直接開這個畫面時不經過 renderStart，
  // 沒有上一步可回，就不顯示「‹」。
  function renderLoginMenu(container, hideBack){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">登入</div>' +
        '<div class="whoami-sub">用已經綁定過的 Google 或 LINE 帳號登入。</div>' +
        '<div class="whoami-google-btn-wrap" id="wiGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
        '<div class="whoami-or-divider">或</div>' +
        '<button type="button" class="whoami-line-btn" id="wiLineLoginBtn">使用 LINE 登入</button>' +
        (hideBack ? '' : '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>') +
      '</div>';
    if(!hideBack) container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });
    renderGoogleButton(container, container.querySelector('#wiGoogleBtnWrap'), handleLoginCredential);
    container.querySelector('#wiLineLoginBtn').addEventListener('click', function(){ startLineFlow(container, 'login'); });
  }

  function handleLoginCredential(container, credential){
    renderVerifying(container);
    apiPost('googleLogin', { credential: credential }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){ renderError(container, '登入驗證失敗，請稍後再試', renderLoginMenu); return; }
      if(result.matched){
        finishLogin(container, result.profile);
      } else {
        renderNotRegistered(container, result.account);
      }
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', renderLoginMenu);
    });
  }

  function renderNotRegistered(container, account){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">這個 Google 帳號還沒註冊</div>' +
        '<div class="whoami-sub">「' + account.name + '」（' + account.email + '）還沒綁定過球員身份，要先完成註冊才能登入。</div>' +
        '<button type="button" class="whoami-primary-btn" id="wiGoRegisterBtn">前往註冊</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiGoRegisterBtn').addEventListener('click', function(){ renderRegister(container); });
    container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });
  }

  function renderNotRegisteredLine(container, account){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">這個 LINE 帳號還沒註冊</div>' +
        '<div class="whoami-sub">「' + (account.name || 'LINE 使用者') + '」還沒綁定過球員身份，要先完成註冊才能登入。</div>' +
        '<button type="button" class="whoami-primary-btn" id="wiGoRegisterBtn">前往註冊</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiGoRegisterBtn').addEventListener('click', function(){ renderRegister(container); });
    container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });
  }

  // ---------------------------------------------------------------
  // 註冊
  // ---------------------------------------------------------------
  // 暱稱建議清單給「至少還有一種登入管道沒綁」的名字——不限 status，
  // 舊名冊(legacy)還沒人綁過的、跟已經用 Google 或 LINE 其中一邊註冊過
  // (active)但還沒綁另一邊的都算，因為同一個人可能想「換一個管道再綁
  // 一次」而不是只有第一次註冊才能選。這裡不分使用者接下來要點 Google
  // 還是 LINE 按鈕，兩種都可能綁的名字都列出來，真的選錯管道送出時
  // gas/Code.gs 那邊還是會用正確的欄位再判斷一次，不會綁錯人。
  var legacyNicknamesCache = null;
  function getLegacyNicknames(){
    if(legacyNicknamesCache) return Promise.resolve(legacyNicknamesCache);
    const cached = getApiCache({ action:'getProfiles' });
    const load = cached ? Promise.resolve(cached) : apiGet({ action:'getProfiles' }).then(function(r){ setApiCache({ action:'getProfiles' }, r); return r; });
    return load.then(function(result){
      const names = new Set();
      (result.profiles || []).forEach(function(p){
        if(!p.email || !p.line_user_id) names.add(p.name);
      });
      legacyNicknamesCache = Array.from(names);
      return legacyNicknamesCache;
    }).catch(function(){ return []; });
  }

  // hideBack：從 nav「註冊」按鈕直接開這個畫面時不經過 renderStart，
  // 沒有上一步可回，就不顯示「‹」。
  function renderRegister(container, hideBack){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">註冊</div>' +
        '<div class="whoami-sub">選擇你的暱稱（可以從名單挑，也可以直接輸入新的），再綁定 Google 帳號完成註冊。</div>' +
        '<input type="text" id="wiNickname" class="nav-login-input" list="wiNicknameList" placeholder="輸入或選擇暱稱" autocomplete="off">' +
        '<datalist id="wiNicknameList"></datalist>' +
        '<div class="auth-error" id="wiNicknameError" style="display:none">請先輸入暱稱，再綁定帳號</div>' +
        '<div class="whoami-google-btn-wrap" id="wiGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
        '<div class="whoami-or-divider">或</div>' +
        '<button type="button" class="whoami-line-btn" id="wiLineRegisterBtn">使用 LINE 綁定</button>' +
        (hideBack ? '' : '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>') +
      '</div>';

    getLegacyNicknames().then(function(names){
      const listEl = container.querySelector('#wiNicknameList');
      if(listEl) listEl.innerHTML = names.map(function(n){ return '<option value="' + n + '">'; }).join('');
    });

    if(!hideBack) container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });

    function readNicknameOrFlagError(){
      const nameInput = container.querySelector('#wiNickname');
      const name = nameInput ? nameInput.value.trim() : '';
      if(!name){
        const err = container.querySelector('#wiNicknameError');
        if(err) err.style.display = 'block';
        if(nameInput) nameInput.focus();
      }
      return name;
    }

    renderGoogleButton(container, container.querySelector('#wiGoogleBtnWrap'), function(c, credential){
      const name = readNicknameOrFlagError();
      if(!name) return;
      handleRegisterCredential(container, credential, name);
    });

    container.querySelector('#wiLineRegisterBtn').addEventListener('click', function(){
      const name = readNicknameOrFlagError();
      if(!name) return;
      startLineFlow(container, 'register', name);
    });
  }

  function handleRegisterCredential(container, credential, name){
    renderVerifying(container, '註冊中…');
    apiPost('registerGoogleProfile', { credential: credential, name: name }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){
        const msg = result && result.reason === 'name_taken' ? '這個暱稱已經有人用了，換一個看看'
          : result && result.reason === 'already_bound' ? '這個 Google 帳號已經註冊過了，改用「登入」即可'
          : '註冊失敗，請稍後再試';
        renderError(container, msg, renderRegister);
        return;
      }
      finishLogin(container, result.profile);
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', renderRegister);
    });
  }

  // ---------------------------------------------------------------
  // 共用
  // ---------------------------------------------------------------
  function renderGoogleButton(container, btnWrap, onCredential){
    if(!btnWrap) return;
    WhonextGis.onReady(function(){
      if(!document.body.contains(btnWrap)) return; // 使用者已經切到別的畫面
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: function(response){ onCredential(container, response.credential); }
      });
      btnWrap.innerHTML = '';
      google.accounts.id.renderButton(btnWrap, { theme:'filled_black', shape:'pill', size:'large', text:'continue_with', width:240 });
    });
  }

  function renderVerifying(container, text){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-spinner-wrap">' +
          '<div class="whoami-spinner"></div>' +
          '<div class="whoami-spinner-text">' + (text || '驗證 Google 帳號中…') + '</div>' +
        '</div>' +
      '</div>';
  }

  function renderError(container, msg, backTo){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="auth-error" style="margin:0 0 14px;">' + msg + '</div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiRetryBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiRetryBtn').addEventListener('click', function(){ (backTo || renderStart)(container); });
  }

  // is_admin 存在 sheet 裡可能是布林值也可能是核取方塊讀出來的 'TRUE'
  // 字串，兩種都要認得。photo_url 是註冊當下存的 Google 大頭貼連結，
  // nav 會優先顯示這張照片，沒有的話才退回姓名縮寫圓圈。
  function finishLogin(container, profile){
    const isAdmin = profile.is_admin === true || profile.is_admin === 'TRUE';
    WhonextAuth.setPlayerName(profile.name, isAdmin, profile.photo_url);
  }

  // ---------------------------------------------------------------
  // LINE 登入／註冊。LIFF 的登入是導頁流程（liff.login() 會整頁導去 LINE
  // 的授權畫面，同網域內導回來），不是像 Google 那樣在頁面裡直接拿到結果，
  // 所以要先把「使用者原本想做什麼」存進 sessionStorage，導回來後（頁面
  // 整個重新載入、原本的 container 已經不在了）才有辦法接著跑完剩下的
  // 驗證流程。如果使用者本來就已經是 LIFF 登入狀態（SDK 把先前登入的憑證
  // 存起來了），就完全不用跳出去，原地驗證完成即可。
  // ---------------------------------------------------------------
  var LINE_PENDING_KEY = 'wu_line_oauth_pending';

  function startLineFlow(container, mode, name){
    renderVerifying(container, 'LINE 登入中…');
    sessionStorage.setItem(LINE_PENDING_KEY, JSON.stringify({ mode: mode, name: name || '' }));
    WhonextLiff.ensureReady(function(){
      if(!document.body.contains(container)) return;
      if(!WhonextLiff.isReady()){
        sessionStorage.removeItem(LINE_PENDING_KEY);
        renderError(container, '無法連線 LINE，請稍後再試', mode === 'register' ? renderRegister : renderLoginMenu);
        return;
      }
      if(WhonextLiff.isLoggedIn()){
        sessionStorage.removeItem(LINE_PENDING_KEY);
        finishLineAuth(container, mode, name, WhonextLiff.getIDToken());
      } else {
        WhonextLiff.login(window.location.href);
      }
    });
  }

  function finishLineAuth(container, mode, name, idToken){
    const action = mode === 'register' ? 'registerLineProfile' : 'lineLogin';
    const payload = mode === 'register' ? { idToken: idToken, name: name } : { idToken: idToken };
    apiPost(action, payload).then(function(result){
      if(!document.body.contains(container)) return;
      if(mode === 'login' && result && result.success && result.matched === false){
        renderNotRegisteredLine(container, result.account);
        return;
      }
      if(!result || !result.success){
        const msg = result && result.reason === 'name_taken' ? '這個暱稱已經有人用了，換一個看看'
          : result && result.reason === 'already_bound' ? '這個 LINE 帳號已經註冊過了，改用「登入」即可'
          : 'LINE 驗證失敗，請稍後再試';
        renderError(container, msg, mode === 'register' ? renderRegister : renderLoginMenu);
        return;
      }
      finishLogin(container, result.profile);
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', mode === 'register' ? renderRegister : renderLoginMenu);
    });
  }

  // 從 LINE 導回來後（整頁重新載入）接著跑完剩下的登入／註冊流程，把 nav
  // 的登入 overlay 打開、顯示驗證中狀態，體驗上跟原本在同一頁點按鈕一致。
  document.addEventListener('DOMContentLoaded', function(){
    var pendingRaw = sessionStorage.getItem(LINE_PENDING_KEY);
    if(!pendingRaw) return;
    sessionStorage.removeItem(LINE_PENDING_KEY);
    var pending;
    try{ pending = JSON.parse(pendingRaw); } catch(e){ return; }

    var overlay = document.getElementById('navLoginOverlay');
    var container = document.getElementById('navLoginContainer');
    if(!overlay || !container) return;
    container.innerHTML = '';
    overlay.classList.add('open');
    renderVerifying(container, 'LINE 登入中…');

    WhonextLiff.ensureReady(function(){
      if(!document.body.contains(container)) return;
      if(!WhonextLiff.isReady() || !WhonextLiff.isLoggedIn()){
        renderError(container, 'LINE 登入失敗，請重新嘗試', renderStart);
        return;
      }
      finishLineAuth(container, pending.mode, pending.name, WhonextLiff.getIDToken());
    });
  });

  window.WhonextIdentityPicker = { render: render, renderLoginMenu: renderLoginMenu, renderRegister: renderRegister };
})();
