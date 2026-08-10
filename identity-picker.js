(function(){
  // 「球員登入」入口分成「註冊」／「登入」兩支，我的活動／我的錢包／nav
  // 共用同一份畫面跟邏輯，避免各處各刻一份之後跑掉。
  //   註冊：兩步——(1) 直接顯示 Google／LINE 按鈕（跟登入同一種畫面結構），
  //         點哪個就用哪個驗證，不用先打暱稱，後端會先用顯示名稱頂著
  //         建檔 (2) 問要不要順便綁定舊球員暱稱，輸入暱稱送出或直接按
  //         「略過」都會馬上進畫面——略過的話 custom_name 先掛顯示名稱，
  //         之後可以在個人頁補綁真正的舊暱稱。
  //   登入：已經綁過 Google 或 LINE 帳號的人一鍵登入；沒綁過的話會被
  //         導去註冊。管理員沒有另外的登入流程，是不是管理員直接看
  //         登入回傳的 profile.is_admin（見 finishLogin）。
  // 沒有訪客身分——一律要綁 Google 或 LINE 其中一個才能報名/使用功能。
  // 「已經綁過其中一個、想再多綁另一個」不是在這裡的匿名註冊流程處理
  // （故意不做同名自動合併——那等於任何人都能打別人的暱稱去「認領」
  // 別人的帳號），而是要先登入，在 renderBindPanel（profile.html 的
  // 「帳號綁定」面板）用 linkProviderProfile 處理。
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
        '<div class="whoami-sub">快速綁定 LINE 帳號「註冊」；已經註冊過的話直接「登入」。</div>' +
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
        finishLogin(container, result.profile, 'google');
      } else {
        renderNotRegistered(container, result.account, 'google');
      }
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', renderLoginMenu);
    });
  }

  function renderNotRegistered(container, account, provider){
    var label = provider === 'google' ? (account.name || '') + (account.email ? '（' + account.email + '）' : '') : (account.name || 'LINE 使用者');
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">這個帳號還沒註冊</div>' +
        '<div class="whoami-sub">「' + label + '」還沒綁定過球員身份，要先完成註冊才能登入。</div>' +
        '<button type="button" class="whoami-primary-btn" id="wiGoRegisterBtn">前往註冊</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiGoRegisterBtn').addEventListener('click', function(){ renderRegister(container); });
    container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });
  }

  // ---------------------------------------------------------------
  // 註冊
  // ---------------------------------------------------------------
  // 暱稱建議清單給「還沒註冊過」的名字——舊球員名單即時從 getRoster
  // （merges members 歷史姓名 + players 綁定狀態）撈，只列 is_bound
  // 還是 false 的，不管接下來要選 Google 還是 LINE 綁定都是同一份清單。
  var legacyNicknamesCache = null;
  function getLegacyNicknames(){
    if(legacyNicknamesCache) return Promise.resolve(legacyNicknamesCache);
    const cached = getApiCache({ action:'getRoster' });
    const load = cached ? Promise.resolve(cached) : apiGet({ action:'getRoster' }).then(function(r){ setApiCache({ action:'getRoster' }, r); return r; });
    return load.then(function(result){
      legacyNicknamesCache = (result.roster || [])
        .filter(function(p){ return !p.is_bound; })
        .map(function(p){ return p.name; });
      return legacyNicknamesCache;
    }).catch(function(){ return []; });
  }

  // 註冊：直接顯示 Google 按鈕跟 LINE 按鈕，跟 renderLoginMenu 同一種
  // 結構，點哪個就用哪個驗證，不用先選方式、按下一步。這裡不用先打
  // 暱稱——後端註冊時沒收到暱稱會自動用 Google/LINE 的顯示名稱頂著
  // 建檔（is_bound:false），暱稱綁定挪到下一步(renderNicknamePrompt)
  // 問，還可以直接略過。hideBack：從 nav「註冊」按鈕直接開這個畫面時
  // 不經過 renderStart，沒有上一步可回，就不顯示「‹」。
  function renderRegister(container, hideBack){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">註冊</div>' +
        '<div class="whoami-sub">選擇要用哪個帳號註冊，之後不管用哪一個登入都是同一個身份。</div>' +
        '<div class="whoami-google-btn-wrap" id="wiGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
        '<div class="whoami-or-divider">或</div>' +
        '<button type="button" class="whoami-line-btn" id="wiLineRegisterBtn">使用 LINE 註冊</button>' +
        (hideBack ? '' : '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>') +
      '</div>';

    if(!hideBack) container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });

    renderGoogleButton(container, container.querySelector('#wiGoogleBtnWrap'), function(c, credential){
      handleRegisterCredential(container, credential);
    });
    container.querySelector('#wiLineRegisterBtn').addEventListener('click', function(){
      startLineFlow(container, 'register');
    });
  }

  function handleRegisterCredential(container, credential){
    renderVerifying(container, '註冊中…');
    apiPost('registerGoogleProfile', { credential: credential }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){
        const msg = result && result.reason === 'already_bound' ? '這個 Google 帳號已經註冊過了，改用「登入」即可'
          : '註冊失敗，請稍後再試';
        renderError(container, msg, renderRegister);
        return;
      }
      renderNicknamePrompt(container, result.profile, 'google');
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', renderRegister);
    });
  }

  // 步驟二：問要不要順便綁定舊球員暱稱。先把 getLegacyNicknames（讀
  // getRoster 撈出來的球員 name）讀完，下拉選單才會一開始就有選項，
  // 不會先顯示空的、選單打開才慢慢補資料。輸入暱稱送出(bindCustomName)
  // 或按「略過」都會呼叫 finishLogin 直接進畫面——略過的話
  // profile.custom_name 已經是後端自動頂上去的顯示名稱，不是空的，所以
  // 報名/錢包這些功能馬上就能用，只是還沒接回舊資料而已，之後可以再補綁。
  function renderNicknamePrompt(container, profile, provider){
    container.innerHTML = '<div class="whoami-card glass"><div class="whoami-spinner-wrap"><div class="whoami-spinner"></div></div></div>';
    getLegacyNicknames().then(function(names){
      if(!document.body.contains(container)) return;
      renderNicknamePromptForm(container, profile, provider, names);
    });
  }

  function renderNicknamePromptForm(container, profile, provider, names){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">要順便綁定舊球員身份嗎？</div>' +
        '<div class="whoami-sub">如果你是舊球員，輸入以前用的暱稱就能接回報名/錢包紀錄；不是的話可以先略過，之後在個人頁也能補綁。</div>' +
        '<input type="text" id="wiBindNickname" class="nav-login-input" list="wiBindNicknameList" placeholder="輸入或選擇舊暱稱" autocomplete="off">' +
        '<datalist id="wiBindNicknameList">' + names.map(function(n){ return '<option value="' + n + '">'; }).join('') + '</datalist>' +
        '<div class="auth-error" id="wiBindNicknameError" style="display:none">請先輸入暱稱</div>' +
        '<button type="button" class="whoami-primary-btn" id="wiBindNicknameBtn">綁定暱稱</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiSkipBindBtn">略過，直接使用</button>' +
      '</div>';

    container.querySelector('#wiBindNicknameBtn').addEventListener('click', function(){
      const nameInput = container.querySelector('#wiBindNickname');
      const name = nameInput ? nameInput.value.trim() : '';
      if(!name){
        const err = container.querySelector('#wiBindNicknameError');
        if(err) err.style.display = 'block';
        if(nameInput) nameInput.focus();
        return;
      }
      renderVerifying(container, '綁定中…');
      apiPost('bindCustomName', { player_id: profile.player_id, name: name }).then(function(result){
        if(!document.body.contains(container)) return;
        if(!result || !result.success){
          const msg = result && result.reason === 'name_taken' ? '這個暱稱已經有人用了，換一個看看' : '綁定失敗，請稍後再試';
          renderError(container, msg, function(c){ renderNicknamePrompt(c, profile, provider); });
          return;
        }
        finishLogin(container, result.profile, provider);
      }).catch(function(){
        if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', function(c){ renderNicknamePrompt(c, profile, provider); });
      });
    });

    container.querySelector('#wiSkipBindBtn').addEventListener('click', function(){
      finishLogin(container, profile, provider);
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
  // 字串，兩種都要認得。頭像看這次是用哪個 provider 登入決定要顯示
  // photo_url(Google) 還是 avatar_url(LINE)，不是另外存一個「目前頭像」
  // 欄位——同一個 player 兩邊都綁的話，換一種方式登入頭像就會跟著換。
  // custom_name 才是 signups/members 等其他表拿來對應球員的鍵值，不是
  // line_display_name。
  function finishLogin(container, player, provider){
    const isAdmin = player.is_admin === true || player.is_admin === 'TRUE';
    const photo = provider === 'google' ? player.photo_url : player.avatar_url;
    WhonextAuth.setPlayerName(player.custom_name, isAdmin, photo, player.player_id);
  }

  // ---------------------------------------------------------------
  // LINE 登入／註冊。LIFF 的登入是導頁流程（liff.login() 會整頁導去 LINE
  // 的授權畫面，同網域內導回來），不是在頁面裡就能直接拿到結果，所以要
  // 先把「使用者原本想做什麼」存進 sessionStorage，導回來後（頁面整個
  // 重新載入、原本的 container 已經不在了）才有辦法接著跑完剩下的驗證
  // 流程。如果使用者本來就已經是 LIFF 登入狀態（SDK 把先前登入的憑證
  // 存起來了），就完全不用跳出去，原地驗證完成即可。
  // ---------------------------------------------------------------
  var LINE_PENDING_KEY = 'wu_line_oauth_pending';

  // LINE/FB/IG/WeChat 這些 App 內建瀏覽器打開的頁面，不是透過真正的
  // liff.line.me 進站連結載入，liff.login() 缺少必要的頁面情境，導頁流程
  // 會直接失敗（實測：LINE 內建瀏覽器點登入會錯誤，同一支手機開一般瀏覽器
  // 的無痕分頁就正常）。這種環境下不要嘗試 liff.login()，直接請使用者
  // 先跳出去用真正的瀏覽器開啟。
  function isInAppBrowser(){
    var ua = navigator.userAgent || '';
    return /Line\//i.test(ua) || /FBAN|FBAV/i.test(ua) || /Instagram/i.test(ua) || /MicroMessenger/i.test(ua);
  }

  function renderOpenInBrowserNotice(container, backTo){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">請用瀏覽器打開才能登入</div>' +
        '<div class="whoami-sub">目前是在 App 內建瀏覽器開啟，LINE 登入沒辦法在這裡完成。點右上角「⋯」選單 → 選擇「在瀏覽器中開啟」，跳出去後再重新登入。</div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiBackBtn').addEventListener('click', function(){ (backTo || renderStart)(container); });
  }

  // mode 是 'register'/'login'/'link'。'link' 是已登入狀態下在帳號綁定
  // 面板多綁 LINE，這種情況 name 用不到、linkPlayerId 才是要綁到哪個
  // player_id，見 renderBindPanel。
  function startLineFlow(container, mode, name, linkPlayerId){
    if(isInAppBrowser()){
      renderOpenInBrowserNotice(container, mode === 'register' ? renderRegister : mode === 'link' ? function(c){ renderBindPanel(c); } : renderLoginMenu);
      return;
    }
    renderVerifying(container, 'LINE 登入中…');
    sessionStorage.setItem(LINE_PENDING_KEY, JSON.stringify({ mode: mode, name: name || '', linkPlayerId: linkPlayerId || '' }));
    WhonextLiff.ensureReady(function(){
      if(!document.body.contains(container)) return;
      if(!WhonextLiff.isReady()){
        sessionStorage.removeItem(LINE_PENDING_KEY);
        renderError(container, '無法連線 LINE，請稍後再試', mode === 'register' ? renderRegister : mode === 'link' ? function(c){ renderBindPanel(c); } : renderLoginMenu);
        return;
      }
      if(WhonextLiff.isLoggedIn()){
        sessionStorage.removeItem(LINE_PENDING_KEY);
        finishLineAuth(container, mode, name, WhonextLiff.getIDToken(), linkPlayerId);
      } else {
        WhonextLiff.login(window.location.href);
      }
    });
  }

  // register 模式不用先打暱稱，跟 handleRegisterCredential(Google 版)對稱，
  // 成功後一律先進 renderNicknamePrompt 問要不要順便綁定舊暱稱。
  function finishLineAuth(container, mode, name, idToken, linkPlayerId){
    if(mode === 'link'){
      finishLinkProvider(container, 'line', idToken, linkPlayerId);
      return;
    }
    const action = mode === 'register' ? 'registerLineProfile' : 'lineLogin';
    apiPost(action, { idToken: idToken }).then(function(result){
      if(!document.body.contains(container)) return;
      if(mode === 'login' && result && result.success && result.matched === false){
        renderNotRegistered(container, result.account, 'line');
        return;
      }
      if(!result || !result.success){
        const msg = result && result.reason === 'already_bound' ? '這個 LINE 帳號已經註冊過了，改用「登入」即可'
          : 'LINE 驗證失敗，請稍後再試';
        renderError(container, msg, mode === 'register' ? renderRegister : renderLoginMenu);
        return;
      }
      if(mode === 'register'){
        renderNicknamePrompt(container, result.profile, 'line');
      } else {
        finishLogin(container, result.profile, 'line');
      }
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
        renderError(container, 'LINE 登入失敗，請重新嘗試', pending.mode === 'link' ? function(c){ renderBindPanel(c); } : renderStart);
        return;
      }
      finishLineAuth(container, pending.mode, pending.name, WhonextLiff.getIDToken(), pending.linkPlayerId);
    });
  });

  // ---------------------------------------------------------------
  // 帳號綁定面板（profile.html「個人頁」用，登入後才會顯示）：列出目前
  // Gmail／LINE 各自的綁定狀態，還沒綁的那一項才有「綁定」按鈕。一定要
  // 先登入(WhonextAuth.getPlayerId() 有值)才能用——沒有 player_id 的話
  // (例如這個功能上線前就登入、還沒重新登入過的舊 session)就只顯示
  // 提示文字，不顯示綁定按鈕，避免綁到不知道是哪一列的資料。
  // Google 綁定不用跳頁，跟註冊/登入同一套 renderGoogleButton 拿到
  // credential 就直接送出；LINE 綁定要走 liff.login() 的整頁導轉，跟
  // startLineFlow 共用同一套 sessionStorage 回復機制(mode:'link')。
  // ---------------------------------------------------------------
  function loadOwnPlayerRow(playerId){
    const cached = getApiCache({ action:'getPlayers' });
    const load = cached ? Promise.resolve(cached) : apiGet({ action:'getPlayers' }).then(function(r){ setApiCache({ action:'getPlayers' }, r); return r; });
    return load.then(function(result){
      return (result.players || []).find(function(p){ return p.player_id === playerId; }) || null;
    }).catch(function(){ return null; });
  }

  function renderBindPanel(container){
    const playerId = WhonextAuth.getPlayerId();
    if(!playerId){
      container.innerHTML = '<div class="whoami-card glass"><div class="whoami-title">帳號綁定</div><div class="whoami-sub" style="margin:0">登出後重新登入即可使用帳號綁定功能。</div></div>';
      return;
    }
    container.innerHTML = '<div class="whoami-card glass"><div class="whoami-spinner-wrap"><div class="whoami-spinner"></div></div></div>';

    loadOwnPlayerRow(playerId).then(function(player){
      if(!document.body.contains(container)) return;
      if(!player){
        container.innerHTML = '<div class="whoami-card glass"><div class="whoami-sub" style="margin:0">找不到目前的球員資料，請重新整理後再試。</div></div>';
        return;
      }
      renderBindRows(container, player);
    });
  }

  function renderBindRows(container, player){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">帳號綁定</div>' +
        '<div class="whoami-sub">Gmail、LINE 都可以綁，之後不管用哪一個登入都是同一個身份。</div>' +
        '<div class="whoami-bind-row">' +
          '<div><div class="whoami-bind-label">Gmail</div><div class="whoami-bind-sub">' + (player.google_display_name || '尚未綁定') + '</div></div>' +
          (player.google_id ? '<div class="whoami-bind-status">已綁定 ✓</div>' : '<div id="wiBindGoogleWrap"><button type="button" class="whoami-bind-btn" id="wiBindGoogleBtn">綁定</button></div>') +
        '</div>' +
        '<div class="whoami-bind-row">' +
          '<div><div class="whoami-bind-label">LINE</div><div class="whoami-bind-sub">' + (player.line_display_name || '尚未綁定') + '</div></div>' +
          (player.line_user_id ? '<div class="whoami-bind-status">已綁定 ✓</div>' : '<button type="button" class="whoami-bind-btn" id="wiBindLineBtn">綁定</button>') +
        '</div>' +
      '</div>';

    const bindGoogleBtn = container.querySelector('#wiBindGoogleBtn');
    if(bindGoogleBtn){
      bindGoogleBtn.addEventListener('click', function(){
        const wrap = document.getElementById('wiBindGoogleWrap');
        wrap.innerHTML = '<div class="whoami-google-btn-wrap" id="wiBindGoogleBtnWrap"><div class="whoami-loading">載入中…</div></div>';
        renderGoogleButton(container, document.getElementById('wiBindGoogleBtnWrap'), function(c, credential){
          finishLinkProvider(container, 'google', credential, player.player_id);
        });
      });
    }
    const bindLineBtn = container.querySelector('#wiBindLineBtn');
    if(bindLineBtn){
      bindLineBtn.addEventListener('click', function(){
        startLineFlow(container, 'link', '', player.player_id);
      });
    }
  }

  function finishLinkProvider(container, provider, token, playerId){
    renderVerifying(container, '綁定中…');
    apiPost('linkProviderProfile', { player_id: playerId, provider: provider, token: token }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){
        const msg = result && result.reason === 'already_bound' ? '這個帳號已經綁定在別的球員身上了'
          : result && result.reason === 'invalid_token' ? '驗證失敗，請稍後再試'
          : '綁定失敗，請稍後再試';
        renderError(container, msg, function(c){ renderBindPanel(c); });
        return;
      }
      // getPlayers 的快取還是綁定前的舊資料(sessionStorage 在 LINE 導轉
      // 前後都還在，不會自動失效)，這裡要清掉才不會重繪出「尚未綁定」的
      // 舊畫面。身份本身沒有變，只是多綁了一個 provider，沿用
      // playername-change 事件讓 nav/profile.html 重繪一次即可(頭像/
      // 暱稱不受影響)，也順便把 nav 的登入 overlay(如果是走 LINE 導轉
      // 回來、彈窗還開著)關掉。
      try{ sessionStorage.removeItem(apiCacheKey({ action:'getPlayers' })); } catch(e){}
      document.dispatchEvent(new CustomEvent('whonext:playername-change'));
      renderBindPanel(container);
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', function(c){ renderBindPanel(c); });
    });
  }

  window.WhonextIdentityPicker = { render: render, renderLoginMenu: renderLoginMenu, renderRegister: renderRegister, renderBindPanel: renderBindPanel };
})();
