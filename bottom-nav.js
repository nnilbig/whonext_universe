(function(){
  // adminLabel／adminHref 只在管理員視角覆蓋預設值，其餘分頁（卡牌）
  // 兩種身分看到的都一樣，不用另外列。
  const TABS = [
    { href: 'index.html', accent: 'home', icon: '⌂', label: '首頁' },
    { href: 'profile.html', adminHref: 'member.html', accent: 'profile', icon: '☺', label: '個人', adminLabel: '球員列表', key: 'profile' },
    { href: 'finance.html', accent: 'finance', icon: '$', label: '錢包', adminLabel: '球隊錢包', key: 'finance' },
    { href: 'ranking.html', accent: 'rank', icon: '★', label: '排行', adminLabel: '排行榜', key: 'ranking' },
    { href: 'match.html', accent: 'match', icon: '⚑', label: '卡牌' }
  ];

  function getRole(){ return window.WhonextAuth ? WhonextAuth.getRole() : 'player'; }
  function tabLabel(t){ return getRole() === 'admin' && t.adminLabel ? t.adminLabel : t.label; }
  function tabHref(t){ return getRole() === 'admin' && t.adminHref ? t.adminHref : t.href; }

  function currentPage(){
    const path = location.pathname.split('/').pop();
    return path === '' ? 'index.html' : path;
  }

  function buildNav(){
    const page = currentPage();
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = '<div class="bottom-nav-inner">' +
      TABS.map(function(t){
        const href = tabHref(t);
        const label = tabLabel(t);
        const activePages = t.adminHref ? [t.href, t.adminHref] : [t.href];
        const cls = activePages.indexOf(page) !== -1 ? 'active' : '';
        return '<a class="' + cls + '" data-accent="' + t.accent + '"' + (t.key ? ' data-tab="' + t.key + '"' : '') + ' href="' + href + '">' +
          '<span class="bn-icon">' + t.icon + '</span>' +
          '<span class="bn-label">' + label + '</span>' +
        '</a>';
      }).join('') +
    '</div>';
    document.body.appendChild(nav);

    // 切換球員／管理員視角時（不重新整理頁面），有 key 的分頁文字跟
    // 目的地都要跟著更新，不然管理員登入後這些分頁還是停在球員版本。
    const keyed = TABS.filter(function(t){ return t.key; })
      .map(function(t){ return { t: t, el: nav.querySelector('a[data-tab="' + t.key + '"]') }; })
      .filter(function(x){ return x.el; });
    if(keyed.length){
      new MutationObserver(function(){
        keyed.forEach(function(x){
          x.el.querySelector('.bn-label').textContent = tabLabel(x.t);
          x.el.setAttribute('href', tabHref(x.t));
        });
      }).observe(document.body, { attributes:true, attributeFilter:['class'] });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();
