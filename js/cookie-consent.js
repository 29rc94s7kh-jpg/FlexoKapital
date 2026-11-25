(function(){
  var KEY = 'fk_cookie_consent';
  var banner = document.getElementById('cookie-banner');

  function getConsent(){
    try { return localStorage.getItem(KEY); } catch(e){ return null; }
  }
  function setConsent(v){
    try { localStorage.setItem(KEY, v); } catch(e){}
  }
  function showBanner(){ if (banner) banner.hidden = false; document.body.classList.add('cookie-bar-open'); var d = banner && banner.querySelector('.cookie-bar-inner'); if (d) { d.setAttribute('tabindex','-1'); try { d.focus({preventScroll:true}); } catch(e){} } }
  function hideBanner(){ if (banner) banner.hidden = true; document.body.classList.remove('cookie-bar-open'); }

  var priorConsent = getConsent();
  if (priorConsent === 'accepted') {
    if (window.__loadMetaPixel) window.__loadMetaPixel();
  } else if (priorConsent !== 'rejected') {
    showBanner();
  }

  var acceptBtn = document.getElementById('cookie-accept');
  var rejectBtn = document.getElementById('cookie-reject');
  var settingsLink = document.getElementById('cookie-settings-link');
  var datenschutzLink = document.getElementById('cookie-banner-datenschutz-link');

  if (acceptBtn) acceptBtn.addEventListener('click', function(){
    setConsent('accepted');
    hideBanner();
    if (window.__loadMetaPixel) window.__loadMetaPixel();
  });

  if (rejectBtn) rejectBtn.addEventListener('click', function(){
    var wasAccepted = (getConsent() === 'accepted');
    setConsent('rejected');
    hideBanner();
    if (wasAccepted) { location.reload(); }
  });

  if (settingsLink) settingsLink.addEventListener('click', function(){ showBanner(); });
  if (datenschutzLink) datenschutzLink.addEventListener('click', function(){
    hideBanner();
    var target = document.querySelector('.footer-legal [data-nav="datenschutz"]');
    if (target) target.click();
  });
  // Wer nur die Datenschutzerklaerung lesen wollte und noch nicht entschieden hat,
  // bekommt die Abfrage wieder, sobald er die Seite verlaesst.
  window.addEventListener('hashchange', function(){
    var c = getConsent();
    if (c !== 'accepted' && c !== 'rejected' && !/datenschutz|impressum/.test(location.hash)) showBanner();
  });
  if (/#(datenschutz|impressum)/.test(location.hash) && banner && !banner.hidden) hideBanner();
})();
