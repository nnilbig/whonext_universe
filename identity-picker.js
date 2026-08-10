(function(){
  // 「球員登入」入口分成「註冊」／「登入」兩支，我的活動／我的錢包／nav
  // 共用同一份畫面跟邏輯，避免各處各刻一份之後跑掉。
  //   註冊：手動選/打暱稱（可以從舊名冊挑，也能直接輸入新的）-> 綁定
  //         Google 帳號完成註冊，或不綁 Google、直接以訪客登入。
  //   登入：已經綁過 Google 帳號的人一鍵登入；沒綁過的話會被導去註冊。
  //         這裡也放訪客登入／管理員登入的入口。
  // Google 憑證一律送後端驗證（GIS 的 script 由 backend.js 的 WhonextGis
  // 共用載入，跟 auth.js 的管理員登入共用同一份 ready queue）。
  // 選完/建完身份呼叫 WhonextAuth.setPlayerName()／setGuestName()，會觸發
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
        '<div class="whoami-sub">用已經綁定過的 Google 帳號登入，或先以訪客身份逛逛。</div>' +
        '<div class="whoami-google-btn-wrap" id="wiGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiGuestBtn">訪客登入</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiAdminBtn">管理員登入</button>' +
        (hideBack ? '' : '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>') +
      '</div>';
    container.querySelector('#wiGuestBtn').addEventListener('click', function(){ renderGuestForm(container, ''); });
    container.querySelector('#wiAdminBtn').addEventListener('click', function(){ WhonextAuth.openAdminLogin(); });
    if(!hideBack) container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });
    renderGoogleButton(container, container.querySelector('#wiGoogleBtnWrap'), handleLoginCredential);
  }

  function handleLoginCredential(container, credential){
    renderVerifying(container);
    apiPost('googleLogin', { credential: credential }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){ renderError(container, '登入驗證失敗，請稍後再試', renderLoginMenu); return; }
      if(result.matched){
        finishLogin(container, result.profile.name);
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

  // ---------------------------------------------------------------
  // 註冊
  // ---------------------------------------------------------------
  // 暱稱建議清單只給「舊名冊、還沒綁定」的名字（status legacy 且沒有
  // email）—— 已經綁過的人選了也只會被擋掉，先篩掉比較不會誤導。
  var legacyNicknamesCache = null;
  function getLegacyNicknames(){
    if(legacyNicknamesCache) return Promise.resolve(legacyNicknamesCache);
    const cached = getApiCache({ action:'getProfiles' });
    const load = cached ? Promise.resolve(cached) : apiGet({ action:'getProfiles' }).then(function(r){ setApiCache({ action:'getProfiles' }, r); return r; });
    return load.then(function(result){
      legacyNicknamesCache = (result.profiles || [])
        .filter(function(p){ return p.status === 'legacy' && !p.email; })
        .map(function(p){ return p.name; });
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
        '<div class="auth-error" id="wiNicknameError" style="display:none">請先輸入暱稱，再綁定 Google 帳號</div>' +
        '<div class="whoami-google-btn-wrap" id="wiGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiGuestInsteadBtn">不註冊，以訪客登入</button>' +
        (hideBack ? '' : '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>') +
      '</div>';

    getLegacyNicknames().then(function(names){
      const listEl = container.querySelector('#wiNicknameList');
      if(listEl) listEl.innerHTML = names.map(function(n){ return '<option value="' + n + '">'; }).join('');
    });

    container.querySelector('#wiGuestInsteadBtn').addEventListener('click', function(){
      const nameInput = container.querySelector('#wiNickname');
      renderGuestForm(container, nameInput ? nameInput.value.trim() : '');
    });
    if(!hideBack) container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });

    renderGoogleButton(container, container.querySelector('#wiGoogleBtnWrap'), function(c, credential){
      const nameInput = container.querySelector('#wiNickname');
      const name = nameInput ? nameInput.value.trim() : '';
      if(!name){
        const err = container.querySelector('#wiNicknameError');
        if(err) err.style.display = 'block';
        if(nameInput) nameInput.focus();
        return;
      }
      handleRegisterCredential(container, credential, name);
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
      finishLogin(container, result.profile.name);
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', renderRegister);
    });
  }

  // ---------------------------------------------------------------
  // 訪客
  // ---------------------------------------------------------------
  function renderGuestForm(container, prefill){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">訪客登入</div>' +
        '<div class="whoami-sub">不用綁定 Google 帳號，輸入名字就能先逛逛，之後隨時可以再回來註冊。</div>' +
        '<input type="text" id="wiGuestName" class="nav-login-input" placeholder="輸入你的名字" value="' + (prefill || '') + '">' +
        '<div class="auth-error" id="wiGuestError" style="display:none">請輸入名字</div>' +
        '<button type="button" class="whoami-primary-btn" id="wiGuestConfirmBtn">確認</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });
    container.querySelector('#wiGuestConfirmBtn').addEventListener('click', function(){
      const input = container.querySelector('#wiGuestName');
      const name = input.value.trim();
      if(!name){
        container.querySelector('#wiGuestError').style.display = 'block';
        input.focus();
        return;
      }
      WhonextAuth.setGuestName(name);
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

  function finishLogin(container, name){
    WhonextAuth.setPlayerName(name);
  }

  window.WhonextIdentityPicker = { render: render, renderLoginMenu: renderLoginMenu, renderRegister: renderRegister };
})();
