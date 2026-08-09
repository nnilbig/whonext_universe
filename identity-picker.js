(function(){
  // 「球員登入」身分綁定流程，我的活動／我的錢包共用同一份畫面跟邏輯，
  // 避免兩邊各刻一份之後跑掉。畫面照 demo.html 那套 Google 登入流程的
  // 樣式（按鈕 → 選擇身份 → 登入中 → 完成），但「使用 Google 繼續」目前
  // 還是假的，選的對象也還是現有的月繳名單（資料照舊，還沒接真的
  // email 比對），之後要換成真的 Google 帳號時，只要把選單資料來源換掉
  // 就好，畫面流程不用重做。
  // 選完球員名字呼叫 WhonextAuth.setPlayerName()，會觸發
  // whonext:playername-change，呼叫方監聽這個事件重繪自己的頁面即可。
  // 「管理員」入口也放在這裡，因為 top nav 已經拿掉管理員按鈕了。
  // 先只放月繳成員進選單，臨打／訪客的身分綁定之後再開放。

  var GOOGLE_ICON =
    '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>';

  async function getMonthlyMemberNames(){
    const cached = getApiCache({ action:'getMembers' });
    let members = cached ? (cached.members || []) : null;
    if(!members){
      try{
        const result = await apiGet({ action:'getMembers' });
        setApiCache({ action:'getMembers' }, result);
        members = result.members || [];
      } catch(e){
        members = [];
      }
    }
    return [...new Set(members.map(function(m){ return m.name; }))].sort(function(a,b){ return a.localeCompare(b); });
  }

  function render(container){
    renderStart(container);
  }

  function renderStart(container){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">球員登入</div>' +
        '<div class="whoami-sub">用 Google 帳號登入，選擇你的球員身份。</div>' +
        '<button type="button" class="gbtn" id="wiGoogleBtn">' + GOOGLE_ICON + '<span>使用 Google 繼續</span></button>' +
        '<button type="button" class="whoami-secondary-btn" id="wiAdminBtn">我是管理員</button>' +
      '</div>';
    container.querySelector('#wiGoogleBtn').addEventListener('click', function(){ renderPicker(container); });
    container.querySelector('#wiAdminBtn').addEventListener('click', function(){ WhonextAuth.openAdminLogin(); });
  }

  function renderPicker(container){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">選擇你的身份</div>' +
        '<div class="whoami-sub">從球員名單挑選你自己，之後才能看到自己的資料。</div>' +
        '<div class="whoami-account-list" id="wiAccountList"><div class="whoami-loading">載入名單中…</div></div>' +
        '<button type="button" class="whoami-secondary-btn" id="wiBackBtn">‹ 返回</button>' +
      '</div>';
    container.querySelector('#wiBackBtn').addEventListener('click', function(){ renderStart(container); });

    getMonthlyMemberNames().then(function(names){
      const listEl = container.querySelector('#wiAccountList');
      if(!listEl) return; // 使用者已經切回上一畫面
      if(!names.length){
        listEl.innerHTML = '<div class="whoami-loading">目前沒有可選的球員名單</div>';
        return;
      }
      listEl.innerHTML = names.map(function(n){
        return '<button type="button" class="whoami-account" data-name="' + n + '">' +
          '<div class="whoami-account-avatar">' + avatarInitial(n) + '</div>' +
          '<div class="whoami-account-name">' + n + '</div>' +
        '</button>';
      }).join('');
      listEl.querySelectorAll('.whoami-account').forEach(function(btn){
        btn.addEventListener('click', function(){ chooseIdentity(container, btn.dataset.name); });
      });
    });
  }

  function chooseIdentity(container, name){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-spinner-wrap">' +
          '<div class="whoami-spinner"></div>' +
          '<div class="whoami-spinner-text">登入中…</div>' +
        '</div>' +
      '</div>';
    setTimeout(function(){
      WhonextAuth.setPlayerName(name);
    }, 500);
  }

  window.WhonextIdentityPicker = { render: render };
})();
