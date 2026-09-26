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
  var expandedLeadIds = {};
  var viewingTrash = false;

  var STATUS_META = {
    '': {label: 'Neu', color: 'var(--muted)', bg: 'rgba(143,160,166,.16)'},
    'kontaktiert': {label: 'Kontaktiert', color: 'var(--accent)', bg: 'var(--accent-soft)'},
    'termin': {label: 'Termin vereinbart', color: 'var(--success)', bg: 'rgba(79,191,139,.16)'},
    'kein_interesse': {label: 'Kein Interesse', color: 'var(--warn)', bg: 'rgba(224,101,76,.16)'}
  };

  function applyStatusStyle(select, value){
    var meta = STATUS_META[value] || STATUS_META[''];
    select.style.color = meta.color;
    select.style.background = meta.bg;
  }

  function showOnly(el){
    [loginGate, deniedGate, dashboardContent].forEach(function(e){ e.hidden = (e !== el); });
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

  function buildCallsHtml(lead){
    var calls = lead.calls || [];
    var out = '<div class="calls-block"><div class="calls-header"><div class="label-sm">Anrufe (' + calls.length + ')</div>' +
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

  var ANSWER_FIELD_ORDER = ['ziel', 'art', 'einmalbetrag', 'sparrate', 'groessenordnung', 'zeithorizont', 'bestehend', 'erfahrung', 'entscheidung', 'timing'];

  function buildDetailHtml(lead, viewingTrashView){
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
    html += buildCallsHtml(lead);
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
      tr.className = 'lead-row';
      tr.innerHTML =
        '<td>' + formatDate(lead.createdAt) + '</td>' +
        '<td><span class="badge ' + (isFunnel ? 'funnel' : 'kontakt') + '">' + (isFunnel ? 'Erstgespräch' : 'Kontakt') + '</span></td>' +
        '<td class="cell-name">' + escapeHtml(lead.name || '–') + (lead.advisorNote ? '<span class="has-note-dot" title="Notiz vorhanden"></span>' : '') + '</td>' +
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
        applyStatusStyle(statusSelect, newVal);
        db.collection('leads').doc(docId).update({ status: newVal }).catch(function(err){
          console.error('Status konnte nicht gespeichert werden:', err);
        });
      });
      statusTd.appendChild(statusSelect);
      tr.appendChild(statusTd);

      var detailTr = document.createElement('tr');
      detailTr.className = expandedLeadIds[docId] ? 'detail-row' : 'detail-row closed';
      var detailTd = document.createElement('td');
      detailTd.colSpan = 8;
      detailTd.innerHTML = buildDetailHtml(lead, viewingTrash);
      detailTr.appendChild(detailTd);

      tr.addEventListener('click', function(){
        detailTr.classList.toggle('closed');
        expandedLeadIds[docId] = !detailTr.classList.contains('closed');
      });

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

      var deleteLeadBtn = detailTd.querySelector('.delete-lead-btn');
      if(deleteLeadBtn){
        deleteLeadBtn.addEventListener('click', function(e){
          e.stopPropagation();
          if(!confirm('Diesen Lead in den Papierkorb verschieben?')) return;
          deleteLeadBtn.disabled = true;
          db.collection('leads').doc(docId).update({ deleted: true, deletedAt: firebase.firestore.Timestamp.now() }).catch(function(err){
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
          db.collection('leads').doc(docId).update({ deleted: false, deletedAt: null }).catch(function(err){
            restoreBtn.disabled = false;
            console.error('Lead konnte nicht wiederhergestellt werden:', err);
          });
        });
      }
    });

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

  function stopLeadsListener(){
    if(unsubscribeLeads){ unsubscribeLeads(); unsubscribeLeads = null; }
  }

  auth.onAuthStateChanged(function(user){
    if(!user){
      stopLeadsListener();
      userRow.hidden = true;
      showOnly(loginGate);
      return;
    }
    if(user.email !== ALLOWED_EMAIL){
      stopLeadsListener();
      userRow.hidden = true;
      showOnly(deniedGate);
      return;
    }
    userEmail.textContent = user.email;
    userRow.hidden = false;
    showOnly(dashboardContent);
    startLeadsListener();
  });
})();
