(function(){
  // 「你是哪位球員？」身分綁定選單，我的活動／我的錢包共用同一份畫面跟邏輯，
  // 避免兩邊各刻一份之後跑掉。選完呼叫 WhonextAuth.setPlayerName()，會觸發
  // whonext:playername-change，呼叫方監聽這個事件重繪自己的頁面即可。
  // 先只放月繳成員進選單，臨打／訪客的身分綁定之後再開放。
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
    container.innerHTML =
      '<div class="whoami-card glass">' +
        '<div class="whoami-title">你是哪位球員？</div>' +
        '<div class="whoami-sub">選擇你的名字，之後才能看到自己的資料。</div>' +
        '<select class="whoami-input" id="whoamiSelect"><option value="">— 選擇姓名 —</option></select>' +
        '<button type="button" class="whoami-btn" id="whoamiConfirm" disabled>確認</button>' +
      '</div>';

    const select = container.querySelector('#whoamiSelect');
    const confirmBtn = container.querySelector('#whoamiConfirm');
    select.addEventListener('change', function(){ confirmBtn.disabled = !this.value; });
    confirmBtn.addEventListener('click', function(){
      if(!select.value) return;
      WhonextAuth.setPlayerName(select.value);
    });

    getMonthlyMemberNames().then(function(names){
      select.innerHTML = '<option value="">— 選擇姓名 —</option>' + names.map(function(n){
        return '<option value="' + n + '">' + n + '</option>';
      }).join('');
    });
  }

  window.WhonextIdentityPicker = { render: render };
})();
