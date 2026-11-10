/* ==== Scroll- und 3D-Animationen für flexokapital.at ====
   Legt sich über die bestehende Seite, ohne Inhalte zu ändern. Bei "Bewegung reduzieren"
   im Betriebssystem bleibt alles wie bisher. */
(function(){
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced) return;
  var root = document.documentElement;
  root.classList.add('mx');
  var finePointer = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
  function smooth(e0, e1, x){ var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
  function visible(el){ return el && el.offsetParent !== null; }

  // Text eines Elements in einzelne Wörter (span) zerlegen, <em>/<br> bleiben erhalten
  function splitWords(el, cls){
    var out = [];
    Array.prototype.slice.call(el.childNodes).forEach(function(node){
      if(node.nodeType === 3){
        var frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(function(part){
          if(!part) return;
          if(/^\s+$/.test(part)){ frag.appendChild(document.createTextNode(part)); return; }
          var s = document.createElement('span'); s.className = cls; s.textContent = part;
          frag.appendChild(s); out.push(s);
        });
        node.parentNode.replaceChild(frag, node);
      } else if(node.nodeType === 1 && node.tagName !== 'BR'){
        out = out.concat(splitWords(node, cls));
      }
    });
    return out;
  }

  // Zahlen wie "180.000 €", "-60 %", "6 % p.a." zerlegen und hochzählen
  function parseNum(txt){
    var m = String(txt).trim().match(/^(-?)([\d.]+)(.*)$/);
    if(!m) return null;
    return { sign: m[1], to: parseFloat(m[2].replace(/\./g, '')), suffix: m[3], grouped: m[2].indexOf('.') !== -1 };
  }
  function fmtNum(n, v){
    var s = String(Math.round(v));
    if(n.grouped) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return n.sign + s + n.suffix;
  }

  // ---- Hintergrund mit Tiefe ----
  var bg = document.createElement('div'); bg.className = 'mx-bg'; bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = '<div class="mx-orb o1"></div><div class="mx-orb o2"></div><div class="mx-orb o3"></div>';
  document.body.insertBefore(bg, document.body.firstChild);
  var orbs = bg.querySelectorAll('.mx-orb');

  // ---- Hero ----
  var hero = document.querySelector('#page-start .hero');
  var heroCopy = null, tilt = null;
  var tg = { rx: 0, ry: 0 }, cur = { rx: 0, ry: 0 };
  if(hero){
    var floor = document.createElement('div'); floor.className = 'mx-floor'; floor.setAttribute('aria-hidden', 'true');
    hero.insertBefore(floor, hero.firstChild);
    var h1 = hero.querySelector('h1');
    if(h1) splitWords(h1, 'mx-word').forEach(function(w, i){ w.style.animationDelay = (140 + i * 75) + 'ms'; });
    heroCopy = hero.querySelector('.hero-grid > div:first-child');
    if(heroCopy) heroCopy.classList.add('mx-hero-copy');
    var visual = hero.querySelector('.hero-visual');
    if(visual){
      tilt = document.createElement('div'); tilt.className = 'mx-tilt';
      while(visual.firstChild) tilt.appendChild(visual.firstChild);
      tilt.insertAdjacentHTML('afterbegin', '<div class="mx-orbit b" aria-hidden="true"><i></i></div><div class="mx-orbit" aria-hidden="true"><i></i></div>');
      visual.appendChild(tilt);
    }
  }

  // ---- Überschriften: Wort für Wort aufleuchten ----
  var litHeads = Array.prototype.map.call(document.querySelectorAll('.section-head h2'), function(h){
    h.classList.add('mx-lit');
    return { el: h, words: splitWords(h, 'mx-w') };
  });

  // ---- Zahlen-Szene vor den drei Gründen (Inhalt wird aus den Karten übernommen) ----
  var scene = null, facts = [], stepBars = [], ringFg = null, RING_LEN = 0;
  var reasons = document.querySelector('#page-start .reasons-grid');
  if(reasons){
    var cards = reasons.querySelectorAll('.card');
    scene = document.createElement('div'); scene.className = 'mx-scene'; scene.setAttribute('aria-hidden', 'true');
    var html = '<div class="mx-scene-sticky"><div class="mx-stage"><div class="mx-ringwrap"><svg viewBox="0 0 200 200"><circle class="bgc" cx="100" cy="100" r="96"/><circle class="fgc" cx="100" cy="100" r="96"/></svg></div>';
    Array.prototype.forEach.call(cards, function(c){
      var k = c.querySelector('.reason-kicker'), n = c.querySelector('.num'), l = c.querySelector('.lbl');
      html += '<div class="mx-fact"><div class="mx-kicker">' + (k ? k.textContent : '') + '</div><div class="mx-big">' + (n ? n.textContent : '') + '</div><div class="mx-lbl">' + (l ? l.textContent : '') + '</div></div>';
    });
    html += '</div><div class="mx-steps">' + Array.prototype.map.call(cards, function(){ return '<i><b></b></i>'; }).join('') + '</div></div>';
    scene.innerHTML = html;
    reasons.parentNode.insertBefore(scene, reasons);
    facts = Array.prototype.map.call(scene.querySelectorAll('.mx-fact'), function(f){
      var big = f.querySelector('.mx-big');
      return { el: f, big: big, num: parseNum(big.textContent), last: '' };
    });
    stepBars = scene.querySelectorAll('.mx-steps b');
    ringFg = scene.querySelector('.fgc');
    RING_LEN = 2 * Math.PI * 96;
    ringFg.style.strokeDasharray = RING_LEN;
    ringFg.style.strokeDashoffset = RING_LEN;
  }

  // ---- Hinweis-Boxen: Zoom beim Scrollen statt einfachem Einblenden ----
  var callouts = Array.prototype.slice.call(document.querySelectorAll('.callout-box'));
  callouts.forEach(function(c){ c.classList.remove('reveal'); c.style.transitionDelay = '0ms'; });

  // ---- Zahlen in den Karten hochzählen, sobald sichtbar ----
  if('IntersectionObserver' in window){
    var countIo = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        countIo.unobserve(en.target);
        var el = en.target, n = parseNum(el.textContent), t0 = null;
        if(!n) return;
        (function step(ts){
          if(t0 === null) t0 = ts;
          var t = clamp((ts - t0) / 1400, 0, 1);
          el.textContent = fmtNum(n, n.to * easeOut(t));
          if(t < 1) requestAnimationFrame(step);
        })(performance.now());
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('.reasons-grid .num, .stat-tile .num').forEach(function(el){ countIo.observe(el); });
  }

  // ---- Karten kippen beim Darüberfahren (nur mit Maus) ----
  if(finePointer){
    document.querySelectorAll('.card').forEach(function(card){
      if(card.closest('.reasons-grid')) return;
      card.addEventListener('pointermove', function(e){
        // offene Karten nicht kippen, das wirkt bei viel Text unruhig
        if(card.classList.contains('is-open')){ card.classList.remove('mx-tilting'); return; }
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg');
        card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        card.classList.add('mx-tilting');
      });
      card.addEventListener('pointerleave', function(){ card.classList.remove('mx-tilting'); });
      card.addEventListener('click', function(){ card.classList.remove('mx-tilting'); });
    });
  }

  // ---- Vergleichstabelle (Warum flexo.kapital): Zeilen und Häkchen erscheinen nacheinander ----
  var cmpBody = document.getElementById('compareBody');
  if(cmpBody && 'IntersectionObserver' in window){
    var cmpPrepare = function(){
      var cols = (cmpBody.getAttribute('style') || '').match(/grid-template-columns\s*:\s*([^;]+)/);
      var row = -1, col = 0, last = 0;
      Array.prototype.forEach.call(cmpBody.children, function(el){
        if(el.classList.contains('cmp-row-label')){ row++; col = 0; el.style.animationDelay = (row * 140) + 'ms'; return; }
        var icon = el.querySelector('.cmp-icon');
        var d = row * 140 + 120 + col * 70;
        if(icon) icon.style.animationDelay = d + 'ms';
        last = Math.max(last, d);
        col++;
      });
      cmpBody.style.setProperty('--mx-glow', (last + 450) + 'ms');
      cmpBody.classList.add('mx-cmp');
    };
    cmpPrepare();
    var cmpIo = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ cmpBody.classList.add('mx-play'); cmpIo.disconnect(); }
      });
    }, { threshold: 0.25 });
    cmpIo.observe(cmpBody);
  }

  // ---- Ablauf (Leistungen): Linie zeichnet sich beim Scrollen durch die Schritte ----
  var procRows = Array.prototype.map.call(document.querySelectorAll('.process-row'), function(rowEl){
    var line = document.createElement('div'); line.className = 'mx-line'; line.setAttribute('aria-hidden', 'true');
    line.innerHTML = '<b></b>';
    rowEl.insertBefore(line, rowEl.firstChild);
    return { el: rowEl, line: line, steps: rowEl.querySelectorAll('.process-step') };
  });

  // ---- eine gemeinsame Schleife für alles, was am Scrollen hängt ----
  var queued = false;
  function kick(){ if(!queued){ queued = true; requestAnimationFrame(frame); } }
  function frame(){
    queued = false;
    var y = window.scrollY, vh = window.innerHeight, again = false;

    orbs[0].style.transform = 'translate3d(0,' + (-y * 0.12).toFixed(1) + 'px,0)';
    orbs[1].style.transform = 'translate3d(0,' + (-y * 0.3).toFixed(1) + 'px,0)';
    orbs[2].style.transform = 'translate3d(0,' + (-y * 0.55).toFixed(1) + 'px,0)';

    if(hero && visible(hero)){
      var p = clamp(y / Math.max(hero.offsetHeight, 1), 0, 1);
      if(heroCopy){
        heroCopy.style.transform = 'translate3d(0,' + (-p * 70).toFixed(1) + 'px,0)';
        heroCopy.style.opacity = (1 - p * 0.85).toFixed(3);
      }
      if(tilt){
        // Logo dreht sich nicht, es wandert beim Scrollen nur leicht nach unten und wird etwas kleiner
        tilt.style.transform = 'translate3d(0,' + (p * 90).toFixed(1) + 'px,0) scale(' + (1 - p * 0.18).toFixed(3) + ')';
      }
    }

    litHeads.forEach(function(h){
      if(!visible(h.el)) return;
      var r = h.el.getBoundingClientRect();
      var q = smooth(vh * 0.95, vh * 0.55, r.top);
      var n = Math.ceil(q * h.words.length);
      h.words.forEach(function(w, i){ w.classList.toggle('on', i < n); });
    });

    if(scene && visible(scene)){
      var sr = scene.getBoundingClientRect();
      var total = Math.max(scene.offsetHeight - vh, 1);
      var sp = clamp(-sr.top / total, 0, 1);
      var seg = sp * facts.length;
      var activeCount = 0;
      facts.forEach(function(f, i){
        var local = seg - i;
        var inn = smooth(-0.1, 0.22, local);
        var out = i < facts.length - 1 ? 1 - smooth(0.74, 0.98, local) : 1;
        var a = inn * out;
        var rise = (1 - inn) * 70 - (1 - out) * 70;
        f.el.style.opacity = a.toFixed(3);
        f.el.style.transform = 'translate3d(0,' + rise.toFixed(1) + 'px,' + (-(1 - a) * 160).toFixed(1) + 'px) rotateX(' + ((1 - inn) * 28 - (1 - out) * 18).toFixed(2) + 'deg)';
        f.el.style.filter = a > 0.98 ? 'none' : 'blur(' + ((1 - a) * 12).toFixed(1) + 'px)';
        var c = easeOut(smooth(0, 0.5, local));
        if(f.num){
          var txt = fmtNum(f.num, f.num.to * c);
          if(txt !== f.last){ f.big.textContent = txt; f.last = txt; }
        }
        if(local >= 0 && local < 1) activeCount = c * out;
        if(stepBars[i]) stepBars[i].style.transform = 'scaleX(' + clamp(local, 0, 1).toFixed(3) + ')';
      });
      if(seg >= facts.length) activeCount = 1;
      ringFg.style.strokeDashoffset = (RING_LEN * (1 - activeCount)).toFixed(1);
    }

    callouts.forEach(function(c){
      if(!visible(c)) return;
      var r = c.getBoundingClientRect();
      var q = easeOut(smooth(vh * 1.02, vh * 0.55, r.top));
      c.style.transform = 'perspective(1000px) translate3d(0,' + ((1 - q) * 50).toFixed(1) + 'px,0) rotateX(' + ((1 - q) * 12).toFixed(2) + 'deg) scale(' + (0.88 + q * 0.12).toFixed(3) + ')';
      c.style.opacity = (0.15 + q * 0.85).toFixed(3);
    });

    procRows.forEach(function(pr){
      if(!visible(pr.el)) return;
      var r = pr.el.getBoundingClientRect();
      var first = pr.steps[0], lastStep = pr.steps[pr.steps.length - 1];
      if(first && lastStep){
        // Linie genau von der ersten bis zur letzten Nummer (nebeneinander am Computer, untereinander am Handy)
        var vertical = lastStep.offsetTop > first.offsetTop + 10;
        pr.line.style.top = (first.offsetTop + (vertical ? 18 : 17)) + 'px';
        pr.line.style.left = (first.offsetLeft + (vertical ? 17 : 18)) + 'px';
        pr.line.style.width = vertical ? '2px' : Math.max(lastStep.offsetLeft - first.offsetLeft, 0) + 'px';
        pr.line.style.height = vertical ? Math.max(lastStep.offsetTop - first.offsetTop, 0) + 'px' : '2px';
      }
      var q = smooth(vh * 0.85, vh * 0.85 - Math.max(r.height, vh * 0.35), r.top);
      pr.line.style.setProperty('--p', q.toFixed(3));
      var n = pr.steps.length;
      Array.prototype.forEach.call(pr.steps, function(st, i){
        st.classList.toggle('mx-on', q >= (n > 1 ? i / (n - 1) : 0) - 0.001 && q > 0.02);
      });
    });

    if(again) kick();
  }
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);
  window.addEventListener('hashchange', function(){ setTimeout(kick, 220); });
  document.addEventListener('click', function(){ setTimeout(kick, 220); });
  kick();
})();
