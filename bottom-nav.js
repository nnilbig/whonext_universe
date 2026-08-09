(function(){
  const TABS = [
    { href: 'index.html', accent: 'home', icon: '⌂', label: '首頁' },
    { href: 'ranking.html', accent: 'rank', icon: '★', label: '排行榜' },
    { href: 'finance.html', accent: 'finance', icon: '$', label: '球隊錢包' },
    { href: 'profile.html', accent: 'profile', icon: '☺', label: '個人' },
    { href: 'match.html', accent: 'match', icon: '⚑', label: '卡牌賽' }
  ];

  function currentPage(){
    const path = location.pathname.split('/').pop();
    return path === '' ? 'index.html' : path;
  }

  // 球隊錢包／我的錢包依身分切換：管理員看球隊錢包，其他人看我的錢包。
  function financeLabel(){
    const role = window.WhonextAuth ? WhonextAuth.getRole() : 'player';
    return role === 'admin' ? '球隊錢包' : '我的錢包';
  }

  // 個人／總覽依身分切換：管理員看後台總覽（球隊錢包＋球員總覽入口），
  // 其他人看自己的個人頁（錢包、報名、歷史、排名）。
  function profileLabel(){
    const role = window.WhonextAuth ? WhonextAuth.getRole() : 'player';
    return role === 'admin' ? '球員名冊' : '我的活動';
  }

  function buildNav(){
    const page = currentPage();
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = '<div class="bottom-nav-inner">' +
      TABS.map(function(t){
        const cls = t.href === page ? 'active' : '';
        let label = t.label;
        if(t.href === 'finance.html') label = financeLabel();
        else if(t.href === 'profile.html') label = profileLabel();
        return '<a class="' + cls + '" data-accent="' + t.accent + '" href="' + t.href + '">' +
          '<span class="bn-icon">' + t.icon + '</span>' +
          '<span class="bn-label">' + label + '</span>' +
        '</a>';
      }).join('') +
    '</div>';
    document.body.appendChild(nav);

    const financeLabelEl = nav.querySelector('a[href="finance.html"] .bn-label');
    const profileLabelEl = nav.querySelector('a[href="profile.html"] .bn-label');
    if(financeLabelEl || profileLabelEl){
      new MutationObserver(function(){
        if(financeLabelEl) financeLabelEl.textContent = financeLabel();
        if(profileLabelEl) profileLabelEl.textContent = profileLabel();
      }).observe(document.body, { attributes:true, attributeFilter:['class'] });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();
