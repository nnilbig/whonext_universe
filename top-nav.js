(function(){
  function buildNav(){
    var nav = document.createElement('div');
    nav.className = 'navbar';
    nav.innerHTML =
      '<div class="nav-inner">' +
        '<a class="nav-title" href="index.html">' +
          '<div class="eyebrow">WHONEXT</div>' +
          '<h1>UNIVERSE</h1>' +
        '</a>' +
        '<div class="nav-role">' +
          '<div class="nav-welcome" id="navWelcome">' +
            '<span id="navWelcomeText">歡迎</span>' +
            '<button type="button" id="navLogoutBtn">登出</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(nav, document.body.firstChild);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();
