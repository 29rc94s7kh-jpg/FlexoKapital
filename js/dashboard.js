(function(){
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

  var loginGate = document.getElementById('loginGate');
  var loginError = document.getElementById('loginError');
  var deniedGate = document.getElementById('deniedGate');
  var dashboardContent = document.getElementById('dashboardContent');
  var efsView = document.getElementById('efsView');
  var viewNav = document.getElementById('viewNav');
  var userRow = document.getElementById('userRow');
  var userEmail = document.getElementById('userEmail');
  var statusLine = document.getElementById('statusLine');
  var leadsBody = document.getElementById('leadsBody');
  var emptyState = document.getElementById('emptyState');
  var searchInput = document.getElementById('searchInput');
  var statusFilter = document.getElementById('statusFilter');
  var sourceFilter = document.getElementById('sourceFilter');
  var trashToggleBtn = document.getElementById('trashToggleBtn');
  var unsubscribeLeads = null;
  var allLeadDocs = [];
  var expandedLeadId = null;   // immer nur ein Lead aufgeklappt
  var scrollToLeadId = null;
  var pendingApptId = null;    // Lead, bei dem für "Termin vereinbart" noch Datum/Uhrzeit fehlt

  // Rückruf-Erinnerung: n Tage nach dem letzten Anruf, bis max. 4 Anrufe
  var CALLBACK_DAYS = 3;
  var MAX_CALLS = 4;
  var viewingTrash = false;

  var STATUS_META = {
    '': {label: 'Neu', color: 'var(--muted)', bg: 'rgba(143,160,166,.16)'},
    'kontaktiert': {label: 'Kontaktiert', color: 'var(--accent)', bg: 'var(--accent-soft)'},
    'termin': {label: 'Termin vereinbart', color: '#A78BFA', bg: 'rgba(167,139,250,.16)'},
    'abschluss': {label: 'Abschluss', color: 'var(--success)', bg: 'rgba(79,191,139,.16)'},
    'kein_interesse': {label: 'Kein Interesse', color: 'var(--warn)', bg: 'rgba(224,101,76,.16)'}
  };

  function applyStatusStyle(select, value){
    var meta = STATUS_META[value] || STATUS_META[''];
    select.style.color = meta.color;
    select.style.background = meta.bg;
  }

  function showOnly(el){
    [loginGate, deniedGate, dashboardContent, efsView].forEach(function(e){ e.hidden = (e !== el); });
  }

  // ---- Bereichs-Navigation (Leads / EFS) ----
  var VIEWS = { leads: 'Leads', efs: 'EFS' };
  var currentView = 'leads';
  var signedIn = false;

  function viewFromHash(){
    var h = (location.hash || '').replace('#', '');
    if(VIEWS[h]) return h;
    try{ var saved = localStorage.getItem('fk_dashboard_view'); if(VIEWS[saved]) return saved; }catch(e){}
    return 'leads';
  }

  function ensureEfsFrame(){
    if(efsView.querySelector('iframe')) return;
    var frame = document.createElement('iframe');
    frame.src = 'efs.html';
    frame.title = 'EFS Dashboard';
    efsView.appendChild(frame);
  }

  function applyView(view){
    currentView = VIEWS[view] ? view : 'leads';
    try{ localStorage.setItem('fk_dashboard_view', currentView); }catch(e){}
    Array.prototype.forEach.call(viewNav.querySelectorAll('a[data-view]'), function(a){
      var active = a.getAttribute('data-view') === currentView;
      a.classList.toggle('active', active);
      if(active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = VIEWS[currentView] + ' \u00b7 flexo.kapital';
    if(!signedIn) return;
    dashboardContent.hidden = currentView !== 'leads';
    efsView.hidden = currentView !== 'efs';
    document.body.classList.toggle('mode-efs', currentView === 'efs');
    if(currentView === 'efs'){
      ensureEfsFrame();
      // Falls das EFS schon unsichtbar im Hintergrund geladen wurde: Layout neu berechnen
      requestAnimationFrame(function(){
        var f = efsView.querySelector('iframe');
        try{ if(f && f.contentWindow) f.contentWindow.dispatchEvent(new Event('resize')); }catch(e){}
      });
    }
  }

  // Zugriff auf das eingebettete EFS-Dashboard (lädt es bei Bedarf unsichtbar im Hintergrund)
  function getEfsApi(){
    ensureEfsFrame();
    var frame = efsView.querySelector('iframe');
    var started = Date.now();
    return new Promise(function(resolve, reject){
      (function poll(){
        var w = null;
        try{ w = frame.contentWindow; }catch(e){}
        if(w && w.efsLeadSync){
          var timer = setTimeout(function(){ reject(new Error('EFS-Daten laden zu lange')); }, 20000);
          w.efsLeadSync.ready().then(function(){ clearTimeout(timer); resolve(w.efsLeadSync); }, function(err){ clearTimeout(timer); reject(err); });
          return;
        }
        if(Date.now() - started > 20000){ reject(new Error('EFS-Dashboard hat nicht geladen')); return; }
        setTimeout(poll, 150);
      })();
    });
  }

  window.addEventListener('hashchange', function(){ applyView(viewFromHash()); });

  function setSignedOutLayout(){
    signedIn = false;
    viewNav.hidden = true;
    document.body.classList.remove('mode-efs');
    efsView.innerHTML = '';
  }

  var AUTH_ERROR_MESSAGES = {
    'auth/popup-blocked': 'Der Anmelde-Popup wurde von deinem Browser blockiert. Bitte Popups f\u00fcr diese Seite erlauben und erneut versuchen.',
    'auth/popup-closed-by-user': 'Anmeldung abgebrochen \u2014 das Popup wurde geschlossen, bevor die Anmeldung fertig war.',
    'auth/unauthorized-domain': 'Diese Domain ist in Firebase noch nicht f\u00fcr die Anmeldung freigeschaltet (Authentication \u2192 Settings \u2192 Authorized domains).',
    'auth/network-request-failed': 'Netzwerkfehler bei der Anmeldung. Bitte Internetverbindung pr\u00fcfen und erneut versuchen.',
    'auth/cancelled-popup-request': null
  };

  function showLoginError(err){
    console.error('Anmeldung fehlgeschlagen:', err);
    var code = err && err.code;
    if(!loginError) return;
    if(AUTH_ERROR_MESSAGES.hasOwnProperty(code) && AUTH_ERROR_MESSAGES[code] === null){
      loginError.hidden = true;
      return;
    }
    loginError.textContent = AUTH_ERROR_MESSAGES[code] || ('Anmeldung fehlgeschlagen (' + (code || 'unbekannter Fehler') + '). Bitte erneut versuchen.');
    loginError.hidden = false;
  }

  document.getElementById('signInBtn').addEventListener('click', function(){
    if(loginError) loginError.hidden = true;
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(showLoginError);
  });
  document.getElementById('signOutBtn').addEventListener('click', function(){ auth.signOut(); });
  document.getElementById('deniedSignOutBtn').addEventListener('click', function(){ auth.signOut(); });

  function formatDate(ts){
    if(!ts || !ts.toDate) return '–';
    return ts.toDate().toLocaleString('de-AT', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function escapeHtml(str){
    var div = document.createElement('div');
    div.textContent = (str === undefined || str === null) ? '' : String(str);
    return div.innerHTML;
  }

  function tsToDate(ts){ return (ts && ts.toDate) ? ts.toDate() : null; }
  function dayStart(d){ var x = new Date(d.getTime()); x.setHours(0,0,0,0); return x; }
  function formatDay(d){ return d.toLocaleDateString('de-AT', {weekday:'short', day:'2-digit', month:'2-digit'}); }

  function callbackInfo(lead){
    var calls = lead.calls || [];
    if(lead.deleted || calls.length === 0) return null;
    var st = lead.status || '';
    if(st === 'termin' || st === 'kein_interesse' || st === 'abschluss') return null;
    if(openAppt(lead) || followUpInfo(lead)) return null;
    if(calls.length >= MAX_CALLS) return {maxed: true};
    var last = null;
    calls.forEach(function(c){ var d = tsToDate(c.at); if(d && (!last || d > last)) last = d; });
    if(!last) return null;
    var due = dayStart(last); due.setDate(due.getDate() + CALLBACK_DAYS);
    var today = dayStart(new Date());
    return {due: due, isDue: due <= today, overdueDays: Math.round((today - due) / 864e5), next: calls.length + 1};
  }
  function openTodoCount(lead){ return (lead.todos || []).filter(function(t){ return !t.done; }).length; }
  function todoDue(t){ return tsToDate(t.due); }
  function isTodoOverdue(t){ var d = todoDue(t); return !t.done && d && d <= new Date(); }
  function formatDueFull(d){ return formatDay(d) + ' · ' + d.toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'}); }
  // Erinnerung für den Server: nur ein Zeitpunkt, kein Text, keine Namen
  function setReminder(rid, d){
    if(!rid || !d || d <= new Date()) return Promise.resolve();
    return db.collection('reminders').doc(rid).set({ at: firebase.firestore.Timestamp.fromDate(d) }).catch(function(err){ console.error('Erinnerung konnte nicht gespeichert werden:', err); });
  }
  function deleteReminder(rid){
    if(!rid) return Promise.resolve();
    return db.collection('reminders').doc(rid).delete().catch(function(err){ console.error('Erinnerung konnte nicht gelöscht werden:', err); });
  }
  function newId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---- Termine (verknüpft mit dem EFS-Dashboard) ----
  // lead.appointments = [{ id, type: 'erst'|'beratung', at, result, eh, booked, efs, resultAt }]
  //   Ergebnisse Erstgespräch: beratung | kein_interesse | noshow | abgesagt
  //   Ergebnisse Beratung:     abschluss | kein_abschluss | noshow | abgesagt
  //   booked = im EFS gebuchte EH (Änderungen buchen nur die Differenz), efs = steht gerade im EFS
  // Älteres Format (bis 09.11.2026): ein einzelnes lead.appointment, wird beim Lesen übernommen
  // und beim nächsten Speichern ersetzt.
  var APPT_TYPES = { erst: 'Erstgespräch', beratung: 'Beratung' };
  var APPT_RESULTS = {
    erst: [['beratung', 'Beratung vereinbart'], ['kein_interesse', 'Kein Interesse'], ['noshow', 'Nicht erschienen'], ['abgesagt', 'Abgesagt']],
    beratung: [['abschluss', 'Abschluss'], ['kein_abschluss', 'Kein Abschluss'], ['noshow', 'Nicht erschienen'], ['abgesagt', 'Abgesagt']]
  };
  var RESULT_LABEL = { beratung: 'Beratung vereinbart', kein_interesse: 'Kein Interesse', noshow: 'Nicht erschienen', abgesagt: 'Abgesagt', abschluss: 'Abschluss', kein_abschluss: 'Kein Abschluss' };
  var RESULT_TONE = { beratung: 'good', abschluss: 'good', kein_interesse: 'bad', kein_abschluss: 'bad', noshow: 'bad', abgesagt: 'warn' };
  function pad2(n){ return ('0' + n).slice(-2); }
  function ymd(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function hm(d){ return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function toLocalInput(d){ return ymd(d) + 'T' + hm(d); }
  function fmtEh(n){ return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('de-AT'); }
  function tsNow(){ return firebase.firestore.Timestamp.now(); }
  function tsFrom(d){ return firebase.firestore.Timestamp.fromDate(d); }
  function formatApptWhen(d){
    var today = dayStart(new Date()), day = dayStart(d);
    var diff = Math.round((day - today) / 864e5);
    var label = diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : formatDay(d);
    return label + ' · ' + hm(d);
  }
  function cloneAppt(a){
    return { id: String(a.id), type: a.type === 'beratung' ? 'beratung' : 'erst', at: a.at || null, result: a.result || null,
      eh: Number(a.eh) || 0, booked: Number(a.booked) || 0, efs: !!a.efs, resultAt: a.resultAt || null, remindedAt: a.remindedAt || null };
  }
  function apptsOf(lead){
    if(Array.isArray(lead.appointments)) return lead.appointments.map(cloneAppt);
    var a = lead.appointment;
    if(a && a.at){
      var res = a.result === 'eh' ? 'abschluss' : a.result === 'none' ? 'kein_abschluss' : null;
      return [{ id: 'legacy', type: a.result ? 'beratung' : 'erst', at: a.at, result: res, eh: Number(a.booked) || 0,
        booked: Number(a.booked) || 0, efs: !!a.efs, resultAt: null }];
    }
    return [];
  }
  function sortedAppts(lead){
    return apptsOf(lead).sort(function(a, b){ return (tsToDate(a.at) || 0) - (tsToDate(b.at) || 0); });
  }
  function openAppt(lead){
    var o = sortedAppts(lead).filter(function(a){ return !a.result && tsToDate(a.at); });
    return o[0] || null;
  }
  function efsKey(docId, apptId){ return apptId === 'legacy' ? docId : docId + ':' + apptId; }
  // Nachfassen: letzter Termin nicht erschienen/abgesagt, danach weder neuer Termin noch Anruf erfasst
  function followUpInfo(lead){
    if(lead.deleted) return null;
    var list = sortedAppts(lead);
    if(!list.length) return null;
    var last = list[list.length - 1];
    if(last.result !== 'noshow' && last.result !== 'abgesagt') return null;
    var since = tsToDate(last.resultAt) || tsToDate(last.at);
    var called = (lead.calls || []).some(function(c){ var d = tsToDate(c.at); return d && since && d > since; });
    return called ? null : { appt: last, since: since };
  }

  // Speichert die Termine eines Leads: gleicht zuerst das EFS ab (Termine eintragen/entfernen,
  // EH als Eigengeschäft buchen), danach wird der Lead gespeichert. extra = weitere Lead-Felder.
  function saveAppointments(docId, lead, list, extra){
    extra = extra || {};
    var deleted = ('deleted' in extra) ? extra.deleted : !!lead.deleted;
    var old = apptsOf(lead);
    function byId(arr, id){ for(var i = 0; i < arr.length; i++){ if(arr[i].id === id) return arr[i]; } return null; }
    var ids = [];
    old.concat(list).forEach(function(a){ if(ids.indexOf(a.id) === -1) ids.push(a.id); });
    var ops = [];
    ids.forEach(function(id){
      var o = byId(old, id), n = byId(list, id);
      var d = n ? tsToDate(n.at) : null, oD = o ? tsToDate(o.at) : null;
      var wantEfs = !!(n && d && !n.result && !deleted);
      var prevBooked = o ? (Number(o.booked) || 0) : 0;
      var newBooked = (n && n.result === 'abschluss') ? Math.round((Number(n.eh) || 0) * 100) / 100 : 0;
      var efsChanged = wantEfs
        ? !(o && o.efs && oD && oD.getTime() === d.getTime() && o.type === n.type)
        : !!(o && o.efs);
      var unitsDelta = Math.round((newBooked - prevBooked) * 100) / 100;
      var customerDelta = (newBooked > 0 ? 1 : 0) - (prevBooked > 0 ? 1 : 0);
      if(efsChanged || unitsDelta || customerDelta){
        ops.push({ leadId: efsKey(docId, id), unitsDelta: unitsDelta, customerDelta: customerDelta,
          termin: wantEfs ? { date: ymd(d), time: hm(d), label: lead.name || 'Lead', type: n.type === 'beratung' ? 'beratung' : 'analyse' } : null });
      }
      if(n){ n.booked = newBooked; n.eh = newBooked; n.efs = wantEfs; }
    });
    var updates = {};
    Object.keys(extra).forEach(function(k){ updates[k] = extra[k]; });
    updates.appointments = list.map(function(a){
      return { id: a.id, type: a.type, at: a.at || null, result: a.result || null, eh: a.eh || 0, booked: a.booked || 0, efs: !!a.efs, resultAt: a.resultAt || null, remindedAt: a.remindedAt || null };
    });
    if(lead.appointment) updates.appointment = firebase.firestore.FieldValue.delete();
    var step = Promise.resolve();
    if(ops.length){
      step = getEfsApi().then(function(api){
        return ops.reduce(function(p, op){ return p.then(function(){ return api.apply(op); }); }, Promise.resolve());
      });
    }
    return step.then(function(){ return db.collection('leads').doc(docId).update(updates); });
  }

  // ---- WhatsApp-Erinnerung (öffnet WhatsApp mit fertigem Text, Raphael schickt selbst ab) ----
  function waNumber(phone){
    var p = String(phone || '').replace(/[^\d+]/g, '');
    if(!p) return null;
    if(p.indexOf('+') === 0) p = p.slice(1);
    else if(p.indexOf('00') === 0) p = p.slice(2);
    else if(p.indexOf('0') === 0) p = '43' + p.slice(1);
    p = p.replace(/\D/g, '');
    return p.length >= 8 ? p : null;
  }
  function waText(lead, a){
    var d = tsToDate(a.at);
    var diff = Math.round((dayStart(d) - dayStart(new Date())) / 864e5);
    var dateTxt = d.toLocaleDateString('de-AT', { weekday: 'long' }) + ', ' + pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.';
    var when = diff === 0 ? 'heute um ' + hm(d) + ' Uhr'
      : diff === 1 ? 'morgen, ' + dateTxt + ', um ' + hm(d) + ' Uhr'
      : 'am ' + dateTxt + ', um ' + hm(d) + ' Uhr';
    var what = a.type === 'beratung' ? 'unseren Beratungstermin' : 'unser Erstgespräch';
    return 'Guten Tag ' + (lead.name || '') + ',\n' +
      'ich darf Sie an ' + what + ' ' + when + ' erinnern. Geben Sie mir bitte kurz Bescheid, ob der Termin für Sie passt.\n\n' +
      'Freundliche Grüße\nRaphael Frühwirth, flexo.kapital';
  }
  function waLink(lead, a){
    var n = waNumber(lead.phone);
    return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(waText(lead, a)) : null;
  }
  // Erinnern sinnvoll für offene Termine, die noch nicht vorbei sind
  function canRemind(a){ var d = a && tsToDate(a.at); return !!(d && !a.result && d > new Date()); }
  function remindLinkHtml(lead, a, small){
    var url = waLink(lead, a);
    if(!url) return small ? '' : '<span class="wa-none">Keine Telefonnummer für WhatsApp</span>';
    var done = tsToDate(a.remindedAt);
    return '<a class="wa-btn' + (small ? ' small' : '') + (done ? ' done' : '') + '" href="' + url + '" target="_blank" rel="noopener" data-appt="' + escapeHtml(a.id) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.3-1.7-.1-.2 0-.4.1-.5l.4-.4.3-.5v-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>' +
      (done ? 'Erinnert ' + (dayStart(done).getTime() === dayStart(new Date()).getTime() ? 'heute' : formatDay(done)) : (small ? 'Erinnern' : 'Per WhatsApp erinnern')) + '</a>';
  }
  // Nach dem Klick als "erinnert" markieren (ob wirklich gesendet wurde, sieht das Dashboard nicht)
  function markReminded(docId, apptId){
    var doc = allLeadDocs.filter(function(d){ return d.id === docId; })[0];
    if(!doc) return;
    var lead = doc.data();
    var list = apptsOf(lead).map(function(a){ if(a.id === apptId) a.remindedAt = tsNow(); return a; });
    saveAppointments(docId, lead, list).catch(function(err){ console.error('Erinnerung konnte nicht vermerkt werden:', err); });
  }
  function wireRemindLinks(container, docId){
    Array.prototype.forEach.call(container.querySelectorAll('.wa-btn'), function(a){
      a.addEventListener('click', function(e){ e.stopPropagation(); markReminded(docId, a.getAttribute('data-appt')); });
    });
  }

  function apptTypeOptions(sel){
    return Object.keys(APPT_TYPES).map(function(k){ return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + APPT_TYPES[k] + '</option>'; }).join('');
  }
  function buildApptHtml(lead, docId){
    var list = sortedAppts(lead);
    var open = openAppt(lead);
    var last = list.length ? list[list.length - 1] : null;
    var fu = followUpInfo(lead);
    var out = '<div class="appt-block' + (pendingApptId === docId && !open ? ' needs-date' : '') + '"><div class="label-sm">Termine' +
      (fu ? '<span class="appt-sync bad">Nachfassen: ' + (fu.appt.result === 'noshow' ? 'nicht erschienen' : 'abgesagt') + '</span>' : '') + '</div>';
    var closed = list.filter(function(a){ return !open || a.id !== open.id; });
    if(closed.length){
      out += '<ul class="appt-history">';
      closed.forEach(function(a){
        var d = tsToDate(a.at);
        out += '<li><span class="ah-type">' + APPT_TYPES[a.type] + '</span>' +
          '<span class="ah-when">' + (d ? formatDay(d) + ' · ' + hm(d) : 'ohne Datum') + '</span>' +
          '<span class="ah-res tone-' + (RESULT_TONE[a.result] || 'open') + '">' + escapeHtml(RESULT_LABEL[a.result] || 'offen') +
          (a.result === 'abschluss' ? ' · ' + fmtEh(a.booked) + ' EH' : '') + '</span>' +
          (last && a.id === last.id && a.result ? '<button type="button" class="appt-reset" data-appt="' + escapeHtml(a.id) + '">Zurücksetzen</button>' : '') + '</li>';
      });
      out += '</ul>';
    }
    if(open){
      var d = tsToDate(open.at), past = d <= new Date();
      out += '<div class="appt-open" data-appt="' + escapeHtml(open.id) + '">' +
        '<div class="appt-row"><select class="appt-type" title="Terminart">' + apptTypeOptions(open.type) + '</select>' +
        '<input type="datetime-local" class="appt-at" value="' + toLocalInput(d) + '">' +
        '<button type="button" class="btn ghost appt-save-btn">Ändern</button>' +
        '<button type="button" class="appt-del">Termin löschen</button>' +
        (open.efs ? '<span class="appt-sync ok">im EFS eingetragen</span>' : '') + '</div>' +
        (canRemind(open) ? '<div class="appt-remind">' + remindLinkHtml(lead, open, false) + '</div>' : '') +
        '<div class="appt-result"><span class="appt-q' + (past ? ' due' : '') + '">Wie lief ' + (open.type === 'beratung' ? 'die Beratung' : 'das Erstgespräch') + '?</span>' +
        APPT_RESULTS[open.type].map(function(r){ return '<button type="button" class="outcome-btn appt-res" data-res="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div>' +
        '<div class="appt-sub appt-eh-row" hidden><input type="text" class="appt-eh" inputmode="decimal" autocomplete="off" placeholder="z. B. 4,5"><span>EH</span>' +
          '<button type="button" class="btn appt-eh-btn">Abschluss speichern</button></div>' +
        '<div class="appt-sub appt-next-row" hidden><span class="appt-sub-lbl">Beratung am</span><input type="datetime-local" class="appt-next-at">' +
          '<button type="button" class="btn appt-next-btn">Beratung speichern</button></div>' +
        '</div>';
    } else {
      var hadBeratung = list.some(function(a){ return a.type === 'beratung' || a.result === 'beratung'; });
      out += '<div class="appt-new"><div class="appt-row"><select class="appt-type" title="Terminart">' + apptTypeOptions(hadBeratung ? 'beratung' : 'erst') + '</select>' +
        '<input type="datetime-local" class="appt-at"><button type="button" class="btn appt-add-btn">Termin speichern</button></div>' +
        (pendingApptId === docId ? '<div class="appt-hint">Datum und Uhrzeit eintragen. Danach wird der Status auf „Termin vereinbart“ gesetzt und der Termin im EFS-Dashboard eingetragen.</div>' : '') +
        '</div>';
    }
    out += '<div class="appt-msg" aria-live="polite"></div></div>';
    return out;
  }

  function buildTodosHtml(lead){
    var todos = lead.todos || [];
    var out = '<div class="todo-block"><div class="label-sm">To-dos</div><ul class="todo-list">';
    if(todos.length === 0){ out += '<li class="todo-empty">Keine To-dos.</li>'; }
    todos.forEach(function(t){
      out += '<li class="todo-item' + (t.done ? ' done' : '') + '" data-todo-id="' + escapeHtml(t.id) + '">' +
        '<label><input type="checkbox" class="todo-check"' + (t.done ? ' checked' : '') + '><span>' + escapeHtml(t.text) + '</span>' +
          (todoDue(t) ? '<em class="todo-due' + (isTodoOverdue(t) ? ' overdue' : '') + '" title="Erinnerung">' + formatDueFull(todoDue(t)) + '</em>' : '') + '</label>' +
        '<button type="button" class="todo-del" title="To-do löschen">&times;</button></li>';
    });
    out += '</ul><div class="todo-hint">Datum und Uhrzeit sind optional. Wenn gesetzt, bekommst du zu dem Zeitpunkt eine Mitteilung aufs Handy.</div><div class="todo-add"><input type="text" class="todo-input" placeholder="Neues To-do, z. B. Angebot rechnen&hellip;" maxlength="200">' +
      '<input type="datetime-local" class="todo-due-input" title="Erinnerung (optional)">' +
      '<button type="button" class="btn ghost todo-add-btn">Hinzufügen</button></div></div>';
    return out;
  }

  function buildCallsHtml(lead){
    var calls = lead.calls || [];
    var cb = callbackInfo(lead), cbHint = '';
    if(cb && cb.maxed){ cbHint = '<span class="callback-hint">' + MAX_CALLS + ' Anrufe erreicht, keine weitere Erinnerung</span>'; }
    else if(cb){ cbHint = '<span class="callback-hint' + (cb.isDue ? ' due' : '') + '">' + (cb.isDue ? 'Anruf ' + cb.next + ' von ' + MAX_CALLS + ' fällig' : 'Nächster Anruf ab ' + formatDay(cb.due)) + '</span>'; }
    var out = '<div class="calls-block"><div class="calls-header"><div class="label-sm">Anrufe (' + calls.length + ')' + cbHint + '</div>' +
      '<button type="button" class="btn ghost call-add-btn">+ Anruf</button></div><div class="calls-list">';
    if(calls.length === 0){
      out += '<div class="calls-empty">Noch keine Anrufe erfasst.</div>';
    } else {
      calls.forEach(function(call, idx){
        var outcomeLabel = '';
        if(call.outcome === 'termin'){ outcomeLabel = '<span class="call-outcome-label outcome-termin">Termin vereinbart</span>'; }
        else if(call.outcome === 'kein_interesse'){ outcomeLabel = '<span class="call-outcome-label outcome-kein_interesse">Kein Interesse</span>'; }
        else if(call.outcome === 'abgehoben'){ outcomeLabel = '<span class="call-outcome-label outcome-abgehoben">Abgehoben</span>'; }
        out += '<div class="call-item" data-call-index="' + idx + '">' +
          '<div class="call-meta"><span class="call-date">' + formatDate(call.at) + '</span>' + outcomeLabel + '</div>' +
          '<textarea class="call-note-textarea" placeholder="Notiz zu diesem Anruf&hellip;">' + escapeHtml(call.note || '') + '</textarea>' +
          '<div class="call-actions">' +
            '<button type="button" class="btn ghost call-note-save-btn">Notiz speichern</button>' +
            '<span class="note-saved call-note-saved">Gespeichert &check;</span>' +
            '<button type="button" class="outcome-btn' + (call.outcome === 'termin' ? ' active' : '') + '" data-outcome="termin">Termin vereinbart</button>' +
            '<button type="button" class="outcome-btn' + (call.outcome === 'kein_interesse' ? ' active' : '') + '" data-outcome="kein_interesse">Kein Interesse</button>' +
            '<button type="button" class="outcome-btn' + (call.outcome === 'abgehoben' ? ' active' : '') + '" data-outcome="abgehoben">Abgehoben</button>' +
            '<button type="button" class="btn ghost call-delete-btn">Löschen</button>' +
          '</div>' +
        '</div>';
      });
    }
    out += '</div></div>';
    return out;
  }

  var ANSWER_FIELD_ORDER = ['ziel', 'art', 'einmalbetrag', 'sparrate', 'groessenordnung', 'zeithorizont', 'erfahrung', 'erfahrung_mit', 'bestehend', 'entscheidung', 'timing']; // 'bestehend' only on older leads

  function buildDetailHtml(lead, viewingTrashView, docId){
    var parts = [];
    if(lead.answers && typeof lead.answers === 'object'){
      var answerKeys = Object.keys(lead.answers).filter(function(key){ return key.indexOf('_') !== 0; }); // _name/_email/_phone sind schon in den Spalten
      var orderedKeys = ANSWER_FIELD_ORDER.filter(function(key){ return answerKeys.indexOf(key) !== -1; });
      var extraKeys = answerKeys.filter(function(key){ return ANSWER_FIELD_ORDER.indexOf(key) === -1; }).sort();
      orderedKeys.concat(extraKeys).forEach(function(key){
        var val = lead.answers[key];
        if(val && typeof val === 'object' && 'label' in val){ val = val.label; }
        parts.push('<div class="detail-field"><div class="k">' + escapeHtml(key) + '</div><div class="v">' + escapeHtml(val) + '</div></div>');
      });
    }
    var html = '<div class="detail-grid">' + parts.join('');
    if(lead.message && lead.source !== 'erstgespraech_funnel'){
      html += '<div class="detail-field detail-msg"><div class="k">Nachricht / Notizen</div><div class="v">' + escapeHtml(lead.message) + '</div></div>';
    }
    if(lead.visitorNote){
      html += '<div class="detail-field detail-msg"><div class="k">Notiz vom Interessenten</div><div class="v">' + escapeHtml(lead.visitorNote) + '</div></div>';
    }
    if(!viewingTrashView){
      html += buildApptHtml(lead, docId);
    }
    html += buildCallsHtml(lead);
    html += buildTodosHtml(lead);
    html += '<div class="note-block">' +
      '<div class="label-sm">Interne Notiz</div>' +
      '<textarea class="note-textarea" placeholder="Notiz zu diesem Lead (z.B. Gespraechsergebnis)&hellip;">' + escapeHtml(lead.advisorNote || '') + '</textarea>' +
      '<div class="note-actions"><button type="button" class="btn ghost note-save-btn">Notiz speichern</button><span class="note-saved">Gespeichert &check;</span></div>' +
      '</div>';
    html += '<div class="detail-footer">' + (viewingTrashView
      ? '<button type="button" class="btn ghost restore-btn">Lead wiederherstellen</button>'
      : '<button type="button" class="btn ghost delete-lead-btn">Lead löschen</button>') + '</div>';
    html += '</div>';
    return html;
  }

  function computeStats(docs){
    var activeDocs = docs.filter(function(doc){ return !doc.data().deleted; });
    var total = activeDocs.length;
    var funnelCount = 0, kontaktCount = 0, weekCount = 0;
    var weekAgo = Date.now() - 7*24*60*60*1000;
    activeDocs.forEach(function(doc){
      var lead = doc.data();
      if(lead.source === 'erstgespraech_funnel') funnelCount++; else kontaktCount++;
      if(lead.createdAt && lead.createdAt.toDate && lead.createdAt.toDate().getTime() > weekAgo) weekCount++;
    });
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statWeek').textContent = weekCount;
    document.getElementById('statFunnel').textContent = funnelCount;
    document.getElementById('statKontakt').textContent = kontaktCount;
  }

  function matchesFilters(lead){
    var statusVal = statusFilter.value;
    if(statusVal !== 'alle' && (lead.status || '') !== statusVal) return false;

    var sourceVal = sourceFilter.value;
    if(sourceVal !== 'alle'){
      var isFunnel = lead.source === 'erstgespraech_funnel';
      if(sourceVal === 'erstgespraech_funnel' && !isFunnel) return false;
      if(sourceVal === 'kontakt' && isFunnel) return false;
    }

    var term = searchInput.value.trim().toLowerCase();
    if(term){
      var hay = [lead.name, lead.email, lead.phone].map(function(v){ return (v || '').toLowerCase(); }).join(' ');
      if(hay.indexOf(term) === -1) return false;
    }
    return true;
  }

  function renderTable(docs){
    var activeDocs = docs.filter(function(doc){ return !doc.data().deleted; });
    var deletedDocs = docs.filter(function(doc){ return !!doc.data().deleted; });
    var baseDocs = viewingTrash ? deletedDocs : activeDocs;
    var filtered = baseDocs.filter(function(doc){ return matchesFilters(doc.data()); });
    leadsBody.innerHTML = '';
    emptyState.hidden = filtered.length > 0;
    if(viewingTrash){
      emptyState.textContent = deletedDocs.length === 0 ? 'Der Papierkorb ist leer.' : 'Keine gelöschten Leads passen zu diesem Filter.';
    } else {
      emptyState.textContent = activeDocs.length === 0 ? 'Noch keine Leads eingegangen.' : 'Keine Leads passen zu diesem Filter.';
    }

    filtered.forEach(function(doc){
      var lead = doc.data();
      var docId = doc.id;
      var isFunnel = lead.source === 'erstgespraech_funnel';

      var tr = document.createElement('tr');
      tr.className = 'lead-row' + (expandedLeadId === docId ? ' is-open' : '');
      tr.setAttribute('data-id', docId);
      var todoN = openTodoCount(lead), cbRow = callbackInfo(lead);
      var marks = (lead.advisorNote ? '<span class="has-note-dot" title="Notiz vorhanden"></span>' : '') +
        (todoN ? '<span class="has-todo' + ((lead.todos || []).some(isTodoOverdue) ? ' overdue' : '') + '" title="Offene To-dos">' + todoN + '</span>' : '') +
        (cbRow && cbRow.isDue && !viewingTrash ? '<span class="callback-badge" title="Rückruf fällig">Anrufen</span>' : '') +
        (function(){
          if(viewingTrash) return '';
          if(followUpInfo(lead)) return '<span class="appt-badge due" title="Termin nicht stattgefunden, nachfassen">Nachfassen</span>';
          var o = openAppt(lead);
          if(!o) return '';
          var d = tsToDate(o.at);
          if(d <= new Date()) return '<span class="appt-badge due" title="Termin vorbei, Ergebnis eintragen">Ergebnis offen</span>';
          return '<span class="appt-badge' + (o.type === 'beratung' ? ' beratung' : '') + '" title="' + APPT_TYPES[o.type] + '">' + (o.type === 'beratung' ? 'Beratung · ' : '') + formatApptWhen(d) + '</span>';
        })();
      tr.innerHTML =
        '<td>' + formatDate(lead.createdAt) + '</td>' +
        '<td><span class="badge ' + (isFunnel ? 'funnel' : 'kontakt') + '">' + (isFunnel ? 'Erstgespräch' : 'Kontakt') + '</span></td>' +
        '<td class="cell-name">' + escapeHtml(lead.name || '–') + marks + '</td>' +
        '<td class="cell-mail">' + escapeHtml(lead.email || '–') + '</td>' +
        '<td>' + escapeHtml(lead.phone || '–') + '</td>' +
        '<td class="cell-note">' + escapeHtml(lead.message || '–') + '</td>' +
        '<td class="call-count-badge">' + ((lead.calls || []).length) + '</td>';

      var statusTd = document.createElement('td');
      var statusSelect = document.createElement('select');
      statusSelect.className = 'status-select';
      Object.keys(STATUS_META).forEach(function(key){
        var opt = document.createElement('option');
        opt.value = key;
        opt.textContent = STATUS_META[key].label;
        statusSelect.appendChild(opt);
      });
      statusSelect.value = lead.status || '';
      applyStatusStyle(statusSelect, statusSelect.value);
      statusSelect.addEventListener('click', function(e){ e.stopPropagation(); });
      statusSelect.addEventListener('change', function(e){
        e.stopPropagation();
        var newVal = statusSelect.value;
        var oldVal = lead.status || '';
        // "Termin vereinbart" nur mit Datum und Uhrzeit
        if(newVal === 'termin' && !openAppt(lead)){
          statusSelect.value = oldVal;
          applyStatusStyle(statusSelect, oldVal);
          pendingApptId = docId; expandedLeadId = docId; scrollToLeadId = docId;
          renderTable(allLeadDocs);
          var inp = leadsBody.querySelector('tr.lead-row[data-id="' + docId + '"]');
          inp = inp && inp.nextElementSibling && inp.nextElementSibling.querySelector('.appt-new .appt-at');
          if(inp) setTimeout(function(){ inp.focus(); }, 350);
          return;
        }
        applyStatusStyle(statusSelect, newVal);
        var job, opn = openAppt(lead);
        if(newVal !== 'termin' && opn){
          // offener Termin: beim Wegwechseln löschen (auch aus dem EFS), erledigte Termine bleiben im Verlauf
          var od = tsToDate(opn.at);
          if(!confirm('Der offene Termin (' + APPT_TYPES[opn.type] + ', ' + formatDay(od) + ' · ' + hm(od) + ') wird gelöscht. Fortfahren?')){
            statusSelect.value = oldVal; applyStatusStyle(statusSelect, oldVal);
            return;
          }
          job = saveAppointments(docId, lead, apptsOf(lead).filter(function(a){ return a.id !== opn.id; }), { status: newVal });
        } else {
          job = db.collection('leads').doc(docId).update({ status: newVal });
        }
        statusSelect.disabled = true;
        job.catch(function(err){
          console.error('Status konnte nicht gespeichert werden:', err);
          alert('Status konnte nicht gespeichert werden: ' + (err && err.message || err));
          statusSelect.value = oldVal; applyStatusStyle(statusSelect, oldVal);
        }).then(function(){ statusSelect.disabled = false; });
      });
      statusTd.appendChild(statusSelect);
      tr.appendChild(statusTd);

      var detailTr = document.createElement('tr');
      detailTr.className = expandedLeadId === docId ? 'detail-row is-open' : 'detail-row closed';
      var detailTd = document.createElement('td');
      detailTd.colSpan = 8;
      detailTd.innerHTML = buildDetailHtml(lead, viewingTrash, docId);
      detailTr.appendChild(detailTd);

      tr.addEventListener('click', function(){ toggleLead(docId); });

      leadsBody.appendChild(tr);
      leadsBody.appendChild(detailTr);

      var noteTextarea = detailTd.querySelector('.note-textarea');
      var noteSaveBtn = detailTd.querySelector('.note-save-btn');
      var noteSavedLabel = detailTd.querySelector('.note-saved');
      if(noteTextarea && noteSaveBtn){
        noteTextarea.addEventListener('click', function(e){ e.stopPropagation(); });
        noteSaveBtn.addEventListener('click', function(e){
          e.stopPropagation();
          var text = noteTextarea.value;
          noteSaveBtn.disabled = true;
          db.collection('leads').doc(docId).update({ advisorNote: text }).then(function(){
            noteSaveBtn.disabled = false;
            if(noteSavedLabel){
              noteSavedLabel.classList.add('show');
              setTimeout(function(){ noteSavedLabel.classList.remove('show'); }, 2000);
            }
          }).catch(function(err){
            noteSaveBtn.disabled = false;
            console.error('Notiz konnte nicht gespeichert werden:', err);
          });
        });
      }

      var todoInput = detailTd.querySelector('.todo-input');
      var todoAddBtn = detailTd.querySelector('.todo-add-btn');
      function saveTodos(list){
        return db.collection('leads').doc(docId).update({ todos: list }).catch(function(err){
          console.error('To-dos konnten nicht gespeichert werden:', err);
        });
      }
      if(todoInput && todoAddBtn){
        todoInput.addEventListener('click', function(e){ e.stopPropagation(); });
        var todoDueInput = detailTd.querySelector('.todo-due-input');
        if(todoDueInput) todoDueInput.addEventListener('click', function(e){ e.stopPropagation(); });
        var addTodo = function(e){
          if(e) e.stopPropagation();
          var text = todoInput.value.trim();
          if(!text) return;
          var item = { id: newId(), text: text, done: false, createdAt: firebase.firestore.Timestamp.now() };
          var dueVal = todoDueInput ? todoDueInput.value : '';
          var due = dueVal ? new Date(dueVal) : null;
          if(due && !isNaN(due.getTime())){
            item.due = firebase.firestore.Timestamp.fromDate(due);
            if(due > new Date()) item.reminderId = newId();
          }
          todoAddBtn.disabled = true;
          var list = (lead.todos || []).slice();
          list.push(item);
          setReminder(item.reminderId, due).then(function(){ return saveTodos(list); }).then(function(){ todoAddBtn.disabled = false; });
        };
        todoAddBtn.addEventListener('click', addTodo);
        todoInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); addTodo(e); } });
      }
      Array.prototype.forEach.call(detailTd.querySelectorAll('.todo-item'), function(li){
        var id = li.getAttribute('data-todo-id');
        li.addEventListener('click', function(e){ e.stopPropagation(); });
        var check = li.querySelector('.todo-check');
        var cur = (lead.todos || []).filter(function(t){ return t.id === id; })[0] || {};
        check.addEventListener('change', function(){
          var list = (lead.todos || []).map(function(t){
            if(t.id !== id) return t;
            var copy = {}; Object.keys(t).forEach(function(k){ copy[k] = t[k]; });
            copy.done = check.checked;
            return copy;
          });
          // erledigt: Erinnerung weg; wieder offen: Erinnerung neu setzen, falls noch in der Zukunft
          (check.checked ? deleteReminder(cur.reminderId) : setReminder(cur.reminderId, todoDue(cur))).then(function(){ saveTodos(list); });
        });
        li.querySelector('.todo-del').addEventListener('click', function(){
          deleteReminder(cur.reminderId).then(function(){
            saveTodos((lead.todos || []).filter(function(t){ return t.id !== id; }));
          });
        });
      });

      var callAddBtn = detailTd.querySelector('.call-add-btn');
      if(callAddBtn){
        callAddBtn.addEventListener('click', function(e){
          e.stopPropagation();
          var newCalls = (lead.calls || []).slice();
          newCalls.push({ at: firebase.firestore.Timestamp.now(), note: '', outcome: null });
          var updates = { calls: newCalls };
          if((lead.status || '') === ''){ updates.status = 'kontaktiert'; }
          callAddBtn.disabled = true;
          db.collection('leads').doc(docId).update(updates).then(function(){
            callAddBtn.disabled = false;
          }).catch(function(err){
            callAddBtn.disabled = false;
            console.error('Anruf konnte nicht gespeichert werden:', err);
          });
        });
      }

      var callItems = detailTd.querySelectorAll('.call-item');
      Array.prototype.forEach.call(callItems, function(callItemEl){
        var idx = parseInt(callItemEl.getAttribute('data-call-index'), 10);
        var callTextarea = callItemEl.querySelector('.call-note-textarea');
        var callSaveBtn = callItemEl.querySelector('.call-note-save-btn');
        var callSavedLabel = callItemEl.querySelector('.call-note-saved');
        if(callTextarea){ callTextarea.addEventListener('click', function(e){ e.stopPropagation(); }); }
        if(callSaveBtn){
          callSaveBtn.addEventListener('click', function(e){
            e.stopPropagation();
            var newCalls = (lead.calls || []).slice();
            if(!newCalls[idx]) return;
            newCalls[idx] = { at: newCalls[idx].at, note: callTextarea.value, outcome: newCalls[idx].outcome };
            callSaveBtn.disabled = true;
            db.collection('leads').doc(docId).update({ calls: newCalls }).then(function(){
              callSaveBtn.disabled = false;
              if(callSavedLabel){
                callSavedLabel.classList.add('show');
                setTimeout(function(){ callSavedLabel.classList.remove('show'); }, 2000);
              }
            }).catch(function(err){
              callSaveBtn.disabled = false;
              console.error('Anruf-Notiz konnte nicht gespeichert werden:', err);
            });
          });
        }
        var callDeleteBtn = callItemEl.querySelector('.call-delete-btn');
        if(callDeleteBtn){
          callDeleteBtn.addEventListener('click', function(e){
            e.stopPropagation();
            if(!confirm('Diesen Anruf-Eintrag löschen?')) return;
            var newCalls = (lead.calls || []).slice();
            newCalls.splice(idx, 1);
            callDeleteBtn.disabled = true;
            db.collection('leads').doc(docId).update({ calls: newCalls }).catch(function(err){
              callDeleteBtn.disabled = false;
              console.error('Anruf konnte nicht gelöscht werden:', err);
            });
          });
        }
        var outcomeBtns = callItemEl.querySelectorAll('.outcome-btn');
        Array.prototype.forEach.call(outcomeBtns, function(btn){
          btn.addEventListener('click', function(e){
            e.stopPropagation();
            var outcome = btn.getAttribute('data-outcome');
            var newCalls = (lead.calls || []).slice();
            if(!newCalls[idx]) return;
            newCalls[idx] = { at: newCalls[idx].at, note: newCalls[idx].note, outcome: outcome };

            var updates = { calls: newCalls };
            var currentStatus = lead.status || '';
            if(outcome === 'termin'){
              if(!openAppt(lead)){
                // erst Datum und Uhrzeit abfragen, Status folgt beim Speichern des Termins
                pendingApptId = docId;
                db.collection('leads').doc(docId).update(updates).catch(function(err){
                  console.error('Anruf-Ergebnis konnte nicht gespeichert werden:', err);
                });
                renderTable(allLeadDocs);
                return;
              }
              updates.status = 'termin';
            } else if(outcome === 'kein_interesse'){
              if(currentStatus !== 'termin'){ updates.status = 'kein_interesse'; }
            } else if(outcome === 'abgehoben'){
              if(currentStatus === ''){ updates.status = 'kontaktiert'; }
            }
            db.collection('leads').doc(docId).update(updates).catch(function(err){
              console.error('Anruf-Ergebnis konnte nicht gespeichert werden:', err);
            });
          });
        });
      });

      var apptBlock = detailTd.querySelector('.appt-block');
      if(apptBlock){
        apptBlock.addEventListener('click', function(e){ e.stopPropagation(); });
        var apptMsg = apptBlock.querySelector('.appt-msg');
        var setBusy = function(on, text){
          Array.prototype.forEach.call(apptBlock.querySelectorAll('button, input, select'), function(b){ b.disabled = on; });
          apptMsg.className = 'appt-msg'; apptMsg.textContent = text || '';
        };
        var showErr = function(err){
          console.error('Termin konnte nicht gespeichert werden:', err);
          setBusy(false);
          apptMsg.className = 'appt-msg err';
          apptMsg.textContent = 'Nicht gespeichert: ' + (err && err.message || err) + '. Bitte nochmal versuchen.';
        };
        var hint = function(text){ apptMsg.className = 'appt-msg err'; apptMsg.textContent = text; };
        wireRemindLinks(apptBlock, docId);
        var readAt = function(input){ var v = input && input.value; var d = v ? new Date(v) : null; return (d && !isNaN(d.getTime())) ? d : null; };
        var run = function(text, list, extra, after){
          setBusy(true, text);
          saveAppointments(docId, lead, list, extra).then(function(){ if(after) after(); }).catch(showErr);
        };

        // neuen Termin anlegen
        var newBox = apptBlock.querySelector('.appt-new');
        if(newBox){
          newBox.querySelector('.appt-add-btn').addEventListener('click', function(){
            var d = readAt(newBox.querySelector('.appt-at'));
            if(!d) return hint('Bitte Datum und Uhrzeit eintragen.');
            var list = apptsOf(lead);
            list.push({ id: newId(), type: newBox.querySelector('.appt-type').value, at: tsFrom(d), result: null, eh: 0, booked: 0, efs: false, resultAt: null });
            run('Wird gespeichert und ins EFS übertragen…', list, (lead.status || '') !== 'termin' ? { status: 'termin' } : {}, function(){
              if(pendingApptId === docId) pendingApptId = null;
            });
          });
        }

        // offenen Termin ändern, löschen, Ergebnis eintragen
        var openBox = apptBlock.querySelector('.appt-open');
        if(openBox){
          var oid = openBox.getAttribute('data-appt');
          var withOpen = function(fn){ var list = apptsOf(lead); list.forEach(function(a){ if(a.id === oid) fn(a); }); return list; };
          var ehRow = openBox.querySelector('.appt-eh-row'), nextRow = openBox.querySelector('.appt-next-row');
          openBox.querySelector('.appt-save-btn').addEventListener('click', function(){
            var d = readAt(openBox.querySelector('.appt-at'));
            if(!d) return hint('Bitte Datum und Uhrzeit eintragen.');
            var type = openBox.querySelector('.appt-type').value;
            run('Wird gespeichert…', withOpen(function(a){ a.at = tsFrom(d); a.type = type; }), (lead.status || '') !== 'termin' ? { status: 'termin' } : {});
          });
          openBox.querySelector('.appt-del').addEventListener('click', function(){
            if(!confirm('Diesen Termin löschen? Er wird auch aus dem EFS entfernt.')) return;
            var list = apptsOf(lead).filter(function(a){ return a.id !== oid; });
            var extra = {};
            if((lead.status || '') === 'termin' && !list.some(function(a){ return !a.result; })) extra.status = 'kontaktiert';
            run('Wird gelöscht…', list, extra);
          });
          Array.prototype.forEach.call(openBox.querySelectorAll('.appt-res'), function(btn){
            btn.addEventListener('click', function(){
              var res = btn.getAttribute('data-res');
              Array.prototype.forEach.call(openBox.querySelectorAll('.appt-res'), function(b){ b.classList.toggle('active', b === btn); });
              ehRow.hidden = res !== 'abschluss';
              nextRow.hidden = res !== 'beratung';
              if(res === 'abschluss'){ ehRow.querySelector('input').focus(); return; }
              if(res === 'beratung'){ nextRow.querySelector('input').focus(); return; }
              var status = res === 'kein_interesse' ? 'kein_interesse' : 'kontaktiert';
              run('Wird gespeichert…', withOpen(function(a){ a.result = res; a.resultAt = tsNow(); }), { status: status });
            });
          });
          var ehInput = ehRow.querySelector('.appt-eh');
          var saveEh = function(){
            var v = parseFloat(String(ehInput.value).trim().replace(/\s/g, '').replace(',', '.'));
            if(!(v > 0)) return hint('Bitte die Anzahl EH eintragen (größer als 0).');
            v = Math.round(v * 100) / 100;
            run('EH werden im EFS gebucht…', withOpen(function(a){ a.result = 'abschluss'; a.eh = v; a.resultAt = tsNow(); }), { status: 'abschluss' });
          };
          ehRow.querySelector('.appt-eh-btn').addEventListener('click', saveEh);
          ehInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); saveEh(); } });
          nextRow.querySelector('.appt-next-btn').addEventListener('click', function(){
            var d = readAt(nextRow.querySelector('.appt-next-at'));
            if(!d) return hint('Bitte Datum und Uhrzeit für die Beratung eintragen.');
            var list = withOpen(function(a){ a.result = 'beratung'; a.resultAt = tsNow(); });
            list.push({ id: newId(), type: 'beratung', at: tsFrom(d), result: null, eh: 0, booked: 0, efs: false, resultAt: null });
            run('Beratung wird gespeichert und ins EFS übertragen…', list, { status: 'termin' });
          });
        }

        // letztes Ergebnis zurücksetzen (Termin ist dann wieder offen)
        var resetBtn = apptBlock.querySelector('.appt-reset');
        if(resetBtn){
          resetBtn.addEventListener('click', function(){
            var rid = resetBtn.getAttribute('data-appt');
            var target = apptsOf(lead).filter(function(a){ return a.id === rid; })[0];
            if(!target) return;
            if(target.booked > 0 && !confirm('Die gebuchten ' + fmtEh(target.booked) + ' EH werden im EFS wieder abgezogen. Fortfahren?')) return;
            var list = apptsOf(lead).map(function(a){ if(a.id === rid){ a.result = null; a.eh = 0; a.resultAt = null; } return a; });
            run('Wird zurückgesetzt…', list, { status: 'termin' });
          });
        }
      }

      var deleteLeadBtn = detailTd.querySelector('.delete-lead-btn');
      if(deleteLeadBtn){
        deleteLeadBtn.addEventListener('click', function(e){
          e.stopPropagation();
          if(!confirm('Diesen Lead in den Papierkorb verschieben?')) return;
          deleteLeadBtn.disabled = true;
          var delUpd = { deleted: true, deletedAt: firebase.firestore.Timestamp.now() };
          (apptsOf(lead).length ? saveAppointments(docId, lead, apptsOf(lead), delUpd) : db.collection('leads').doc(docId).update(delUpd)).catch(function(err){
            deleteLeadBtn.disabled = false;
            console.error('Lead konnte nicht gelöscht werden:', err);
          });
        });
      }
      var restoreBtn = detailTd.querySelector('.restore-btn');
      if(restoreBtn){
        restoreBtn.addEventListener('click', function(e){
          e.stopPropagation();
          restoreBtn.disabled = true;
          var resUpd = { deleted: false, deletedAt: null };
          (apptsOf(lead).length ? saveAppointments(docId, lead, apptsOf(lead), resUpd) : db.collection('leads').doc(docId).update(resUpd)).catch(function(err){
            restoreBtn.disabled = false;
            console.error('Lead konnte nicht wiederhergestellt werden:', err);
          });
        });
      }
    });

    renderCallbacks(activeDocs);
    if(scrollToLeadId){ var sid = scrollToLeadId; scrollToLeadId = null; scrollLeadIntoView(sid); }

    if(viewingTrash){
      statusLine.textContent = filtered.length === deletedDocs.length
        ? (filtered.length + (filtered.length === 1 ? ' gelöschter Lead im Papierkorb' : ' gelöschte Leads im Papierkorb'))
        : (filtered.length + ' von ' + deletedDocs.length + ' gelöschten Leads angezeigt');
    } else {
      statusLine.textContent = filtered.length === activeDocs.length
        ? (activeDocs.length + ' Lead' + (activeDocs.length === 1 ? '' : 's') + ' – live aktualisiert')
        : (filtered.length + ' von ' + activeDocs.length + ' Leads angezeigt');
    }
  }

  function toggleLead(docId){
    expandedLeadId = (expandedLeadId === docId) ? null : docId;
    if(expandedLeadId) scrollToLeadId = docId;
    renderTable(allLeadDocs);
  }

  // Aufgeklappten Lead so scrollen, dass Zeile + Details möglichst ganz sichtbar sind
  function scrollLeadIntoView(docId){
    var row = leadsBody.querySelector('tr.lead-row[data-id="' + docId + '"]');
    if(!row) return;
    requestAnimationFrame(function(){
      var detail = row.nextElementSibling;
      var hdr = document.querySelector('header');
      var off = (hdr ? hdr.getBoundingClientRect().height : 0) + 12;
      var r1 = row.getBoundingClientRect();
      var r2 = detail ? detail.getBoundingClientRect() : r1;
      var viewTop = off, viewBottom = window.innerHeight - 12;
      if(r1.top >= viewTop && r2.bottom <= viewBottom) return; // schon ganz sichtbar
      var delta;
      if(r2.bottom - r1.top <= viewBottom - viewTop){
        delta = (r1.top < viewTop) ? (r1.top - viewTop) : (r2.bottom - viewBottom);
      } else {
        delta = r1.top - viewTop; // zu hoch: Zeile oben anlegen
      }
      window.scrollTo({ top: window.scrollY + delta, behavior: 'smooth' });
    });
  }

  function openLeadFromList(docId){
    if(viewingTrash){ viewingTrash = false; trashToggleBtn.textContent = 'Papierkorb'; trashToggleBtn.classList.remove('active'); }
    searchInput.value = ''; statusFilter.value = 'alle'; sourceFilter.value = 'alle';
    expandedLeadId = docId; scrollToLeadId = docId;
    renderTable(allLeadDocs);
  }

  var callbackCard = document.getElementById('callbackCard');
  var callbackList = document.getElementById('callbackList');
  var callbackSub = document.getElementById('callbackSub');
  var callbackUpcoming = document.getElementById('callbackUpcoming');
  var apptSection = document.getElementById('apptSection');
  var apptList = document.getElementById('apptList');
  function renderAppointments(activeDocs){
    var items = [], noDate = [];
    activeDocs.forEach(function(doc){
      var lead = doc.data();
      var o = openAppt(lead);
      if(o) items.push({ id: doc.id, lead: lead, a: o, d: tsToDate(o.at) });
      else if((lead.status || '') === 'termin' && !followUpInfo(lead)) noDate.push({ id: doc.id, lead: lead });
    });
    items.sort(function(a, b){ return a.d - b.d; });
    apptList.innerHTML = '';
    var now = new Date();
    items.concat(noDate).forEach(function(item){
      var b = document.createElement('div');
      b.setAttribute('role', 'button'); b.tabIndex = 0;
      var meta, cls = 'callback-item appt-kind';
      if(!item.d){ meta = 'Datum fehlt'; cls += ' is-due'; }
      else {
        var typ = APPT_TYPES[item.a.type];
        if(item.a.type === 'beratung') cls += ' is-beratung';
        if(item.d <= now){ meta = typ + ' · ' + formatDay(item.d) + ' · ' + hm(item.d) + ' · Ergebnis eintragen'; cls += ' is-due'; }
        else { meta = typ + ' · ' + formatApptWhen(item.d); if(dayStart(item.d).getTime() === dayStart(now).getTime()) cls += ' is-today'; }
      }
      b.className = cls;
      var soon = item.d && canRemind(item.a) && Math.round((dayStart(item.d) - dayStart(now)) / 864e5) <= 1;
      b.innerHTML = '<span class="cb-name">' + escapeHtml(item.lead.name || '–') + '</span>' +
        '<span class="cb-meta">' + escapeHtml(meta) + '</span>' +
        (item.lead.phone ? '<span class="cb-phone">' + escapeHtml(item.lead.phone) + '</span>' : '') +
        (soon ? '<span class="cb-actions">' + remindLinkHtml(item.lead, item.a, true) + '</span>' : '');
      b.addEventListener('click', function(){ openLeadFromList(item.id); });
      b.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openLeadFromList(item.id); } });
      wireRemindLinks(b, item.id);
      apptList.appendChild(b);
    });
    apptSection.hidden = items.length + noDate.length === 0;
    return items.length + noDate.length;
  }
  function renderCallbacks(activeDocs){
    var apptCount = renderAppointments(activeDocs);
    var due = [], upcoming = [];
    activeDocs.forEach(function(doc){
      var lead = doc.data(), cb = callbackInfo(lead);
      if(!cb || cb.maxed) return;
      (cb.isDue ? due : upcoming).push({ id: doc.id, lead: lead, cb: cb });
    });
    var todosDue = [];
    activeDocs.forEach(function(doc){
      var lead = doc.data();
      (lead.todos || []).forEach(function(t){ if(isTodoOverdue(t)) todosDue.push({ id: doc.id, lead: lead, t: t, d: todoDue(t) }); });
    });
    todosDue.sort(function(a, b){ return a.d - b.d; });
    var followUps = [];
    activeDocs.forEach(function(doc){ var fu = followUpInfo(doc.data()); if(fu) followUps.push({ id: doc.id, lead: doc.data(), fu: fu }); });
    followUps.sort(function(a, b){ return (a.fu.since || 0) - (b.fu.since || 0); });
    due.sort(function(a, b){ return a.cb.due - b.cb.due; });
    upcoming.sort(function(a, b){ return a.cb.due - b.cb.due; });
    callbackCard.hidden = due.length === 0 && upcoming.length === 0 && todosDue.length === 0 && apptCount === 0 && followUps.length === 0;
    var subParts = [];
    if(followUps.length) subParts.push(followUps.length + ' Nachfassen');
    if(due.length) subParts.push(due.length + (due.length === 1 ? ' Rückruf' : ' Rückrufe'));
    if(todosDue.length) subParts.push(todosDue.length + (todosDue.length === 1 ? ' To-do' : ' To-dos'));
    callbackSub.textContent = (subParts.length ? subParts.join(' · ') + ' fällig' : 'Heute nichts fällig') +
      (apptCount ? ' · ' + apptCount + (apptCount === 1 ? ' offener Termin' : ' offene Termine') : '');
    callbackList.innerHTML = '';
    followUps.forEach(function(item){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'callback-item followup-kind';
      var d = tsToDate(item.fu.appt.at);
      b.innerHTML = '<span class="cb-name">' + escapeHtml(item.lead.name || '–') + '</span>' +
        '<span class="cb-meta">Nachfassen · ' + APPT_TYPES[item.fu.appt.type] + ' ' + (item.fu.appt.result === 'noshow' ? 'nicht erschienen' : 'abgesagt') + (d ? ' (' + formatDay(d) + ')' : '') + '</span>' +
        (item.lead.phone ? '<span class="cb-phone">' + escapeHtml(item.lead.phone) + '</span>' : '');
      b.addEventListener('click', function(){ openLeadFromList(item.id); });
      callbackList.appendChild(b);
    });
    todosDue.forEach(function(item){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'callback-item todo-kind';
      b.innerHTML = '<span class="cb-name">' + escapeHtml(item.t.text) + '</span>' +
        '<span class="cb-meta">To-do · fällig ' + formatDueFull(item.d) + '</span>' +
        '<span class="cb-phone">' + escapeHtml(item.lead.name || '–') + '</span>';
      b.addEventListener('click', function(){ openLeadFromList(item.id); });
      callbackList.appendChild(b);
    });
    due.forEach(function(item){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'callback-item';
      var when = item.cb.overdueDays <= 0 ? 'seit heute fällig' : ('seit ' + item.cb.overdueDays + (item.cb.overdueDays === 1 ? ' Tag' : ' Tagen') + ' fällig');
      b.innerHTML = '<span class="cb-name">' + escapeHtml(item.lead.name || '–') + '</span>' +
        '<span class="cb-meta">Anruf ' + item.cb.next + ' von ' + MAX_CALLS + ' · ' + when + '</span>' +
        (item.lead.phone ? '<span class="cb-phone">' + escapeHtml(item.lead.phone) + '</span>' : '');
      b.addEventListener('click', function(){ openLeadFromList(item.id); });
      callbackList.appendChild(b);
    });
    callbackUpcoming.textContent = upcoming.length
      ? 'Demnächst: ' + upcoming.slice(0, 4).map(function(i){ return (i.lead.name || '–') + ' (' + formatDay(i.cb.due) + ')'; }).join(', ') + (upcoming.length > 4 ? ' …' : '')
      : '';
  }

  searchInput.addEventListener('input', function(){ renderTable(allLeadDocs); });
  statusFilter.addEventListener('change', function(){ renderTable(allLeadDocs); });
  sourceFilter.addEventListener('change', function(){ renderTable(allLeadDocs); });
  trashToggleBtn.addEventListener('click', function(){
    viewingTrash = !viewingTrash;
    trashToggleBtn.textContent = viewingTrash ? 'Zurück zu Leads' : 'Papierkorb';
    trashToggleBtn.classList.toggle('active', viewingTrash);
    renderTable(allLeadDocs);
  });

  function startLeadsListener(){
    if(unsubscribeLeads) return;
    statusLine.textContent = 'Lädt…';
    unsubscribeLeads = db.collection('leads').orderBy('createdAt', 'desc').onSnapshot(function(snap){
      allLeadDocs = snap.docs;
      computeStats(allLeadDocs);
      renderTable(allLeadDocs);
    }, function(err){
      console.error('Leads konnten nicht geladen werden:', err);
      statusLine.textContent = 'Fehler beim Laden der Leads.';
    });
  }

  // ---- Fragebogen-Trichter (anonyme funnel_events) ----
  var FUNNEL_STEPS = [
    {key:'seite', label:'Seite geöffnet'},
    {key:'fragebogen_gesehen', label:'Fragebogen gesehen'},
    {key:'gestartet', label:'Frage 1 beantwortet', sub:'Ziel'},
    {key:'schritt_3', label:'Frage 2 beantwortet', sub:'Einmalig / monatlich'},
    {key:'schritt_4', label:'Frage 3 beantwortet', sub:'Betrag'},
    {key:'schritt_5', label:'Frage 4 beantwortet', sub:'Zeithorizont'},
    {key:'schritt_6', label:'Frage 6 erreicht', sub:'nur wer schon Erfahrung hat', optional:true},
    {key:'schritt_7', label:'Erfahrungsfragen beantwortet', sub:'Frage 5 bzw. 6'},
    {key:'schritt_8', label:'Frage 7 beantwortet', sub:'Allein / gemeinsam'},
    {key:'schritt_9', label:'Kontaktschritt erreicht', sub:'Frage 8 beantwortet'},
    {key:'abgeschickt', label:'Abgeschickt', final:true}
  ];
  var funnelRange = document.getElementById('funnelRange');
  var funnelSource = document.getElementById('funnelSource');
  var funnelRows = document.getElementById('funnelRows');
  var funnelFoot = document.getElementById('funnelFoot');
  var funnelDocs = [];

  function funnelMatches(d, filter){
    if(filter === 'alle') return true;
    if(filter.indexOf('src:') === 0) return (d.src || '') === filter.slice(4);
    if(filter.indexOf('ad:') === 0) return (d.ad || '') === filter.slice(3);
    if(filter.indexOf('dev:') === 0) return (d.dev || '') === filter.slice(4);
    return true;
  }

  function fillFunnelSourceOptions(){
    var current = funnelSource.value;
    var srcs = {}, ads = {};
    funnelDocs.forEach(function(d){ if(d.src) srcs[d.src] = 1; if(d.ad) ads[d.ad] = 1; });
    var html = '<option value="alle">Alle Quellen</option>';
    Object.keys(srcs).sort().forEach(function(k){ html += '<option value="src:'+escapeHtml(k).replace(/"/g,'&quot;')+'">Quelle: '+escapeHtml(k)+'</option>'; });
    Object.keys(ads).sort().forEach(function(k){ html += '<option value="ad:'+escapeHtml(k).replace(/"/g,'&quot;')+'">Anzeige: '+escapeHtml(k)+'</option>'; });
    html += '<option value="dev:mobil">Gerät: mobil</option><option value="dev:desktop">Gerät: desktop</option>';
    funnelSource.innerHTML = html;
    if(Array.prototype.some.call(funnelSource.options, function(o){ return o.value === current; })) funnelSource.value = current;
  }

  function renderFunnel(){
    var filter = funnelSource.value || 'alle';
    var visitsByStep = {};
    FUNNEL_STEPS.forEach(function(st){ visitsByStep[st.key] = {}; });
    funnelDocs.forEach(function(d){
      if(!funnelMatches(d, filter)) return;
      if(visitsByStep[d.e]) visitsByStep[d.e][d.v] = 1;
    });
    // "schritt_7 erreicht" heißt auch: Frage 5 beantwortet (Einsteiger überspringen Frage 6)
    var counts = FUNNEL_STEPS.map(function(st){ return Object.keys(visitsByStep[st.key]).length; });
    var max = Math.max.apply(null, counts.concat([1]));
    var html = '';
    var prevCount = null;
    FUNNEL_STEPS.forEach(function(st, i){
      var c = counts[i];
      var dropTxt = '', dropBad = false;
      if(!st.optional && prevCount !== null && prevCount > 0){
        var drop = Math.round((1 - c / prevCount) * 100);
        dropTxt = drop > 0 ? '−' + drop + ' %' : '±0 %';
        dropBad = drop >= 30 && prevCount >= 5;
      }
      html += '<div class="funnel-row' + (st.optional ? ' is-optional' : '') + (st.final ? ' is-final' : '') + '">'
        + '<div class="lbl">' + escapeHtml(st.label) + (st.sub ? '<small>' + escapeHtml(st.sub) + '</small>' : '') + '</div>'
        + '<div class="bar"><span style="width:' + Math.round(c / max * 100) + '%"></span></div>'
        + '<div class="cnt">' + c + '</div>'
        + '<div class="drop' + (dropBad ? ' bad' : '') + '">' + dropTxt + '</div>'
        + '</div>';
      if(!st.optional) prevCount = c;
    });
    funnelRows.innerHTML = html;
    var seen = counts[1], done = counts[counts.length - 1];
    funnelFoot.textContent = funnelDocs.length
      ? ('Abschlussquote ab „Fragebogen gesehen“: ' + (seen ? Math.round(done / seen * 1000) / 10 : 0) + ' %. Rote Werte = besonders viele Abbrüche an dieser Stelle.')
      : 'Noch keine Daten im gewählten Zeitraum.';
  }

  function loadFunnel(){
    var days = parseInt(funnelRange.value, 10) || 30;
    var since = firebase.firestore.Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    funnelFoot.textContent = 'Lädt…';
    db.collection('funnel_events').where('t', '>=', since).get().then(function(snap){
      funnelDocs = snap.docs.map(function(doc){
        var d = doc.data();
        // ältere Einträge: "B+-+Ad+01.10.2026" und "B - Ad 01.10.2026" als dieselbe Anzeige zählen
        if(d.ad) d.ad = String(d.ad).replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
        return d;
      });
      fillFunnelSourceOptions();
      renderFunnel();
    }).catch(function(err){
      console.error('Trichter konnte nicht geladen werden:', err);
      funnelFoot.textContent = 'Trichter konnte nicht geladen werden (Firestore-Regeln für funnel_events schon eingetragen?).';
    });
  }
  funnelRange.addEventListener('change', loadFunnel);
  funnelSource.addEventListener('change', renderFunnel);
  document.getElementById('funnelReload').addEventListener('click', loadFunnel);

  function stopLeadsListener(){
    if(unsubscribeLeads){ unsubscribeLeads(); unsubscribeLeads = null; }
  }

  // ---- Push-Benachrichtigungen bei neuen Leads (Web-App am Homescreen) ----
  var VAPID_PUBLIC_KEY = 'BHl_Jyy4DgvIaQpphE_GkVcx2IcQYnY2MhAEhH1K4f5wh7f_LYxOX_B4pK37rNkTU7i5fvJ3LN0H4o-zo3IevPA';
  var pushBar = document.getElementById('pushBar');
  var pushHint = document.getElementById('pushHint');
  var pushToggleBtn = document.getElementById('pushToggleBtn');
  var pushTestBtn = document.getElementById('pushTestBtn');
  var pushSubsDoc = db.collection('push').doc('subscriptions');
  var pushSupported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var pushActive = false;

  if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
    navigator.serviceWorker.register('/sw.js').catch(function(err){ console.warn('Service Worker nicht registriert:', err); });
  }

  function b64uToUint8(s){
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while(s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function subscriptionId(endpoint){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf).slice(0, 10), function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function deviceLabel(){
    if(isIOS) return 'iPhone/iPad';
    if(/Android/.test(navigator.userAgent)) return 'Android';
    if(/Mac/.test(navigator.platform)) return 'Mac';
    return 'Computer';
  }
  function setPushUI(hint, opts){
    opts = opts || {};
    pushHint.textContent = hint;
    pushActive = !!opts.active;
    pushBar.classList.toggle('is-active', pushActive);
    pushToggleBtn.hidden = !opts.button;
    pushToggleBtn.textContent = pushActive ? 'Deaktivieren' : 'Auf diesem Gerät aktivieren';
    pushToggleBtn.className = pushActive ? 'btn ghost' : 'btn';
    pushToggleBtn.disabled = false;
    pushTestBtn.hidden = !pushActive;
  }
  function currentSubscription(){
    return navigator.serviceWorker.ready.then(function(reg){ return reg.pushManager.getSubscription(); });
  }
  function refreshPushUI(){
    pushBar.hidden = false;
    if(!pushSupported){
      if(isIOS && !isStandalone){
        setPushUI('Am iPhone geht das nur als App: in Safari auf Teilen → „Zum Home-Bildschirm“, dann das Dashboard über das neue Symbol öffnen und hier aktivieren.');
      } else {
        setPushUI('Dieser Browser unterstützt keine Benachrichtigungen.');
      }
      return;
    }
    if(Notification.permission === 'denied'){
      setPushUI('Benachrichtigungen sind für diese Seite blockiert. Am iPhone erlaubst du sie unter Einstellungen → Mitteilungen → flexo.kapital, am Computer in den Website-Einstellungen des Browsers.');
      return;
    }
    currentSubscription().then(function(sub){
      if(sub) setPushUI('Du bekommst auf diesem Gerät eine Mitteilung, sobald ein neuer Lead eingeht.', {button: true, active: true});
      else setPushUI('Lass dich auf diesem Gerät benachrichtigen, sobald ein neuer Lead eingeht.', {button: true});
    }).catch(function(){
      setPushUI('Benachrichtigungen konnten nicht geprüft werden. Bitte Seite neu laden.');
    });
  }
  function enablePush(){
    // requestPermission muss direkt im Klick passieren (sonst blockt iOS)
    return Notification.requestPermission().then(function(perm){
      if(perm !== 'granted') throw new Error('keine Erlaubnis');
      return navigator.serviceWorker.ready;
    }).then(function(reg){
      return reg.pushManager.getSubscription().then(function(existing){
        return existing || reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64uToUint8(VAPID_PUBLIC_KEY)});
      });
    }).then(function(sub){
      var j = sub.toJSON();
      return subscriptionId(j.endpoint).then(function(id){
        var subs = {};
        subs[id] = {endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceLabel(), created: firebase.firestore.FieldValue.serverTimestamp()};
        return pushSubsDoc.set({subs: subs}, {merge: true});
      });
    });
  }
  function disablePush(){
    return currentSubscription().then(function(sub){
      if(!sub) return;
      return subscriptionId(sub.endpoint).then(function(id){
        return pushSubsDoc.update(new firebase.firestore.FieldPath('subs', id), firebase.firestore.FieldValue.delete())
          .catch(function(){ /* Eintrag gab es schon nicht mehr */ })
          .then(function(){ return sub.unsubscribe(); });
      });
    });
  }
  pushToggleBtn.addEventListener('click', function(){
    pushToggleBtn.disabled = true;
    (pushActive ? disablePush() : enablePush()).then(refreshPushUI).catch(function(err){
      console.error('Push-Einstellung fehlgeschlagen:', err);
      refreshPushUI();
      if(Notification.permission !== 'denied') pushHint.textContent = 'Das hat nicht geklappt (' + (err && err.message || err) + '). Bitte nochmal versuchen.';
    });
  });
  pushTestBtn.addEventListener('click', function(){
    pushTestBtn.disabled = true;
    fetch('/api/lead-notify', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({src: 'test'})})
      .then(function(r){ return r.json(); })
      .then(function(res){
        pushHint.textContent = res.sent ? ('Test an ' + res.sent + (res.sent === 1 ? ' Gerät' : ' Geräte') + ' gesendet. Die Mitteilung sollte gleich erscheinen.') : ('Test nicht gesendet' + (res.error ? ': ' + res.error : '.'));
      })
      .catch(function(){ pushHint.textContent = 'Test konnte nicht gesendet werden.'; })
      .then(function(){ pushTestBtn.disabled = false; });
  });

  auth.onAuthStateChanged(function(user){
    if(!user){
      stopLeadsListener();
      setSignedOutLayout();
      userRow.hidden = true;
      showOnly(loginGate);
      return;
    }
    if(user.email !== ALLOWED_EMAIL){
      stopLeadsListener();
      setSignedOutLayout();
      userRow.hidden = true;
      showOnly(deniedGate);
      return;
    }
    userEmail.textContent = user.email;
    userRow.hidden = false;
    showOnly(null);
    signedIn = true;
    viewNav.hidden = false;
    applyView(viewFromHash());
    // eigene Website-Besuche auf diesem Gerät nicht mehr im Trichter zählen
    try{ localStorage.setItem('fk_notrack', '1'); }catch(e){}
    startLeadsListener();
    loadFunnel();
    refreshPushUI();
  });
})();
