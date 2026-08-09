(function(){
  // 「球員登入」身分綁定流程，我的活動／我的錢包共用同一份畫面跟邏輯，
  // 避免兩邊各刻一份之後跑掉。真的 Google 登入（Google Identity Services）
  // 接在這裡：按鈕 → 驗證中 → (a) email 對到已綁定的 profiles 列直接登入
  // (b) 沒對到 email 但顯示名稱疑似舊名冊裡還沒綁定的人 → 讓使用者手動
  // 確認要不要綁定 (c) 兩邊都沒對到 → 用 Google 資料自動建檔。跟
  // demo.html 的 gauth mock 是同一套邏輯，只是這裡真的打 GAS 後端驗證
  // token、寫回 profiles 分頁。
  // 選完/建完身份呼叫 WhonextAuth.setPlayerName()，會觸發
  // whonext:playername-change，呼叫方監聽這個事件重繪自己的頁面即可
  // （這個 identity picker 的容器通常也會因此被換掉，不用自己關窗）。
  // 「管理員」入口也放在這裡，因為 top nav 已經拿掉管理員按鈕了，那邊
  // 還是原本帳密登入的假 Google 驗證流程，不在這次真登入的範圍內。

  var GOOGLE_CLIENT_ID = '702772011583-5g00roumo9mgruijtn3jhg525bot1cja.apps.googleusercontent.com';

  // GIS 的 script 是非同步載入，用一個小型 ready callback queue 讓任何時候
  // 呼叫 renderGoogleButton() 都能等到腳本真的可用再初始化，不用在每個
  // 呼叫端各自處理載入時序。
  var gisReady = false;
  var gisReadyCallbacks = [];
  function onGisReady(cb){
    if(gisReady){ cb(); return; }
    gisReadyCallbacks.push(cb);
  }
  (function loadGis(){
    if(document.getElementById('google-identity-services')) return;
    var s = document.createElement('script');
    s.id = 'google-identity-services';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = function(){
      gisReady = true;
      gisReadyCallbacks.forEach(function(cb){ cb(); });
      gisReadyCallbacks = [];
    };
    document.head.appendChild(s);
  })();

  function render(container){
    renderStart(container);
  }

  function renderStart(container){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">球員登入</div>' +
        '<div class="whoami-sub">用 Google 帳號登入，還沒綁定過的帳號會帶你完成綁定或註冊。</div>' +
        '<div class="whoami-google-btn-wrap" id="wiGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiAdminBtn">我是管理員</button>' +
      '</div>';
    container.querySelector('#wiAdminBtn').addEventListener('click', function(){ WhonextAuth.openAdminLogin(); });
    renderGoogleButton(container, container.querySelector('#wiGoogleBtnWrap'));
  }

  function renderGoogleButton(container, btnWrap){
    onGisReady(function(){
      if(!document.body.contains(btnWrap)) return; // 使用者已經切到別的畫面
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: function(response){ handleGoogleCredential(container, response.credential); }
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

  function renderError(container, msg){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="auth-error" style="margin:0 0 14px;">' + msg + '</div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiRetryBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiRetryBtn').addEventListener('click', function(){ renderStart(container); });
  }

  function handleGoogleCredential(container, credential){
    renderVerifying(container);
    apiPost('googleLogin', { credential: credential }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){ renderError(container, '登入驗證失敗，請稍後再試'); return; }
      if(result.matched === 'active'){
        finishLogin(container, result.profile.name);
      } else if(result.matched === 'legacy_candidates'){
        renderLegacyMatch(container, credential, result.account, result.candidates);
      } else {
        renderAutoCreate(container, credential, result.account);
      }
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試');
    });
  }

  // 既有名稱配對：Google 顯示名稱疑似舊名冊裡的人，請使用者手動確認
  // 是不是同一個人，選到就把這個 Google 帳號併進那筆既有 profiles 資料；
  // 「都不是」則走自動建檔，用 Google 資料開一筆全新的。
  function renderLegacyMatch(container, credential, account, candidates){
    var candidatesHTML = candidates.map(function(n){
      return '<button type="button" class="whoami-account" data-name="' + n + '">' +
        '<div class="whoami-account-avatar">' + avatarInitial(n) + '</div>' +
        '<div class="whoami-account-name">' + n + '</div>' +
      '</button>';
    }).join('');
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">是否綁定既有球員身份？</div>' +
        '<div class="whoami-sub">Google 帳號「' + account.name + '」（' + account.email + '）還沒綁定過，我們在舊名冊找到可能是你的資料，選一個綁定，或建立全新帳號。</div>' +
        '<div class="whoami-account-list">' + candidatesHTML + '</div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiNotMeBtn">都不是，建立新帳號</button>' +
      '</div>';
    container.querySelectorAll('.whoami-account').forEach(function(btn){
      btn.addEventListener('click', function(){ bindLegacyProfile(container, credential, btn.dataset.name); });
    });
    container.querySelector('#wiNotMeBtn').addEventListener('click', function(){ renderAutoCreate(container, credential, account); });
  }

  function bindLegacyProfile(container, credential, legacyName){
    renderVerifying(container, '綁定帳號中…');
    apiPost('bindGoogleProfile', { credential: credential, name: legacyName }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){ renderError(container, '綁定失敗，請稍後再試'); return; }
      finishLogin(container, legacyName);
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試');
    });
  }

  // 自動建檔：email 跟顯示名稱都沒對到，用 Google 提供的 name/email/photo
  // 開一筆新的 profiles，不用再手動輸入暱稱。
  function renderAutoCreate(container, credential, account){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-account-avatar-lg">' + avatarInitial(account.name) + '</div>' +
        '<div class="whoami-title" style="text-align:center;">建立球員帳號</div>' +
        '<div class="whoami-sub" style="text-align:center;">用 Google 資料自動建檔：' + account.name + '（' + account.email + '）</div>' +
        '<button type="button" class="whoami-primary-btn" id="wiCreateBtn">確認建立</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiCreateCancelBtn">取消</button>' +
      '</div>';
    container.querySelector('#wiCreateCancelBtn').addEventListener('click', function(){ renderStart(container); });
    container.querySelector('#wiCreateBtn').addEventListener('click', function(){ createProfile(container, credential); });
  }

  function createProfile(container, credential){
    renderVerifying(container, '建立帳號中…');
    apiPost('createGoogleProfile', { credential: credential }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){
        renderError(container, result && result.reason === 'name_taken' ? '這個名字已經有人在用了，請聯絡管理員協助處理' : '建立帳號失敗，請稍後再試');
        return;
      }
      finishLogin(container, result.profile.name);
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試');
    });
  }

  function finishLogin(container, name){
    WhonextAuth.setPlayerName(name);
  }

  window.WhonextIdentityPicker = { render: render };
})();
