(function() {
  "use strict";

  // ---------- Firebase (Google-Anmeldung + Firestore) ----------
  var ALLOWED_EMAIL = 'raphi.fruehwirth@gmail.com';
  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAAM0T4LjFNpm8K3pohfJVB5w8LA3zHrWQ',
    authDomain: 'flexokapital.firebaseapp.com',
    projectId: 'flexokapital',
    storageBucket: 'flexokapital.firebasestorage.app',
    messagingSenderId: '663972345841',
    appId: '1:663972345841:web:63bb7e1e00eb9e410eb650'
  };
  firebase.initializeApp(FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var efsDocRef = db.collection('efs').doc('main');
  var efsDataLoaded = false;

  var efsLoginGateEl = document.getElementById('efsLoginGate');
  var efsLoginErrorEl = document.getElementById('efsLoginError');
  var efsDeniedGateEl = document.getElementById('efsDeniedGate');
  var efsAppRootEl = document.getElementById('efsAppRoot');
  var efsSignInBtnEl = document.getElementById('efsSignInBtn');
  var efsDeniedSignOutBtnEl = document.getElementById('efsDeniedSignOutBtn');

  var EFS_AUTH_ERROR_MESSAGES = {
    'auth/popup-blocked': 'Der Anmelde-Popup wurde von deinem Browser blockiert. Bitte Popups für diese Seite erlauben und erneut versuchen.',
    'auth/popup-closed-by-user': 'Anmeldung abgebrochen — das Popup wurde geschlossen, bevor die Anmeldung fertig war.',
    'auth/unauthorized-domain': 'Diese Domain ist in Firebase noch nicht für die Anmeldung freigeschaltet (Authentication → Settings → Authorized domains).',
    'auth/network-request-failed': 'Netzwerkfehler bei der Anmeldung. Bitte Internetverbindung prüfen und erneut versuchen.',
    'auth/cancelled-popup-request': null
  };

  function showEfsLoginError(err) {
    console.error('Anmeldung fehlgeschlagen:', err);
    var code = err && err.code;
    if (!efsLoginErrorEl) return;
    if (EFS_AUTH_ERROR_MESSAGES.hasOwnProperty(code) && EFS_AUTH_ERROR_MESSAGES[code] === null) {
      efsLoginErrorEl.hidden = true;
      return;
    }
    efsLoginErrorEl.textContent = EFS_AUTH_ERROR_MESSAGES[code] || ('Anmeldung fehlgeschlagen (' + (code || 'unbekannter Fehler') + '). Bitte erneut versuchen.');
    efsLoginErrorEl.hidden = false;
  }

  if (efsSignInBtnEl) {
    efsSignInBtnEl.addEventListener('click', function() {
      if (efsLoginErrorEl) efsLoginErrorEl.hidden = true;
      var provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(provider).catch(showEfsLoginError);
    });
  }
  if (efsDeniedSignOutBtnEl) {
    efsDeniedSignOutBtnEl.addEventListener('click', function() { auth.signOut(); });
  }

  function showEfsState(mode) {
    if (efsLoginGateEl) efsLoginGateEl.hidden = (mode !== 'login');
    if (efsDeniedGateEl) efsDeniedGateEl.hidden = (mode !== 'denied');
    if (efsAppRootEl) efsAppRootEl.hidden = (mode !== 'app');
  }

  auth.onAuthStateChanged(function(user) {
    if (!user) { showEfsState('login'); return; }
    if (user.email !== ALLOWED_EMAIL) { showEfsState('denied'); return; }
    showEfsState('app');
    if (efsDataLoaded) return;
    efsDocRef.get().then(function(doc) {
      if (doc.exists) applyAppState(doc.data());
      efsDataLoaded = true;
      setSaveStatus('✓ Verbunden mit Firestore — Änderungen werden automatisch gespeichert.', 'connected');
    }).catch(function(err) {
      console.error('Daten konnten nicht geladen werden:', err);
      efsDataLoaded = true;
      setSaveStatus('⚠️ Daten konnten nicht geladen werden — bitte Seite neu laden.', 'error');
    });
  });

  // ---------- Theme toggle ----------
  var themeButtons = document.querySelectorAll('.theme-toggle button');
  var currentThemeMode = 'system';
  function applyThemeMode(mode) {
    currentThemeMode = (mode === 'light' || mode === 'dark') ? mode : 'system';
    themeButtons.forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-mode') === currentThemeMode); });
    if (currentThemeMode === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', currentThemeMode);
    }
  }
  themeButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      applyThemeMode(btn.getAttribute('data-mode'));
      scheduleAutoSave();
    });
  });

  // ---------- Accent color picker ----------
  var vizRoot = document.querySelector('.viz-root');
  var accentSwatches = document.querySelectorAll('.accent-swatch[data-accent]');
  var accentCustomSwatch = document.getElementById('accentCustomSwatch');
  var accentCustomInput = document.getElementById('accentCustomInput');

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) { h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; }
    var num = parseInt(h, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function rgbToHex(rgb) {
    function c(v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }
    return '#' + c(rgb.r) + c(rgb.g) + c(rgb.b);
  }
  function relLuminance(rgb) {
    var chans = [rgb.r, rgb.g, rgb.b].map(function(c) {
      var s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2];
  }
  function contrastRatio(l1, l2) {
    var a = Math.max(l1, l2), b = Math.min(l1, l2);
    return (a + 0.05) / (b + 0.05);
  }
  function bestInk(hex) {
    var rgb = hexToRgb(hex);
    var lum = relLuminance(rgb);
    var vsWhite = contrastRatio(1, lum);
    var vsBlack = contrastRatio(lum, 0);
    return vsWhite >= vsBlack ? '#ffffff' : '#0b0b0c';
  }
  // The spotlight total-tile always sits on a near-black card, in both light and
  // dark theme — so the big number needs guaranteed contrast against near-black,
  // independent of how dark the user's chosen accent hue happens to be.
  function vividOnDark(hex) {
    var rgb = hexToRgb(hex);
    if (contrastRatio(relLuminance(rgb), 0) >= 4.5) return hex;
    for (var t = 0.05; t <= 1; t += 0.05) {
      var blended = { r: rgb.r + (255 - rgb.r) * t, g: rgb.g + (255 - rgb.g) * t, b: rgb.b + (255 - rgb.b) * t };
      if (contrastRatio(relLuminance(blended), 0) >= 4.5) return rgbToHex(blended);
    }
    return '#ffffff';
  }

  var currentAccentHex = '#4C7EFF';

  function setAccent(hex) {
    currentAccentHex = hex;
    var rgb = hexToRgb(hex);
    vizRoot.style.setProperty('--accent', hex);
    vizRoot.style.setProperty('--accent-ink', bestInk(hex));
    vizRoot.style.setProperty('--accent-soft', 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.14)');
    vizRoot.style.setProperty('--accent-vivid', vividOnDark(hex));
    accentSwatches.forEach(function(sw) {
      sw.classList.toggle('selected', sw.getAttribute('data-accent').toLowerCase() === hex.toLowerCase());
    });
    accentCustomSwatch.classList.toggle('selected', !Array.prototype.some.call(accentSwatches, function(sw) {
      return sw.getAttribute('data-accent').toLowerCase() === hex.toLowerCase();
    }));
    accentCustomInput.value = hex;
    refreshIndicators();
  }

  accentSwatches.forEach(function(sw) {
    sw.addEventListener('click', function() { setAccent(sw.getAttribute('data-accent')); scheduleAutoSave(); });
  });
  accentCustomInput.addEventListener('input', function() { setAccent(accentCustomInput.value); scheduleAutoSave(); });

  // ---------- Sliding tab indicator (shared helper) ----------
  function moveIndicator(tabsEl, activeBtn) {
    var indicator = tabsEl.querySelector('.tab-indicator');
    if (!indicator || !activeBtn) return;
    indicator.style.width = activeBtn.offsetWidth + 'px';
    indicator.style.height = activeBtn.offsetHeight + 'px';
    indicator.style.transform = 'translate(' + activeBtn.offsetLeft + 'px,' + activeBtn.offsetTop + 'px)';
  }

  // ---------- Top-level dashboard tabs ----------
  var mainTabsEl = document.querySelector('.main-tabs');
  var mainTabButtons = document.querySelectorAll('.main-tabs button');
  var mainPanels = {
    uebersicht: document.getElementById('mainpanel-uebersicht'),
    struktur:   document.getElementById('mainpanel-struktur'),
    rechner:    document.getElementById('mainpanel-rechner'),
    dokumente:  document.getElementById('mainpanel-dokumente'),
    lv:         document.getElementById('mainpanel-lv'),
    einheiten:  document.getElementById('mainpanel-einheiten'),
    notizen:    document.getElementById('mainpanel-notizen')
  };
  mainTabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-maintab');
      mainTabButtons.forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      Object.keys(mainPanels).forEach(function(k) {
        mainPanels[k].classList.toggle('active', k === tab);
      });
      moveIndicator(mainTabsEl, btn);
      // Der LV-Chart hat beim ersten Rendern (Tab noch unsichtbar) Breite 0 gemessen — beim Aktivieren
      // dieses Tabs daher neu zeichnen, damit die viewBox zur tatsächlichen Kartenbreite passt.
      if (tab === 'lv' && typeof lvRecompute === 'function') lvRecompute();
    });
  });
  var lvResizeTimer = null;
  window.addEventListener('resize', function() {
    if (lvResizeTimer) clearTimeout(lvResizeTimer);
    lvResizeTimer = setTimeout(function() {
      var lvPanel = document.getElementById('mainpanel-lv');
      if (lvPanel && lvPanel.classList.contains('active') && typeof lvRecompute === 'function') lvRecompute();
    }, 150);
  });

  // ---------- Inner sheet tabs (Rechner ↔ AfA) ----------
  var sheetTabsEl = document.querySelector('.sheet-tabs');
  var tabButtons = document.querySelectorAll('.sheet-tabs button');
  var tabPanels = { rechner: document.getElementById('panel-rechner'), afa: document.getElementById('panel-afa') };
  tabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-tab');
      tabButtons.forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      Object.keys(tabPanels).forEach(function(k) {
        tabPanels[k].classList.toggle('active', k === tab);
      });
      moveIndicator(sheetTabsEl, btn);
    });
  });

  function refreshIndicators() {
    moveIndicator(mainTabsEl, mainTabsEl.querySelector('button.active'));
    moveIndicator(sheetTabsEl, sheetTabsEl.querySelector('button.active'));
  }
  window.addEventListener('resize', refreshIndicators);
  // Initial placement (fonts/layout should already be ready, but defer one tick to be safe)
  setTimeout(refreshIndicators, 0);
  window.addEventListener('load', refreshIndicators);

  // ---------- Number formatting ----------
  var fmt = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  var fmtPct = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });

  function euro(n) {
    if (!isFinite(n)) n = 0;
    return fmt.format(Math.round(n));
  }

  // ---------- Progressive income tax (Austria) ----------
  // thresholds computed from confirmed 2026 stufe 1 & 2 (13.539 / 21.992), extrapolated for 3-7
  // using the same indexation factor (~1.7346%) applied to the 2025 thresholds.
  var brackets2026 = [
    { from: 0,        to: 13539,   rate: 0.00 },
    { from: 13539,    to: 21992,   rate: 0.20 },
    { from: 21992,    to: 36459,   rate: 0.30 },
    { from: 36459,    to: 70368,   rate: 0.40 },
    { from: 70368,    to: 104862,  rate: 0.48 },
    { from: 104862,   to: 1000000, rate: 0.50 },
    { from: 1000000,  to: Infinity,rate: 0.55 }
  ];

  function computeEst(basis) {
    if (basis <= 0) return 0;
    var tax = 0;
    for (var i = 0; i < brackets2026.length; i++) {
      var b = brackets2026[i];
      if (basis > b.from) {
        var upper = Math.min(basis, b.to);
        tax += (upper - b.from) * b.rate;
      }
    }
    return tax;
  }

  function renderBracketTable() {
    var tbody = document.getElementById('bracketTable');
    var rows = '';
    brackets2026.forEach(function(b, i) {
      var to = b.to === Infinity ? '—' : euro(b.to);
      rows += '<tr><td>' + (i+1) + '</td><td class="num">' + euro(b.from) + '</td><td class="num">' + to + '</td><td class="num">' + (b.rate*100).toFixed(0) + ' %</td></tr>';
    });
    tbody.innerHTML = rows;
  }
  renderBracketTable();

  // ---------- Inputs ----------
  var els = {
    isKU: document.getElementById('isKleinunternehmer'),
    isVersVermittler: document.getElementById('isVersVermittler'),
    umsatz: document.getElementById('umsatz'),
    ausgaben: document.getElementById('ausgaben'),
    ustSatz: document.getElementById('ustSatz'),
    kuGrenze: document.getElementById('kuGrenze'),
    svSatz: document.getElementById('svSatz'),
    svMin: document.getElementById('svMin'),
    svMax: document.getElementById('svMax'),
    uvFix: document.getElementById('uvFix'),
    gfbSatz: document.getElementById('gfbSatz'),
    gfbGrenze: document.getElementById('gfbGrenze')
  };

  var outs = {
    ust: document.getElementById('outUst'),
    ustSub: document.getElementById('outUstSub'),
    sv: document.getElementById('outSv'),
    svSub: document.getElementById('outSvSub'),
    est: document.getElementById('outEst'),
    estSub: document.getElementById('outEstSub'),
    gewinn: document.getElementById('outGewinn'),
    gewinnSub: document.getElementById('outGewinnSub'),
    afa: document.getElementById('outAfa'),
    afaSub: document.getElementById('outAfaSub'),
    gfb: document.getElementById('outGfb'),
    gfbSub: document.getElementById('outGfbSub'),
    netto: document.getElementById('outNetto'),
    total: document.getElementById('outTotal'),
    totalPct: document.getElementById('outTotalPct'),
    monthly: document.getElementById('outMonthly'),
    kuWarning: document.getElementById('kuWarning'),
    umsatzHint: document.getElementById('umsatzHint'),
    ausgabenHint: document.getElementById('ausgabenHint')
  };

  var ruecklageEls = {
    gespart: document.getElementById('ruecklageGespart'),
    istOut: document.getElementById('ruecklageIstOut'),
    sollOut: document.getElementById('ruecklageSollOut'),
    fill: document.getElementById('ruecklageFill'),
    monthLabel: document.getElementById('ruecklageMonthLabel'),
    yearLabel: document.getElementById('ruecklageYearLabel'),
    statusLabel: document.getElementById('ruecklageStatusLabel'),
    statusValue: document.getElementById('ruecklageStatusValue')
  };
  var RUECKLAGE_MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var lastRuecklageTotal = 0; // vom letzten recalc() übernommener Jahres-Rücklagenbetrag, für die Ampel

  // Vergleicht den tatsächlich zurückgelegten Betrag mit dem Soll-Stand (Jahresrücklage
  // anteilig nach bereits vergangenen Kalendermonaten) und zeigt Fortschritt + Status an.
  function updateRuecklageAmpel(annualTotal) {
    if (!ruecklageEls.fill) return;
    lastRuecklageTotal = annualTotal;
    var now = new Date();
    var monthsElapsed = now.getMonth() + 1; // 1..12, inkl. laufendem Monat
    var soll = (annualTotal / 12) * monthsElapsed;
    var ist = num(ruecklageEls.gespart);
    var pct = soll > 0 ? Math.min(100, (ist / soll) * 100) : 0;
    ruecklageEls.istOut.textContent = euro(ist);
    ruecklageEls.sollOut.textContent = euro(soll);
    ruecklageEls.fill.style.width = pct + '%';
    ruecklageEls.monthLabel.textContent = RUECKLAGE_MONTH_NAMES[now.getMonth()];
    ruecklageEls.yearLabel.textContent = String(now.getFullYear());
    var diff = ist - soll;
    if (soll <= 0) {
      ruecklageEls.statusLabel.textContent = 'Status';
      ruecklageEls.statusValue.textContent = '– (noch kein Umsatz eingetragen)';
      ruecklageEls.statusValue.style.color = '';
    } else if (diff >= 0) {
      ruecklageEls.statusLabel.textContent = 'Du liegst im Plan';
      ruecklageEls.statusValue.textContent = '✓ +' + euro(diff);
      ruecklageEls.statusValue.style.color = 'var(--accent)';
    } else {
      ruecklageEls.statusLabel.textContent = 'Du liegst zurück';
      ruecklageEls.statusValue.textContent = '− ' + euro(Math.abs(diff));
      ruecklageEls.statusValue.style.color = 'var(--series-ust)';
    }
  }

  // Nächste SVS-Quartalstermine und ESt-Vorauszahlungstermine, dynamisch anhand des
  // heutigen Datums berechnet (Termine selbst sind gesetzlich fix, siehe field-hint im Markup).
  function updateZahlungstermine() {
    var svsDateEl = document.getElementById('svsNextDate');
    var svsCountdownEl = document.getElementById('svsNextCountdown');
    var estDateEl = document.getElementById('estNextDate');
    var estCountdownEl = document.getElementById('estNextCountdown');
    if (!svsDateEl || !estDateEl) return;

    function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
    function svsDatesForYear(y) {
      return [
        new Date(y, 1, isLeap(y) ? 29 : 28),
        new Date(y, 4, 31),
        new Date(y, 7, 31),
        new Date(y, 10, 30)
      ];
    }
    function estDatesForYear(y) {
      return [
        new Date(y, 1, 15),
        new Date(y, 4, 15),
        new Date(y, 7, 15),
        new Date(y, 10, 15)
      ];
    }
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var thisYear = today.getFullYear();

    function nextUpcoming(datesFn) {
      var candidates = datesFn(thisYear).concat(datesFn(thisYear + 1));
      var upcoming = candidates.filter(function(d) { return d.getTime() >= today.getTime(); });
      upcoming.sort(function(a, b) { return a - b; });
      return upcoming[0];
    }

    function fmtDate(d) {
      return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    }
    function fmtCountdown(d) {
      var diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
      if (diffDays === 0) return 'heute fällig';
      if (diffDays === 1) return 'morgen fällig';
      return 'in ' + diffDays + ' Tagen';
    }

    var nextSvs = nextUpcoming(svsDatesForYear);
    var nextEst = nextUpcoming(estDatesForYear);
    svsDateEl.textContent = fmtDate(nextSvs);
    svsCountdownEl.textContent = fmtCountdown(nextSvs) + ' (+ 18 Tage Zahlungsfrist)';
    estDateEl.textContent = fmtDate(nextEst);
    estCountdownEl.textContent = fmtCountdown(nextEst);
  }

  function num(el) {
    var v = parseFloat(el.value);
    return isFinite(v) ? v : 0;
  }

  // Dezimalzahlen im österreichischen/deutschen Format anzeigen (Komma statt Punkt).
  function toFixedAT(n, digits) {
    return (isFinite(n) ? n : 0).toFixed(digits).replace('.', ',');
  }

  // Datumsfelder: Anzeige/Eingabe im österreichischen Format TT.MM.JJJJ, intern immer ISO (YYYY-MM-DD),
  // damit die restliche Logik (Sortierung, Datumsvergleiche, Speicherformat) unverändert bleibt.
  function formatATDateFromISO(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) return '';
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  function parseATDateToISO(str) {
    var m = String(str || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return '';
    var day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
    var d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return '';
    return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
  }
  function getDateISO(el) {
    if (!el) return '';
    if (el.dataset && el.dataset.iso) return el.dataset.iso;
    return parseATDateToISO(el.value);
  }
  function setDateISO(el, iso) {
    if (!el) return;
    el.value = formatATDateFromISO(iso);
    if (el.dataset) el.dataset.iso = iso || '';
  }
  function attachATDateMask(el) {
    if (!el || el._atDateMaskAttached) return;
    el._atDateMaskAttached = true;
    el.addEventListener('input', function() {
      var digits = el.value.replace(/[^0-9]/g, '').slice(0, 8);
      var out = digits;
      if (digits.length > 4) out = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
      else if (digits.length > 2) out = digits.slice(0, 2) + '.' + digits.slice(2);
      el.value = out;
      el.dataset.iso = parseATDateToISO(out);
    });
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  var currentAfaTotal = 0; // set by renderAssets(), read by recalc()
  var currentAssetCount = 0;

  var segDefs = [
    { key: 'ausgaben', label: 'Betriebsausgaben (inkl. AfA)', color: 'var(--series-ausgaben)' },
    { key: 'ust',      label: 'Umsatzsteuer',      color: 'var(--series-ust)' },
    { key: 'sv',       label: 'Sozialversicherung',color: 'var(--series-sv)' },
    { key: 'est',      label: 'Einkommensteuer',   color: 'var(--series-est)' },
    { key: 'netto',    label: 'Bleibt übrig',      color: 'var(--series-netto)' }
  ];

  function recalc() {
    var isKU = els.isKU.checked;
    var isVersVermittler = els.isVersVermittler ? els.isVersVermittler.checked : false;
    var ustBefreit = isKU || isVersVermittler;
    var revenue = num(els.umsatz);
    var expenses = num(els.ausgaben);
    var ustRate = num(els.ustSatz) / 100;
    var kuGrenze = num(els.kuGrenze);
    var svRate = num(els.svSatz) / 100;
    var svMin = num(els.svMin);
    var svMax = num(els.svMax);
    var uvFix = num(els.uvFix);
    var gfbSatz = num(els.gfbSatz) / 100;
    var gfbGrenze = num(els.gfbGrenze);

    // Feld-Hinweise: sowohl Kleinunternehmer als auch der umsatzsteuerbefreite Versicherungsvermittler
    // verrechnen keine USt und haben deshalb auch keinen Vorsteuerabzug (beides "unechte" Befreiungen).
    if (isVersVermittler) {
      outs.umsatzHint.textContent = 'Vermittlungsprovision inkl. Leitungs-/Differenzvergütung — als Versicherungsvermittler nach § 6 Abs 1 Z 13 UStG umsatzsteuerbefreit.';
      outs.ausgabenHint.textContent = 'Inklusive der Vorsteuer, da bei dieser Befreiung kein Vorsteuerabzug möglich ist.';
      els.ustSatz.parentElement.style.opacity = 0.4;
      els.ustSatz.disabled = true;
    } else if (isKU) {
      outs.umsatzHint.textContent = 'Rechnungsbetrag ohne USt (Kleinunternehmer verrechnen keine USt).';
      outs.ausgabenHint.textContent = 'Inklusive der Vorsteuer, da bei Kleinunternehmern kein Vorsteuerabzug möglich ist.';
      els.ustSatz.parentElement.style.opacity = 0.4;
      els.ustSatz.disabled = true;
    } else {
      outs.umsatzHint.textContent = 'Gesamter Rechnungsbetrag exkl. Umsatzsteuer.';
      outs.ausgabenHint.textContent = 'Alle abzugsfähigen Ausgaben exkl. Vorsteuer (SV-Beiträge nicht extra eintragen — die werden unten automatisch berechnet).';
      els.ustSatz.parentElement.style.opacity = 1;
      els.ustSatz.disabled = false;
    }

    if (isKU && !isVersVermittler && revenue > kuGrenze) {
      outs.kuWarning.classList.add('show');
      outs.kuWarning.innerHTML = '⚠️ Dein Umsatz (' + euro(revenue) + ') liegt über der Kleinunternehmergrenze von ' + euro(kuGrenze) + '. Ab Überschreiten (bzw. bei mehr als 15% Überschreitung im Jahr) bist du regelbesteuert — Umsatzsteuer wird unten trotzdem nicht verrechnet, da die Kleinunternehmerregelung aktiviert ist. Bitte prüfen bzw. Regelung deaktivieren.';
    } else {
      outs.kuWarning.classList.remove('show');
    }

    // USt
    var ustZahllast = 0;
    if (!ustBefreit) {
      var ustOutput = revenue * ustRate;
      var vorsteuer = expenses * ustRate;
      ustZahllast = Math.max(0, ustOutput - vorsteuer);
    }

    // Gewinn (Ausgaben inkl. automatisch übernommener AfA aus dem Anlagenverzeichnis)
    var afaTotal = currentAfaTotal;
    var gewinn = revenue - expenses - afaTotal;

    // SV
    var svBasis = gewinn > 0 ? clamp(gewinn, svMin, svMax) : svMin;
    var svBeitrag = svBasis * svRate + uvFix;

    // ESt basis
    var gewinnNachSV = gewinn - svBeitrag;
    var gfbBasis = clamp(gewinnNachSV, 0, gfbGrenze);
    var grundfreibetrag = gfbBasis * gfbSatz;
    var estBasis = Math.max(0, gewinnNachSV - grundfreibetrag);
    var est = computeEst(estBasis);

    var total = ustZahllast + svBeitrag + est;
    var netto = gewinn - svBeitrag - est - ustZahllast;

    // ---------- Render stat tiles ----------
    outs.ust.textContent = euro(ustZahllast);
    outs.ustSub.textContent = isVersVermittler ? 'Versicherungsvermittler – umsatzsteuerbefreit (§ 6/1/13 UStG)' : (isKU ? 'Kleinunternehmer – keine USt-Pflicht' : ('USt ' + (ustRate*100).toFixed(0) + '% auf Umsatz minus Vorsteuer auf Ausgaben'));
    outs.sv.textContent = euro(svBeitrag);
    outs.svSub.textContent = 'Basis ' + euro(svBasis) + ' × ' + toFixedAT(svRate*100, 2) + '% + ' + euro(uvFix) + ' UV';
    outs.est.textContent = euro(est);
    outs.estSub.textContent = 'Bemessungsgrundlage ' + euro(estBasis);
    outs.gewinn.textContent = euro(gewinn);
    outs.gewinnSub.textContent = afaTotal > 0 ? ('inkl. ' + euro(afaTotal) + ' AfA-Abzug') : 'Bemessungsbasis für SV & ESt';
    outs.afa.textContent = euro(afaTotal);
    outs.afaSub.textContent = currentAssetCount + (currentAssetCount === 1 ? ' Wirtschaftsgut erfasst' : ' Wirtschaftsgüter erfasst');
    outs.gfb.textContent = euro(grundfreibetrag);
    outs.gfbSub.textContent = (gfbSatz*100).toFixed(0) + '% von ' + euro(gfbBasis);
    outs.netto.textContent = euro(netto);
    outs.total.textContent = euro(total);
    outs.totalPct.textContent = (revenue > 0 ? fmtPct.format(total / revenue * 100) : '0') + ' % vom Umsatz';
    outs.monthly.textContent = euro(total / 12);

    // ---------- Stacked bar ----------
    var values = { ausgaben: expenses + afaTotal, ust: ustZahllast, sv: svBeitrag, est: est, netto: Math.max(netto, 0) };
    var barBase = expenses + afaTotal + ustZahllast + svBeitrag + est + Math.max(netto, 0);
    if (barBase <= 0) barBase = 1;

    var barEl = document.getElementById('barChart');
    var legendEl = document.getElementById('barLegend');
    barEl.innerHTML = '';
    legendEl.innerHTML = '';

    segDefs.forEach(function(def) {
      var v = values[def.key];
      var pct = v / barBase * 100;
      var seg = document.createElement('div');
      seg.className = 'bar-seg';
      seg.style.width = pct + '%';
      seg.style.background = def.color;
      seg.setAttribute('data-label', def.label);
      seg.setAttribute('data-value', euro(v));
      seg.setAttribute('data-pct', fmtPct.format(pct) + ' %');
      seg.addEventListener('mousemove', showTooltip);
      seg.addEventListener('mouseleave', hideTooltip);
      barEl.appendChild(seg);

      var li = document.createElement('div');
      li.className = 'legend-item';
      li.innerHTML = '<span class="sw" style="background:' + def.color + '"></span>' + def.label + ': <strong>' + euro(v) + '</strong>';
      legendEl.appendChild(li);
    });

    updateRuecklageAmpel(total);
    scheduleAutoSave();
  }

  var tooltip = document.getElementById('tooltip');
  function showTooltip(e) {
    var t = e.currentTarget;
    tooltip.textContent = t.getAttribute('data-label') + ': ' + t.getAttribute('data-value') + ' (' + t.getAttribute('data-pct') + ')';
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY + 12) + 'px';
    tooltip.classList.add('show');
  }
  function hideTooltip() {
    tooltip.classList.remove('show');
  }

  Object.keys(els).forEach(function(k) {
    els[k].addEventListener('input', recalc);
    els[k].addEventListener('change', recalc);
  });

  if (ruecklageEls.gespart) {
    ruecklageEls.gespart.addEventListener('input', function() {
      updateRuecklageAmpel(lastRuecklageTotal);
      scheduleAutoSave();
    });
  }

  // ============================================================
  // Anlagenverzeichnis / AfA
  // ============================================================

  var AFA_CATEGORIES = [
    { key: 'pkw',            label: 'PKW / Kombi (Verbrenner)',                 nd: 8, isVehicle: true },
    { key: 'pkw_e',          label: 'Elektro-Fahrzeug (PKW)',                    nd: 8, isVehicle: true },
    { key: 'nutzfahrzeug',   label: 'Nutzfahrzeug / Transporter / LKW',          nd: 5, isVehicle: true },
    { key: 'fahrrad',        label: 'Fahrrad / E-Bike (betrieblich)',            nd: 5 },
    { key: 'hardware',       label: 'Computer / Notebook / PC-Hardware',         nd: 3 },
    { key: 'smartphone',     label: 'Smartphone / Tablet',                       nd: 3 },
    { key: 'buerogeraet',    label: 'Drucker / kleine Bürogeräte',               nd: 5 },
    { key: 'software',       label: 'Software (Standardsoftware)',               nd: 3 },
    { key: 'bueromoebel',    label: 'Büromöbel (Schreibtisch, Regal, Stuhl)',    nd: 10 },
    { key: 'werkzeug',       label: 'Werkzeug / Maschinen (Handwerk)',           nd: 10 },
    { key: 'werkstatt',      label: 'Elektrogeräte / Werkstattausstattung',      nd: 8 },
    { key: 'kamera',         label: 'Kamera- / Videoequipment',                  nd: 5 },
    { key: 'telefonanlage',  label: 'Telefonanlage / IT-Netzwerk',               nd: 5 },
    { key: 'gebaeude',       label: 'Betriebsgebäude',                           nd: 40 },
    { key: 'einbauten',      label: 'Einbauten / Mietereinbauten',               nd: 10 },
    { key: 'bga_sonstige',   label: 'Sonstige Betriebs- und Geschäftsausstattung', nd: 10 },
    { key: 'custom',         label: 'Andere / eigene Nutzungsdauer angeben',     nd: null }
  ];

  var assets = []; // { id, name, categoryKey, ndCustom, cost, date }
  var nextAssetId = 1;

  var assetEls = {
    jahr: document.getElementById('afaJahr'),
    gwgGrenze: document.getElementById('gwgGrenze'),
    name: document.getElementById('assetName'),
    category: document.getElementById('assetCategory'),
    customNdGroup: document.getElementById('customNdGroup'),
    ndCustom: document.getElementById('assetNdCustom'),
    ageBox: document.getElementById('vehicleAgeBox'),
    age: document.getElementById('assetAge'),
    ageHint: document.getElementById('vehicleAgeHint'),
    restNdGroup: document.getElementById('assetRestNdGroup'),
    restNd: document.getElementById('assetRestNd'),
    cost: document.getElementById('assetCost'),
    date: document.getElementById('assetDate'),
    addBtn: document.getElementById('addAssetBtn'),
    tbody: document.getElementById('assetTableBody'),
    totalCell: document.getElementById('assetTotalAfa'),
    yearLabel: document.getElementById('afaYearLabel')
  };
  attachATDateMask(assetEls.date);

  // populate category dropdown
  AFA_CATEGORIES.forEach(function(cat) {
    var opt = document.createElement('option');
    opt.value = cat.key;
    opt.textContent = cat.label + (cat.nd ? ' — ' + cat.nd + ' Jahre' : '');
    assetEls.category.appendChild(opt);
  });

  function categoryByKey(key) {
    for (var i = 0; i < AFA_CATEGORIES.length; i++) {
      if (AFA_CATEGORIES[i].key === key) return AFA_CATEGORIES[i];
    }
    return AFA_CATEGORIES[0];
  }

  // Gebrauchte Fahrzeuge: ist das Auto bereits so alt wie/älter als die normale ND (8 Jahre),
  // darf die Restnutzungsdauer selbst geschätzt werden (statt die Normal-AfA neu zu starten).
  function updateVehicleAgeUI() {
    var cat = categoryByKey(assetEls.category.value);
    if (!cat.isVehicle) {
      assetEls.ageBox.style.display = 'none';
      return;
    }
    assetEls.ageBox.style.display = 'block';
    var age = parseFloat(assetEls.age.value) || 0;
    if (age >= cat.nd) {
      assetEls.restNdGroup.style.display = 'block';
      assetEls.ageHint.textContent = 'Das Fahrzeug ist bereits ' + age + ' Jahre alt — mindestens so alt wie die normale Nutzungsdauer von ' + cat.nd + ' Jahren. Ab diesem Alter darfst du die Restnutzungsdauer selbst schätzen (Zustand, km-Stand, erwartete weitere Nutzung).';
    } else {
      assetEls.restNdGroup.style.display = 'none';
      var remaining = cat.nd - age;
      assetEls.ageHint.textContent = age > 0
        ? ('Gebraucht, ' + age + ' Jahre alt — Restnutzungsdauer automatisch: ' + remaining + ' Jahre (normale ND ' + cat.nd + ' − Alter).')
        : ('Neu — normale Nutzungsdauer ' + cat.nd + ' Jahre.');
    }
  }

  assetEls.category.addEventListener('change', function() {
    assetEls.customNdGroup.style.display = (assetEls.category.value === 'custom') ? 'block' : 'none';
    updateVehicleAgeUI();
  });
  assetEls.age.addEventListener('input', updateVehicleAgeUI);
  updateVehicleAgeUI(); // initial state for the default-selected category

  function ndForAsset(asset) {
    if (asset.categoryKey === 'custom') return Math.max(1, asset.ndCustom || 1);
    var cat = categoryByKey(asset.categoryKey);
    if (cat.isVehicle && asset.age > 0) {
      if (asset.age >= cat.nd) {
        return Math.max(1, asset.restNd || 1); // selbst geschätzte Restnutzungsdauer
      }
      return Math.max(1, cat.nd - asset.age); // Rest der normalen Nutzungsdauer
    }
    return cat.nd;
  }

  // AfA for a single calendar year (index 0 = acquisition year), with Halbjahresregel
  function afaForCalendarYear(asset, year, gwgGrenze) {
    var cost = asset.cost;
    var acqDate = new Date(asset.date);
    if (isNaN(acqDate.getTime())) return 0;
    var acqYear = acqDate.getFullYear();
    var isGWG = cost > 0 && cost <= gwgGrenze;

    if (isGWG) {
      return (year === acqYear) ? cost : 0;
    }

    var nd = ndForAsset(asset);
    var fullAnnual = cost / nd;
    var halfYear = acqDate.getMonth() >= 6; // Juli (index 6) oder später
    var index = year - acqYear;

    if (index < 0) return 0;

    if (!halfYear) {
      return (index < nd) ? fullAnnual : 0;
    } else {
      if (index === 0) return fullAnnual / 2;
      if (index >= 1 && index < nd) return fullAnnual;
      if (index === nd) return fullAnnual / 2;
      return 0;
    }
  }

  function restbuchwertEndOfYear(asset, year, gwgGrenze) {
    var acqDate = new Date(asset.date);
    if (isNaN(acqDate.getTime())) return asset.cost;
    var acqYear = acqDate.getFullYear();
    var cum = 0;
    for (var y = acqYear; y <= year; y++) {
      cum += afaForCalendarYear(asset, y, gwgGrenze);
    }
    return Math.max(0, asset.cost - cum);
  }

  function renderAssets() {
    var calcYear = Math.round(num(assetEls.jahr)) || new Date().getFullYear();
    var gwgGrenze = num(assetEls.gwgGrenze);
    assetEls.yearLabel.textContent = calcYear;

    var rows = '';
    var total = 0;

    assets.forEach(function(asset) {
      var cat = categoryByKey(asset.categoryKey);
      var nd = ndForAsset(asset);
      var isGWG = asset.cost > 0 && asset.cost <= gwgGrenze;
      var afaYear = afaForCalendarYear(asset, calcYear, gwgGrenze);
      var rbw = restbuchwertEndOfYear(asset, calcYear, gwgGrenze);
      total += afaYear;

      var dateStr = '—';
      var d = new Date(asset.date);
      if (!isNaN(d.getTime())) {
        dateStr = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth()+1)).slice(-2) + '.' + d.getFullYear();
      }

      var vehicleBadge = '';
      if (cat.isVehicle && asset.age > 0 && !isGWG) {
        vehicleBadge = (asset.age >= cat.nd)
          ? '<span class="gwg-badge">gebraucht, ' + asset.age + ' J. — ND selbst geschätzt</span>'
          : '<span class="gwg-badge">gebraucht, ' + asset.age + ' J. alt</span>';
      }

      rows += '<tr>' +
        '<td class="name-cell"><strong>' + escapeHtml(asset.name || '(ohne Bezeichnung)') + '</strong>' +
          '<span>' + escapeHtml(cat.label) + (isGWG ? '<span class="gwg-badge">GWG – sofort abgesetzt</span>' : vehicleBadge) + '</span></td>' +
        '<td class="num">' + dateStr + '</td>' +
        '<td class="num">' + euro(asset.cost) + '</td>' +
        '<td class="num">' + (isGWG ? '—' : nd + ' J.') + '</td>' +
        '<td class="num">' + euro(afaYear) + '</td>' +
        '<td class="num">' + euro(rbw) + '</td>' +
        '<td><button type="button" class="btn-remove" data-id="' + asset.id + '">Entfernen</button></td>' +
      '</tr>';
    });

    if (assets.length === 0) {
      rows = '<tr><td colspan="7"><div class="empty-state">Noch keine Wirtschaftsgüter erfasst. Füge oben dein erstes Anlagegut hinzu.</div></td></tr>';
    }

    assetEls.tbody.innerHTML = rows;
    assetEls.totalCell.textContent = euro(total);

    assetEls.tbody.querySelectorAll('.btn-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(btn.getAttribute('data-id'), 10);
        assets = assets.filter(function(a) { return a.id !== id; });
        renderAssets();
      });
    });

    currentAfaTotal = total;
    currentAssetCount = assets.length;
    recalc();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  // ---------- Notizen & Ideen (echte To-do-Liste, optional Mitarbeiter-Zuordnung + Fälligkeit) ----------
  var notes = [
    { id: 'n1', text: 'GISA-Zahl & Gewerbewortlaut nachtragen, sobald ich die Eckdaten habe', done: false, assignedTo: [], due: '' },
    { id: 'n2', text: 'Weitere AfA-Kategorien ergänzen, falls eine Anschaffung nicht passt', done: false, assignedTo: [], due: '' }
  ];
  var noteIdSeq = 2;
  var noteListEl = document.getElementById('noteListEl');
  var noteEmptyStateEl = document.getElementById('noteEmptyState');
  var noteInputEl = document.getElementById('noteInput');
  var btnAddNoteEl = document.getElementById('btnAddNote');
  var noteDueInputEl = document.getElementById('noteDueInput');
  var noteAssignPickerEl = document.getElementById('noteAssignPicker');
  var pendingNoteAssignees = [];

  // Anzeigename zu einer Personen-ID ("raphael" oder Mitarbeiter-ID). Defensiv gegenüber
  // "team", das erst weiter unten im Skript initialisiert wird (kann bei sehr frühem Aufruf
  // noch nicht existieren).
  function personName(id) {
    if (id === 'raphael') return 'Ich (Raphael)';
    var list = (typeof team !== 'undefined' && team) ? team : [];
    var p = list.find(function(x) { return x.id === id; });
    return p ? (p.name || '(ohne Namen)') : null;
  }

  function formatDueDateTime(due) {
    if (!due) return '';
    var d = new Date(due);
    if (isNaN(d.getTime())) return '';
    var dd = ('0' + d.getDate()).slice(-2), mm = ('0' + (d.getMonth() + 1)).slice(-2), yy = d.getFullYear();
    var hh = ('0' + d.getHours()).slice(-2), mi = ('0' + d.getMinutes()).slice(-2);
    return dd + '.' + mm + '.' + yy + ', ' + hh + ':' + mi;
  }

  // Pillen-Auswahl "Ich" + alle Mitarbeiter, für die Zuordnung neuer Notizen. Wird auch bei
  // jeder Änderung der Team-Liste neu gerendert (siehe renderTeamTable()).
  function renderNoteAssignOptions() {
    if (!noteAssignPickerEl) return;
    var list = (typeof team !== 'undefined' && team) ? team : [];
    var options = [{ id: 'raphael', name: 'Ich' }].concat(list.map(function(p) { return { id: p.id, name: p.name || '(ohne Namen)' }; }));
    noteAssignPickerEl.innerHTML = options.map(function(o) {
      var active = pendingNoteAssignees.indexOf(o.id) !== -1;
      return '<button type="button" class="note-assign-pill' + (active ? ' active' : '') + '" data-id="' + o.id + '">' + escapeHtml(o.name) + '</button>';
    }).join('');
    noteAssignPickerEl.querySelectorAll('.note-assign-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-id');
        var idx = pendingNoteAssignees.indexOf(id);
        if (idx === -1) pendingNoteAssignees.push(id); else pendingNoteAssignees.splice(idx, 1);
        renderNoteAssignOptions();
      });
    });
  }

  function renderNotes() {
    noteEmptyStateEl.style.display = notes.length === 0 ? 'block' : 'none';
    noteListEl.style.display = notes.length === 0 ? 'none' : 'block';
    noteListEl.innerHTML = notes.map(function(n) {
      var assignNames = (n.assignedTo || []).map(personName).filter(Boolean);
      var overdue = isNoteOverdue(n);
      var metaParts = [];
      if (n.due) metaParts.push('<span class="' + (overdue ? 'overdue' : '') + '">📅 ' + escapeHtml(formatDueDateTime(n.due)) + (overdue ? ' · überfällig' : '') + '</span>');
      if (assignNames.length) metaParts.push('👤 ' + escapeHtml(assignNames.join(', ')));
      return '' +
        '<li data-id="' + n.id + '" class="' + (n.done ? 'note-done' : '') + '">' +
          '<div class="box note-check" data-id="' + n.id + '" role="checkbox" aria-checked="' + (n.done ? 'true' : 'false') + '"></div>' +
          '<div class="txt"><strong>' + escapeHtml(n.text) + '</strong>' +
            (metaParts.length ? '<span>' + metaParts.join(' · ') + '</span>' : '') +
          '</div>' +
          '<button type="button" class="btn-remove note-remove" data-id="' + n.id + '" title="Löschen">✕</button>' +
        '</li>';
    }).join('');

    noteListEl.querySelectorAll('.note-check').forEach(function(el) {
      el.addEventListener('click', function() {
        var n = notes.find(function(x) { return x.id === el.getAttribute('data-id'); });
        if (n) { n.done = !n.done; renderNotes(); scheduleAutoSave(); }
      });
    });
    noteListEl.querySelectorAll('.note-remove').forEach(function(el) {
      el.addEventListener('click', function() {
        notes = notes.filter(function(x) { return x.id !== el.getAttribute('data-id'); });
        renderNotes();
        scheduleAutoSave();
      });
    });

    if (typeof renderOrgTree === 'function') renderOrgTree();
    if (typeof renderPersonDetail === 'function') renderPersonDetail();
    if (typeof renderHeute === 'function') renderHeute();
  }

  function addNote(text, assignedTo, due) {
    text = (text || '').trim();
    if (!text) return;
    noteIdSeq += 1;
    notes.push({ id: 'n' + noteIdSeq, text: text, done: false, assignedTo: (assignedTo || []).slice(), due: due || '' });
    renderNotes();
    scheduleAutoSave();
  }

  btnAddNoteEl.addEventListener('click', function() {
    addNote(noteInputEl.value, pendingNoteAssignees, noteDueInputEl ? noteDueInputEl.value : '');
    noteInputEl.value = '';
    if (noteDueInputEl) noteDueInputEl.value = '';
    pendingNoteAssignees = [];
    renderNoteAssignOptions();
    noteInputEl.focus();
  });
  noteInputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNote(noteInputEl.value, pendingNoteAssignees, noteDueInputEl ? noteDueInputEl.value : '');
      noteInputEl.value = '';
      if (noteDueInputEl) noteDueInputEl.value = '';
      pendingNoteAssignees = [];
      renderNoteAssignOptions();
    }
  });

  // Initiales Rendern von Notizen + Zuordnungs-Pillen erfolgt erst unten, NACHDEM team/raphael
  // weiter unten im Skript initialisiert sind (siehe renderTeamTable()/teamRecalc()-Aufruf am Ende).

  assetEls.addBtn.addEventListener('click', function() {
    var cost = num(assetEls.cost);
    var dateVal = getDateISO(assetEls.date);
    if (!dateVal) {
      var today = new Date();
      dateVal = today.toISOString().slice(0, 10);
      setDateISO(assetEls.date, dateVal);
    }
    if (cost <= 0) {
      assetEls.cost.focus();
      return;
    }
    assets.push({
      id: nextAssetId++,
      name: assetEls.name.value.trim(),
      categoryKey: assetEls.category.value,
      ndCustom: parseFloat(assetEls.ndCustom.value) || 5,
      age: parseFloat(assetEls.age.value) || 0,
      restNd: parseFloat(assetEls.restNd.value) || 1,
      cost: cost,
      date: dateVal
    });
    assetEls.name.value = '';
    assetEls.cost.value = '';
    setDateISO(assetEls.date, '');
    assetEls.age.value = '0';
    assetEls.restNd.value = '4';
    updateVehicleAgeUI();
    renderAssets();
  });

  assetEls.jahr.addEventListener('input', renderAssets);
  assetEls.gwgGrenze.addEventListener('input', renderAssets);

  // default calc year = current year
  assetEls.jahr.value = new Date().getFullYear();

  renderAssets(); // also triggers first recalc() via currentAfaTotal
  recalc();
  updateZahlungstermine();

  // ============================================================
  // Lebensversicherung (übernommen aus Uniqa_FlexSelection_Rechner.xlsx)
  // ============================================================

  var lvEls = {
    premium: document.getElementById('lvPremium'),
    years: document.getElementById('lvYears'),
    rateReduction: document.getElementById('lvRateReduction'),
    rateReductionHint: document.getElementById('lvRateReductionHint'),
    dynamikEnabled: document.getElementById('lvDynamikEnabled'),
    dynamikRate: document.getElementById('lvDynamikRate'),
    tableBody: document.getElementById('lvTableBody'),
    chart: document.getElementById('lvChart'),
    outPaid: document.getElementById('lvOutPaid'),
    outV0: document.getElementById('lvOutV0'),
    outV3: document.getElementById('lvOutV3'),
    outV6: document.getElementById('lvOutV6'),
    outV8: document.getElementById('lvOutV8'),
    outG3: document.getElementById('lvOutG3'),
    outG6: document.getElementById('lvOutG6'),
    outG8: document.getElementById('lvOutG8'),
    wunschrendite: document.getElementById('lvWunschrendite'),
    wunschTile: document.getElementById('lvWunschTile'),
    rateLabelW: document.getElementById('lvRateLabelW'),
    outVW: document.getElementById('lvOutVW'),
    outGW: document.getElementById('lvOutGW'),
    legendLabelW: document.getElementById('lvLegendLabelW'),
    headRateW: document.getElementById('lvHeadRateW'),
    headGainW: document.getElementById('lvHeadGainW'),
    praemieJahr: document.getElementById('lvPraemieJahr'),
    praemieBetrag: document.getElementById('lvPraemieBetrag'),
    btnAddPraemie: document.getElementById('btnAddPraemie'),
    praemieList: document.getElementById('lvPraemieList'),
    praemieEmpty: document.getElementById('lvPraemieEmpty'),
    zuzahlungJahr: document.getElementById('lvZuzahlungJahr'),
    zuzahlungBetrag: document.getElementById('lvZuzahlungBetrag'),
    btnAddZuzahlung: document.getElementById('btnAddZuzahlung'),
    zuzahlungList: document.getElementById('lvZuzahlungList'),
    zuzahlungEmpty: document.getElementById('lvZuzahlungEmpty'),
    auszahlungJahr: document.getElementById('lvAuszahlungJahr'),
    auszahlungBetrag: document.getElementById('lvAuszahlungBetrag'),
    btnAddAuszahlung: document.getElementById('btnAddAuszahlung'),
    auszahlungList: document.getElementById('lvAuszahlungList'),
    auszahlungEmpty: document.getElementById('lvAuszahlungEmpty')
  };

  var lvLumpSums = {};          // Jahr -> Einmalerlag (€)
  var lvWithdrawals = {};       // Jahr -> Teilauszahlung (€)
  var lvPremiumOverrides = {};  // Jahr -> neue monatliche Prämie ab diesem Jahr (gilt bis zur nächsten Änderung)
  var LV_RATES = [0, 0.03, 0.06, 0.08];

  // Fix hinterlegt (nicht änderbar) — Raphael investiert in FlexSelection ausschließlich in den Fidelity MSCI
  // World Index Fund, daher genügt ein einziger, an seinem echten Uniqa-Vorschlag vom 29.08.2026 geprüfter
  // Kostensatz statt eines editierbaren Feldes. Versicherungssteuer 4% der Prämie inkl. Steuer (= 4/104 des
  // Bruttobetrags) + Abschlusskosten 8% der Prämie exklusive Steuer ergeben zusammen die Kostenquote unten.
  var LV_COST_RATIO = 4 / 104 + 0.08 * (100 / 104); // = 11,5385% -> Investitionsquote 88,4615%
  var LV_DEPOT_FEE = 0.005; // 0,50% p.a. auf den bestehenden Polizzenwert ("Kosten, die am Depotwert bemessen sind")

  // Die Zinsminderung wird als Prozentpunkt-Abschlag auf jeden der vier Basis-Zinssätze angewandt
  // (z. B. für Fondskosten oder eine vorsichtigere Annahme). Die Basisrate (0/0.03/0.06/0.08) bleibt
  // überall als Objekt-Schlüssel (values[r], LV_RATES-Index) erhalten — nur der tatsächlich verzinste
  // Satz wird reduziert. Kann rechnerisch auch unter 0% fallen, das ist bei einer echten Zinsminderung
  // so gewollt (kein künstlicher Boden bei 0%).
  function lvRateReduction() {
    return clamp(num(lvEls.rateReduction), 0, 100) / 100;
  }
  function lvEffectiveRate(baseRate) {
    return baseRate - lvRateReduction();
  }

  // Freie "Wunschrendite" (5. Szenario, zusätzlich zu den vier festen 0/3/6/8%) — liefert die eingetragene
  // Rendite als Bruchzahl (z. B. 0.045 für 4,5%) oder null, wenn das Feld leer/ungültig ist. Unterliegt
  // ebenso der Zinsminderung wie die vier festen Sätze (über lvEffectiveRate), damit alle Szenarien konsistent
  // bleiben.
  function lvWunschRate() {
    if (!lvEls.wunschrendite) return null;
    var raw = lvEls.wunschrendite.value;
    if (raw === '' || raw === null || raw === undefined) return null;
    var v = parseFloat(String(raw).replace(',', '.'));
    return isFinite(v) ? v / 100 : null;
  }

  function lvYears() {
    var y = Math.round(num(lvEls.years)) || 1;
    return Math.max(1, Math.min(80, y));
  }

  // Zeitfaktor für unterjährig (monatlich) eingezahltes Geld, kalibriert gegen einen echten UNIQA-Vorschlag
  // (29.08.2026, Haupttarif R2R_HV_202603, 500 €/Monat, 45 Jahre Prämienzahlungsdauer, 50 Jahre Laufzeit):
  // Für alle vier dort ausgewiesenen Szenario-Zinssätze (-3/0/3/6%) über alle 50 Laufzeitjahre gegen die
  // tatsächlich ausgewiesenen Rückkaufswerte per Kleinste-Quadrate-Anpassung ermittelt (max. Abweichung
  // danach < 0,05% statt zuvor bis zu 23%). 0,5 (= halbes Jahr) wäre der naheliegende Wert für "im Schnitt
  // ein halbes Jahr im Depot"; 0,543 bildet den tatsächlichen Effekt in UNIQAs Berechnung minimal genauer ab.
  var LV_NEW_MONEY_TIME_FACTOR = 0.543;

  // Endwert des im laufenden Jahr neu eingezahlten Geldes (Prämie + Einmalerlag, nach Kostenquote). Wächst
  // unterjährig nur mit LV_NEW_MONEY_TIME_FACTOR statt einem vollen Jahr (wie ein Einmalbetrag), und unterliegt
  // der laufenden Depotgebühr im Schnitt nur ein halbes Jahr (sqrt statt volles (1-fee)) — beides, weil das Geld
  // erst nach und nach über das Jahr einbezahlt wird, nicht als Einmalbetrag am Jahresanfang.
  function lvNewMoneyFV(amount, rate, fee) {
    if (!(amount > 0)) return 0;
    var growthBase = 1 + rate;
    if (growthBase <= 0) return 0; // Sicherheitsnetz bei rechnerisch extremer (unrealistischer) Zinsminderung
    return amount * Math.pow(growthBase, LV_NEW_MONEY_TIME_FACTOR) * Math.sqrt(1 - fee);
  }

  // Nachbildet die Mechanik eines echten UNIQA-FlexSelection-Vorschlags (geprüft anhand des oben genannten
  // Vorschlags — Modellwerte lagen für alle vier Szenario-Zinssätze über die volle Laufzeit von 50 Jahren
  // innerhalb von < 0,05% der tatsächlich ausgewiesenen Werte):
  //  - Kostenquote (Versicherungssteuer + laufzeitanteilige Abschlusskosten) wird auf die im jeweiligen Jahr neu
  //    eingezahlte Prämie + Einmalerlag angewandt (Investitionsquote = 1 - Kostenquote).
  //  - Diese neu eingezahlte, unterjährig einbezahlte Summe wird über lvNewMoneyFV() verzinst (nicht als
  //    Einmalbetrag, siehe dort).
  //  - Der zu Jahresbeginn bereits bestehende Polizzenwert wird dagegen mit dem vollen Jahreszins verzinst und
  //    danach um die laufende Depotgebühr gekürzt (Kosten, die am Depotwert bemessen sind, 0,50% p.a. bei
  //    UNIQA FlexSelection) — diese volle Jahresgebühr trifft nur das bereits bestehende Kapital, nicht das im
  //    selben Jahr frisch eingezahlte Geld (das trägt stattdessen nur die halbjährige Gebühr aus lvNewMoneyFV()).
  //  - Eine Teilauszahlung mindert den Vorjahreswert VOR der Verzinsung dieses Jahres (außer im 1. Jahr, dort
  //    ungewichtet abgezogen).
  // Die monatliche Prämie ist ab Jahr 1 der Basiswert und bleibt gleich, bis eine Zeile mit einer neuen Prämie eine
  // Änderung einträgt — ab dann gilt die neue Prämie für alle folgenden Jahre weiter, bis wieder eine geändert wird.
  function lvCompute() {
    // Jahr 1 wird ausschließlich über das Feld "Monatliche Prämie, Jahr 1" oben gesteuert — eine eigene
    // Übersteuerung in der Tabellenzeile für Jahr 1 würde dieses Feld sonst dauerhaft wirkungslos machen.
    delete lvPremiumOverrides[1];
    var basePremium = num(lvEls.premium);
    var costRatio = LV_COST_RATIO;
    var investRatio = 1 - costRatio;
    var depotFee = LV_DEPOT_FEE;
    var years = lvYears();
    var dynamikOn = !!(lvEls.dynamikEnabled && lvEls.dynamikEnabled.checked);
    var dynamikRate = dynamikOn ? clamp(num(lvEls.dynamikRate) / 100, 0, 1) : 0;
    var wunschBase = lvWunschRate(); // null, wenn keine Wunschrendite eingetragen ist
    // Die vier festen Szenarien plus — falls eingetragen — die Wunschrendite als 5. Eintrag ("W" als eigener,
    // nicht mit den numerischen Basissätzen kollidierender Schlüssel). Ein einziger Durchlauf berechnet damit
    // alle aktiven Szenarien identisch, ohne die Rechenlogik zu duplizieren.
    var rateEntries = LV_RATES.map(function(r) { return { key: r, base: r }; });
    if (wunschBase !== null) rateEntries.push({ key: 'W', base: wunschBase });

    var rows = [];
    var prevValues = { 0: 0, 0.03: 0, 0.06: 0, 0.08: 0, W: 0 };
    var cumLump = 0;
    var cumPremiumTotal = 0;
    var currentPremium = basePremium;

    for (var y = 1; y <= years; y++) {
      if (lvPremiumOverrides[y] !== undefined) currentPremium = lvPremiumOverrides[y];
      var premiumThisYear = currentPremium;
      // Dynamikerhöhung: die jeweils aktuelle Prämie wächst ab dem Folgejahr automatisch um dynamikRate weiter,
      // ausgehend von diesem Jahr (egal ob Basisprämie, vorheriges Dynamik-Ergebnis oder manuelle Prämienänderung) —
      // eine Prämienänderung in einem späteren Jahr überschreibt currentPremium oben ohnehin wieder.
      currentPremium = dynamikOn ? premiumThisYear * (1 + dynamikRate) : premiumThisYear;

      var lump = lvLumpSums[y] || 0;
      var withdrawal = lvWithdrawals[y] || 0;
      cumLump += lump;
      cumPremiumTotal += premiumThisYear * 12;
      var totalPaid = cumPremiumTotal + cumLump;
      var newMoney = premiumThisYear * 12 + lump;
      var investedNewMoney = newMoney * investRatio;

      // Eine Teilauszahlung kann nie mehr entnehmen, als im jeweiligen Szenario tatsächlich im Polizzenwert steckt
      // (bei 0% p.a. kann das Geld z. B. früher aufgebraucht sein als bei 8% p.a.) — und der Polizzenwert kann
      // dadurch nie negativ werden.
      var values = {};
      rateEntries.forEach(function(entry) {
        var effR = lvEffectiveRate(entry.base);
        var fvNewMoney = lvNewMoneyFV(investedNewMoney, effR, depotFee);
        if (y === 1) {
          var actualWithdrawal = Math.min(withdrawal, fvNewMoney);
          values[entry.key] = Math.max(0, fvNewMoney - actualWithdrawal);
        } else {
          var available = prevValues[entry.key] || 0;
          var actualWithdrawal2 = Math.min(withdrawal, available);
          var grownPrior = (available - actualWithdrawal2) * (1 + effR) * (1 - depotFee);
          values[entry.key] = Math.max(0, grownPrior + fvNewMoney);
        }
      });

      rows.push({
        year: y, lump: lump, withdrawal: withdrawal, premiumThisYear: premiumThisYear,
        cumPremium: cumPremiumTotal, cumLump: cumLump, totalPaid: totalPaid,
        values: values,
        gain03: values[0.03] - totalPaid,
        gain06: values[0.06] - totalPaid,
        gain08: values[0.08] - totalPaid,
        gainW: (wunschBase !== null) ? (values.W - totalPaid) : null
      });
      prevValues = values;
    }
    return rows;
  }

  function lvSetCell(field, year, text) {
    var el = lvEls.tableBody.querySelector('[data-field="' + field + '"][data-year="' + year + '"]');
    if (el) el.textContent = text;
  }

  // Formatiert den TATSÄCHLICH gerechneten Zinssatz (Basissatz abzüglich Zinsminderung) als Text,
  // z. B. "0,03" -> "3%" ohne Minderung, oder "1,5%" bei einer Minderung von 1,5 Prozentpunkten.
  function lvFormatRatePct(baseRatePct) {
    var eff = Math.round((baseRatePct - lvRateReduction() * 100) * 10) / 10;
    var text = (Math.abs(eff - Math.round(eff)) < 1e-9) ? String(Math.round(eff)) : toFixedAT(eff, 1);
    return text + '%';
  }

  // Aktualisiert alle Beschriftungen, die den Zinssatz im Klartext zeigen (Ergebnis-Kacheln, Legende,
  // Tabellenkopf, Chart-Tooltip) — damit bei eingetragener Zinsminderung nirgends noch der ursprüngliche,
  // nicht mehr tatsächlich gerechnete Satz (z. B. "3%") stehen bleibt.
  function lvUpdateRateLabels() {
    [0, 3, 6, 8].forEach(function(base) {
      var text = lvFormatRatePct(base);
      var stat = document.getElementById('lvRateLabel' + base);
      if (stat) stat.textContent = text;
      var legend = document.getElementById('lvLegendLabel' + base);
      if (legend) legend.textContent = text + ' p.a.';
      var head = document.getElementById('lvHeadRate' + base);
      if (head) head.textContent = text;
      if (base !== 0) {
        var gainHead = document.getElementById('lvHeadGain' + base);
        if (gainHead) gainHead.textContent = text;
      }
    });
    if (typeof LV_SERIES !== 'undefined') {
      LV_SERIES.forEach(function(s) { if (s.key !== 'W') s.label = lvFormatRatePct(s.key * 100) + ' p.a.'; });

      // Die Wunschrendite als 5. Chart-Serie ein-/ausblenden, je nachdem ob das Feld aktuell einen gültigen
      // Wert enthält — LV_SERIES bleibt sonst unverändert (die vier festen Serien werden nie entfernt).
      var wunschBase = lvWunschRate();
      var wIdx = -1;
      LV_SERIES.forEach(function(s, i) { if (s.key === 'W') wIdx = i; });
      if (wunschBase !== null) {
        var wLabel = 'Wunschrendite ' + lvFormatRatePct(wunschBase * 100) + ' p.a.';
        if (wIdx >= 0) { LV_SERIES[wIdx].label = wLabel; }
        else { LV_SERIES.push({ key: 'W', color: 'var(--series-netto)', label: wLabel }); }
      } else if (wIdx >= 0) {
        LV_SERIES.splice(wIdx, 1);
      }
    }
    if (lvEls.rateReductionHint) {
      lvEls.rateReductionHint.textContent = '→ Effektive Verzinsung: ' +
        [0, 3, 6, 8].map(lvFormatRatePct).join(' / ') + ' p.a.';
    }

    // Wunschrendite-Beschriftungen (Kachel, Legende, Tabellenkopf) unabhängig vom Chart aktualisieren.
    var wb = lvWunschRate();
    var wText = (wb !== null) ? lvFormatRatePct(wb * 100) : '–';
    if (lvEls.rateLabelW) lvEls.rateLabelW.textContent = wText;
    if (lvEls.legendLabelW) lvEls.legendLabelW.textContent = 'Wunschrendite ' + (wb !== null ? wText + ' p.a.' : '–');
    if (lvEls.headRateW) lvEls.headRateW.textContent = wText;
    if (lvEls.headGainW) lvEls.headGainW.textContent = wText;
  }

  // Grauen/aktiven Zustand des Prozentsatz-Felds an den Schalter angleichen — auch nach Wiederherstellung
  // eines gespeicherten Zustands (applyAppState setzt die Checkbox, ohne diese Funktion selbst aufzurufen).
  function lvUpdateDynamikUI() {
    if (!lvEls.dynamikEnabled || !lvEls.dynamikRate) return;
    var on = lvEls.dynamikEnabled.checked;
    lvEls.dynamikRate.disabled = !on;
    lvEls.dynamikRate.parentElement.style.opacity = on ? 1 : 0.5;
  }

  function lvRecompute() {
    lvUpdateRateLabels();
    lvUpdateDynamikUI();

    var rows = lvCompute();

    rows.forEach(function(r) {
      lvSetCell('premium', r.year, Math.round(r.premiumThisYear).toString());
      lvSetCell('totalPaid', r.year, euro(r.totalPaid));
      lvSetCell('v0', r.year, euro(r.values[0]));
      lvSetCell('v3', r.year, euro(r.values[0.03]));
      lvSetCell('v6', r.year, euro(r.values[0.06]));
      lvSetCell('v8', r.year, euro(r.values[0.08]));
      lvSetCell('g3', r.year, euro(r.gain03));
      lvSetCell('g6', r.year, euro(r.gain06));
      lvSetCell('g8', r.year, euro(r.gain08));
      lvSetCell('vW', r.year, (r.values.W !== undefined) ? euro(r.values.W) : '–');
      lvSetCell('gW', r.year, (r.gainW !== null && r.gainW !== undefined) ? euro(r.gainW) : '–');
    });

    var last = rows[rows.length - 1];
    if (last) {
      lvEls.outPaid.textContent = euro(last.totalPaid);
      lvEls.outV0.textContent = euro(last.values[0]);
      lvEls.outV3.textContent = euro(last.values[0.03]);
      lvEls.outV6.textContent = euro(last.values[0.06]);
      lvEls.outV8.textContent = euro(last.values[0.08]);
      lvEls.outG3.textContent = 'Gewinn/Verlust: ' + euro(last.gain03);
      lvEls.outG6.textContent = 'Gewinn/Verlust: ' + euro(last.gain06);
      lvEls.outG8.textContent = 'Gewinn/Verlust: ' + euro(last.gain08);
      if (last.values.W !== undefined) {
        if (lvEls.outVW) lvEls.outVW.textContent = euro(last.values.W);
        if (lvEls.outGW) lvEls.outGW.textContent = 'Gewinn/Verlust: ' + euro(last.gainW);
      } else {
        if (lvEls.outVW) lvEls.outVW.textContent = '–';
        if (lvEls.outGW) lvEls.outGW.textContent = 'Wunschrendite oben eintragen, um sie zu sehen';
      }
    }

    lvRenderChart(rows);
    scheduleAutoSave();
  }

  // Die Jahresübersicht ist reine Ausgabe (nichts mehr direkt in der Tabelle editierbar) — Prämienänderungen,
  // Zuzahlungen und Auszahlungen kommen ausschließlich aus den drei Boxen darüber (lvPremiumOverrides,
  // lvLumpSums, lvWithdrawals), siehe lvRenderFlows().
  function lvBuildTableStructure() {
    var years = lvYears();
    var tbody = lvEls.tableBody;
    tbody.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var y = 1; y <= years; y++) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + y + '</td>' +
        '<td class="num" data-field="premium" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="totalPaid" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="v0" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="v3" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="v6" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="v8" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="g3" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="g6" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="g8" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="vW" data-year="' + y + '">—</td>' +
        '<td class="num" data-field="gW" data-year="' + y + '">—</td>';
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);

    lvRecompute();
  }

  // Rendert die drei Boxen "Prämienänderungen", "Zuzahlungen" und "Auszahlungen" als Liste aus den jeweiligen
  // Jahr->Betrag-Maps, aufsteigend nach Jahr sortiert, jeweils mit einem Entfernen-Button pro Eintrag.
  function lvRenderFlowList(map, listEl, emptyEl, formatLabel) {
    var years = Object.keys(map).map(Number).sort(function(a, b) { return a - b; });
    listEl.innerHTML = years.map(function(y) {
      return '<li><span>' + formatLabel(y, map[y]) + '</span>' +
        '<button type="button" class="btn-remove" data-year="' + y + '" title="Entfernen">✕</button></li>';
    }).join('');
    emptyEl.style.display = years.length === 0 ? 'block' : 'none';
  }

  function lvRenderFlows() {
    lvRenderFlowList(lvPremiumOverrides, lvEls.praemieList, lvEls.praemieEmpty, function(y, v) {
      return 'ab Jahr ' + y + ': <strong>' + euro(v) + '</strong> / Monat';
    });
    lvRenderFlowList(lvLumpSums, lvEls.zuzahlungList, lvEls.zuzahlungEmpty, function(y, v) {
      return 'Jahr ' + y + ': <strong>' + euro(v) + '</strong>';
    });
    lvRenderFlowList(lvWithdrawals, lvEls.auszahlungList, lvEls.auszahlungEmpty, function(y, v) {
      return 'Jahr ' + y + ': <strong>' + euro(v) + '</strong>';
    });
  }

  // Fügt einen Eintrag zu einer der drei Jahr->Betrag-Maps hinzu (addiert, falls für das Jahr bereits ein
  // Eintrag besteht) und setzt danach die beiden Eingabefelder der jeweiligen Box zurück.
  function lvAddFlowEntry(map, yearEl, amountEl, minYear) {
    var y = Math.round(num(yearEl));
    var v = num(amountEl);
    if (!isFinite(y) || y < minYear || y > 80 || !isFinite(v) || v < 0 || (v === 0 && map !== lvPremiumOverrides)) return;
    map[y] = (map[y] || 0) + v;
    yearEl.value = '';
    amountEl.value = '';
    lvRenderFlows();
    lvRecompute();
  }

  lvEls.btnAddPraemie.addEventListener('click', function() {
    lvAddFlowEntry(lvPremiumOverrides, lvEls.praemieJahr, lvEls.praemieBetrag, 2);
  });
  lvEls.btnAddZuzahlung.addEventListener('click', function() {
    lvAddFlowEntry(lvLumpSums, lvEls.zuzahlungJahr, lvEls.zuzahlungBetrag, 1);
  });
  lvEls.btnAddAuszahlung.addEventListener('click', function() {
    lvAddFlowEntry(lvWithdrawals, lvEls.auszahlungJahr, lvEls.auszahlungBetrag, 1);
  });

  // Wichtig: die Map bei jedem Klick NEU auflösen (nicht einmalig cachen) — applyAppState() weist
  // lvPremiumOverrides/lvLumpSums/lvWithdrawals beim Laden gespeicherter Daten komplett neu zu, ein
  // gecachter Verweis würde dann noch auf die alte (verworfene) Map zeigen.
  function lvFlowMapFor(listEl) {
    if (listEl === lvEls.praemieList) return lvPremiumOverrides;
    if (listEl === lvEls.zuzahlungList) return lvLumpSums;
    return lvWithdrawals;
  }
  [lvEls.praemieList, lvEls.zuzahlungList, lvEls.auszahlungList].forEach(function(listEl) {
    listEl.addEventListener('click', function(ev) {
      var btn = ev.target.closest('.btn-remove');
      if (!btn) return;
      delete lvFlowMapFor(listEl)[Number(btn.getAttribute('data-year'))];
      lvRenderFlows();
      lvRecompute();
    });
  });

  var LV_SERIES = [
    { key: 0,    color: 'var(--series-ausgaben)', label: '0% p.a.' },
    { key: 0.03, color: 'var(--series-ust)',       label: '3% p.a.' },
    { key: 0.06, color: 'var(--series-sv)',        label: '6% p.a.' },
    { key: 0.08, color: 'var(--series-est)',       label: '8% p.a.' }
  ];

  var lvChartGeom = null; // cached geometry for hover handling

  function lvRenderChart(rows) {
    var svg = lvEls.chart;
    // viewBox-Breite an die tatsächliche Darstellungsbreite anpassen (statt fix 720), sonst wird die
    // SVG-Grafik bei einer breiteren Karte horizontal verzerrt/gestreckt (auch die Achsenbeschriftung).
    var measuredW = Math.round(svg.getBoundingClientRect().width);
    var W = measuredW > 0 ? measuredW : 720;
    var H = 280;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var padL = 54, padR = 14, padT = 14, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;

    var maxVal = 0;
    rows.forEach(function(r) {
      LV_SERIES.forEach(function(s) { if (r.values[s.key] > maxVal) maxVal = r.values[s.key]; });
    });
    if (maxVal <= 0) maxVal = 1;
    // round up to a "nice" ceiling for gridlines
    var magnitude = Math.pow(10, Math.floor(Math.log(maxVal) / Math.LN10));
    var niceMax = Math.ceil(maxVal / magnitude) * magnitude;

    function xFor(i) { return padL + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * plotW); }
    function yFor(v) { return padT + plotH - (v / niceMax) * plotH; }

    var svgParts = [];

    // gridlines + y labels (5 steps)
    var steps = 4;
    for (var s = 0; s <= steps; s++) {
      var val = niceMax * s / steps;
      var yy = yFor(val);
      svgParts.push('<line class="lv-axis" x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '"></line>');
      svgParts.push('<text class="lv-axislabel" x="' + (padL - 8) + '" y="' + (yy + 3) + '" text-anchor="end">' + lvShortEuro(val) + '</text>');
    }
    // x axis labels (start, mid, end year)
    [0, Math.floor((rows.length - 1) / 2), rows.length - 1].forEach(function(i) {
      if (i < 0 || i >= rows.length) return;
      svgParts.push('<text class="lv-axislabel" x="' + xFor(i) + '" y="' + (H - 8) + '" text-anchor="middle">Jahr ' + rows[i].year + '</text>');
    });

    LV_SERIES.forEach(function(s) {
      var pts = rows.map(function(r, i) { return xFor(i) + ',' + yFor(r.values[s.key]); }).join(' ');
      svgParts.push('<polyline class="lv-line" points="' + pts + '"></polyline>');
    });

    // hover overlay + crosshair group (hidden by default)
    svgParts.push('<g id="lvHoverGroup" style="display:none;">' +
      '<line id="lvCrosshair" class="lv-crosshair" x1="0" y1="' + padT + '" x2="0" y2="' + (H - padB) + '"></line>' +
      LV_SERIES.map(function(s, idx) {
        return '<circle id="lvDot' + idx + '" r="4" stroke="var(--surface-1)" stroke-width="2"></circle>';
      }).join('') +
      '</g>');
    svgParts.push('<rect id="lvHoverRect" x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="transparent"></rect>');

    svg.innerHTML = svgParts.join('');

    // set colors via inline style so CSS custom properties resolve reliably
    var lineEls = svg.querySelectorAll('.lv-line');
    LV_SERIES.forEach(function(s, idx) {
      if (lineEls[idx]) lineEls[idx].style.stroke = s.color;
      var dot = svg.querySelector('#lvDot' + idx);
      if (dot) dot.style.fill = s.color;
    });

    lvChartGeom = { rows: rows, xFor: xFor, padL: padL, plotW: plotW };

    var hoverRect = svg.querySelector('#lvHoverRect');
    var hoverGroup = svg.querySelector('#lvHoverGroup');
    var crosshair = svg.querySelector('#lvCrosshair');

    hoverRect.addEventListener('mousemove', function(evt) {
      if (!lvChartGeom) return;
      var rect = svg.getBoundingClientRect();
      var scaleX = W / rect.width;
      var mouseX = (evt.clientX - rect.left) * scaleX;
      var relX = clamp(mouseX - lvChartGeom.padL, 0, lvChartGeom.plotW);
      var frac = lvChartGeom.plotW === 0 ? 0 : relX / lvChartGeom.plotW;
      var idx = Math.round(frac * (lvChartGeom.rows.length - 1));
      idx = clamp(idx, 0, lvChartGeom.rows.length - 1);
      var r = lvChartGeom.rows[idx];
      var xPix = xFor(idx);

      hoverGroup.style.display = 'block';
      crosshair.setAttribute('x1', xPix);
      crosshair.setAttribute('x2', xPix);

      LV_SERIES.forEach(function(s, i) {
        var dot = svg.querySelector('#lvDot' + i);
        dot.setAttribute('cx', xPix);
        dot.setAttribute('cy', yFor(r.values[s.key]));
      });

      tooltip.innerHTML = 'Jahr ' + r.year + '<br>' +
        LV_SERIES.map(function(s) { return s.label + ': ' + euro(r.values[s.key]); }).join('<br>');
      tooltip.style.left = (evt.clientX + 14) + 'px';
      tooltip.style.top = (evt.clientY + 14) + 'px';
      tooltip.classList.add('show');
    });
    hoverRect.addEventListener('mouseleave', function() {
      hoverGroup.style.display = 'none';
      tooltip.classList.remove('show');
    });
  }

  function lvShortEuro(v) {
    if (v >= 1000000) return toFixedAT(v / 1000000, 1).replace(/,0$/, '') + 'M';
    if (v >= 1000) return Math.round(v / 1000) + 'k';
    return Math.round(v).toString();
  }

  lvEls.premium.addEventListener('input', lvRecompute);
  lvEls.years.addEventListener('input', lvBuildTableStructure);
  if (lvEls.rateReduction) lvEls.rateReduction.addEventListener('input', lvRecompute);
  if (lvEls.dynamikEnabled) lvEls.dynamikEnabled.addEventListener('change', lvRecompute);
  if (lvEls.dynamikRate) lvEls.dynamikRate.addEventListener('input', lvRecompute);
  if (lvEls.wunschrendite) lvEls.wunschrendite.addEventListener('input', lvRecompute);

  lvRenderFlows();
  lvBuildTableStructure(); // initial render

  // ---------- Einheitenrechner ----------
  // Formeln 1:1 aus "Einheitenrechner neu.xlsx" übernommen (gegen die
  // Original-Zellwerte verifiziert, z. B. PlusInvest: Laufzeit 40/gedeckelt 35,
  // Prämie 100 € → 121,15 EH).
  var EH_PRODUCTS = [
    { key: 'plusinvest',    usesLaufzeit: true,  cap: 35, calc: function(lz, prem) { return (12 / 1.04) * (3 / 1000) * Math.min(lz, 35) * prem; } },
    { key: 'flexsolution',  usesLaufzeit: true,  cap: 30, calc: function(lz, prem) { return (12 / 1.04) * (2.7 / 1000) * Math.min(lz, 30) * prem; } },
    { key: 'sgzv',          usesLaufzeit: true,  cap: 15, calc: function(lz, prem) { return (prem * 12) * (Math.min(lz, 15) / 15) * (6 / 100); } },
    { key: 'dialogrisiko',  usesLaufzeit: true,  cap: null, calc: function(lz, prem) { return ((prem * 12 * lz) / 1.04) * 3 / 1000; } },
    { key: 'dialogbu',      usesLaufzeit: true,  cap: 35, calc: function(lz, prem) { return ((prem * 12 * Math.min(lz, 35)) / 1.04) * 3 / 1000; } },
    { key: 'kvambulant',    usesLaufzeit: false, calc: function(lz, prem) { return (prem / 1.01) * 0.6; } },
    { key: 'kvambulantsk',  usesLaufzeit: false, calc: function(lz, prem) { return (prem / 1.01) * 0.72; } },
    { key: 'uniquv',        usesLaufzeit: false, calc: function(lz, prem) { return (prem * 12) / 1.04 * 5.5 / 100; } },
    { key: 'aragrs',        usesLaufzeit: false, calc: function(lz, prem) { return (prem * 12) / 1.11 * 5 / 100; } },
    { key: 'hheh',          usesLaufzeit: false, calc: function(lz, prem) { return (prem * 12) / 1.11 * 5 / 100; } }
  ];
  var ehStufeEl = document.getElementById('ehStufe');
  var ehTotalUnitsEl = document.getElementById('ehTotalUnits');
  var ehTotalEuroEl = document.getElementById('ehTotalEuro');
  var ehTotalSubEl = document.getElementById('ehTotalSub');
  var ehStufeProvisionEl = document.getElementById('ehStufeProvision');
  var ehStufeProvisionSubEl = document.getElementById('ehStufeProvisionSub');
  var fmtEh = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function ehRecalc() {
    var totalUnits = 0;
    EH_PRODUCTS.forEach(function(p) {
      var premEl = document.querySelector('.eh-prem[data-key="' + p.key + '"]');
      var prem = num(premEl);
      var lz = p.usesLaufzeit ? num(document.querySelector('.eh-laufzeit[data-key="' + p.key + '"]')) : 0;
      var units = Math.max(0, p.calc(lz, prem) || 0);
      totalUnits += units;
      var cell = document.getElementById('ehResult_' + p.key);
      if (cell) cell.textContent = fmtEh.format(units) + ' EH';
    });
    var stufe = num(ehStufeEl);
    var totalEuro = totalUnits * stufe;
    ehTotalUnitsEl.textContent = fmtEh.format(totalUnits) + ' EH';
    ehTotalEuroEl.textContent = euro(totalEuro);
    ehTotalSubEl.textContent = fmtEh.format(totalUnits) + ' EH × ' + euro(stufe);
    if (ehStufeProvisionEl) ehStufeProvisionEl.textContent = euro(totalEuro);
    if (ehStufeProvisionSubEl) ehStufeProvisionSubEl.textContent = fmtEh.format(totalUnits) + ' EH × ' + euro(stufe);
    scheduleAutoSave();
  }

  document.querySelectorAll('.eh-prem, .eh-laufzeit').forEach(function(input) {
    input.addEventListener('input', ehRecalc);
  });
  ehStufeEl.addEventListener('input', ehRecalc);

  var btnEhResetEl = document.getElementById('btnEhReset');
  if (btnEhResetEl) {
    btnEhResetEl.addEventListener('click', function() {
      document.querySelectorAll('.eh-prem, .eh-laufzeit').forEach(function(input) {
        input.value = 0;
      });
      ehRecalc();
    });
  }

  ehRecalc(); // initial render

  // ---------- Team & Struktur (Übersicht) ----------
  // Differenzprovision: jede Person verdient eigene Stufe × eigene Einheiten,
  // plus je direktem Mitarbeiter die Differenz (eigene Stufe − dessen Stufe,
  // min. 0) × dessen Gesamt-Einheiten (inkl. dessen eigenem Team, rekursiv
  // aufgerollt). Erreicht ein Mitarbeiter die gleiche oder eine höhere Stufe,
  // ist die Differenz 0 und aus dieser Linie kommt nichts mehr.
  var STUFEN = [
    { rate: 2,  label: 'Akquisiteur' },
    { rate: 3,  label: 'Berater für Finanzanalyse' },
    { rate: 4,  label: 'Produktberater' },
    { rate: 6,  label: 'Verkaufsleiter' },
    { rate: 8,  label: 'Vertriebsmanager' },
    { rate: 10, label: 'Vertriebsdirektor' },
    { rate: 12, label: 'Direktor' }
  ];
  function stufeLabel(rate) {
    var s = STUFEN.find(function(x) { return x.rate === rate; });
    return s ? (rate + ' € – ' + s.label) : (rate + ' €');
  }
  function stufeOptionsHtml(selected) {
    return STUFEN.map(function(s) {
      return '<option value="' + s.rate + '"' + (s.rate === selected ? ' selected' : '') + '>' + escapeHtml(stufeLabel(s.rate)) + '</option>';
    }).join('');
  }
  // Karriereleiter bis zum Produktberater (4 €): automatisch aus den gesamthistorischen
  // Einheiten hergeleitet. Darüber (Verkaufsleiter etc.) ist manuelle Beförderung nötig —
  // die Automatik geht nie über 4 € hinaus.
  function stufeFromHistory(hist) {
    if (hist >= 1000) return 4;
    if (hist >= 250) return 3;
    return 2;
  }
  function applyAutoStufe(p) {
    if (!p.stufeAuto) return;
    p.stufe = stufeFromHistory(p.historicalUnits || 0);
    var sel = teamTableBody.querySelector('.team-stufe[data-id="' + p.id + '"]');
    if (sel) sel.value = p.stufe;
  }

  // Gestaffelte (marginale) Bewertung der eigenen EH auf der automatischen Karriereleiter:
  // nicht ein einziger Flatrate-Satz für die GESAMTE Monatsmenge, sobald irgendein Schwellenwert
  // überschritten ist (das war der Fehler), sondern jede einzelne EH wird nach der Staffel bewertet,
  // in der ihre eigene historische Position liegt — die ersten 250 historischen EH mit 2 €,
  // die nächsten 750 (EH 250–1000) mit 3 €, und alles darüber mit 4 €.
  var STUFEN_BRACKETS = [
    { from: 0,    to: 250,      rate: 2 },
    { from: 250,  to: 1000,     rate: 3 },
    { from: 1000, to: Infinity, rate: 4 }
  ];
  function tieredOwnValue(histBefore, units) {
    var pos = Math.max(0, histBefore || 0);
    var remaining = Math.max(0, units || 0);
    var total = 0;
    for (var i = 0; i < STUFEN_BRACKETS.length && remaining > 0; i++) {
      var b = STUFEN_BRACKETS[i];
      if (pos >= b.to) continue;
      var bracketStart = Math.max(pos, b.from);
      var capacity = b.to - bracketStart;
      var amount = Math.min(remaining, capacity);
      if (amount > 0) {
        total += amount * b.rate;
        pos += amount;
        remaining -= amount;
      }
    }
    return total;
  }
  // Eigenverdienst einer Person: auf der automatischen Karriereleiter (Checkbox "automatisch
  // (Historie)" aktiv) gestaffelt nach obiger Staffel, sonst wie bisher Stufe × Einheiten
  // (manuell gewählte Stufe = bewusst fixierter Satz, z. B. ab Verkaufsleiter aufwärts).
  function personOwnComm(p) {
    if (p.stufeAuto) {
      var histBefore = Math.max(0, (p.historicalUnits || 0) - (p.units || 0));
      return tieredOwnValue(histBefore, p.units || 0);
    }
    return p.stufe * (p.units || 0);
  }

  var raphael = { stufe: 6, units: 0, historicalUnits: 0 };
  var team = [];
  var teamGoals = { struktur: 0, gesamt: 0, eigen: 0 };
  var customersTotal = 0;
  var teamIdSeq = 0;
  var stufeZiel = 0;
  var raphaelMonthlyTotal = 0; // Eigengeschäft + Struktur-Provision, für die Jahreshochrechnung im Steuerrechner-Tab
  var lastActiveMonth = null; // "YYYY-MM" — für den automatischen Monatswechsel-Reset
  var lastTopLevelVolume = 0; // Struktur-Volumen des laufenden Monats, für Verlauf-Snapshots beim Monatswechsel
  var lastTotalTeamComm = 0; // Gesamt-Provision der Struktur (Eigenverdienst + Overrides) des laufenden Monats, für die "Ø pro Mitarbeiter"-Kennzahlen
  var monthlyHistory = []; // [{ month: "YYYY-MM", eigenUnits, strukturUnits, verdienst }] — ein Eintrag pro abgeschlossenem Monat
  var lastTotalHistoricalUnits = 0; // Eigene gesamthistorische Einheiten + gesamthistorische Struktur-Einheiten, von teamRecalc() gepflegt
  var stufeZielGesamt = 0; // Zielwert für "Gesamthistorische Einheiten (Eigen + Struktur)" beim Stufenaufstieg

  // ---------- Struktur-Baum: Termine (Analyse/Beratung/Servicetermin) je Person ----------
  var TERMIN_TYPES = [
    { key: 'analyse', label: 'Analyse' },
    { key: 'beratung', label: 'Beratung' },
    { key: 'service', label: 'Servicetermin' }
  ];
  var termine = []; // [{ id, personId: "raphael" | Mitarbeiter-ID, type, date: "YYYY-MM-DD", time: "HH:MM", label, umsatzEH }]
  var termineIdSeq = 0;
  var selectedPersonId = null; // aktuell im Struktur-Baum ausgewählte Person (für das Detail-Panel)
  var editingTerminId = null; // Termin-ID, die im Termine-Formular gerade bearbeitet wird (null = Neu-Anlegen-Modus)
  var personDetailOpen = false; // true sobald das Detail-Panel sichtbar ist (steuert, ob die Öffnen/Schließen-Animation läuft)
  var pdAnimTimer = null;

  var raphaelStufeEl = document.getElementById('raphaelStufe');
  var raphaelUnitsEl = document.getElementById('raphaelUnits');
  var raphaelHistEl = document.getElementById('raphaelHist');
  var raphaelHistTotalEl = document.getElementById('raphaelHistTotal');
  var teamTableBody = document.getElementById('teamTableBody');
  var teamEmptyState = document.getElementById('teamEmptyState');
  var btnAddPerson = document.getElementById('btnAddPerson');
  var btnExportTeam = document.getElementById('btnExportTeam');
  var btnImportTeam = document.getElementById('btnImportTeam');
  var btnConnectFile = document.getElementById('btnConnectFile');
  var autoSaveStatusEl = document.getElementById('autoSaveStatus');
  var saveStatusRowEl = document.getElementById('saveStatusRow');
  var autoSaveHandle = null;
  var autoSaveTimer = null;
  var localSyncActive = false;
  var localSyncTimer = null;
  var LOCAL_SYNC_URL = 'efs-dashboard-daten.json';
  var goalEls = {
    struktur: { target: document.getElementById('goalStruktur'), actual: document.getElementById('goalStrukturActual'), targetOut: document.getElementById('goalStrukturTargetOut'), pct: document.getElementById('goalStrukturPct'), fill: document.getElementById('goalStrukturFill') },
    gesamt:   { target: document.getElementById('goalGesamt'),   actual: document.getElementById('goalGesamtActual'),   targetOut: document.getElementById('goalGesamtTargetOut'),   pct: document.getElementById('goalGesamtPct'),   fill: document.getElementById('goalGesamtFill') },
    eigen:    { target: document.getElementById('goalEigen'),    actual: document.getElementById('goalEigenActual'),    targetOut: document.getElementById('goalEigenTargetOut'),    pct: document.getElementById('goalEigenPct'),    fill: document.getElementById('goalEigenFill') }
  };
  var goalStrukturProvisionEl = document.getElementById('goalStrukturProvision');
  var goalGesamtProvisionEl = document.getElementById('goalGesamtProvision');
  var goalEigenProvisionEl = document.getElementById('goalEigenProvision');
  var zielInsightEl = document.getElementById('zielInsight');
  var zielInsightValueEl = document.getElementById('zielInsightValue');
  var zielInsightSubEl = document.getElementById('zielInsightSub');
  var zielInsightFillEl = document.getElementById('zielInsightFill');
  var stufeGoalEl = document.getElementById('stufeGoal');
  var stufeCurrentOutEl = document.getElementById('stufeCurrentOut');
  var stufeNextOutEl = document.getElementById('stufeNextOut');
  // "Eigen" = nur meine eigenen gesamthistorischen Einheiten
  var stufeGoalEigenSet = { target: stufeGoalEl, actual: document.getElementById('stufeGoalActual'), targetOut: document.getElementById('stufeGoalTargetOut'), pct: document.getElementById('stufeGoalPct'), fill: document.getElementById('stufeGoalFill') };
  var stufeGoalRemainingEl = document.getElementById('stufeGoalRemaining');
  var stufeMilestoneRowEl = document.getElementById('stufeMilestoneRow');
  var stufeMilestoneValueEl = document.getElementById('stufeMilestoneValue');
  var stufeMilestonePaceEl = document.getElementById('stufeMilestonePace');
  // "Gesamt" = meine eigenen + alle gesamthistorischen Einheiten meiner Struktur
  var stufeGoalGesamtEl = document.getElementById('stufeGoalGesamt');
  var stufeGoalGesamtSet = { target: stufeGoalGesamtEl, actual: document.getElementById('stufeGoalGesamtActual'), targetOut: document.getElementById('stufeGoalGesamtTargetOut'), pct: document.getElementById('stufeGoalGesamtPct'), fill: document.getElementById('stufeGoalGesamtFill') };
  var stufeGoalGesamtRemainingEl = document.getElementById('stufeGoalGesamtRemaining');
  var stufeMilestoneGesamtRowEl = document.getElementById('stufeMilestoneGesamtRow');
  var stufeMilestoneGesamtValueEl = document.getElementById('stufeMilestoneGesamtValue');
  var stufeMilestoneGesamtPaceEl = document.getElementById('stufeMilestoneGesamtPace');
  var verlaufCardEl = document.getElementById('verlaufCard');
  var verlaufChartEl = document.getElementById('verlaufChart');
  var orgTreeEl = document.getElementById('orgTree');
  var personDetailCardEl = document.getElementById('personDetailCard');
  var btnUmsatzFromVerdienst = document.getElementById('btnUmsatzFromVerdienst');
  var umsatzFromVerdienstHintEl = document.getElementById('umsatzFromVerdienstHint');
  var custGesamtEl = document.getElementById('custGesamt');
  var custMonatEl = document.getElementById('custMonat');
  var custEhProKundeEl = document.getElementById('custEhProKunde');
  var custUmsatzProKundeEl = document.getElementById('custUmsatzProKunde');
  var mitarbeiterEhProKopfEl = document.getElementById('mitarbeiterEhProKopf');
  var mitarbeiterUmsatzProKopfEl = document.getElementById('mitarbeiterUmsatzProKopf');
  var custNeueDiesenMonat = 0;

  raphaelStufeEl.innerHTML = stufeOptionsHtml(raphael.stufe);

  function childrenOf(parentId) { return team.filter(function(p) { return p.parentId === parentId; }); }
  function findPerson(id) { return team.find(function(p) { return p.id === id; }); }
  function isDescendantOf(candidateId, ancestorId) {
    var cur = findPerson(candidateId);
    while (cur && cur.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = findPerson(cur.parentId);
    }
    return false;
  }
  function computeVolume(personId) {
    var p = findPerson(personId);
    if (!p) return 0;
    var vol = p.units || 0;
    childrenOf(personId).forEach(function(c) { vol += computeVolume(c.id); });
    return vol;
  }
  // Wie computeVolume(), aber auf den gesamthistorischen Einheiten statt dem laufenden Monat —
  // fasst rekursiv die historicalUnits einer Person und ihres gesamten Unterteams zusammen.
  function computeHistoricalVolume(personId) {
    var p = findPerson(personId);
    if (!p) return 0;
    var vol = p.historicalUnits || 0;
    childrenOf(personId).forEach(function(c) { vol += computeHistoricalVolume(c.id); });
    return vol;
  }
  function computeOverride(stufe, parentId) {
    var total = 0;
    childrenOf(parentId).forEach(function(c) {
      var diff = Math.max(0, stufe - c.stufe);
      total += diff * computeVolume(c.id);
    });
    return total;
  }

  function dfsOrder(parentId, depth, out) {
    childrenOf(parentId).forEach(function(c) {
      out.push({ person: c, depth: depth });
      dfsOrder(c.id, depth + 1, out);
    });
  }

  function parentOptionsHtml(personId) {
    var opts = ['<option value="root">Ich (Raphael)</option>'];
    team.forEach(function(t) {
      if (t.id === personId || isDescendantOf(t.id, personId)) return;
      opts.push('<option value="' + t.id + '">' + escapeHtml(t.name || '(ohne Namen)') + '</option>');
    });
    return opts.join('');
  }

  function renderTeamTable() {
    var ordered = [];
    dfsOrder(null, 0, ordered);
    teamEmptyState.style.display = team.length === 0 ? 'block' : 'none';
    document.getElementById('teamTable').style.display = team.length === 0 ? 'none' : 'table';

    teamTableBody.innerHTML = ordered.map(function(item) {
      var p = item.person;
      var indent = item.depth * 16;
      var prefix = item.depth > 0 ? ('<span style="color:var(--text-muted);">' + '›'.repeat(item.depth) + '</span> ') : '';
      return '' +
        '<tr data-id="' + p.id + '">' +
          '<td><div class="name-input-wrap" style="padding-left:' + indent + 'px;">' + prefix +
            '<input type="text" class="team-name" data-id="' + p.id + '" value="' + escapeHtml(p.name) + '" placeholder="Name"></div></td>' +
          '<td><select class="team-parent" data-id="' + p.id + '">' + parentOptionsHtml(p.id) + '</select></td>' +
          '<td><label class="team-auto-row"><input type="checkbox" class="team-auto" data-id="' + p.id + '"' + (p.stufeAuto ? ' checked' : '') + '>automatisch (Historie)</label>' +
            '<select class="team-stufe" data-id="' + p.id + '"' + (p.stufeAuto ? ' disabled' : '') + '>' + stufeOptionsHtml(p.stufe) + '</select></td>' +
          '<td><input type="number" class="team-units" id="teamUnits_' + p.id + '" data-id="' + p.id + '" value="' + p.units + '" min="0" step="1"></td>' +
          '<td><input type="number" class="team-hist" data-id="' + p.id + '" value="' + (p.historicalUnits || 0) + '" min="0" step="1"></td>' +
          '<td class="num" id="teamVol_' + p.id + '">0 EH</td>' +
          '<td class="num" id="teamOwnComm_' + p.id + '">€ 0</td>' +
          '<td class="num" id="teamOverride_' + p.id + '">€ 0</td>' +
          '<td class="num team-total-cell" id="teamTotalComm_' + p.id + '">€ 0</td>' +
          '<td><button type="button" class="btn-remove" data-id="' + p.id + '" title="Entfernen">✕</button></td>' +
        '</tr>';
    }).join('');

    // set select values explicitly (value attr already correct via option[selected], but parent needs runtime set)
    ordered.forEach(function(item) {
      var sel = document.getElementById('teamTableBody').querySelector('.team-parent[data-id="' + item.person.id + '"]');
      if (sel) sel.value = item.person.parentId || 'root';
    });

    teamTableBody.querySelectorAll('.team-name').forEach(function(el) {
      el.addEventListener('input', function() {
        var p = findPerson(el.getAttribute('data-id'));
        if (p) p.name = el.value;
        refreshParentOptionLabels();
        if (typeof renderNoteAssignOptions === 'function') renderNoteAssignOptions();
        if (typeof renderDocAssignOptions === 'function') renderDocAssignOptions();
        if (typeof renderOrgTree === 'function') renderOrgTree();
        if (typeof renderPersonDetail === 'function') renderPersonDetail();
      });
    });
    teamTableBody.querySelectorAll('.team-parent').forEach(function(el) {
      el.addEventListener('change', function() {
        var p = findPerson(el.getAttribute('data-id'));
        if (p) p.parentId = el.value === 'root' ? null : el.value;
        renderTeamTable();
        teamRecalc();
      });
    });
    teamTableBody.querySelectorAll('.team-stufe').forEach(function(el) {
      el.addEventListener('change', function() {
        var p = findPerson(el.getAttribute('data-id'));
        if (p) p.stufe = parseFloat(el.value);
        teamRecalc();
      });
    });
    teamTableBody.querySelectorAll('.team-auto').forEach(function(el) {
      el.addEventListener('change', function() {
        var p = findPerson(el.getAttribute('data-id'));
        if (!p) return;
        p.stufeAuto = el.checked;
        var sel = teamTableBody.querySelector('.team-stufe[data-id="' + p.id + '"]');
        if (sel) sel.disabled = p.stufeAuto;
        if (p.stufeAuto) applyAutoStufe(p);
        teamRecalc();
      });
    });
    teamTableBody.querySelectorAll('.team-units').forEach(function(el) {
      el.addEventListener('input', function() {
        var p = findPerson(el.getAttribute('data-id'));
        if (!p) return;
        var newVal = num(el);
        var delta = newVal - p.units;
        p.units = newVal;
        p.historicalUnits = Math.max(0, (p.historicalUnits || 0) + delta);
        var histEl = teamTableBody.querySelector('.team-hist[data-id="' + p.id + '"]');
        if (histEl) histEl.value = p.historicalUnits;
        applyAutoStufe(p);
        teamRecalc();
      });
    });
    teamTableBody.querySelectorAll('.team-hist').forEach(function(el) {
      el.addEventListener('input', function() {
        var p = findPerson(el.getAttribute('data-id'));
        if (!p) return;
        p.historicalUnits = num(el);
        applyAutoStufe(p);
        teamRecalc();
      });
    });
    teamTableBody.querySelectorAll('.btn-remove').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-id');
        var removed = findPerson(id);
        if (!removed) return;
        // Kinder werden an den Vorgesetzten des entfernten Mitarbeiters übergeben, statt verwaist zu bleiben.
        childrenOf(id).forEach(function(c) { c.parentId = removed.parentId; });
        team = team.filter(function(p) { return p.id !== id; });
        // Zuordnungen/Termine der entfernten Person aufräumen, statt sie verwaist stehen zu lassen.
        notes.forEach(function(n) { n.assignedTo = (n.assignedTo || []).filter(function(a) { return a !== id; }); });
        termine = termine.filter(function(t) { return t.personId !== id; });
        if (typeof docFiles !== 'undefined') { docFiles.forEach(function(f) { f.assignedTo = (f.assignedTo || []).filter(function(a) { return a !== id; }); }); }
        if (selectedPersonId === id) selectedPersonId = null;
        renderTeamTable();
        teamRecalc();
        renderNotes();
      });
    });

    renderNoteAssignOptions();
    if (typeof renderDocAssignOptions === 'function') renderDocAssignOptions();
  }

  function refreshParentOptionLabels() {
    teamTableBody.querySelectorAll('.team-parent').forEach(function(sel) {
      var ownerId = sel.getAttribute('data-id');
      Array.prototype.forEach.call(sel.options, function(opt) {
        if (opt.value === 'root') return;
        var p = findPerson(opt.value);
        if (p) opt.textContent = p.name || '(ohne Namen)';
      });
      sel.value = findPerson(ownerId).parentId || 'root';
    });
  }

  function teamRecalc() {
    // Eigene Provision + Struktur-Provision je Person, bottom-up über die vorhandenen DOM-Werte (bereits aktuell).
    var totalTeamVolume = 0, totalTeamOwnComm = 0, totalTeamOverride = 0, totalTeamComm = 0;
    team.forEach(function(p) {
      var vol = computeVolume(p.id);
      var ownComm = personOwnComm(p);
      var override = computeOverride(p.stufe, p.id);
      var totalComm = ownComm + override;
      var volEl = document.getElementById('teamVol_' + p.id);
      var ownEl = document.getElementById('teamOwnComm_' + p.id);
      var ovEl = document.getElementById('teamOverride_' + p.id);
      var totEl = document.getElementById('teamTotalComm_' + p.id);
      if (volEl) volEl.textContent = fmtEh.format(vol) + ' EH';
      if (ownEl) ownEl.textContent = euro(ownComm);
      if (ovEl) ovEl.textContent = euro(override);
      if (totEl) totEl.textContent = euro(totalComm);
    });
    // Struktur-Gesamtzeile: Summe über alle Mitarbeiter (Eigenverdienst je Person, keine Doppelzählung — Override ist bereits Teil des jeweiligen totalComm der Person selbst).
    team.forEach(function(p) {
      totalTeamOwnComm += personOwnComm(p);
      totalTeamOverride += computeOverride(p.stufe, p.id);
    });
    totalTeamComm = totalTeamOwnComm + totalTeamOverride;
    var topLevelVolume = 0;
    childrenOf(null).forEach(function(c) { topLevelVolume += computeVolume(c.id); });
    totalTeamVolume = topLevelVolume;
    lastTopLevelVolume = topLevelVolume;
    lastTotalTeamComm = totalTeamComm;

    // Gesamthistorische Einheiten: meine eigenen + alle jemals von meiner gesamten Struktur
    // gemachten Einheiten (rekursiv über alle Mitarbeiter-Ebenen, deren historicalUnits schon
    // laufend per Differenz-Tracking mitwachsen, sobald sie ihre monatlichen Einheiten eintragen).
    var topLevelHistoricalVolume = 0;
    childrenOf(null).forEach(function(c) { topLevelHistoricalVolume += computeHistoricalVolume(c.id); });
    lastTotalHistoricalUnits = (raphael.historicalUnits || 0) + topLevelHistoricalVolume;
    if (raphaelHistTotalEl) raphaelHistTotalEl.value = lastTotalHistoricalUnits;

    document.getElementById('teamTotalVolume').textContent = fmtEh.format(totalTeamVolume) + ' EH';
    document.getElementById('teamTotalOwnComm').textContent = euro(totalTeamOwnComm);
    document.getElementById('teamTotalOverride').textContent = euro(totalTeamOverride);
    document.getElementById('teamTotalComm').textContent = euro(totalTeamComm);

    // Raphael
    var raphaelOwn = raphael.stufe * raphael.units;
    var raphaelOverride = computeOverride(raphael.stufe, null);
    var raphaelTotal = raphaelOwn + raphaelOverride;
    var gesamtVolume = topLevelVolume + raphael.units;

    document.getElementById('statEigengeschaeft').textContent = euro(raphaelOwn);
    document.getElementById('statEigengeschaeftSub').textContent = fmtEh.format(raphael.units) + ' EH × ' + euro(raphael.stufe) + '/EH';
    document.getElementById('statIchVerdiene').textContent = euro(raphaelOverride);
    document.getElementById('statMitarbeiterVerdienst').textContent = euro(totalTeamComm);
    document.getElementById('verdienstTotal').textContent = euro(raphaelTotal);
    document.getElementById('verdienstTotalSub').textContent = fmtEh.format(gesamtVolume) + ' EH Gesamtvolumen';

    // Ziele
    teamGoals.gesamt = (teamGoals.struktur || 0) + (teamGoals.eigen || 0);
    goalEls.gesamt.target.value = teamGoals.gesamt;
    updateGoal(goalEls.struktur, topLevelVolume);
    updateGoal(goalEls.gesamt, gesamtVolume);
    updateGoal(goalEls.eigen, raphael.units);

    // Provision bei Zielerreichung: beim Eigenanteil exakt (eigene Stufe × Zieleinheiten),
    // beim Strukturanteil nur als Ø-Schätzung — die tatsächliche Differenz-Provision hängt
    // von der künftigen Stufen-Zusammensetzung des Teams ab, die sich laufend ändert (Aufstiege
    // etc.). Als Schätzgrundlage dient die aktuelle durchschnittliche Differenz-Provision je EH
    // (heutige Struktur-Provision / heutiges Struktur-Volumen).
    var avgOverridePerUnit = topLevelVolume > 0 ? (raphaelOverride / topLevelVolume) : 0;
    var provisionEigenGoal = raphael.stufe * (teamGoals.eigen || 0);
    var provisionStrukturGoal = avgOverridePerUnit * (teamGoals.struktur || 0);
    var provisionGesamtGoal = provisionEigenGoal + provisionStrukturGoal;
    if (goalEigenProvisionEl) goalEigenProvisionEl.textContent = euro(provisionEigenGoal);
    if (goalStrukturProvisionEl) goalStrukturProvisionEl.textContent = '≈ ' + euro(provisionStrukturGoal);
    if (goalGesamtProvisionEl) goalGesamtProvisionEl.textContent = '≈ ' + euro(provisionGesamtGoal);

    // Mini-Einsicht bei "Verdienst diesen Monat": zeigt, wie der Verdienst aussähe,
    // wenn die (unten bei "Ziele diesen Monat" gesetzten) Ziele bereits erreicht wären.
    if (zielInsightEl) {
      if (teamGoals.gesamt > 0) {
        zielInsightEl.style.display = '';
        zielInsightValueEl.textContent = '≈ ' + euro(provisionGesamtGoal);
        var zielPct = Math.min(100, (gesamtVolume / teamGoals.gesamt) * 100);
        if (zielInsightFillEl) zielInsightFillEl.style.width = zielPct + '%';
        var zielDiff = provisionGesamtGoal - raphaelTotal;
        var zielDiffText = zielDiff > 0.5
          ? ('+' + euro(zielDiff) + ' mehr als aktuell')
          : (zielDiff < -0.5 ? (euro(Math.abs(zielDiff)) + ' weniger als aktuell — Ziel schon übertroffen 🎉') : 'entspricht etwa deinem aktuellen Stand');
        zielInsightSubEl.textContent = Math.round(zielPct) + '% des Ziels bereits erreicht (' + fmtEh.format(gesamtVolume) + ' / ' + fmtEh.format(teamGoals.gesamt) + ' EH) · ' + zielDiffText;
      } else {
        zielInsightEl.style.display = 'none';
      }
    }

    // Stufenaufstieg
    updateStufeTracker();

    // Für die Jahreshochrechnung im Steuerrechner-Tab merken
    raphaelMonthlyTotal = raphaelTotal;
    if (umsatzFromVerdienstHintEl) {
      umsatzFromVerdienstHintEl.textContent = 'Aktuell: ' + euro(raphaelMonthlyTotal) + ' / Monat → ' + euro(raphaelMonthlyTotal * 12) + ' / Jahr.';
    }

    if (typeof renderOrgTree === 'function') renderOrgTree();
    if (typeof renderPersonDetail === 'function') renderPersonDetail();
    if (typeof renderVerlauf === 'function') renderVerlauf();
    if (typeof recalcCustomers === 'function') recalcCustomers();

    scheduleAutoSave();
  }

  var VERLAUF_MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  function monthLabel(key) {
    var parts = String(key).split('-');
    var y = parts[0] || '';
    var m = parseInt(parts[1], 10);
    var name = (m >= 1 && m <= 12) ? VERLAUF_MONTH_NAMES[m - 1] : '';
    return name + ' ' + y.slice(-2);
  }

  // Balkendiagramm der letzten abgeschlossenen Monate (Gesamtverdienst) aus monthlyHistory,
  // plus ein zusätzlicher (gestrichelter) Balken für den laufenden Monat auf Basis von
  // raphaelMonthlyTotal, samt einfacher linearer Hochrechnung auf das Monatsende.
  function renderVerlauf() {
    if (!verlaufCardEl || !verlaufChartEl) return;
    var now = new Date();
    var currentTotal = raphaelMonthlyTotal || 0;
    var uebersichtTopRowEl = document.getElementById('uebersichtTopRow');
    if (!monthlyHistory.length && currentTotal <= 0) {
      verlaufCardEl.style.display = 'none';
      if (uebersichtTopRowEl) uebersichtTopRowEl.classList.add('single-col');
      return;
    }
    verlaufCardEl.style.display = '';
    if (uebersichtTopRowEl) uebersichtTopRowEl.classList.remove('single-col');

    var bars = monthlyHistory.slice(-5).map(function(entry) {
      return { label: monthLabel(entry.month), value: entry.verdienst || 0, current: false };
    });
    bars.push({ label: monthLabel(currentMonthKey()) + ' (läuft)', value: currentTotal, current: true });

    var max = bars.reduce(function(m, b) { return Math.max(m, b.value || 0); }, 0);
    verlaufChartEl.innerHTML = bars.map(function(b) {
      var pct = max > 0 ? Math.max(4, Math.round((b.value / max) * 100)) : 4;
      return '<div class="verlauf-bar-wrap">' +
        '<div class="verlauf-bar-value">' + euro(b.value) + '</div>' +
        '<div class="verlauf-bar' + (b.current ? ' current' : '') + '" style="height:' + pct + '%"></div>' +
        '<div class="verlauf-bar-label">' + escapeHtml(b.label) + '</div>' +
        '</div>';
    }).join('');

    var hintEl = document.getElementById('verlaufPrognoseHint');
    if (hintEl) {
      var dayOfMonth = now.getDate();
      var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (currentTotal > 0 && dayOfMonth > 0) {
        var projected = currentTotal * (daysInMonth / dayOfMonth);
        hintEl.textContent = '📈 Hochrechnung auf Monatsende (bei gleichem Tempo wie bisher diesen Monat): ~' + euro(projected) + '.';
        hintEl.style.display = '';
      } else {
        hintEl.style.display = 'none';
      }
    }
  }

  // Durchschnittliches Monatstempo (eigene EH) als Grundlage für die Meilenstein-Schätzung:
  // Mittelwert der letzten bis zu 3 abgeschlossenen Monate aus monthlyHistory; solange noch
  // keine Historie vorliegt, wird ersatzweise das laufende Monatsvolumen herangezogen.
  function computeAvgPace() {
    if (monthlyHistory.length > 0) {
      var recent = monthlyHistory.slice(-3);
      var sum = recent.reduce(function(s, m) { return s + (m.eigenUnits || 0); }, 0);
      return sum / recent.length;
    }
    return raphael.units || 0;
  }

  // Wie computeAvgPace(), aber inkl. Struktur (eigene + Team-Einheiten je Monat).
  function computeAvgPaceGesamt() {
    if (monthlyHistory.length > 0) {
      var recent = monthlyHistory.slice(-3);
      var sum = recent.reduce(function(s, m) { return s + (m.eigenUnits || 0) + (m.strukturUnits || 0); }, 0);
      return sum / recent.length;
    }
    return (raphael.units || 0) + (lastTopLevelVolume || 0);
  }

  // Blendet die "Nächster Meilenstein"-Zeile ein/aus und befüllt sie, je nach Zielwert,
  // Restdistanz und Durchschnittstempo. Wird für den Eigen- und den Gesamt-Fortschritt genutzt.
  function updateMilestoneDisplay(rowEl, valueEl, paceEl, remaining, target, pace) {
    if (!rowEl) return;
    if (target <= 0) {
      rowEl.style.display = 'none';
    } else if (remaining <= 0) {
      rowEl.style.display = '';
      valueEl.textContent = '🎉 Ziel erreicht';
      if (paceEl) paceEl.textContent = '';
    } else {
      rowEl.style.display = '';
      if (pace > 0) {
        var monthsNeeded = Math.ceil(remaining / pace);
        valueEl.textContent = 'in ca. ' + monthsNeeded + (monthsNeeded === 1 ? ' Monat' : ' Monaten');
        if (paceEl) paceEl.textContent = 'Ø ' + fmtEh.format(pace) + ' EH/Monat';
      } else {
        valueEl.textContent = 'noch keine Tempo-Daten';
        if (paceEl) paceEl.textContent = '';
      }
    }
  }

  function updateStufeTracker() {
    var histEigen = raphael.historicalUnits || 0;
    var histGesamt = lastTotalHistoricalUnits || histEigen;
    var idx = STUFEN.findIndex(function(s) { return s.rate === raphael.stufe; });
    var current = idx >= 0 ? STUFEN[idx] : null;
    var next = (idx >= 0 && idx < STUFEN.length - 1) ? STUFEN[idx + 1] : null;
    stufeCurrentOutEl.textContent = current ? stufeLabel(current.rate) : (raphael.stufe + ' €');
    stufeNextOutEl.textContent = next ? stufeLabel(next.rate) : 'Höchste Stufe erreicht';

    // Gesamthistorische Einheiten (Eigen + Struktur)
    updateGoal(stufeGoalGesamtSet, histGesamt);
    var targetGesamt = num(stufeGoalGesamtEl);
    var remainingGesamt = Math.max(0, targetGesamt - histGesamt);
    if (stufeGoalGesamtRemainingEl) stufeGoalGesamtRemainingEl.textContent = fmtEh.format(remainingGesamt);
    updateMilestoneDisplay(stufeMilestoneGesamtRowEl, stufeMilestoneGesamtValueEl, stufeMilestoneGesamtPaceEl, remainingGesamt, targetGesamt, computeAvgPaceGesamt());

    // Gesamthistorische Eigeneinheiten
    updateGoal(stufeGoalEigenSet, histEigen);
    var targetEigen = num(stufeGoalEl);
    var remainingEigen = Math.max(0, targetEigen - histEigen);
    stufeGoalRemainingEl.textContent = fmtEh.format(remainingEigen);
    updateMilestoneDisplay(stufeMilestoneRowEl, stufeMilestoneValueEl, stufeMilestonePaceEl, remainingEigen, targetEigen, computeAvgPace());
  }

  function updateGoal(elSet, actual) {
    var target = num(elSet.target);
    var pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
    elSet.actual.textContent = fmtEh.format(actual);
    elSet.targetOut.textContent = fmtEh.format(target);
    elSet.pct.textContent = Math.round(pct);
    elSet.fill.style.width = pct + '%';
  }

  function currentMonthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  function currentDateStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // Prüft bei jedem Laden, ob seit dem letzten Mal ein neuer Kalendermonat begonnen hat.
  // Falls ja: "Einheiten diesen Monat" (bei dir und bei jedem Mitarbeiter) auf 0 zurücksetzen —
  // die gesamthistorischen Einheiten bleiben unangetastet, weil sie schon laufend per
  // Differenz-Tracking mitgewachsen sind, während der Monat lief. Kunden und Ziele bleiben
  // bewusst stehen (nicht Teil des automatischen Resets).
  function checkMonthRollover() {
    var nowKey = currentMonthKey();
    if (lastActiveMonth && lastActiveMonth !== nowKey) {
      // Schnappschuss des abgeschlossenen Monats für den Verlauf sichern, bevor zurückgesetzt wird.
      monthlyHistory.push({
        month: lastActiveMonth,
        eigenUnits: raphael.units || 0,
        strukturUnits: lastTopLevelVolume || 0,
        verdienst: raphaelMonthlyTotal || 0
      });
      monthlyHistory = monthlyHistory.slice(-12);
      raphael.units = 0;
      if (raphaelUnitsEl) raphaelUnitsEl.value = 0;
      team.forEach(function(p) { p.units = 0; });
      customersTotal += custNeueDiesenMonat;
      if (custGesamtEl) custGesamtEl.value = customersTotal;
      custNeueDiesenMonat = 0;
      if (custMonatEl) custMonatEl.value = 0;
      renderTeamTable();
      teamRecalc();
      if (typeof recalcCustomers === 'function') recalcCustomers();
      lastActiveMonth = nowKey;
      scheduleAutoSave();
      renderVerlauf();
      setSaveStatus('✓ Neuer Monat erkannt — „Einheiten diesen Monat" wurden zurückgesetzt (historische Einheiten bleiben erhalten), neue Kunden wurden zu „Gesamtkunden" addiert.', 'connected');
    } else {
      lastActiveMonth = nowKey;
    }
  }

  // ============================================================
  // Struktur-Baum (Übersicht ↔ eigener Tab): Baumdiagramm der Struktur mit Einheiten,
  // Notizen und Terminen (Analyse/Beratung/Servicetermin) je Person.
  // ============================================================

  function personSubtreeVolume(id) {
    if (id === 'raphael') return (raphael.units || 0) + (lastTopLevelVolume || 0);
    return computeVolume(id);
  }
  function personSubtreeHistorical(id) {
    if (id === 'raphael') return lastTotalHistoricalUnits || 0;
    return computeHistoricalVolume(id);
  }
  // Gesamtzahl aller Notizen/Termine einer Person (unabhängig von erledigt/offen) — wird
  // immer als Badge am Baum-Knoten angezeigt, damit man auf einen Blick sieht, wieviel bei
  // wem hinterlegt ist. Die "offen"-Zählung bleibt separat für Detail-Panel & Erinnerungen.
  function personNoteCount(id) {
    return notes.filter(function(n) { return (n.assignedTo || []).indexOf(id) !== -1; }).length;
  }
  function personTermineCount(id) {
    return termine.filter(function(t) { return t.personId === id; }).length;
  }
  function isTerminOffen(t) {
    if (!t.date) return false;
    var dt = new Date(t.date + 'T' + (t.time || '00:00'));
    return dt.getTime() >= Date.now();
  }
  function personOffeneTermineCount(id) {
    return termine.filter(function(t) { return t.personId === id && isTerminOffen(t); }).length;
  }
  function isNoteOverdue(n) {
    if (!n.due || n.done) return false;
    var d = new Date(n.due);
    return !isNaN(d.getTime()) && d.getTime() < Date.now();
  }
  function formatTerminWhen(t) {
    if (!t.date) return '';
    var parts = t.date.split('-');
    var when = parts[2] + '.' + parts[1] + '.' + parts[0];
    if (t.time) when += ', ' + t.time;
    return when;
  }

  function buildOrgNodeHtml(id, name, stufe, units, hist) {
    var noteCount = personNoteCount(id);
    var termineCount = personTermineCount(id);
    var docCount = typeof personDocCount === 'function' ? personDocCount(id) : 0;
    var badges = '<div class="org-node-badges">' +
      '<span class="org-badge">📝 ' + noteCount + '</span>' +
      '<span class="org-badge">📅 ' + termineCount + '</span>' +
      '<span class="org-badge">📄 ' + docCount + '</span>' +
    '</div>';
    var ehClass = units === 0 ? ' class="zero"' : '';
    return '' +
      '<div class="org-node' + (selectedPersonId === id ? ' selected' : '') + '" data-person="' + id + '">' +
        '<div class="org-node-name">' + escapeHtml(name) + '</div>' +
        '<div class="org-node-stufe">' + escapeHtml(stufeLabel(stufe)) + '</div>' +
        '<div class="org-node-eh"><span' + ehClass + '>' + fmtEh.format(units) + ' EH/Monat' + (units === 0 ? ' ⚠' : '') + '</span><span>' + fmtEh.format(hist) + ' EH gesamt</span></div>' +
        badges +
      '</div>';
  }

  function buildOrgSubtree(parentId) {
    var children = childrenOf(parentId);
    if (!children.length) return '';
    return '<ul>' + children.map(function(c) {
      return '<li>' + buildOrgNodeHtml(c.id, c.name || '(ohne Namen)', c.stufe, c.units, c.historicalUnits || 0) + buildOrgSubtree(c.id) + '</li>';
    }).join('') + '</ul>';
  }

  function renderOrgTree() {
    if (!orgTreeEl) return;
    orgTreeEl.innerHTML = '<ul class="org-tree"><li>' +
      buildOrgNodeHtml('raphael', 'Ich (Raphael)', raphael.stufe, raphael.units, raphael.historicalUnits || 0) +
      buildOrgSubtree(null) +
    '</li></ul>';
    orgTreeEl.querySelectorAll('.org-node').forEach(function(el) {
      el.addEventListener('click', function() {
        selectPerson(el.getAttribute('data-person'));
      });
    });
  }

  // ---------- Struktur-Baum: Verschieben (Ziehen) & Zoomen, wie bei einer Kartenansicht ----------
  // (Vorher stieß man mit der zentrierten Flexbox-Darstellung + reinem overflow-x:auto an eine
  // Browser-Eigenheit: der linke, überstehende Bereich war per Scrollbalken nicht erreichbar.
  // Freies Ziehen + Zoomen umgeht das und skaliert außerdem sauber mit einer wachsenden Struktur.)
  var orgTreeWrapEl = document.getElementById('orgTreeWrap');
  var orgTreeZoomInEl = document.getElementById('orgTreeZoomIn');
  var orgTreeZoomOutEl = document.getElementById('orgTreeZoomOut');
  var orgTreeZoomResetEl = document.getElementById('orgTreeZoomReset');
  var orgTreeTransform = { x: 0, y: 0, scale: 1 };
  var orgTreeDrag = null;
  var orgTreeSuppressNextClick = false;
  var ORG_TREE_MIN_SCALE = 0.4, ORG_TREE_MAX_SCALE = 2.5;

  function applyOrgTreeTransform() {
    if (!orgTreeEl) return;
    orgTreeEl.style.transform = 'translate(' + orgTreeTransform.x + 'px,' + orgTreeTransform.y + 'px) scale(' + orgTreeTransform.scale + ')';
  }

  function clampOrgTreePan() {
    if (!orgTreeWrapEl || !orgTreeEl) return;
    var wrapW = orgTreeWrapEl.clientWidth, wrapH = orgTreeWrapEl.clientHeight;
    var contentW = orgTreeEl.scrollWidth * orgTreeTransform.scale;
    var contentH = orgTreeEl.scrollHeight * orgTreeTransform.scale;
    var margin = 60; // so viele Pixel des Baums müssen mindestens sichtbar bleiben
    var minX = margin - contentW, maxX = wrapW - margin;
    var minY = margin - contentH, maxY = wrapH - margin;
    if (minX > maxX) { var midX = (minX + maxX) / 2; minX = maxX = midX; }
    if (minY > maxY) { var midY = (minY + maxY) / 2; minY = maxY = midY; }
    orgTreeTransform.x = Math.min(maxX, Math.max(minX, orgTreeTransform.x));
    orgTreeTransform.y = Math.min(maxY, Math.max(minY, orgTreeTransform.y));
  }

  function zoomOrgTreeBy(factor, cx, cy) {
    if (!orgTreeWrapEl) return;
    var rect = orgTreeWrapEl.getBoundingClientRect();
    if (cx === undefined) cx = rect.width / 2;
    if (cy === undefined) cy = rect.height / 2;
    var oldScale = orgTreeTransform.scale;
    var newScale = Math.min(ORG_TREE_MAX_SCALE, Math.max(ORG_TREE_MIN_SCALE, oldScale * factor));
    if (newScale === oldScale) return;
    // Punkt unter dem Mauszeiger (bzw. Kartenmitte) soll beim Zoomen an derselben Stelle bleiben.
    var contentX = (cx - orgTreeTransform.x) / oldScale;
    var contentY = (cy - orgTreeTransform.y) / oldScale;
    orgTreeTransform.scale = newScale;
    orgTreeTransform.x = cx - contentX * newScale;
    orgTreeTransform.y = cy - contentY * newScale;
    clampOrgTreePan();
    applyOrgTreeTransform();
  }

  if (orgTreeWrapEl && orgTreeEl) {
    orgTreeWrapEl.addEventListener('pointerdown', function(e) {
      if (e.button !== undefined && e.button !== 0) return;
      // Klicks auf die Zoom-Knöpfe sollen nicht als Ziehen der Karte starten.
      if (e.target && e.target.closest && e.target.closest('.org-tree-zoom')) return;
      orgTreeDrag = { startX: e.clientX, startY: e.clientY, startTX: orgTreeTransform.x, startTY: orgTreeTransform.y, moved: false, captured: false, pointerId: e.pointerId };
    });
    orgTreeWrapEl.addEventListener('pointermove', function(e) {
      if (!orgTreeDrag || orgTreeDrag.pointerId !== e.pointerId) return;
      var dx = e.clientX - orgTreeDrag.startX, dy = e.clientY - orgTreeDrag.startY;
      if (!orgTreeDrag.moved) {
        if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return; // noch keine echte Ziehbewegung -> ein einfacher Klick bleibt möglich
        orgTreeDrag.moved = true;
        orgTreeWrapEl.classList.add('dragging');
        // Die Pointer-Erfassung erst JETZT (bei tatsächlichem Ziehen) setzen, nicht schon bei
        // pointerdown — sonst würde jeder normale Klick auf einen Personen-Knoten an das
        // umschließende Element umgeleitet und der Knoten bekäme den Klick nie zu sehen.
        try { orgTreeWrapEl.setPointerCapture(e.pointerId); orgTreeDrag.captured = true; } catch (err) {}
      }
      orgTreeTransform.x = orgTreeDrag.startTX + dx;
      orgTreeTransform.y = orgTreeDrag.startTY + dy;
      clampOrgTreePan();
      applyOrgTreeTransform();
    });
    var endOrgTreeDrag = function(e) {
      if (!orgTreeDrag) return;
      if (orgTreeDrag.moved) {
        orgTreeSuppressNextClick = true;
        if (orgTreeDrag.captured) { try { orgTreeWrapEl.releasePointerCapture(orgTreeDrag.pointerId); } catch (err) {} }
      }
      orgTreeDrag = null;
      orgTreeWrapEl.classList.remove('dragging');
    };
    orgTreeWrapEl.addEventListener('pointerup', endOrgTreeDrag);
    orgTreeWrapEl.addEventListener('pointercancel', endOrgTreeDrag);
    // Zentrale Stelle, um genau den einen Klick zu unterdrücken, der direkt auf ein Ziehen folgt
    // (Capture-Phase, damit sie vor dem Auswahl-Klick-Handler eines Personen-Knotens greift) —
    // egal ob der Loslass-Punkt auf einem Knoten, dem leeren Hintergrund oder sonstwo im Baum lag.
    orgTreeWrapEl.addEventListener('click', function(e) {
      if (orgTreeSuppressNextClick) {
        orgTreeSuppressNextClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
    orgTreeWrapEl.addEventListener('wheel', function(e) {
      e.preventDefault();
      var rect = orgTreeWrapEl.getBoundingClientRect();
      var factor = Math.pow(1.0015, -e.deltaY);
      zoomOrgTreeBy(factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
  }
  if (orgTreeZoomInEl) orgTreeZoomInEl.addEventListener('click', function() { zoomOrgTreeBy(1.25); });
  if (orgTreeZoomOutEl) orgTreeZoomOutEl.addEventListener('click', function() { zoomOrgTreeBy(0.8); });
  if (orgTreeZoomResetEl) orgTreeZoomResetEl.addEventListener('click', function() {
    orgTreeTransform = { x: 0, y: 0, scale: 1 };
    applyOrgTreeTransform();
  });
  var orgTreeResizeTimer = null;
  window.addEventListener('resize', function() {
    if (orgTreeResizeTimer) clearTimeout(orgTreeResizeTimer);
    orgTreeResizeTimer = setTimeout(function() { clampOrgTreePan(); applyOrgTreeTransform(); }, 150);
  });
  applyOrgTreeTransform();

  function selectPerson(id) {
    selectedPersonId = id;
    editingTerminId = null;
    renderOrgTree();
    renderPersonDetail();
    if (personDetailCardEl) personDetailCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Trägt EH manuell bei einer Person ein (z. B. Umsatz aus einem Beratungstermin) — spiegelt
  // dieselbe Delta-Logik wie die "Eigene EH"-Eingabefelder: Monatswert UND gesamthistorischer
  // Wert wachsen um denselben Betrag (amount darf auch negativ sein, zum Zurückbuchen).
  function addUnitsToPerson(personId, amount) {
    if (!amount) return;
    if (personId === 'raphael') {
      raphael.units = Math.max(0, (raphael.units || 0) + amount);
      raphael.historicalUnits = Math.max(0, (raphael.historicalUnits || 0) + amount);
      if (raphaelUnitsEl) raphaelUnitsEl.value = raphael.units;
      if (raphaelHistEl) raphaelHistEl.value = raphael.historicalUnits;
      teamRecalc();
      if (typeof recalcCustomers === 'function') recalcCustomers();
      return;
    }
    var p = findPerson(personId);
    if (!p) return;
    p.units = Math.max(0, (p.units || 0) + amount);
    p.historicalUnits = Math.max(0, (p.historicalUnits || 0) + amount);
    applyAutoStufe(p);
    renderTeamTable();
    teamRecalc();
  }

  function addTermin(personId, type, date, time, label) {
    if (!date) return;
    var validType = TERMIN_TYPES.some(function(tt) { return tt.key === type; }) ? type : 'analyse';
    termineIdSeq += 1;
    termine.push({ id: 't' + termineIdSeq, personId: personId, type: validType, date: date, time: time || '', label: (label || '').trim(), umsatzEH: 0 });
    renderOrgTree();
    renderPersonDetail();
    renderNaechsteTermine();
    renderHeute();
    scheduleAutoSave();
  }
  function removeTermin(id) {
    var t = termine.find(function(x) { return x.id === id; });
    if (t && t.umsatzEH > 0) addUnitsToPerson(t.personId, -t.umsatzEH);
    termine = termine.filter(function(x) { return x.id !== id; });
    if (editingTerminId === id) editingTerminId = null;
    renderOrgTree();
    renderPersonDetail();
    renderNaechsteTermine();
    renderHeute();
    scheduleAutoSave();
  }
  // Beratung abschließen: trägt den Umsatz bei der Person ein (egal ob ich selbst oder ein Mitarbeiter),
  // zählt den damit gewonnenen Kunden automatisch bei "Neukunden diesen Monat" dazu und entfernt den
  // Termin aus der Liste.
  function confirmTerminUmsatz(id, amount) {
    var t = termine.find(function(x) { return x.id === id; });
    if (!t || !(amount > 0)) return;
    addUnitsToPerson(t.personId, amount);
    if (custMonatEl) {
      custMonatEl.value = num(custMonatEl) + 1;
      if (typeof recalcCustomers === 'function') recalcCustomers();
    }
    termine = termine.filter(function(x) { return x.id !== id; });
    if (editingTerminId === id) editingTerminId = null;
    renderOrgTree();
    renderPersonDetail();
    renderNaechsteTermine();
    renderHeute();
    scheduleAutoSave();
  }
  // Bestehenden Termin bearbeiten (Typ/Datum/Zeit/Bezeichnung), ohne ihn zu löschen und neu anzulegen.
  function updateTermin(id, type, date, time, label) {
    var t = termine.find(function(x) { return x.id === id; });
    if (!t || !date) return;
    var validType = TERMIN_TYPES.some(function(tt) { return tt.key === type; }) ? type : t.type;
    t.type = validType;
    t.date = date;
    t.time = time || '';
    t.label = (label || '').trim();
    editingTerminId = null;
    renderOrgTree();
    renderPersonDetail();
    renderNaechsteTermine();
    renderHeute();
    scheduleAutoSave();
  }
  function startEditTermin(id) {
    var t = termine.find(function(x) { return x.id === id; });
    if (!t) return;
    editingTerminId = id;
    renderPersonDetail();
  }
  function cancelEditTermin() {
    editingTerminId = null;
    renderPersonDetail();
  }

  function terminTypeLabel(key) {
    var tt = TERMIN_TYPES.find(function(x) { return x.key === key; });
    return tt ? tt.label : key;
  }

  // "Nächste Termine": alle offenen Termine über die gesamte Struktur, chronologisch — Klick auf
  // einen Eintrag springt direkt zur jeweiligen Person im Baum.
  function renderNaechsteTermine() {
    var el = document.getElementById('naechsteTermineContent');
    if (!el) return;
    var upcoming = termine.filter(isTerminOffen).slice().sort(function(a, b) {
      return (a.date + 'T' + (a.time || '00:00')).localeCompare(b.date + 'T' + (b.time || '00:00'));
    });
    if (!upcoming.length) {
      el.innerHTML = '<div class="empty-state">Keine offenen Termine.</div>';
      return;
    }
    var shown = upcoming.slice(0, 10);
    el.innerHTML = '<ul class="termin-list">' + shown.map(function(t) {
      return '' +
        '<li data-person="' + t.personId + '">' +
          '<span class="termin-when">' + formatTerminWhen(t) + '</span>' +
          '<span class="termin-person">' + escapeHtml(personName(t.personId) || '–') + '</span>' +
          '<span class="termin-label">' + escapeHtml(terminTypeLabel(t.type)) + (t.label ? ' · ' + escapeHtml(t.label) : '') + '</span>' +
        '</li>';
    }).join('') + '</ul>' +
    (upcoming.length > shown.length ? '<div class="field-hint" style="margin-top:8px;">+ ' + (upcoming.length - shown.length) + ' weitere offene Termine.</div>' : '');

    el.querySelectorAll('.termin-list li').forEach(function(li) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', function() {
        selectPerson(li.getAttribute('data-person'));
      });
    });
  }

  // "Heute"-Karte (Übersicht): heutige Termine + heute fällige, nicht erledigte Notizen —
  // über die gesamte Struktur hinweg.
  function renderHeute() {
    var contentEl = document.getElementById('heuteContent');
    if (!contentEl) return;
    var now = new Date();
    var todayKey = currentDateStr();
    var dateLabel = now.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var todaysTermine = termine.filter(function(t) { return t.date === todayKey; }).slice().sort(function(a, b) {
      return (a.time || '00:00').localeCompare(b.time || '00:00');
    });
    var dueTodayNotes = notes.filter(function(n) {
      if (n.done || !n.due) return false;
      return n.due.slice(0, 10) === todayKey;
    });

    var terminHtml = todaysTermine.length ? ('<ul class="termin-list">' + todaysTermine.map(function(t) {
      return '' +
        '<li data-person="' + t.personId + '">' +
          '<span class="termin-when">' + (t.time || '–') + '</span>' +
          '<span class="termin-person">' + escapeHtml(personName(t.personId) || '–') + '</span>' +
          '<span class="termin-label">' + escapeHtml(terminTypeLabel(t.type)) + (t.label ? ' · ' + escapeHtml(t.label) : '') + '</span>' +
        '</li>';
    }).join('') + '</ul>') : '<div class="empty-state">Keine Termine heute.</div>';

    var notesHtml = dueTodayNotes.length ? ('<ul class="note-list">' + dueTodayNotes.map(function(n) {
      var assignNames = (n.assignedTo || []).map(personName).filter(Boolean);
      return '' +
        '<li data-id="' + n.id + '">' +
          '<div class="box note-check" data-id="' + n.id + '" role="checkbox" aria-checked="false"></div>' +
          '<div class="txt"><strong>' + escapeHtml(n.text) + '</strong>' +
            (assignNames.length ? '<span>👤 ' + escapeHtml(assignNames.join(', ')) + '</span>' : '') +
          '</div>' +
        '</li>';
    }).join('') + '</ul>') : '<div class="empty-state">Keine fälligen Notizen heute.</div>';

    contentEl.innerHTML =
      '<div class="heute-date">' + escapeHtml(dateLabel) + '</div>' +
      '<div class="heute-section"><h4>📅 Termine heute</h4>' + terminHtml + '</div>' +
      '<div class="heute-section"><h4>📝 Fällige Notizen heute</h4>' + notesHtml + '</div>';

    contentEl.querySelectorAll('.termin-list li').forEach(function(li) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', function() {
        var struktBtn = document.querySelector('.main-tabs button[data-maintab="struktur"]');
        if (struktBtn) struktBtn.click();
        selectPerson(li.getAttribute('data-person'));
      });
    });
    contentEl.querySelectorAll('.note-check').forEach(function(el2) {
      el2.addEventListener('click', function() {
        var n = notes.find(function(x) { return x.id === el2.getAttribute('data-id'); });
        if (n) { n.done = !n.done; renderNotes(); scheduleAutoSave(); }
      });
    });
  }

  // Öffnet #personDetailCard mit einer sanften "nach unten aufklappen"-Animation (max-height + Fade),
  // statt es hart per display:none/'' umzuschalten. Wird nur beim tatsächlichen Öffnen animiert — ist
  // das Panel schon offen (z. B. nur der Inhalt wurde aktualisiert), passiert nichts Sichtbares.
  function openPersonDetailPanel() {
    if (!personDetailCardEl) return;
    if (personDetailOpen) { personDetailCardEl.style.display = ''; return; }
    personDetailOpen = true;
    if (pdAnimTimer) { clearTimeout(pdAnimTimer); pdAnimTimer = null; }
    personDetailCardEl.style.display = '';
    personDetailCardEl.style.maxHeight = '0px';
    personDetailCardEl.style.opacity = '0';
    void personDetailCardEl.offsetHeight; // reflow erzwingen, damit der Übergang ab 0 startet
    var target = personDetailCardEl.scrollHeight;
    personDetailCardEl.style.maxHeight = target + 'px';
    personDetailCardEl.style.opacity = '1';
    pdAnimTimer = setTimeout(function() {
      if (personDetailOpen) personDetailCardEl.style.maxHeight = 'none'; // Deckel entfernen, damit später wachsender Inhalt nicht abgeschnitten wird
      pdAnimTimer = null;
    }, 440);
  }

  // Schließt #personDetailCard mit derselben Animation rückwärts (schrumpfen + ausblenden), erst danach
  // wird display:none gesetzt und der Inhalt geleert (identisch zum bisherigen Ruhezustand).
  function closePersonDetailPanel() {
    if (!personDetailCardEl) return;
    if (!personDetailOpen) { personDetailCardEl.style.display = 'none'; personDetailCardEl.innerHTML = ''; return; }
    personDetailOpen = false;
    if (pdAnimTimer) { clearTimeout(pdAnimTimer); pdAnimTimer = null; }
    var current = personDetailCardEl.scrollHeight;
    personDetailCardEl.style.maxHeight = current + 'px';
    void personDetailCardEl.offsetHeight; // reflow erzwingen, damit der Übergang von diesem konkreten Wert aus startet
    personDetailCardEl.style.maxHeight = '0px';
    personDetailCardEl.style.opacity = '0';
    pdAnimTimer = setTimeout(function() {
      personDetailCardEl.style.display = 'none';
      personDetailCardEl.innerHTML = '';
      pdAnimTimer = null;
    }, 420);
  }

  function renderPersonDetail() {
    if (!personDetailCardEl) return;
    if (!selectedPersonId) { closePersonDetailPanel(); return; }

    var id = selectedPersonId;
    var isRaphael = id === 'raphael';
    var p = isRaphael ? null : findPerson(id);
    if (!isRaphael && !p) { selectedPersonId = null; closePersonDetailPanel(); return; }

    var name = isRaphael ? 'Ich (Raphael)' : (p.name || '(ohne Namen)');
    var stufe = isRaphael ? raphael.stufe : p.stufe;
    var units = isRaphael ? raphael.units : p.units;
    var hist = isRaphael ? (raphael.historicalUnits || 0) : (p.historicalUnits || 0);
    var hasTeam = isRaphael ? true : childrenOf(id).length > 0;

    var statsHtml = '' +
      '<div class="stat-tile"><div class="stat-label">Stufe</div><div class="stat-value" style="font-size:16px;">' + escapeHtml(stufeLabel(stufe)) + '</div></div>' +
      '<div class="stat-tile"><div class="stat-label">Eigene EH diesen Monat</div><div class="stat-value" style="font-size:16px;">' + fmtEh.format(units) + ' EH</div></div>' +
      '<div class="stat-tile"><div class="stat-label">Eigene gesamthistorische EH</div><div class="stat-value" style="font-size:16px;">' + fmtEh.format(hist) + ' EH</div></div>';
    if (hasTeam) {
      statsHtml += '' +
        '<div class="stat-tile"><div class="stat-label">Inkl. Team diesen Monat</div><div class="stat-value" style="font-size:16px;">' + fmtEh.format(personSubtreeVolume(id)) + ' EH</div></div>' +
        '<div class="stat-tile"><div class="stat-label">Inkl. Team gesamthistorisch</div><div class="stat-value" style="font-size:16px;">' + fmtEh.format(personSubtreeHistorical(id)) + ' EH</div></div>';
    }

    var personNotes = notes.filter(function(n) { return (n.assignedTo || []).indexOf(id) !== -1; });
    var notesHtml = personNotes.length ? ('<ul class="note-list">' + personNotes.map(function(n) {
      var overdue = isNoteOverdue(n);
      var metaParts = [];
      if (n.due) metaParts.push('<span class="' + (overdue ? 'overdue' : '') + '">📅 ' + escapeHtml(formatDueDateTime(n.due)) + (overdue ? ' · überfällig' : '') + '</span>');
      var otherAssignees = (n.assignedTo || []).filter(function(a) { return a !== id; }).map(personName).filter(Boolean);
      if (otherAssignees.length) metaParts.push('👤 auch: ' + escapeHtml(otherAssignees.join(', ')));
      return '' +
        '<li data-id="' + n.id + '" class="' + (n.done ? 'note-done' : '') + '">' +
          '<div class="box note-check" data-id="' + n.id + '" role="checkbox" aria-checked="' + (n.done ? 'true' : 'false') + '"></div>' +
          '<div class="txt"><strong>' + escapeHtml(n.text) + '</strong>' +
            (metaParts.length ? '<span>' + metaParts.join(' · ') + '</span>' : '') +
          '</div>' +
          '<button type="button" class="btn-remove note-remove" data-id="' + n.id + '" title="Löschen">✕</button>' +
        '</li>';
    }).join('') + '</ul>') : '<div class="empty-state">Keine Notizen für diese Person.</div>';

    var personTermine = termine.filter(function(t) { return t.personId === id; }).slice().sort(function(a, b) {
      return (a.date + 'T' + (a.time || '00:00')).localeCompare(b.date + 'T' + (b.time || '00:00'));
    });
    var editingTermin = editingTerminId ? personTermine.find(function(t) { return t.id === editingTerminId; }) : null;
    var termineHtml = TERMIN_TYPES.map(function(tt) {
      var items = personTermine.filter(function(t) { return t.type === tt.key; });
      var offenCount = items.filter(isTerminOffen).length;
      var listHtml = items.length ? ('<ul class="termin-list">' + items.map(function(t) {
        var offen = isTerminOffen(t);
        var needsUmsatzConfirm = t.type === 'beratung' && !(t.umsatzEH > 0);
        return '' +
          '<li class="' + (offen ? '' : 'termin-vergangen') + (editingTermin && editingTermin.id === t.id ? ' termin-editing' : '') + '">' +
            '<span class="termin-when">' + formatTerminWhen(t) + '</span>' +
            '<span class="termin-label">' + (t.label ? escapeHtml(t.label) : '<span style="color:var(--text-muted);">–</span>') +
              (t.umsatzEH > 0 ? ' <span class="org-badge" style="margin-left:6px;">💶 +' + fmtEh.format(t.umsatzEH) + ' EH</span>' : '') +
            '</span>' +
            (needsUmsatzConfirm ?
              '<div class="termin-umsatz-confirm">' +
                '<input type="number" class="termin-umsatz-inline" min="0" step="1" placeholder="EH" data-id="' + t.id + '">' +
                '<button type="button" class="btn-confirm-umsatz" data-id="' + t.id + '" disabled title="Umsatz eintragen &amp; Beratung abschließen">✓</button>' +
              '</div>'
            : '') +
            '<button type="button" class="btn-remove termin-edit" data-id="' + t.id + '" title="Bearbeiten">✎</button>' +
            '<button type="button" class="btn-remove termin-remove" data-id="' + t.id + '" title="Ohne Umsatz löschen">✕</button>' +
          '</li>';
      }).join('') + '</ul>') : '<div class="empty-state" style="padding:10px 4px;">Keine ' + escapeHtml(tt.label) + '-Termine.</div>';
      return '' +
        '<div class="termin-group">' +
          '<div class="termin-group-head">' + escapeHtml(tt.label) + (offenCount ? ' <span class="org-badge offen">' + offenCount + ' offen</span>' : '') + '</div>' +
          listHtml +
        '</div>';
    }).join('');

    var personDocs = (typeof docFiles !== 'undefined' ? docFiles : []).filter(function(f) { return (f.assignedTo || []).indexOf(id) !== -1; });
    var docsHtml = personDocs.length ? ('<ul class="doc-list">' + personDocs.map(function(f) {
      var otherAssignees = (f.assignedTo || []).filter(function(a) { return a !== id; }).map(personName).filter(Boolean);
      var pathParts = (typeof docFolderPath === 'function') ? docFolderPath(f.folderId).map(function(pf) { return pf.name; }) : [];
      return '' +
        '<li class="doc-file" data-id="' + f.id + '">' +
          '<span class="doc-name-wrap"><span class="doc-name">' + escapeHtml(f.name) + '</span>' +
            (pathParts.length ? '<span class="doc-path-hint">in ' + escapeHtml(pathParts.join(' › ')) + '</span>' : '') +
          '</span>' +
          '<span class="doc-right">' +
            (otherAssignees.length ? '<span class="doc-assignees">auch: ' + escapeHtml(otherAssignees.join(', ')) + '</span>' : '') +
            '<button type="button" class="btn-remove doc-unassign" data-id="' + f.id + '" title="Diese Person nicht mehr zuordnen">✕</button>' +
          '</span>' +
        '</li>';
    }).join('') + '</ul>') : '<div class="empty-state">Keine Dokumente dieser Person zugeordnet.</div>';

    personDetailCardEl.innerHTML = '' +
      '<div class="person-detail-head"><h2>' + escapeHtml(name) + '</h2><button type="button" class="btn-remove" id="btnClosePersonDetail">✕ Schließen</button></div>' +
      '<div class="person-detail-sub">Klicke auf eine andere Person im Baum, um zu wechseln.</div>' +
      '<div class="result-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px,1fr));">' + statsHtml + '</div>' +

      '<div class="person-detail-section">' +
        '<h3>Notizen</h3>' +
        '<div class="note-add-row">' +
          '<input type="text" id="personNoteInput" placeholder="Neue Notiz für ' + escapeHtml(name) + '…">' +
          '<button type="button" class="btn-add" id="btnAddPersonNote">+ Hinzufügen</button>' +
        '</div>' +
        '<div class="note-add-extra"><input type="datetime-local" id="personNoteDueInput" lang="de-AT" title="Fällig am (optional)"></div>' +
        notesHtml +
      '</div>' +

      '<div class="person-detail-section">' +
        '<h3>Termine</h3>' +
        (editingTermin ? '<div class="termin-editing-hint">✎ Termin wird bearbeitet …</div>' : '') +
        '<div class="termin-add-row">' +
          '<select id="terminTypeInput">' + TERMIN_TYPES.map(function(tt) { return '<option value="' + tt.key + '"' + (editingTermin && editingTermin.type === tt.key ? ' selected' : '') + '>' + escapeHtml(tt.label) + '</option>'; }).join('') + '</select>' +
          '<input type="text" inputmode="numeric" id="terminDateInput" placeholder="TT.MM.JJJJ" maxlength="10" autocomplete="off"' + (editingTermin ? ' value="' + escapeHtml(formatATDateFromISO(editingTermin.date)) + '" data-iso="' + escapeHtml(editingTermin.date) + '"' : '') + '>' +
          '<input type="time" id="terminTimeInput"' + (editingTermin ? ' value="' + escapeHtml(editingTermin.time || '') + '"' : '') + '>' +
          '<input type="text" id="terminLabelInput" placeholder="Kunde/Bezeichnung (optional)"' + (editingTermin ? ' value="' + escapeHtml(editingTermin.label || '') + '"' : '') + '>' +
          '<button type="button" class="btn-add" id="btnAddTermin">' + (editingTermin ? '✓ Speichern' : '+ Termin') + '</button>' +
          (editingTermin ? '<button type="button" class="btn-remove" id="btnCancelEditTermin" title="Bearbeiten abbrechen">Abbrechen</button>' : '') +
        '</div>' +
        termineHtml +
      '</div>' +

      '<div class="person-detail-section">' +
        '<h3>Dokumente</h3>' +
        docsHtml +
      '</div>';

    openPersonDetailPanel();

    document.getElementById('btnClosePersonDetail').addEventListener('click', function() {
      selectedPersonId = null;
      editingTerminId = null;
      renderOrgTree();
      renderPersonDetail();
    });

    personDetailCardEl.querySelectorAll('.note-check').forEach(function(el) {
      el.addEventListener('click', function() {
        var n = notes.find(function(x) { return x.id === el.getAttribute('data-id'); });
        if (n) { n.done = !n.done; renderNotes(); scheduleAutoSave(); }
      });
    });
    personDetailCardEl.querySelectorAll('.note-remove').forEach(function(el) {
      el.addEventListener('click', function() {
        notes = notes.filter(function(x) { return x.id !== el.getAttribute('data-id'); });
        renderNotes();
        scheduleAutoSave();
      });
    });

    var personNoteInputEl = document.getElementById('personNoteInput');
    var personNoteDueInputEl = document.getElementById('personNoteDueInput');
    function addPersonNote() {
      addNote(personNoteInputEl.value, [id], personNoteDueInputEl.value);
      var freshInput = document.getElementById('personNoteInput');
      if (freshInput) freshInput.focus();
    }
    document.getElementById('btnAddPersonNote').addEventListener('click', addPersonNote);
    personNoteInputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); addPersonNote(); }
    });

    personDetailCardEl.querySelectorAll('.termin-remove').forEach(function(el) {
      el.addEventListener('click', function() {
        removeTermin(el.getAttribute('data-id'));
      });
    });
    personDetailCardEl.querySelectorAll('.termin-edit').forEach(function(el) {
      el.addEventListener('click', function() {
        startEditTermin(el.getAttribute('data-id'));
      });
    });
    var btnCancelEditTerminEl = document.getElementById('btnCancelEditTermin');
    if (btnCancelEditTerminEl) btnCancelEditTerminEl.addEventListener('click', cancelEditTermin);
    personDetailCardEl.querySelectorAll('.termin-umsatz-inline').forEach(function(inp) {
      var btn = personDetailCardEl.querySelector('.btn-confirm-umsatz[data-id="' + inp.getAttribute('data-id') + '"]');
      function syncConfirmBtn() { if (btn) btn.disabled = !(num(inp) > 0); }
      inp.addEventListener('input', syncConfirmBtn);
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && num(inp) > 0) { e.preventDefault(); confirmTerminUmsatz(inp.getAttribute('data-id'), num(inp)); }
      });
    });
    personDetailCardEl.querySelectorAll('.btn-confirm-umsatz').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tid = btn.getAttribute('data-id');
        var inp = personDetailCardEl.querySelector('.termin-umsatz-inline[data-id="' + tid + '"]');
        var amount = inp ? num(inp) : 0;
        if (!(amount > 0)) return;
        confirmTerminUmsatz(tid, amount);
      });
    });
    var terminTypeInputEl = document.getElementById('terminTypeInput');
    attachATDateMask(document.getElementById('terminDateInput'));

    document.getElementById('btnAddTermin').addEventListener('click', function() {
      var type = terminTypeInputEl.value;
      var date = getDateISO(document.getElementById('terminDateInput'));
      var time = document.getElementById('terminTimeInput').value;
      var label = document.getElementById('terminLabelInput').value;
      if (!date) { document.getElementById('terminDateInput').focus(); return; }
      if (editingTerminId) {
        updateTermin(editingTerminId, type, date, time, label);
      } else {
        addTermin(id, type, date, time, label);
      }
    });

    personDetailCardEl.querySelectorAll('.doc-file').forEach(function(li) {
      li.addEventListener('click', function(e) {
        if (e.target.closest('.doc-unassign')) return;
        if (typeof openDocFile === 'function') openDocFile(li.getAttribute('data-id'));
      });
    });
    personDetailCardEl.querySelectorAll('.doc-unassign').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var f = (typeof docFiles !== 'undefined' ? docFiles : []).find(function(x) { return x.id === btn.getAttribute('data-id'); });
        if (f) { f.assignedTo = (f.assignedTo || []).filter(function(a) { return a !== id; }); }
        renderOrgTree();
        renderPersonDetail();
        scheduleAutoSave();
      });
    });
  }

  function addPerson() {
    teamIdSeq += 1;
    team.push({ id: 'p' + teamIdSeq, name: '', parentId: null, stufe: 2, units: 0, historicalUnits: 0, stufeAuto: true });
    renderTeamTable();
    teamRecalc();
  }

  function teamState() {
    return { raphael: raphael, team: team, goals: teamGoals, custGesamt: customersTotal, stufeZiel: stufeZiel, stufeZielGesamt: stufeZielGesamt, custMonat: custNeueDiesenMonat };
  }
  function applyTeamState(st) {
    if (!st || typeof st !== 'object') return;
    raphael = (st.raphael && typeof st.raphael === 'object') ? { stufe: Number(st.raphael.stufe) || 6, units: Number(st.raphael.units) || 0, historicalUnits: Number(st.raphael.historicalUnits) || 0 } : { stufe: 6, units: 0, historicalUnits: 0 };
    team = Array.isArray(st.team) ? st.team.map(function(p) {
      return { id: String(p.id), name: String(p.name || ''), parentId: p.parentId ? String(p.parentId) : null, stufe: Number(p.stufe) || 2, units: Number(p.units) || 0, historicalUnits: Number(p.historicalUnits) || 0, stufeAuto: p.stufeAuto === undefined ? false : !!p.stufeAuto };
    }) : [];
    teamIdSeq = team.reduce(function(max, p) {
      var n = parseInt(String(p.id).replace(/^p/, ''), 10);
      return isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    teamGoals = (st.goals && typeof st.goals === 'object') ? { struktur: Number(st.goals.struktur) || 0, gesamt: Number(st.goals.gesamt) || 0, eigen: Number(st.goals.eigen) || 0 } : { struktur: 0, gesamt: 0, eigen: 0 };
    teamGoals.gesamt = (teamGoals.struktur || 0) + (teamGoals.eigen || 0);
    if (st.custGesamt !== undefined) {
      customersTotal = Number(st.custGesamt) || 0;
    } else if (st.customers && typeof st.customers === 'object') {
      // Altformat: { eigen, struktur } bzw. noch älter { total, struktur } -> zu einem Gesamtwert zusammenführen
      if (st.customers.eigen !== undefined) {
        customersTotal = (Number(st.customers.eigen) || 0) + (Number(st.customers.struktur) || 0);
      } else {
        customersTotal = Number(st.customers.total) || 0;
      }
    } else {
      customersTotal = 0;
    }
    stufeZiel = Number(st.stufeZiel) || 0;
    stufeZielGesamt = Number(st.stufeZielGesamt) || 0;
    custNeueDiesenMonat = Number(st.custMonat) || 0;

    raphaelStufeEl.value = raphael.stufe;
    raphaelUnitsEl.value = raphael.units;
    raphaelHistEl.value = raphael.historicalUnits;
    goalEls.struktur.target.value = teamGoals.struktur;
    goalEls.gesamt.target.value = teamGoals.gesamt;
    goalEls.eigen.target.value = teamGoals.eigen;
    custGesamtEl.value = customersTotal;
    if (custMonatEl) custMonatEl.value = custNeueDiesenMonat;
    stufeGoalEl.value = stufeZiel;
    if (stufeGoalGesamtEl) stufeGoalGesamtEl.value = stufeZielGesamt;

    renderTeamTable();
    teamRecalc();
    recalcCustomers();
  }

  // ---------- Gesamter Dashboard-Zustand (alle Tabs, nicht nur Team & Struktur) ----------
  // Fasst Rechner (USt/SV/ESt), AfA-Anlagenverzeichnis, Uniqa FlexSelection, Einheitenrechner,
  // Design-Einstellungen (Theme/Akzentfarbe) und Team & Struktur zu einem einzigen, speicherbaren
  // Objekt zusammen. Wird sowohl vom automatischen Speichern als auch von „Manuell speichern/laden" genutzt.
  function collectAppState() {
    var fields = {};
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(function(el) {
      if (mainPanels.uebersicht && mainPanels.uebersicht.contains(el)) return; // -> teamState()
      if (mainPanels.struktur && mainPanels.struktur.contains(el)) return; // dynamisch erzeugt (Baum/Personendetails), nicht generisch sweepen
      if (mainPanels.dokumente && mainPanels.dokumente.contains(el)) return; // Suchfeld/Ordnername sind transiente UI, nicht generisch sweepen -> docFolders/docFiles
      if (el.type === 'file') return;
      if (el.id === 'accentCustomInput') return; // -> eigenes accent-Feld
      if (el.type === 'checkbox' || el.type === 'radio') {
        fields[el.id] = { checked: el.checked };
      } else {
        fields[el.id] = { value: el.value };
      }
    });

    var eh = {};
    EH_PRODUCTS.forEach(function(p) {
      var premEl = document.querySelector('.eh-prem[data-key="' + p.key + '"]');
      var lzEl = document.querySelector('.eh-laufzeit[data-key="' + p.key + '"]');
      eh[p.key] = { prem: premEl ? premEl.value : '0', laufzeit: lzEl ? lzEl.value : '0' };
    });

    return {
      version: 2,
      team: teamState(),
      fields: fields,
      assets: assets,
      nextAssetId: nextAssetId,
      lv: { lumpSums: lvLumpSums, withdrawals: lvWithdrawals, premiumOverrides: lvPremiumOverrides },
      eh: eh,
      theme: currentThemeMode,
      accent: currentAccentHex,
      lastActiveMonth: lastActiveMonth,
      notes: notes,
      monthlyHistory: monthlyHistory,
      termine: termine
    };
  }

  function applyAppState(st) {
    if (!st || typeof st !== 'object') return;

    if (st.fields && typeof st.fields === 'object') {
      Object.keys(st.fields).forEach(function(id) {
        var el = document.getElementById(id);
        var f = st.fields[id];
        if (!el || !f || typeof f !== 'object') return;
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = !!f.checked;
        } else if (f.value !== undefined) {
          el.value = f.value;
        }
      });
    }

    if (Array.isArray(st.assets)) {
      assets = st.assets.map(function(a) {
        return {
          id: Number(a.id) || 0,
          name: String(a.name || ''),
          categoryKey: String(a.categoryKey || ''),
          ndCustom: Number(a.ndCustom) || 5,
          age: Number(a.age) || 0,
          restNd: Number(a.restNd) || 1,
          cost: Number(a.cost) || 0,
          date: String(a.date || '')
        };
      });
      nextAssetId = Number(st.nextAssetId) || (assets.reduce(function(m, a) { return Math.max(m, a.id); }, 0) + 1);
    }

    if (st.lv && typeof st.lv === 'object') {
      lvLumpSums = (st.lv.lumpSums && typeof st.lv.lumpSums === 'object') ? st.lv.lumpSums : {};
      lvWithdrawals = (st.lv.withdrawals && typeof st.lv.withdrawals === 'object') ? st.lv.withdrawals : {};
      lvPremiumOverrides = (st.lv.premiumOverrides && typeof st.lv.premiumOverrides === 'object') ? st.lv.premiumOverrides : {};
    }

    if (Array.isArray(st.notes)) {
      notes = st.notes.map(function(n, i) {
        return {
          id: String(n.id || ('n' + (i + 1))),
          text: String(n.text || ''),
          done: !!n.done,
          assignedTo: Array.isArray(n.assignedTo) ? n.assignedTo.map(String) : [],
          due: String(n.due || '')
        };
      }).filter(function(n) { return n.text; });
      noteIdSeq = notes.reduce(function(max, n) {
        var m = parseInt(String(n.id).replace(/^n/, ''), 10);
        return isFinite(m) ? Math.max(max, m) : max;
      }, 0);
      renderNotes();
    }

    if (Array.isArray(st.termine)) {
      termine = st.termine.map(function(t, i) {
        var type = TERMIN_TYPES.some(function(tt) { return tt.key === t.type; }) ? t.type : 'analyse';
        return {
          id: String(t.id || ('t' + (i + 1))),
          personId: String(t.personId || 'raphael'),
          type: type,
          date: String(t.date || ''),
          time: String(t.time || ''),
          label: String(t.label || ''),
          umsatzEH: Number(t.umsatzEH) || 0
        };
      }).filter(function(t) { return t.date; });
      termineIdSeq = termine.reduce(function(max, t) {
        var m = parseInt(String(t.id).replace(/^t/, ''), 10);
        return isFinite(m) ? Math.max(max, m) : max;
      }, 0);
    }

    if (Array.isArray(st.docFolders)) {
      docFolders = st.docFolders.map(function(f, i) {
        return {
          id: String(f.id || ('docf' + (i + 1))),
          name: String(f.name || ''),
          parentId: f.parentId ? String(f.parentId) : null
        };
      }).filter(function(f) { return f.name; });
      docFolderIdSeq = docFolders.reduce(function(max, f) {
        var m = parseInt(String(f.id).replace(/^docf/, ''), 10);
        return isFinite(m) ? Math.max(max, m) : max;
      }, 0);
    }

    if (Array.isArray(st.docFiles)) {
      var validFolderIds = docFolders.map(function(f) { return f.id; });
      docFiles = st.docFiles.map(function(f, i) {
        return {
          id: String(f.id || ('docfile' + (i + 1))),
          folderId: (f.folderId && validFolderIds.indexOf(String(f.folderId)) !== -1) ? String(f.folderId) : null,
          name: String(f.name || ''),
          size: Number(f.size) || 0,
          mime: String(f.mime || ''),
          addedAt: Number(f.addedAt) || null,
          assignedTo: Array.isArray(f.assignedTo) ? f.assignedTo.map(String) : [],
          dataUrl: String(f.dataUrl || '')
        };
      }).filter(function(f) { return f.name && f.dataUrl; });
      docFileIdSeq = docFiles.reduce(function(max, f) {
        var m = parseInt(String(f.id).replace(/^docfile/, ''), 10);
        return isFinite(m) ? Math.max(max, m) : max;
      }, 0);
    }

    if (Array.isArray(st.monthlyHistory)) {
      monthlyHistory = st.monthlyHistory.map(function(m) {
        return {
          month: String(m.month || ''),
          eigenUnits: Number(m.eigenUnits) || 0,
          strukturUnits: Number(m.strukturUnits) || 0,
          verdienst: Number(m.verdienst) || 0
        };
      }).filter(function(m) { return m.month; }).slice(-12);
    }

    if (st.eh && typeof st.eh === 'object') {
      EH_PRODUCTS.forEach(function(p) {
        var e = st.eh[p.key];
        if (!e) return;
        var premEl = document.querySelector('.eh-prem[data-key="' + p.key + '"]');
        var lzEl = document.querySelector('.eh-laufzeit[data-key="' + p.key + '"]');
        if (premEl && e.prem !== undefined) premEl.value = e.prem;
        if (lzEl && e.laufzeit !== undefined) lzEl.value = e.laufzeit;
      });
    }

    if (st.theme) applyThemeMode(st.theme);
    setAccent('#4C7EFF'); // Akzentfarbe ist fix auf Flexo-Blau gesetzt, nicht mehr veraenderbar -- gespeicherter st.accent wird bewusst ignoriert.

    // Rückwärtskompatibilität: ältere gespeicherte Dateien enthielten ausschließlich die
    // Team-&-Struktur-Daten direkt auf oberster Ebene (kein "fields"/"team"-Wrapper).
    var teamPortion = null;
    if (st.team && typeof st.team === 'object' && !Array.isArray(st.team)) {
      teamPortion = st.team;
    } else if (st.raphael || Array.isArray(st.team) || st.goals || st.customers || st.custGesamt !== undefined) {
      teamPortion = st;
    }

    // Alles neu berechnen/rendern, das von den wiederhergestellten Werten abhängt.
    updateVehicleAgeUI();
    renderAssets();          // -> recalc()
    lvRenderFlows();         // Listen aus lvLumpSums/lvWithdrawals/lvPremiumOverrides neu aufbauen
    lvBuildTableStructure(); // baut Jahreszeilen neu -> lvRecompute()
    ehRecalc();
    selectedPersonId = null; // Struktur-Baum-Auswahl nicht über einen Neuladen hinweg mitschleppen
    if (typeof currentDocFolderId !== 'undefined') currentDocFolderId = null; // Dokumente-Ansicht zurück auf die Wurzel
    if (teamPortion) applyTeamState(teamPortion); // -> renderTeamTable() + teamRecalc() + recalcCustomers() + renderOrgTree()/renderPersonDetail()
    if (typeof renderOrgTree === 'function') renderOrgTree();
    if (typeof renderPersonDetail === 'function') renderPersonDetail();
    if (typeof renderNaechsteTermine === 'function') renderNaechsteTermine();
    if (typeof renderHeute === 'function') renderHeute();
    if (typeof renderDocsBrowser === 'function') renderDocsBrowser();
    renderVerlauf();

    // Automatischer Monatswechsel-Reset: erst prüfen, nachdem der zuletzt gespeicherte
    // Monat (falls vorhanden) geladen wurde, damit gegen den korrekten Vorwert verglichen wird.
    lastActiveMonth = (typeof st.lastActiveMonth === 'string' && st.lastActiveMonth) ? st.lastActiveMonth : lastActiveMonth;
    checkMonthRollover();
  }

  // ---------- Automatisches Speichern (Firestore) ----------
  // Jede Änderung wird gebündelt (700ms Debounce) als Ganzes nach Firestore geschrieben —
  // im selben Firebase-Projekt wie flexokapital.at, nur für dieses Google-Konto lesbar.
  function setSaveStatus(text, cls) {
    if (!autoSaveStatusEl) return;
    autoSaveStatusEl.className = 'save-status-text' + (cls ? ' ' + cls : '');
    autoSaveStatusEl.textContent = text;
  }

  var efsSaveTimer = null;

  function pushEfsSave() {
    efsDocRef.set(collectAppState()).then(function() {
      var t = new Date();
      var hh = ('0' + t.getHours()).slice(-2), mm = ('0' + t.getMinutes()).slice(-2), ss = ('0' + t.getSeconds()).slice(-2);
      setSaveStatus('✓ Automatisch gespeichert um ' + hh + ':' + mm + ':' + ss + '.', 'connected');
    }).catch(function(err) {
      console.error('Speichern fehlgeschlagen:', err);
      setSaveStatus('⚠️ Automatisches Speichern fehlgeschlagen — bitte „Manuell speichern" als Sicherung nutzen.', 'error');
    });
  }

  function scheduleAutoSave() {
    if (!efsDataLoaded) return; // erst speichern, sobald die geladenen Daten wirklich angewendet wurden
    if (efsSaveTimer) clearTimeout(efsSaveTimer);
    efsSaveTimer = setTimeout(pushEfsSave, 700);
  }

  if (btnConnectFile) btnConnectFile.style.display = 'none';

  function recalcCustomers() {
    customersTotal = num(custGesamtEl);
    custNeueDiesenMonat = custMonatEl ? num(custMonatEl) : 0;
    var ownUnits = (typeof raphael !== 'undefined' && raphael) ? (raphael.units || 0) : 0;
    var ownComm = (typeof raphael !== 'undefined' && raphael) ? (raphael.stufe * raphael.units) : 0;
    if (custEhProKundeEl) {
      custEhProKundeEl.textContent = custNeueDiesenMonat > 0 ? (fmtEh.format(ownUnits / custNeueDiesenMonat) + ' EH/Kunde') : '–';
    }
    if (custUmsatzProKundeEl) {
      custUmsatzProKundeEl.textContent = custNeueDiesenMonat > 0 ? (euro(ownComm / custNeueDiesenMonat) + '/Kunde') : '–';
    }
    // Ø je Mitarbeiter: Struktur-Gesamtvolumen bzw. -Provision (von teamRecalc() gepflegt) durch die
    // Anzahl der Mitarbeiter — nicht Raphael selbst, sondern nur seine tatsächliche Struktur.
    var teamCount = (typeof team !== 'undefined' && team) ? team.length : 0;
    if (mitarbeiterEhProKopfEl) {
      mitarbeiterEhProKopfEl.textContent = teamCount > 0 ? (fmtEh.format((lastTopLevelVolume || 0) / teamCount) + ' EH/MA') : '–';
    }
    if (mitarbeiterUmsatzProKopfEl) {
      mitarbeiterUmsatzProKopfEl.textContent = teamCount > 0 ? (euro((lastTotalTeamComm || 0) / teamCount) + '/MA') : '–';
    }
    scheduleAutoSave();
  }

  raphaelStufeEl.addEventListener('change', function() { raphael.stufe = parseFloat(raphaelStufeEl.value); teamRecalc(); });
  raphaelUnitsEl.addEventListener('input', function() {
    var newVal = num(raphaelUnitsEl);
    var delta = newVal - raphael.units;
    raphael.units = newVal;
    raphael.historicalUnits = Math.max(0, (raphael.historicalUnits || 0) + delta);
    raphaelHistEl.value = raphael.historicalUnits;
    teamRecalc();
    if (typeof recalcCustomers === 'function') recalcCustomers();
  });
  raphaelHistEl.addEventListener('input', function() { raphael.historicalUnits = num(raphaelHistEl); teamRecalc(); });
  btnAddPerson.addEventListener('click', addPerson);
  goalEls.struktur.target.addEventListener('input', function() { teamGoals.struktur = num(goalEls.struktur.target); teamRecalc(); });
  goalEls.eigen.target.addEventListener('input', function() { teamGoals.eigen = num(goalEls.eigen.target); teamRecalc(); });
  custGesamtEl.addEventListener('input', recalcCustomers);
  if (custMonatEl) custMonatEl.addEventListener('input', recalcCustomers);
  stufeGoalEl.addEventListener('input', function() { stufeZiel = num(stufeGoalEl); teamRecalc(); });
  if (stufeGoalGesamtEl) stufeGoalGesamtEl.addEventListener('input', function() { stufeZielGesamt = num(stufeGoalGesamtEl); teamRecalc(); });

  btnUmsatzFromVerdienst.addEventListener('click', function() {
    var umsatzEl = document.getElementById('umsatz');
    umsatzEl.value = Math.round(raphaelMonthlyTotal * 12);
    umsatzEl.dispatchEvent(new Event('input', { bubbles: true }));
    umsatzFromVerdienstHintEl.textContent = 'Übernommen: ' + euro(raphaelMonthlyTotal) + ' × 12 = ' + euro(raphaelMonthlyTotal * 12) + '. Passt das nicht genau, einfach direkt im Feld oben anpassen.';
  });

  btnExportTeam.addEventListener('click', function() {
    var data = JSON.stringify(collectAppState(), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'efs-dashboard-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  btnImportTeam.addEventListener('change', function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var st = JSON.parse(reader.result);
        applyAppState(st);
        scheduleAutoSave();
      } catch (err) {
        alert('Diese Datei konnte nicht gelesen werden — ist es eine gültige „Manuell speichern"-JSON-Datei aus diesem Dashboard?');
      }
      btnImportTeam.value = '';
    };
    reader.readAsText(file);
  });

  // ---------- Dokumente: eigene Ordnerstruktur im Dashboard ----------
  // Ordner und Dateien leben komplett innerhalb des Dashboards (kein externer Ordnerzugriff mehr) —
  // Dateien werden als Data-URL im normalen App-Zustand gespeichert und laufen damit automatisch
  // über denselben Speicherweg wie alles andere hier (lokaler Sync-Dienst / manuelles JSON).
  var docFolders = [
    { id: 'docf1', name: 'Persönliche Dokumente', parentId: null },
    { id: 'docf2', name: 'Dokumente', parentId: null },
    { id: 'docf3', name: 'VA (Ausbildung)', parentId: null },
    { id: 'docf4', name: 'Sonstige Unterlagen', parentId: null }
  ];
  var docFiles = [];
  var docFolderIdSeq = 4;
  var docFileIdSeq = 0;
  var currentDocFolderId = null; // null = Wurzelebene
  var docsSearchTerm = '';
  var pendingDocAssignees = [];
  var DOC_MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB Warnschwelle, damit der gespeicherte Zustand nicht zu groß wird

  var docsSearchInputEl = document.getElementById('docsSearchInput');
  var docsBreadcrumbEl = document.getElementById('docsBreadcrumb');
  var docFolderNameInputEl = document.getElementById('docFolderNameInput');
  var btnAddDocFolderEl = document.getElementById('btnAddDocFolder');
  var docUploadInputEl = document.getElementById('docUploadInput');
  var docAssignPickerEl = document.getElementById('docAssignPicker');
  var docsContentEl = document.getElementById('docsContent');

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return toFixedAT(bytes / (1024 * 1024), 1) + ' MB';
  }

  function formatDocDate(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
  }

  function docFolderChildren(parentId) {
    return docFolders.filter(function(f) { return (f.parentId || null) === (parentId || null); });
  }
  function docFilesInFolder(folderId) {
    return docFiles.filter(function(f) { return (f.folderId || null) === (folderId || null); });
  }
  function docFolderPath(id) {
    var path = [];
    var cur = id;
    var guard = 0;
    while (cur && guard < 20) {
      var f = docFolders.find(function(x) { return x.id === cur; });
      if (!f) break;
      path.unshift(f);
      cur = f.parentId;
      guard++;
    }
    return path;
  }
  function personDocCount(id) {
    return docFiles.filter(function(f) { return (f.assignedTo || []).indexOf(id) !== -1; }).length;
  }

  // Pillen-Auswahl "Ich" + alle Mitarbeiter, gilt für als Nächstes hochgeladene Dateien.
  function renderDocAssignOptions() {
    if (!docAssignPickerEl) return;
    var list = (typeof team !== 'undefined' && team) ? team : [];
    var options = [{ id: 'raphael', name: 'Ich' }].concat(list.map(function(p) { return { id: p.id, name: p.name || '(ohne Namen)' }; }));
    docAssignPickerEl.innerHTML = options.map(function(o) {
      var active = pendingDocAssignees.indexOf(o.id) !== -1;
      return '<button type="button" class="note-assign-pill' + (active ? ' active' : '') + '" data-id="' + o.id + '">' + escapeHtml(o.name) + '</button>';
    }).join('');
    docAssignPickerEl.querySelectorAll('.note-assign-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-id');
        var idx = pendingDocAssignees.indexOf(id);
        if (idx === -1) pendingDocAssignees.push(id); else pendingDocAssignees.splice(idx, 1);
        renderDocAssignOptions();
      });
    });
  }

  function renderDocBreadcrumb() {
    if (!docsBreadcrumbEl) return;
    var path = docFolderPath(currentDocFolderId);
    var parts = ['<button type="button" class="' + (currentDocFolderId === null ? 'current' : '') + '" data-folder="">🏠 Alle Dokumente</button>'];
    path.forEach(function(f, i) {
      parts.push('<span class="sep">›</span>');
      var isCurrent = i === path.length - 1;
      parts.push('<button type="button" class="' + (isCurrent ? 'current' : '') + '" data-folder="' + f.id + '">' + escapeHtml(f.name) + '</button>');
    });
    docsBreadcrumbEl.innerHTML = parts.join('');
    docsBreadcrumbEl.querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() { navigateDocFolder(btn.getAttribute('data-folder') || null); });
    });
  }

  function buildDocFileRowHtml(f, showPath) {
    var assignNames = (f.assignedTo || []).map(personName).filter(Boolean);
    var pathParts = showPath ? docFolderPath(f.folderId).map(function(pf) { return pf.name; }) : [];
    return '' +
      '<li class="doc-file" data-id="' + f.id + '">' +
        '<span class="doc-name-wrap"><span class="doc-name">' + escapeHtml(f.name) + '</span>' +
          (pathParts.length ? '<span class="doc-path-hint">in ' + escapeHtml(pathParts.join(' › ')) + '</span>' : '') +
        '</span>' +
        '<span class="doc-right">' +
          (assignNames.length ? '<span class="doc-assignees">👤 ' + escapeHtml(assignNames.join(', ')) + '</span>' : '') +
          '<span class="doc-size">' + escapeHtml(formatBytes(f.size)) + '</span>' +
          '<span class="doc-date">' + escapeHtml(formatDocDate(f.addedAt)) + '</span>' +
          '<button type="button" class="btn-remove doc-remove" data-type="file" data-id="' + f.id + '" title="Löschen">✕</button>' +
        '</span>' +
      '</li>';
  }

  function renderDocsBrowser() {
    if (!docsContentEl) return;
    renderDocBreadcrumb();
    var term = docsSearchTerm.trim().toLowerCase();

    if (term) {
      var matches = docFiles.filter(function(f) { return f.name.toLowerCase().indexOf(term) !== -1; })
        .slice().sort(function(a, b) { return a.name.localeCompare(b.name, 'de'); });
      docsContentEl.innerHTML = matches.length
        ? ('<ul class="doc-list">' + matches.map(function(f) { return buildDocFileRowHtml(f, true); }).join('') + '</ul>')
        : ('<div class="empty-state">Keine Dateien gefunden für „' + escapeHtml(docsSearchTerm) + '".</div>');
      wireDocsContentEvents();
      return;
    }

    var subfolders = docFolderChildren(currentDocFolderId).slice().sort(function(a, b) { return a.name.localeCompare(b.name, 'de'); });
    var files = docFilesInFolder(currentDocFolderId).slice().sort(function(a, b) { return a.name.localeCompare(b.name, 'de'); });

    if (!subfolders.length && !files.length) {
      docsContentEl.innerHTML = '<div class="empty-state">Dieser Ordner ist leer — leg einen Unterordner an oder lade eine Datei hoch.</div>';
      return;
    }

    var html = '<ul class="doc-list">';
    html += subfolders.map(function(f) {
      var count = docFilesInFolder(f.id).length + docFolderChildren(f.id).length;
      return '' +
        '<li class="doc-folder-row" data-folder="' + f.id + '">' +
          '<span class="doc-name-wrap"><span class="folder-icon">📁</span><span class="doc-name">' + escapeHtml(f.name) + '</span></span>' +
          '<span class="doc-right"><span class="doc-size">' + count + (count === 1 ? ' Eintrag' : ' Einträge') + '</span><button type="button" class="btn-remove doc-remove" data-type="folder" data-id="' + f.id + '" title="Ordner löschen">✕</button></span>' +
        '</li>';
    }).join('');
    html += files.map(function(f) { return buildDocFileRowHtml(f, false); }).join('');
    html += '</ul>';
    docsContentEl.innerHTML = html;
    wireDocsContentEvents();
  }

  function wireDocsContentEvents() {
    docsContentEl.querySelectorAll('.doc-folder-row').forEach(function(li) {
      li.addEventListener('click', function(e) {
        if (e.target.closest('.doc-remove')) return;
        navigateDocFolder(li.getAttribute('data-folder'));
      });
    });
    docsContentEl.querySelectorAll('.doc-file').forEach(function(li) {
      li.addEventListener('click', function(e) {
        if (e.target.closest('.doc-remove')) return;
        openDocFile(li.getAttribute('data-id'));
      });
    });
    docsContentEl.querySelectorAll('.doc-remove[data-type="folder"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); removeDocFolder(btn.getAttribute('data-id')); });
    });
    docsContentEl.querySelectorAll('.doc-remove[data-type="file"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); removeDocFile(btn.getAttribute('data-id')); });
    });
  }

  function navigateDocFolder(id) {
    currentDocFolderId = id || null;
    docsSearchTerm = '';
    if (docsSearchInputEl) docsSearchInputEl.value = '';
    renderDocsBrowser();
  }

  function addDocFolder(name) {
    name = (name || '').trim();
    if (!name) return;
    docFolderIdSeq += 1;
    docFolders.push({ id: 'docf' + docFolderIdSeq, name: name, parentId: currentDocFolderId });
    renderDocsBrowser();
    scheduleAutoSave();
  }

  function collectDocFolderAndDescendantIds(id) {
    var ids = [id];
    docFolderChildren(id).forEach(function(child) { ids = ids.concat(collectDocFolderAndDescendantIds(child.id)); });
    return ids;
  }

  function removeDocFolder(id) {
    var idsToRemove = collectDocFolderAndDescendantIds(id);
    docFolders = docFolders.filter(function(f) { return idsToRemove.indexOf(f.id) === -1; });
    docFiles = docFiles.filter(function(f) { return idsToRemove.indexOf(f.folderId) === -1; });
    renderDocsBrowser();
    if (typeof renderOrgTree === 'function') renderOrgTree();
    if (typeof renderPersonDetail === 'function') renderPersonDetail();
    scheduleAutoSave();
  }

  function removeDocFile(id) {
    docFiles = docFiles.filter(function(f) { return f.id !== id; });
    renderDocsBrowser();
    if (typeof renderOrgTree === 'function') renderOrgTree();
    if (typeof renderPersonDetail === 'function') renderPersonDetail();
    scheduleAutoSave();
  }

  function openDocFile(id) {
    var f = docFiles.find(function(x) { return x.id === id; });
    if (!f || !f.dataUrl) return;
    window.open(f.dataUrl, '_blank');
  }

  function readFileAsDataUrl(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  function addDocFiles(fileList) {
    if (!fileList || !fileList.length) return Promise.resolve();
    var files = Array.prototype.slice.call(fileList);
    var tooBig = files.filter(function(f) { return f.size > DOC_MAX_FILE_BYTES; });
    var okFiles = files.filter(function(f) { return f.size <= DOC_MAX_FILE_BYTES; });
    var chain = Promise.resolve();
    okFiles.forEach(function(file) {
      chain = chain.then(function() {
        return readFileAsDataUrl(file).then(function(dataUrl) {
          docFileIdSeq += 1;
          docFiles.push({
            id: 'docfile' + docFileIdSeq,
            folderId: currentDocFolderId,
            name: file.name,
            size: file.size,
            mime: file.type || '',
            addedAt: Date.now(),
            assignedTo: pendingDocAssignees.slice(),
            dataUrl: dataUrl
          });
        });
      });
    });
    return chain.then(function() {
      pendingDocAssignees = [];
      renderDocAssignOptions();
      renderDocsBrowser();
      if (typeof renderOrgTree === 'function') renderOrgTree();
      if (typeof renderPersonDetail === 'function') renderPersonDetail();
      scheduleAutoSave();
      if (tooBig.length) {
        alert('Diese Datei(en) sind größer als 15 MB und wurden übersprungen, damit das Dashboard nicht zu groß wird: ' + tooBig.map(function(f) { return f.name; }).join(', '));
      }
    });
  }

  if (docsSearchInputEl) {
    docsSearchInputEl.addEventListener('input', function() {
      docsSearchTerm = docsSearchInputEl.value;
      renderDocsBrowser();
    });
  }
  if (btnAddDocFolderEl) {
    btnAddDocFolderEl.addEventListener('click', function() {
      addDocFolder(docFolderNameInputEl.value);
      docFolderNameInputEl.value = '';
      docFolderNameInputEl.focus();
    });
  }
  if (docFolderNameInputEl) {
    docFolderNameInputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); addDocFolder(docFolderNameInputEl.value); docFolderNameInputEl.value = ''; }
    });
  }
  if (docUploadInputEl) {
    docUploadInputEl.addEventListener('change', function(e) {
      addDocFiles(e.target.files).then(function() { docUploadInputEl.value = ''; });
    });
  }

  renderTeamTable();
  teamRecalc();
  recalcCustomers();
  renderNotes();
  if (typeof renderNaechsteTermine === 'function') renderNaechsteTermine();
  if (typeof renderHeute === 'function') renderHeute();
  renderDocAssignOptions();
  renderDocsBrowser();
  // Baseline für den Monatswechsel-Reset, falls (noch) keine gespeicherten Daten geladen werden —
  // wird andernfalls, sobald geladene Daten eintreffen, in applyAppState() mit dem korrekten
  // zuletzt gespeicherten Monat überschrieben und dort erneut korrekt geprüft.
  checkMonthRollover();

})();
