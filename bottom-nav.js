(function(){
  const TABS = [
    { href: 'index.html', accent: 'home', icon: '⌂', label: '首頁' },
    { href: 'ranking.html', accent: 'rank', icon: '★', label: '排行榜' },
    { href: 'finance.html', accent: 'finance', icon: '$', label: '球隊錢包' },
    { href: 'member.html', accent: 'member', icon: '☺', label: '球員名冊' },
    { href: 'match.html', accent: 'match', icon: '⚑', label: '卡牌賽' }
  ];

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
        const cls = t.href === page ? 'active' : '';
        return '<a class="' + cls + '" data-accent="' + t.accent + '" href="' + t.href + '">' +
          '<span class="bn-icon">' + t.icon + '</span>' +
          '<span>' + t.label + '</span>' +
        '</a>';
      }).join('') +
    '</div>';
    document.body.appendChild(nav);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();
