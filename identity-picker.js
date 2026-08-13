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

  // 進來直接是登入畫面（Google／LINE 二選一），不再另外分「註冊」／
  // 「登入」兩顆——沒註冊過的帳號登入時直接拿這次已經驗證過的
  // credential/idToken 轉去註冊、進綁定畫面（見 handleLoginCredential／
  // finishLineAuth），不會多顯示一層「還沒註冊」提示要求重新點一次
  // Google/LINE，跟 nav 的「球員登入」按鈕已經是同一套邏輯（見
  // auth.js openNavLogin）。
  function render(container){
    renderLoginMenu(container);
  }

  // ---------------------------------------------------------------
  // 登入
  // ---------------------------------------------------------------
  // 這是 identity picker 的入口畫面，沒有上一步可回，不顯示「‹」。
  function renderLoginMenu(container){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-google-btn-wrap" id="wiGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
        '<div class="whoami-or-divider">或</div>' +
        '<button type="button" class="whoami-line-btn" id="wiLineLoginBtn">使用 LINE 登入</button>' +
      '</div>';
    renderGoogleButton(container, container.querySelector('#wiGoogleBtnWrap'), handleLoginCredential);
    container.querySelector('#wiLineLoginBtn').addEventListener('click', function(){ startLineFlow(container, 'login'); });
  }

  // 沒註冊過的帳號登入時，直接拿這次登入已經驗證過的 credential 送去
  // 註冊、進綁定畫面（renderNicknamePrompt），不用再多一層「這個帳號還
  // 沒註冊，前往註冊」的提示、逼使用者重新點一次 Google/LINE 按鈕。
  function handleLoginCredential(container, credential){
    renderVerifying(container);
    apiPost('googleLogin', { credential: credential }).then(function(result){
      if(!document.body.contains(container)) return;
      if(!result || !result.success){ renderError(container, '登入驗證失敗，請稍後再試', renderLoginMenu); return; }
      if(result.matched){
        finishLogin(container, result.profile, 'google');
      } else {
        handleRegisterCredential(container, credential);
      }
    }).catch(function(){
      if(document.body.contains(container)) renderError(container, '無法連線後台，請稍後再試', renderLoginMenu);
    });
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
  // 問，還可以直接略過。現在只會在註冊 API 失敗時當重試畫面出現（見
  // handleRegisterCredential／finishLineAuth 的錯誤處理），「‹ 返回」
  // 回到 renderLoginMenu 重新開始。
  function renderRegister(container){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-google-btn-wrap" id="wiGoogleBtnWrap"><div class="whoami-loading">Google 登入按鈕載入中…</div></div>' +
        '<div class="whoami-or-divider">或</div>' +
        '<button type="button" class="whoami-line-btn" id="wiLineRegisterBtn">使用 LINE 註冊</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>' +
      '</div>';

    container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderLoginMenu(container); });

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

  // 原本用 <input list=datalist> 讓瀏覽器畫展開箭頭，但那顆箭頭在手機上
  // 小到很難點準（各瀏覽器畫法還不一樣）。改成輸入框 + 常駐展開的清單：
  // 清單本來就顯示著，不用先點開才看得到選項，點清單裡的名字直接帶入
  // 輸入框；輸入框本身還是可以直接打字篩選清單。
  function renderNicknamePromptForm(container, profile, provider, names){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">選擇綁定球員暱稱嗎？</div>' +
        '<div class="whoami-sub">輸入之前的報名暱稱就能接回報名紀錄；不需要也可以先略過。</div>' +
        '<input type="text" id="wiBindNickname" class="nav-login-input" placeholder="輸入或選擇暱稱" autocomplete="off">' +
        '<div class="whoami-nickname-list" id="wiBindNicknameList"></div>' +
        '<div class="auth-error" id="wiBindNicknameError" style="display:none">請先輸入暱稱</div>' +
        '<button type="button" class="whoami-primary-btn" id="wiBindNicknameBtn">綁定暱稱</button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiSkipBindBtn">略過，直接使用</button>' +
      '</div>';

    const nameInput = container.querySelector('#wiBindNickname');
    const listEl = container.querySelector('#wiBindNicknameList');

    function renderOptions(filter){
      const q = String(filter || '').trim().toLowerCase();
      const matches = q ? names.filter(function(n){ return n.toLowerCase().indexOf(q) >= 0; }) : names;
      listEl.innerHTML = matches.length
        ? matches.map(function(n){ return '<button type="button" class="whoami-nickname-option">' + escapeHtml_(n) + '</button>'; }).join('')
        : '<div class="whoami-nickname-empty">沒有符合的暱稱</div>';
    }
    renderOptions('');

    nameInput.addEventListener('input', function(){ renderOptions(nameInput.value); });
    listEl.addEventListener('click', function(e){
      const opt = e.target.closest('.whoami-nickname-option');
      if(!opt) return;
      nameInput.value = opt.textContent;
      renderOptions('');
      nameInput.focus();
    });

    container.querySelector('#wiBindNicknameBtn').addEventListener('click', function(){
      const name = nameInput.value.trim();
      if(!name){
        const err = container.querySelector('#wiBindNicknameError');
        if(err) err.style.display = 'block';
        nameInput.focus();
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

  function escapeHtml_(str){
    return String(str).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  // ---------------------------------------------------------------
  // 共用
  // ---------------------------------------------------------------
  // Google 明確擋掉 in-app 瀏覽器（LINE/FB/IG/WeChat 的 WebView 一律回
  // disallowed_useragent），renderButton 在裡面會什麼都不畫、整塊空白
  // ——不管是不是真的 LIFF 啟動都一樣擋，跟 LINE 登入那邊的 isInClient
  // 判斷不同，這裡不用分辨，同一個 WebView 內 Google 一律沒用。
  function isBlockedForGoogle(){
    return isLineUa() || isNonLineInAppBrowser();
  }

  function renderGoogleButton(container, btnWrap, onCredential){
    if(!btnWrap) return;
    if(isBlockedForGoogle()){
      // 直接藏起來，不留提示文字佔位——這個情境下 LINE 那顆本來就在
      // 旁邊，不需要額外解釋，藏掉比留一段用不到的文字乾淨。連帶把
      // 「或」分隔線也藏掉（它是 wrap 後面那個 sibling），不然只剩
      // LINE 按鈕上面卻掛著一條「或」會很奇怪。
      btnWrap.style.display = 'none';
      var divider = btnWrap.nextElementSibling;
      if(divider && divider.classList.contains('whoami-or-divider')) divider.style.display = 'none';
      return;
    }
    WhonextGis.onReady(function(){
      if(!document.body.contains(btnWrap)) return; // 使用者已經切到別的畫面
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: function(response){ onCredential(container, response.credential); },
        // 舊的按鈕流程靠彈窗 + postMessage 把憑證傳回來，Chrome 預設政策
        // (COOP、封鎖第三方 cookie)常常會擋掉這個 postMessage，導致
        // callback 收不到憑證、註冊/登入卡住或直接失敗。改用 FedCM
        // 走瀏覽器原生機制，不靠彈窗中繼。
        use_fedcm_for_button: true
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
    container.querySelector('#wiRetryBtn').addEventListener('click', function(){ (backTo || renderLoginMenu)(container); });
  }

  // is_admin 存在 sheet 裡可能是布林值也可能是核取方塊讀出來的 'TRUE'
  // 字串，兩種都要認得。頭像看這次是用哪個 provider 登入決定要顯示
  // photo_url(Google) 還是 avatar_url(LINE)，不是另外存一個「目前頭像」
  // 欄位——同一個 player 兩邊都綁的話，換一種方式登入頭像就會跟著換。
  // 這裡存進 WhonextAuth 的名字（拿去給 nav 顯示、報名/錢包比對用）優先
  // 用 bound_name（已經接回舊資料的話，這才是穩定的歷史鍵值），還沒
  // 綁定的話才退回 custom_name（註冊當下自動頂上去的顯示名稱）——兩者
  // 是分開的欄位，不要混用，見 gas/Code.gs 開頭的欄位說明。
  function finishLogin(container, player, provider){
    const isAdmin = player.is_admin === true || player.is_admin === 'TRUE';
    const photo = provider === 'google' ? player.photo_url : player.avatar_url;
    const name = player.bound_name || player.custom_name;
    WhonextAuth.setPlayerName(name, isAdmin, photo, player.player_id);
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
  // liff.login() 導去 LINE 授權頁後，如果使用者按瀏覽器「上一頁」在還沒
  // 完成驗證前就回來，瀏覽器多半是從 bfcache 還原這一頁（pageshow
  // persisted:true），不會整頁重新載入，DOMContentLoaded 那段接續驗證
  // 的邏輯不會跑到，畫面就會卡在 renderVerifying 的「LINE 登入中…」轉圈
  // 圈，sessionStorage 裡的 pending 旗標也沒清掉。這裡記住觸發當下的
  // container/mode，pageshow 還原時如果 pending 旗標還在，代表這趟沒有
  // 真的走完（走完的話 DOMContentLoaded 早就把旗標清掉了），直接當作
  // 「沒有經過帳號驗證」處理：清旗標、把畫面退回登入選單，不要傻等或
  // 誤以為要接著送驗證。
  var pendingLineContainer = null;
  var pendingLineMode = null;
  window.addEventListener('pageshow', function(e){
    if(!e.persisted) return;
    if(!sessionStorage.getItem(LINE_PENDING_KEY)) return;
    sessionStorage.removeItem(LINE_PENDING_KEY);
    if(pendingLineContainer && document.body.contains(pendingLineContainer)){
      lineFlowBackTo(pendingLineMode)(pendingLineContainer);
    }
    pendingLineContainer = null;
    pendingLineMode = null;
  });

  // FB/IG/WeChat 這些跟 LINE 無關的 App 內建瀏覽器，LIFF 完全用不上，
  // 一律擋。LINE 自己的內建瀏覽器不能只看 UA 有沒有 Line/ 就擋——正常
  // 透過 https://liff.line.me/... 連結進站，本來就是在 LINE 內建瀏覽器
  // 裡開啟，liff.login() 完全沒問題；只有「野生網址被貼到 LINE 對話裡
  // 直接開」才會缺少 LIFF 啟動所需的頁面情境而失敗。這兩種情況 UA 一模
  // 一樣，只能等 liff.init() 跑完後用 WhonextLiff.isInClient() 分辨
  // （見 startLineFlow），這裡的 isNonLineInAppBrowser 只先擋「LINE 以外」的。
  function isNonLineInAppBrowser(){
    var ua = navigator.userAgent || '';
    return /FBAN|FBAV/i.test(ua) || /Instagram/i.test(ua) || /MicroMessenger/i.test(ua);
  }
  function isLineUa(){
    return /Line\//i.test(navigator.userAgent || '');
  }

  function renderOpenInBrowserNotice(container, backTo){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">請用瀏覽器打開才能登入</div>' +
        '<div class="whoami-sub">目前是在 App 內建瀏覽器開啟，LINE 登入沒辦法在這裡完成。點右上角「⋯」選單 → 選擇「在瀏覽器中開啟」，跳出去後再重新登入。</div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiBackBtn').addEventListener('click', function(){ (backTo || renderLoginMenu)(container); });
  }

  function lineFlowBackTo(mode){
    return mode === 'register' ? renderRegister : mode === 'link' ? function(c){ renderBindPanel(c); } : renderLoginMenu;
  }

  // mode 是 'register'/'login'/'link'。'link' 是已登入狀態下在帳號綁定
  // 面板多綁 LINE，這種情況 name 用不到、linkPlayerId 才是要綁到哪個
  // player_id，見 renderBindPanel。
  function startLineFlow(container, mode, name, linkPlayerId){
    if(isNonLineInAppBrowser()){
      renderOpenInBrowserNotice(container, lineFlowBackTo(mode));
      return;
    }
    renderVerifying(container, 'LINE 登入中…');
    sessionStorage.setItem(LINE_PENDING_KEY, JSON.stringify({ mode: mode, name: name || '', linkPlayerId: linkPlayerId || '' }));
    pendingLineContainer = container;
    pendingLineMode = mode;
    WhonextLiff.ensureReady(function(){
      if(!document.body.contains(container)) return;
      if(!WhonextLiff.isReady()){
        sessionStorage.removeItem(LINE_PENDING_KEY);
        renderError(container, '無法連線 LINE，請稍後再試', lineFlowBackTo(mode));
        return;
      }
      // 只有「在 LINE 內建瀏覽器裡，但不是透過真的 liff.line.me 連結啟動」
      // 才擋——isInClient() 判斷的是「這是不是真的 LIFF 啟動」，不是單純
      // UA 有沒有 Line/（正常從 liff.line.me 進站，UA 一樣有 Line/，但
      // isInClient() 會是 true，不該擋）。
      if(isLineUa() && !WhonextLiff.isInClient()){
        sessionStorage.removeItem(LINE_PENDING_KEY);
        renderOpenInBrowserNotice(container, lineFlowBackTo(mode));
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
      // 沒註冊過的 LINE 帳號登入時，直接拿這次已經驗證過的 idToken 轉去
      // 註冊、進綁定畫面，不用再多一層提示逼使用者重新點一次 LINE 按鈕。
      if(mode === 'login' && result && result.success && result.matched === false){
        finishLineAuth(container, 'register', name, idToken, linkPlayerId);
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
      if(!WhonextLiff.isReady()){
        console.error('LINE redirect-back: liff.init failed (see earlier "liff.init failed" log)');
        renderError(container, 'LINE 登入失敗，請重新嘗試', pending.mode === 'link' ? function(c){ renderBindPanel(c); } : renderLoginMenu);
        return;
      }
      if(!WhonextLiff.isLoggedIn()){
        console.error('LINE redirect-back: liff.init succeeded but liff.isLoggedIn() is false');
        renderError(container, 'LINE 登入失敗，請重新嘗試', pending.mode === 'link' ? function(c){ renderBindPanel(c); } : renderLoginMenu);
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
          '<div class="whoami-bind-label">Gmail</div>' +
          (player.google_id ? '<div class="whoami-bind-status">已綁定 ✓</div>' : '<div id="wiBindGoogleWrap"><button type="button" class="whoami-bind-btn" id="wiBindGoogleBtn">綁定</button></div>') +
        '</div>' +
        '<div class="whoami-bind-row">' +
          '<div class="whoami-bind-label">LINE</div>' +
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
