(function(){
  // 「你是哪位球員？」身分綁定選單，我的活動／我的錢包共用同一份畫面跟邏輯，
  // 避免兩邊各刻一份之後跑掉。選完球員名字呼叫 WhonextAuth.setPlayerName()，
  // 會觸發 whonext:playername-change，呼叫方監聽這個事件重繪自己的頁面即可。
  // top nav 拿掉「管理員」按鈕後，這個選單多一個「管理員」選項當作
  // 管理員登入的入口，選到它是跳現成的帳密驗證彈窗，不會綁定球員身分。
  // 先只放月繳成員進選單，臨打／訪客的身分綁定之後再開放。
  const ADMIN_OPTION_VALUE = '__admin__';

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

  function placeholderOptionsHTML(names){
    return '<option value="">— 選擇姓名 —</option>' +
      names.map(function(n){ return '<option value="' + n + '">' + n + '</option>'; }).join('') +
      '<option value="' + ADMIN_OPTION_VALUE + '">管理員</option>';
  }

  function render(container){
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">你是哪位球員？</div>' +
        '<div class="whoami-sub">選擇你的名字，之後才能看到自己的資料。</div>' +
        '<select class="whoami-input" id="whoamiSelect">' + placeholderOptionsHTML([]) + '</select>' +
        '<button type="button" class="whoami-btn" id="whoamiConfirm" disabled>確認</button>' +
      '</div>';

    const select = container.querySelector('#whoamiSelect');
    const confirmBtn = container.querySelector('#whoamiConfirm');
    select.addEventListener('change', function(){ confirmBtn.disabled = !this.value; });
    confirmBtn.addEventListener('click', function(){
      if(!select.value) return;
      if(select.value === ADMIN_OPTION_VALUE){
        WhonextAuth.openAdminLogin();
        return;
      }
      WhonextAuth.setPlayerName(select.value);
    });

    getMonthlyMemberNames().then(function(names){
      select.innerHTML = placeholderOptionsHTML(names);
    });
  }

  window.WhonextIdentityPicker = { render: render };
})();
