(function(){
  var prefersReduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Firebase (Leads-Speicherung) ----
  // Nach Anlegen des Firebase-Projekts hier die echten Werte eintragen:
  // Projekteinstellungen (Zahnrad oben links) -> "Meine Apps" -> Web-App
  // anlegen -> der angezeigte firebaseConfig-Block kommt hier rein.
  // Diese Werte sind alle oeffentlich unbedenklich -- der eigentliche Schutz
  // laeuft ueber die Firestore-Sicherheitsregeln (firestore.rules), nicht
  // ueber Geheimhaltung dieser Werte.
  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAAM0T4LjFNpm8K3pohfJVB5w8LA3zHrWQ',
    authDomain: 'flexokapital.firebaseapp.com',
    projectId: 'flexokapital',
    storageBucket: 'flexokapital.firebasestorage.app',
    messagingSenderId: '663972345841',
    appId: '1:663972345841:web:63bb7e1e00eb9e410eb650'
  };
  var leadsCollection = null;
  if(FIREBASE_CONFIG.apiKey.indexOf('DEIN_') !== 0 && window.firebase){
    firebase.initializeApp(FIREBASE_CONFIG);
    leadsCollection = firebase.firestore().collection('leads');
  }

  function saveLead(payload){
    if(!leadsCollection){
      console.warn('Firebase ist noch nicht konfiguriert (siehe FIREBASE_CONFIG) -- Lead wurde NICHT gespeichert:', payload);
      return Promise.resolve({ok:false});
    }
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    return leadsCollection.add(payload).then(function(){
      return {ok:true};
    }).catch(function(err){
      console.error('Lead konnte nicht gespeichert werden:', err);
      return {ok:false, error:err};
    });
  }

  // ---- EmailJS (automatische Bestätigungsmail) ----
  var EMAILJS_PUBLIC_KEY = 'KrqqtVAW5EXiJlnEU';
  var EMAILJS_SERVICE_ID = 'service_office';
  var EMAILJS_TEMPLATE_FUNNEL = 'template_31eunzx';   // Erstgespräch-Funnel (mit Telefonnummer)
  var EMAILJS_TEMPLATE_KONTAKT = 'template_dvkkkw9';  // einfaches Kontaktformular (ohne Telefonnummer)
  if(window.emailjs){
    emailjs.init({publicKey: EMAILJS_PUBLIC_KEY});
  }

  function sendConfirmationEmail(templateId, params){
    if(!window.emailjs) return;
    emailjs.send(EMAILJS_SERVICE_ID, templateId, params).catch(function(err){
      console.error('Bestätigungsmail konnte nicht gesendet werden:', err);
    });
  }

  // ---- navigation (hash-based, single file "pages") ----
  var pages = ['start','warum','leistungen','ueber-mich','kontakt','erstgespraech','impressum','datenschutz'];
  var mobileMenu = document.getElementById('mobileMenu');
  var mobileToggle = document.getElementById('mobileNavToggle');
  function closeMobileMenu(){
    mobileMenu.classList.remove('open');
    mobileToggle.setAttribute('aria-expanded','false');
  }

  // ---- header: sticky scroll state ----
  var headerEl = document.querySelector('header');
  function onScroll(){
    headerEl.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  // ---- desktop nav: sliding active-page indicator ----
  var navLinks = document.querySelector('nav.links');
  var navIndicator = document.createElement('div');
  navIndicator.className = 'nav-indicator';
  navLinks.insertBefore(navIndicator, navLinks.firstChild);
  function updateNavIndicator(skipTransition){
    var active = navLinks.querySelector('button[aria-current="page"]');
    if(!active || navLinks.offsetWidth === 0){ navIndicator.style.opacity = 0; return; }
    if(skipTransition) navIndicator.style.transition = 'none';
    navIndicator.style.opacity = 1;
    navIndicator.style.width = active.offsetWidth + 'px';
    navIndicator.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    if(skipTransition){
      void navIndicator.offsetWidth;
      navIndicator.style.transition = '';
    }
  }
  var navResizeTimer;
  window.addEventListener('resize', function(){
    clearTimeout(navResizeTimer);
    navResizeTimer = setTimeout(function(){ updateNavIndicator(true); }, 120);
  });
  function showPage(id, push){
    if(pages.indexOf(id) === -1) id = 'start';
    var current = document.querySelector('section.page:not([hidden])');
    var next = document.getElementById('page-'+id);
    function activate(){
      pages.forEach(function(p){
        var el = document.getElementById('page-'+p);
        if(el){ el.hidden = (p !== id); el.classList.remove('page-out'); }
      });
      if(next){
        next.classList.remove('page-in');
        void next.offsetWidth; // reflow, so the enter animation replays every switch
        next.classList.add('page-in');
      }
      document.querySelectorAll('nav.links button, .mobile-menu button').forEach(function(b){
        if(b.dataset.nav === id) b.setAttribute('aria-current','page');
        else b.removeAttribute('aria-current');
      });
      document.body.classList.toggle('funnel-active', id === 'erstgespraech');
      if(id === 'erstgespraech' && typeof resetFunnel === 'function') resetFunnel();
      updateNavIndicator();
      if(push !== false) history.replaceState(null,'','#'+id);
      window.scrollTo({top:0,behavior:'instant' in window ? 'instant' : 'auto'});
      closeMobileMenu();
    }
    if(current && current !== next && !prefersReduced){
      current.classList.add('page-out');
      setTimeout(activate, 160);
    } else {
      activate();
    }
  }
  document.querySelectorAll('[data-nav]').forEach(function(el){
    el.addEventListener('click', function(){ showPage(this.dataset.nav); });
  });
  mobileToggle.addEventListener('click', function(){
    var open = mobileMenu.classList.toggle('open');
    mobileToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('hashchange', function(){
    showPage(location.hash.replace('#',''));
  });
  showPage(location.hash ? location.hash.replace('#','') : 'start', false);
  updateNavIndicator(true);

  // ---- scroll-reveal for cards/rows/tiles, staggered by position among siblings ----
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if(prefersReduced || !('IntersectionObserver' in window)){
    revealEls.forEach(function(el){ el.classList.add('in'); });
  } else {
    revealEls.forEach(function(el){
      var siblings = Array.prototype.filter.call(el.parentElement.children, function(c){
        return c.classList.contains('reveal');
      });
      el.style.transitionDelay = Math.min(siblings.indexOf(el) * 70, 420) + 'ms';
    });
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, {threshold:0.15, rootMargin:'0px 0px -60px 0px'});
    revealEls.forEach(function(el){ io.observe(el); });
  }

  // ---- Erstgespräch funnel ----
  var funnelQuestions = [
    {field:'ziel', q:'Was ist dir bei deiner Geldanlage am wichtigsten?', options:[
      ['vermoegen','Vermögen aufbauen'],
      ['arbeiten','Geld arbeiten lassen statt am Sparbuch'],
      ['steuern','Steuern sparen — KESt-befreit'],
      ['starten','Einfach mal anfangen']
    ]},
    {field:'art', q:'Wie möchtest du investieren?', options:[
      ['einmalig','Einmalbetrag'],
      ['monatlich','Monatlich per Sparplan'],
      ['beides','Beides — Einmalbetrag & monatlich'],
      ['unsicher','Weiß ich noch nicht']
    ]},
    {field:'groessenordnung', q:'In welcher Größenordnung denkst du?', options:[
      ['bis5k','bis 5.000 €'],
      ['5-20k','5.000–20.000 €'],
      ['20-50k','20.000–50.000 €'],
      ['50k+','mehr als 50.000 €']
    ]},
    {field:'zeithorizont', q:'Was ist dein Zeithorizont?', options:[]}, // rendered dynamically, see renderStep4()
    {field:'bestehend', q:'Hast du aktuell schon Geld investiert (Fonds, ETFs, Aktien)?', options:[
      ['ja','Ja'],
      ['nur_sparbuch','Nein, nur Sparbuch'],
      ['nichts','Nein, noch gar nichts']
    ]},
    {field:'erfahrung', q:'Wie viel Erfahrung hast du mit Geldanlage?', options:[
      ['einsteiger','Einsteiger'],
      ['etwas','Etwas Erfahrung'],
      ['erfahren','Erfahren']
    ]},
    {field:'entscheidung', q:'Entscheidest du allein oder gemeinsam?', options:[
      ['allein','Allein'],
      ['gemeinsam','Gemeinsam, z. B. mit Partner:in']
    ]},
    {field:'timing', q:'Wann möchtest du starten?', options:[
      ['sofort','Sofort'],
      ['bald','In den nächsten Monaten'],
      ['info','Erstmal nur informieren']
    ]}
  ];
  var funnelState = {step:1, answers:{}};
  var funnelTotal = 10;

  function renderFunnelQuestions(){
    funnelQuestions.forEach(function(q, i){
      if(q.field === 'groessenordnung' || q.field === 'zeithorizont') return; // rendered dynamically
      var stepEl = document.querySelector('.funnel-step[data-step="'+(i+1)+'"]');
      if(!stepEl) return;
      var optsHtml = q.options.map(function(opt){
        return '<button type="button" class="funnel-opt" data-value="'+opt[0]+'" data-label="'+opt[1]+'">'+opt[1]+'</button>';
      }).join('');
      stepEl.innerHTML =
        '<div class="funnel-q"><span class="funnel-eyebrow">0'+(i+1)+' / '+funnelTotal+'</span><h2>'+q.q+'</h2></div>' +
        '<div class="funnel-options" data-field="'+q.field+'">'+optsHtml+'</div>';
    });
  }
  renderFunnelQuestions();

  // ---- comparison table (Startseite): flexo.kapital vs. andere Wege ----
  var compareCols = [
    {label:'flexo.kapital', badge:'Direkt und unabhängig', highlight:true},
    {label:'Bankfiliale'},
    {label:'Fondsgebundene Lebensversicherung'},
    {label:'Online-Broker / Robo-Advisor'},
    {label:'Klassischer Vermittler', badge:'Einmalabschluss'}
  ];
  var compareRows = [
    {feature:'Persönlicher, unabhängiger Ansprechpartner', vals:['yes','mid','mid','no','mid']},
    {feature:'Einfach, verständlich und kompetent erklärt', vals:['yes','mid','no','no','mid']},
    {feature:'Zugang zu KESt-freier Vorsorge', vals:['yes','no','yes','no','mid']},
    {feature:'Kein Verkaufsdruck', vals:['yes','mid','no','yes','no']},
    {feature:'Keine hohen Mindestanlagen', vals:['yes','mid','mid','yes','mid']},
    {feature:'Laufende Begleitung statt Einmal-Termin', vals:['yes','mid','no','no','no']},
    {feature:'Kostenloses, unverbindliches Erstgespräch', vals:['yes','mid','mid','no','mid']}
  ];
  var cmpIcons = {
    yes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>',
    mid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14"/></svg>',
    no:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };
  var cmpTitle = {yes:'trifft zu', mid:'teilweise', no:'trifft nicht zu'};
  function renderCompareTable(){
    var head = document.getElementById('compareHead');
    var body = document.getElementById('compareBody');
    if(!head || !body) return;
    head.innerHTML = '<th></th>' + compareCols.map(function(c){
      var badge = c.badge ? '<span class="compare-badge'+(c.highlight ? ' is-accent' : '')+'">'+c.badge+'</span>' : '';
      return '<th'+(c.highlight ? ' class="is-highlight"' : '')+'><span class="compare-col-title">'+c.label+'</span>'+badge+'</th>';
    }).join('');
    body.innerHTML = compareRows.map(function(row, i){
      var cells = row.vals.map(function(v){
        return '<td><span class="cmp-icon cmp-'+v+'" title="'+cmpTitle[v]+'">'+cmpIcons[v]+'</span></td>';
      }).join('');
      return '<tr'+(i % 2 === 1 ? ' class="cmp-row-alt"' : '')+'><td>'+row.feature+'</td>'+cells+'</tr>';
    }).join('');
  }
  renderCompareTable();

  // Step 3 depends on the answer to step 2 ("Wie möchtest du investieren?"):
  // lump sum, monthly savings rate, or both — each gets realistic, matching ranges.
  var funnelLumpOptions = [
    ['bis5k','bis 5.000 €'],
    ['5-20k','5.000–20.000 €'],
    ['20-50k','20.000–50.000 €'],
    ['50k+','mehr als 50.000 €']
  ];
  var funnelRateOptions = [
    ['bis150','bis 150 €'],
    ['150-400','150–400 €'],
    ['400-800','400–800 €'],
    ['800-1500','800–1.500 €'],
    ['1500+','mehr als 1.500 €']
  ];
  function funnelOptsHtml(field, opts){
    return '<div class="funnel-options" data-field="'+field+'">' +
      opts.map(function(opt){
        return '<button type="button" class="funnel-opt" data-value="'+opt[0]+'" data-label="'+opt[1]+'">'+opt[1]+'</button>';
      }).join('') +
      '</div>';
  }
  function renderStep3(){
    var stepEl = document.querySelector('.funnel-step[data-step="3"]');
    if(!stepEl) return;
    var artVal = funnelState.answers.art ? funnelState.answers.art.value : 'einmalig';
    var eyebrow = '<span class="funnel-eyebrow">03 / '+funnelTotal+'</span>';
    var html;
    if(artVal === 'monatlich'){
      html = '<div class="funnel-q">'+eyebrow+'<h2>Wie viel möchtest du monatlich investieren?</h2></div>' +
        funnelOptsHtml('sparrate', funnelRateOptions);
    } else if(artVal === 'beides'){
      html = '<div class="funnel-q">'+eyebrow+'<h2>Wie viel möchtest du investieren?</h2><p>Einmalig und monatlich — wähl bei beidem eine Größenordnung.</p></div>' +
        '<div class="funnel-opt-group-label">Einmalbetrag</div>' + funnelOptsHtml('einmalbetrag', funnelLumpOptions) +
        '<div class="funnel-opt-group-label">Monatliche Sparrate</div>' + funnelOptsHtml('sparrate', funnelRateOptions);
    } else {
      html = '<div class="funnel-q">'+eyebrow+'<h2>In welcher Größenordnung denkst du?</h2></div>' +
        funnelOptsHtml('groessenordnung', funnelLumpOptions);
    }
    stepEl.innerHTML = html;
  }

  // Step 4 (Zeithorizont) also depends on step 2: the product only really
  // pays off over longer horizons, and that's even more true for someone
  // investing purely via monthly Sparplan (no lump sum), so that path gets
  // noticeably longer bands than everyone else.
  var funnelZeithorizontGeneral = [
    ['kurz','unter 15 Jahre'],
    ['mittel','15–20 Jahre'],
    ['lang','20–25 Jahre'],
    ['sehr_lang','mehr als 25 Jahre']
  ];
  var funnelZeithorizontMonatlich = [
    ['kurz','unter 20 Jahre'],
    ['mittel','20–25 Jahre'],
    ['lang','25–30 Jahre'],
    ['sehr_lang','mehr als 30 Jahre']
  ];
  function renderStep4(){
    var stepEl = document.querySelector('.funnel-step[data-step="4"]');
    if(!stepEl) return;
    var artVal = funnelState.answers.art ? funnelState.answers.art.value : 'einmalig';
    var opts = artVal === 'monatlich' ? funnelZeithorizontMonatlich : funnelZeithorizontGeneral;
    var eyebrow = '<span class="funnel-eyebrow">04 / '+funnelTotal+'</span>';
    stepEl.innerHTML = '<div class="funnel-q">'+eyebrow+'<h2>Was ist dein Zeithorizont?</h2></div>' +
      funnelOptsHtml('zeithorizont', opts);
  }

  function updateFunnelProgress(){
    var fill = document.getElementById('funnelFill');
    var label = document.getElementById('funnelLabel');
    if(!fill || !label) return;
    fill.style.width = Math.round((funnelState.step/funnelTotal)*100) + '%';
    label.textContent = 'Schritt '+funnelState.step+' von '+funnelTotal;
  }

  function funnelGoTo(n){
    document.querySelectorAll('.funnel-step').forEach(function(s){ s.classList.remove('active'); });
    var target = document.querySelector('.funnel-step[data-step="'+n+'"]');
    if(target) target.classList.add('active');
    funnelState.step = n;
    var back = document.getElementById('funnelBack');
    if(back) back.hidden = (n === 1);
    if(n === 3 && !target.innerHTML.trim()) renderStep3();
    if(n === 4 && !target.innerHTML.trim()) renderStep4();
    updateFunnelProgress();
  }

  function resetFunnel(){
    funnelState.step = 1;
    funnelState.answers = {};
    document.querySelectorAll('.funnel-opt.selected').forEach(function(b){ b.classList.remove('selected'); });
    var form = document.getElementById('funnelContactForm');
    if(form) form.reset();
    funnelGoTo(1);
  }

  function buildFunnelNotes(){
    var lines = funnelQuestions.map(function(q){
      var a = funnelState.answers[q.field];
      return a ? (q.q + ' → ' + a.label) : null;
    }).filter(Boolean);
    if(funnelState.answers.einmalbetrag) lines.push('Einmalbetrag → ' + funnelState.answers.einmalbetrag.label);
    if(funnelState.answers.sparrate) lines.push('Monatliche Sparrate → ' + funnelState.answers.sparrate.label);
    return lines.join(' | ');
  }

  var funnelStage = document.getElementById('funnelStage');
  if(funnelStage){
    funnelStage.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('.funnel-opt');
      if(!btn) return;
      var group = btn.closest('.funnel-options');
      group.querySelectorAll('.funnel-opt').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
      funnelState.answers[group.dataset.field] = {value:btn.dataset.value, label:btn.dataset.label};

      // the amount question (step 3) depends on this answer, and its field
      // names change between paths, so drop any stale answer and re-render.
      if(group.dataset.field === 'art'){
        delete funnelState.answers.groessenordnung;
        delete funnelState.answers.einmalbetrag;
        delete funnelState.answers.sparrate;
        delete funnelState.answers.zeithorizont;
        renderStep3();
        renderStep4();
      }

      // a step can hold more than one option group (e.g. "beides" asks for
      // both a lump sum and a monthly rate) — only advance once every group
      // on the current step has an answer.
      var activeStep = document.querySelector('.funnel-step.active');
      var allGroups = activeStep ? activeStep.querySelectorAll('.funnel-options') : [];
      var allAnswered = Array.prototype.every.call(allGroups, function(g){
        return g.querySelector('.funnel-opt.selected') !== null;
      });
      if(!allAnswered) return;

      var next = funnelState.step + 1;
      if(prefersReduced){ funnelGoTo(next); }
      else { setTimeout(function(){ funnelGoTo(next); }, 320); }
    });
  }
  var funnelBackBtn = document.getElementById('funnelBack');
  if(funnelBackBtn){
    funnelBackBtn.addEventListener('click', function(){
      if(funnelState.step > 1) funnelGoTo(funnelState.step - 1);
    });
  }
  var funnelContactForm = document.getElementById('funnelContactForm');
  if(funnelContactForm){
    funnelContactForm.addEventListener('submit', function(e){
      e.preventDefault();
      if(!funnelContactForm.checkValidity()){ funnelContactForm.reportValidity(); return; }
      funnelState.answers._name = document.getElementById('funnelName').value.trim();
      funnelState.answers._email = document.getElementById('funnelEmail').value.trim();
      funnelState.answers._phone = document.getElementById('funnelPhone').value.trim();
      var funnelVisitorNote = document.getElementById('funnelNote').value.trim();
      saveLead({
        source: 'erstgespraech_funnel',
        name: funnelState.answers._name,
        email: funnelState.answers._email,
        phone: funnelState.answers._phone,
        message: buildFunnelNotes(),
        visitorNote: funnelVisitorNote,
        answers: funnelState.answers
      }).then(function(res){
        if(res.ok){
          if(typeof fbq === 'function') fbq('track', 'Lead', {content_category: 'erstgespraech_funnel'});
          sendConfirmationEmail(EMAILJS_TEMPLATE_FUNNEL, {
            name: funnelState.answers._name,
            email: funnelState.answers._email,
            phone: funnelState.answers._phone,
            note: funnelVisitorNote
          });
        }
      });
      funnelGoTo(funnelTotal);
    });
  }
  var contactMsgForm = document.getElementById('contactMsgForm');
  if(contactMsgForm){
    contactMsgForm.addEventListener('submit', function(e){
      e.preventDefault();
      var statusEl = document.getElementById('contactMsgStatus');
      if(!contactMsgForm.checkValidity()){ contactMsgForm.reportValidity(); return; }
      var submitBtn = contactMsgForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      statusEl.style.color = 'var(--text-dim)';
      statusEl.textContent = 'Wird gesendet …';
      var contactMsgName = document.getElementById('f-name').value.trim();
      var contactMsgEmail = document.getElementById('f-mail').value.trim();
      var contactMsgText = document.getElementById('f-msg').value.trim();
      saveLead({
        source: 'kontaktformular',
        name: contactMsgName,
        email: contactMsgEmail,
        message: contactMsgText
      }).then(function(res){
        submitBtn.disabled = false;
        if(res.ok){
          statusEl.style.color = 'var(--success, #4FBF8B)';
          statusEl.textContent = 'Danke! Wir melden uns bald bei dir.';
          contactMsgForm.reset();
          if(typeof fbq === 'function') fbq('track', 'Lead', {content_category: 'kontaktformular'});
          sendConfirmationEmail(EMAILJS_TEMPLATE_KONTAKT, {
            name: contactMsgName,
            email: contactMsgEmail,
            note: contactMsgText
          });
        } else {
          statusEl.style.color = 'var(--warn, #E0654C)';
          statusEl.textContent = 'Senden hat nicht geklappt — schreib uns bitte direkt an office@flexokapital.at';
        }
      });
    });
  }
  document.addEventListener('keydown', function(e){
    if(!document.body.classList.contains('funnel-active')) return;
    var activeStep = document.querySelector('.funnel-step.active');
    if(!activeStep) return;
    var opts = activeStep.querySelectorAll('.funnel-opt');
    if(!opts.length) return;
    var n = parseInt(e.key, 10);
    if(n >= 1 && n <= opts.length) opts[n-1].click();
  });
})();
