(function(){
  const TABS = [
    { href: 'index.html', accent: 'home', icon: '⌂', label: '首頁' },
    { href: 'profile.html', accent: 'profile', icon: '☺', label: '個人', key: 'profile' },
    { href: 'finance.html', accent: 'finance', icon: '$', label: '球隊錢包', key: 'finance' },
    { href: 'ranking.html', accent: 'rank', icon: '★', label: '排行榜' },
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

  // 個人／球員名冊依身分切換：管理員直接進球員名冊管理頁（member.html），
  // 不用先進個人頁再多點一次「管理球員名冊」連結；其他人看自己的個人頁
  // （錢包、報名、歷史、排名）。
  function profileLabel(){
    const role = window.WhonextAuth ? WhonextAuth.getRole() : 'player';
    return role === 'admin' ? '球員名冊' : '我的活動';
  }
  function profileHref(){
    const role = window.WhonextAuth ? WhonextAuth.getRole() : 'player';
    return role === 'admin' ? 'member.html' : 'profile.html';
  }

  function buildNav(){
    const page = currentPage();
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = '<div class="bottom-nav-inner">' +
      TABS.map(function(t){
        let href = t.href;
        let label = t.label;
        let activePages = [t.href];
        if(t.key === 'finance'){
          label = financeLabel();
        } else if(t.key === 'profile'){
          href = profileHref();
          label = profileLabel();
          activePages = ['profile.html', 'member.html'];
        }
        const cls = activePages.indexOf(page) !== -1 ? 'active' : '';
        return '<a class="' + cls + '" data-accent="' + t.accent + '"' + (t.key ? ' data-tab="' + t.key + '"' : '') + ' href="' + href + '">' +
          '<span class="bn-icon">' + t.icon + '</span>' +
          '<span class="bn-label">' + label + '</span>' +
        '</a>';
      }).join('') +
    '</div>';
    document.body.appendChild(nav);

    // 切換球員／管理員視角時（不重新整理頁面），連結文字跟目的地都要
    // 跟著更新，不然管理員登入後這顆按鈕還是連去 profile.html。
    const financeLinkEl = nav.querySelector('a[data-tab="finance"]');
    const profileLinkEl = nav.querySelector('a[data-tab="profile"]');
    if(financeLinkEl || profileLinkEl){
      new MutationObserver(function(){
        if(financeLinkEl) financeLinkEl.querySelector('.bn-label').textContent = financeLabel();
        if(profileLinkEl){
          profileLinkEl.querySelector('.bn-label').textContent = profileLabel();
          profileLinkEl.setAttribute('href', profileHref());
        }
      }).observe(document.body, { attributes:true, attributeFilter:['class'] });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();
