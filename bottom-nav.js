(function(){
  // 球員／管理員的底部導覽是兩組完全不同的分頁組合（不只是文字/連結
  // 小改），管理員沒有「首頁」（個人化已報名活動沒意義），第一格直接
  // 是球隊錢包；球員沒有錢包入口（之後再補）。切換身分時整組重繪，
  // 不再像舊版只patch單一分頁的文字/連結。
  const PLAYER_TABS = [
    { href: 'index.html', accent: 'home', icon: '⌂', label: '首頁' },
    { href: 'activities.html', accent: 'finance', icon: '≡', label: '活動' },
    { href: 'profile.html', accent: 'profile', icon: '☺', label: '個人' },
    { href: 'ranking.html', accent: 'rank', icon: '★', label: '排行' },
    { href: 'match.html', accent: 'match', icon: '⚑', label: '卡牌' }
  ];
  const ADMIN_TABS = [
    { href: 'finance.html', accent: 'finance', icon: '$', label: '球隊錢包' },
    { href: 'activities.html', accent: 'home', icon: '≡', label: '活動管理' },
    { href: 'member.html', accent: 'profile', icon: '☺', label: '球員名冊' },
    { href: 'ranking.html', accent: 'rank', icon: '★', label: '排行榜' },
    { href: 'match.html', accent: 'match', icon: '⚑', label: '卡牌' }
  ];

  function getRole(){ return window.WhonextAuth ? WhonextAuth.getRole() : 'player'; }

  function currentPage(){
    const path = location.pathname.split('/').pop();
    return path === '' ? 'index.html' : path;
  }

  function buildNav(){
    const page = currentPage();
    const tabs = getRole() === 'admin' ? ADMIN_TABS : PLAYER_TABS;
    let nav = document.querySelector('nav.bottom-nav');
    if(!nav){
      nav = document.createElement('nav');
      nav.className = 'bottom-nav';
      document.body.appendChild(nav);
    }
    nav.innerHTML = '<div class="bottom-nav-inner">' +
      tabs.map(function(t){
        const cls = t.href === page ? 'active' : '';
        return '<a class="' + cls + '" data-accent="' + t.accent + '" href="' + t.href + '">' +
          '<span class="bn-icon">' + t.icon + '</span>' +
          '<span class="bn-label">' + t.label + '</span>' +
        '</a>';
      }).join('') +
    '</div>';
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }

  // 切換球員／管理員視角時（不重新整理頁面），整組分頁要跟著換掉，
  // 不只是換文字/連結，所以直接整個重繪。
  new MutationObserver(buildNav).observe(document.body, { attributes:true, attributeFilter:['class'] });
})();
