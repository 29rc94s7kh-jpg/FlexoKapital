/* ==== Interaktive Elemente (Entwurf 23.11.2026): Hero-Suchleiste, KESt-Rechner, Vergleich zum Durchklicken ==== */
(function(){
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmt(v){ return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  function esc(s){ return s.replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  // ---- Hero: Suchleiste tippt Fragen, darunter erscheint die Antwort ----
  var hs = document.getElementById('heroSearch');
  if(hs){
    var txtEl = hs.querySelector('.hs-text');
    var ans = hs.querySelector('.hs-answer');
    var ansTxt = hs.querySelector('.hs-answer-text');
    var items = [
      { q: 'fondsgewinne ohne kest – geht das?', a: 'Ja, unter bestimmten Voraussetzungen.' },
      { q: '27,5 % kest auf jeden gewinn?', a: 'Muss nicht sein.' },
      { q: 'investieren ohne kest österreich', a: "Gibt's. Kaum jemand kennt's." }
    ];
    var paint = function(s){ txtEl.innerHTML = esc(s).replace(/kest/gi, function(m){ return '<b>' + m + '</b>'; }); };
    var onScreen = function(){ return hs.offsetParent !== null && !document.hidden; };
    if(reduced){
      paint(items[0].q); ansTxt.textContent = items[0].a; ans.classList.add('on');
    } else {
      (async function run(){
        var idx = 0;
        await wait(1100);
        for(;;){
          while(!onScreen()) await wait(500);
          var it = items[idx % items.length];
          for(var i = 1; i <= it.q.length; i++){ paint(it.q.slice(0, i)); await wait(38 + Math.random() * 60); }
          await wait(420);
          ansTxt.textContent = it.a; ans.classList.add('on');
          await wait(3800);
          ans.classList.remove('on');
          await wait(350);
          for(var j = it.q.length; j >= 0; j--){ paint(it.q.slice(0, j)); await wait(14); }
          await wait(380);
          idx++;
        }
      })();
    }
  }

  // ---- KESt-Rechner: Depot mit laufender KESt (ausschüttungsgleiche Erträge) und KESt beim Verkauf ----
  var kc = document.getElementById('kestCalc');
  if(kc){
    var KEST = 0.275;
    var $ = function(id){ return document.getElementById(id); };
    var amount = $('kcAmount'), years = $('kcYears');
    var st = { mode: 'monthly', rate: 0.06, age: 0.02 };
    var MODES = {
      monthly: { label: 'Monatlicher Betrag', min: 50, max: 2000, step: 25, val: 300 },
      once:    { label: 'Einmaliger Betrag', min: 1000, max: 200000, step: 1000, val: 20000 }
    };
    var r100 = function(v){ return Math.round(v / 100) * 100; };
    var setP = function(el){ el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100).toFixed(2) + '%'); };

    // Monatliche Simulation, KESt auf den laufenden Ertrag jeweils zum Jahresende
    var simulate = function(mode, amt, yrs, r, q){
      var rm = Math.pow(1 + r, 1 / 12) - 1;
      var g = mode === 'once' ? amt : 0, n = g, basis = g, paidIn = g, runTax = 0;
      var ptsG = [g], ptsN = [g], ptsE = [g];
      for(var y = 1; y <= yrs; y++){
        for(var m = 0; m < 12; m++){
          if(mode === 'monthly'){ g += amt; n += amt; basis += amt; paidIn += amt; }
          g *= 1 + rm; n *= 1 + rm;
        }
        var ageAmt = q * n, t = KEST * ageAmt;   // ausschüttungsgleicher Ertrag, sofort versteuert
        n -= t; runTax += t; basis += ageAmt;     // erhöht die Anschaffungskosten (keine Doppelbesteuerung)
        ptsG.push(g); ptsN.push(n - KEST * Math.max(n - basis, 0)); ptsE.push(paidIn);
      }
      var endTax = KEST * Math.max(n - basis, 0);
      var net = n - endTax, gap = g - net;
      return { gross: g, net: net, gap: gap, run: runTax, end: endTax, lost: gap - runTax - endTax, paidIn: paidIn, ptsG: ptsG, ptsN: ptsN, ptsE: ptsE };
    };

    var chart = $('kcChart');
    var draw = function(res, yrs){
      var W = 400, H = 180, L = 4, R = 6, T = 12, B = 24;
      var max = res.ptsG[res.ptsG.length - 1] * 1.04;
      var x = function(i){ return L + i / yrs * (W - L - R); };
      var yv = function(v){ return T + (1 - v / max) * (H - T - B); };
      var line = function(pts){ return pts.map(function(v, i){ return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yv(v).toFixed(1); }).join(''); };
      var gapPoly = line(res.ptsG) + res.ptsN.slice().reverse().map(function(v, k){ var i = res.ptsN.length - 1 - k; return 'L' + x(i).toFixed(1) + ' ' + yv(v).toFixed(1); }).join('') + 'Z';
      var area = line(res.ptsN) + 'L' + x(yrs).toFixed(1) + ' ' + yv(0) + 'L' + x(0) + ' ' + yv(0) + 'Z';
      var lastN = res.ptsN[yrs], lastG = res.ptsG[yrs];
      chart.innerHTML =
        '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yv(max / 2).toFixed(1) + '" y2="' + yv(max / 2).toFixed(1) + '"/>' +
        '<path class="area" d="' + area + '"/>' +
        '<path class="gap" d="' + gapPoly + '"/>' +
        '<path class="le" d="' + line(res.ptsE) + '"/>' +
        '<path class="lg" d="' + line(res.ptsG) + '"/>' +
        '<path class="ln" d="' + line(res.ptsN) + '"/>' +
        '<line class="ax" x1="' + L + '" x2="' + (W - R) + '" y1="' + yv(0) + '" y2="' + yv(0) + '"/>' +
        '<circle class="dotg" cx="' + x(yrs).toFixed(1) + '" cy="' + yv(lastG).toFixed(1) + '" r="4"/>' +
        '<circle class="dot" cx="' + x(yrs).toFixed(1) + '" cy="' + yv(lastN).toFixed(1) + '" r="4.5"/>' +
        '<text x="' + L + '" y="' + (H - 6) + '">heute</text>' +
        '<text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">in ' + yrs + ' Jahren</text>';
    };

    var shown = 0, target = 0, raf = null;
    var tick = function(){
      shown += (target - shown) * 0.2;
      if(Math.abs(target - shown) < 50){ shown = target; raf = null; }
      $('kcTax').textContent = fmt(r100(shown));
      if(raf !== null) raf = requestAnimationFrame(tick);
    };

    var update = function(){
      var amt = +amount.value, yrs = +years.value;
      setP(amount); setP(years);
      $('kcAmountVal').textContent = fmt(amt);
      $('kcYearsVal').textContent = yrs + ' Jahre';
      var res = simulate(st.mode, amt, yrs, st.rate, st.age);
      $('kcResLabel').textContent = 'In ' + yrs + ' Jahren kostet dich die KESt rund';
      $('kcRun').textContent = fmt(r100(res.run));
      $('kcEnd').textContent = fmt(r100(res.end));
      $('kcLost').textContent = fmt(r100(res.lost));
      $('kcGross').textContent = fmt(r100(res.gross));
      $('kcNet').textContent = fmt(r100(res.net));
      $('kcPaidIn').textContent = fmt(r100(res.paidIn));
      draw(res, yrs);
      target = res.gap;
      if(reduced){ shown = target; $('kcTax').textContent = fmt(r100(target)); return; }
      if(raf === null) raf = requestAnimationFrame(tick);
    };

    var setMode = function(mode){
      st.mode = mode; var c = MODES[mode];
      amount.min = c.min; amount.max = c.max; amount.step = c.step; amount.value = c.val;
      $('kcAmountLabel').textContent = c.label;
    };
    var bindChips = function(id, key){
      Array.prototype.forEach.call($(id).querySelectorAll('button'), function(b, _, all){
        b.addEventListener('click', function(){
          Array.prototype.forEach.call($(id).querySelectorAll('button'), function(x){ x.classList.toggle('on', x === b); });
          st[key] = +b.dataset.v; update();
        });
      });
    };
    Array.prototype.forEach.call($('kcMode').querySelectorAll('button'), function(b){
      b.addEventListener('click', function(){
        Array.prototype.forEach.call($('kcMode').querySelectorAll('button'), function(x){ x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        setMode(b.dataset.mode); update();
      });
    });
    bindChips('kcRate', 'rate'); bindChips('kcAge', 'age');
    amount.addEventListener('input', update); years.addEventListener('input', update);
    update();
  }

  
// ---- Vergleich: flexo.kapital gegen eine Option ----
  var filter = document.getElementById('cmpFilter');
  var head = document.getElementById('compareHead');
  var body = document.getElementById('compareBody');
  if(filter && head && body){
    var wrap = body.closest('.compare-wrap');
    var summary = document.getElementById('cmpSummary');
    var nCols = head.children.length - 1;
    var perRow = nCols + 1;
    var colName = function(ci){ return head.children[ci + 1].querySelector('.compare-col-title').textContent.replace(/­/g, ''); };
    var valAt = function(ri, ci){
      var icon = body.children[ri * perRow + 1 + ci].querySelector('.cmp-icon');
      return /cmp-yes/.test(icon.className) ? 'yes' : /cmp-mid/.test(icon.className) ? 'mid' : 'no';
    };
    var rows = Math.round(body.children.length / perRow);
    var apply = function(sel){
      var visible = [];
      for(var ci = 0; ci < nCols; ci++){
        var show = sel === 'all' || ci === 0 || ci === +sel;
        if(show) visible.push(ci);
        head.children[ci + 1].classList.toggle('cmp-x', !show);
        for(var ri = 0; ri < rows; ri++) body.children[ri * perRow + 1 + ci].classList.toggle('cmp-x', !show);
      }
      var cols = 'minmax(0,1.6fr) repeat(' + visible.length + ',minmax(0,1fr))';
      head.style.gridTemplateColumns = cols; body.style.gridTemplateColumns = cols;
      wrap.classList.toggle('is-filtered', sel !== 'all');
      if(sel === 'all'){ summary.innerHTML = ''; }
      else {
        var diffs = [];
        for(var r = 0; r < rows; r++){
          if(valAt(r, 0) === 'yes' && valAt(r, +sel) !== 'yes') diffs.push(body.children[r * perRow].textContent);
        }
        summary.innerHTML = diffs.length
          ? 'Der Unterschied zu <b>' + esc(colName(+sel)) + '</b>: ' + diffs.map(function(d){ return '<b>' + esc(d) + '</b>'; }).join(', ') + '.'
          : '';
      }
      if(!reduced){
        Array.prototype.forEach.call(body.querySelectorAll('.cmp-cell:not(.cmp-x) .cmp-icon'), function(ic, k){
          ic.classList.remove('ix-pop'); void ic.offsetWidth;
          ic.style.animationDelay = (k * 35) + 'ms';
          ic.classList.add('ix-pop');
        });
      }
    };
    Array.prototype.forEach.call(filter.querySelectorAll('button'), function(b){
      b.addEventListener('click', function(){
        Array.prototype.forEach.call(filter.querySelectorAll('button'), function(x){ x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        apply(b.dataset.cmp);
      });
    });
  }

  // ---- Warum früh investieren: Karten verändern sich beim normalen Scrollen (kein Festhalten) ----
  var rxGrid = document.querySelector('#page-start .reasons-grid.rx');
  if(rxGrid){
    var clamp = function(v, a, b){ return v < a ? a : v > b ? b : v; };
    var sm = function(a, b, x){ var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    var de = function(v){ return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; };
    var rxCards = Array.prototype.slice.call(rxGrid.querySelectorAll('.card'));
    var rxItems = rxCards.map(function(c){ return { el: c, cur: 0, tgt: 0, last: -1 }; });

    // 1) Pensionslücke: Rechnung baut sich Teil für Teil auf
    var eqParts = rxCards[0] ? rxCards[0].querySelectorAll('.rx-t, .rx-op') : [];
    var renderGap = function(p){
      Array.prototype.forEach.call(eqParts, function(el, i){
        var a = sm(i * 0.16, i * 0.16 + 0.22, p);
        el.style.opacity = (0.12 + a * 0.88).toFixed(3);
        el.style.transform = 'translateY(' + ((1 - a) * 8).toFixed(1) + 'px)';
      });
    };
    // 2) Inflation: 10.000 € verlieren Jahr für Jahr Kaufkraft
    var inf = rxCards[1];
    var renderInfl = function(p){
      if(!inf) return;
      var yrs = Math.round(p * 30), v = 10000 / Math.pow(1.03, p * 30);
      inf.querySelector('.rx-yr').textContent = yrs === 0 ? 'heute' : 'in ' + yrs + ' Jahren';
      inf.querySelector('.rx-amt').textContent = de(Math.round(v / 10) * 10);
      inf.querySelector('.rx-fill').style.width = (v / 100).toFixed(2) + '%';
    };
    // 3) Zinseszins: heute starten vs. 10 Jahre später
    var cmp = rxCards[2], c1, c2, L1 = 0, L2 = 0;
    if(cmp){
      var W = 240, H = 62, MAX = 10000 * Math.pow(1.06, 30) * 1.04;
      var X = function(t){ return t / 30 * W; }, Y = function(v){ return H - 1 - v / MAX * (H - 4); };
      var d1 = '', d2 = '';
      for(var t = 0; t <= 30; t += 0.5){
        d1 += (t ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(10000 * Math.pow(1.06, t)).toFixed(1);
        if(t >= 10) d2 += (t === 10 ? 'M' : 'L') + X(t).toFixed(1) + ' ' + Y(10000 * Math.pow(1.06, t - 10)).toFixed(1);
      }
      c1 = cmp.querySelector('.rx-c1'); c2 = cmp.querySelector('.rx-c2');
      c1.setAttribute('d', d1); c2.setAttribute('d', d2);
      L1 = c1.getTotalLength(); L2 = c2.getTotalLength();
      c1.style.strokeDasharray = L1; c2.style.strokeDasharray = L2;
    }
    var renderCmp = function(p){
      if(!cmp) return;
      if(!L1){ L1 = c1.getTotalLength(); L2 = c2.getTotalLength(); if(L1){ c1.style.strokeDasharray = L1; c2.style.strokeDasharray = L2; } }
      var t = p * 30;
      c1.style.strokeDashoffset = (L1 * (1 - p)).toFixed(1);
      var p2 = clamp((t - 10) / 20, 0, 1);
      c2.style.strokeDashoffset = (L2 * (1 - p2)).toFixed(1);
      cmp.querySelector('.rx-v1').textContent = de(Math.round(10000 * Math.pow(1.06, t) / 100) * 100);
      cmp.querySelector('.rx-v2').textContent = t < 10 ? '–' : de(Math.round(10000 * Math.pow(1.06, t - 10) / 100) * 100);
      var y = Math.round(t);
      cmp.querySelector('.rx-y').textContent = y === 0 ? 'heute' : 'Jahr ' + y;
    };
    var renders = [renderGap, renderInfl, renderCmp];

    var rxRaf = null;
    var measure = function(){
      var vh = window.innerHeight;
      rxItems.forEach(function(it){
        if(it.el.offsetParent === null) return;
        var r = it.el.getBoundingClientRect();
        it.tgt = clamp((vh * 0.95 - r.top) / (vh * 0.45), 0, 1);
      });
    };
    var loop = function(){
      var busy = false;
      rxItems.forEach(function(it, i){
        it.cur += (it.tgt - it.cur) * 0.12;
        if(Math.abs(it.tgt - it.cur) < 0.001) it.cur = it.tgt; else busy = true;
        if(Math.abs(it.cur - it.last) > 0.0005){ renders[i] && renders[i](it.cur); it.last = it.cur; }
      });
      rxRaf = busy ? requestAnimationFrame(loop) : null;
    };
    var kickRx = function(){ measure(); if(rxRaf === null) rxRaf = requestAnimationFrame(loop); };
    if(reduced){
      rxItems.forEach(function(it, i){ renders[i] && renders[i](1); });
    } else {
      rxItems.forEach(function(it, i){ renders[i] && renders[i](0); });
      window.addEventListener('scroll', kickRx, { passive: true });
      window.addEventListener('resize', kickRx);
      document.addEventListener('click', function(){ setTimeout(kickRx, 250); });
      window.addEventListener('hashchange', function(){ setTimeout(kickRx, 250); });
      kickRx();
    }
  }
})();
