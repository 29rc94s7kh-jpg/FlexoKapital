// Aufklappbare Karten (Leistungen, "Worauf es uns ankommt", "Drei Gründe"):
// - Höhe wird weich animiert (von 0 auf die echte Inhaltshöhe und zurück)
// - Nachbarkarten in derselben Zeile behalten während des Auf- und Zuklappens exakt ihre Höhe,
//   damit nichts springt; erst wenn in der Zeile keine Karte mehr offen ist, werden sie wieder freigegeben.
(function(){
  var DURATION = 560;
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var grids = Array.prototype.slice.call(document.querySelectorAll('.services-grid, .pillars-grid, .reasons-grid'));
  grids.forEach(function(grid){
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.card.expandable'));
    if (!cards.length) return;
    function columnCount(){
      var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean);
      return cols.length || 1;
    }
    function rowOf(i){
      var cols = columnCount();
      var start = Math.floor(i / cols) * cols;
      var row = [];
      for (var j = start; j < Math.min(start + cols, cards.length); j++) row.push(j);
      return { cols: cols, idx: row };
    }
    // Nachbarn auf ihrer aktuellen Höhe festhalten
    function lockPartners(i){
      var r = rowOf(i);
      if (r.cols <= 1) return;
      r.idx.forEach(function(j){
        var c = cards[j];
        if (j === i || c.classList.contains('is-open') || c.classList.contains('row-partner-open')) return;
        c.style.height = c.offsetHeight + 'px';
        c.classList.add('row-partner-open');
      });
    }
    // Nachbarn wieder freigeben, wenn in der Zeile nichts mehr offen ist
    function releaseRow(i){
      var r = rowOf(i);
      var anyOpen = r.idx.some(function(j){ return cards[j].classList.contains('is-open'); });
      if (anyOpen) return;
      r.idx.forEach(function(j){ cards[j].style.height = ''; cards[j].classList.remove('row-partner-open'); });
    }
    function setOpen(card, i, open){
      var detail = card.querySelector('.card-detail');
      if (!detail) return;
      clearTimeout(detail._mxTimer);
      if (open){
        card.style.height = '';
        card.classList.remove('row-partner-open');
        lockPartners(i);
        var from = detail.getBoundingClientRect().height;
        card.classList.add('is-open');
        var to = detail.scrollHeight;
        if (reduced){ detail.style.height = 'auto'; return; }
        detail.style.height = from + 'px';
        void detail.offsetHeight;
        detail.style.height = to + 'px';
        detail._mxTimer = setTimeout(function(){ if (card.classList.contains('is-open')) detail.style.height = 'auto'; }, DURATION + 40);
      } else {
        // Ist in der Zeile noch eine andere Karte offen, schrumpft diese hier auf ihre eigene Höhe statt gestreckt zu bleiben
        var r = rowOf(i);
        if (r.cols > 1 && r.idx.some(function(j){ return j !== i && cards[j].classList.contains('is-open'); })) card.classList.add('row-partner-open');
        detail.style.height = detail.getBoundingClientRect().height + 'px';
        void detail.offsetHeight;
        card.classList.remove('is-open');
        detail.style.height = '0px';
        if (reduced){ releaseRow(i); return; }
        detail._mxTimer = setTimeout(function(){ if (!card.classList.contains('is-open')) releaseRow(i); }, DURATION + 40);
      }
    }
    cards.forEach(function(card, i){
      function toggleCard(){
        var open = !card.classList.contains('is-open');
        card.setAttribute('aria-expanded', open ? 'true' : 'false');
        setOpen(card, i, open);
      }
      card.addEventListener('click', function(e){
        // Text in einer offenen Karte markieren soll sie nicht zuklappen
        var sel = window.getSelection && String(window.getSelection());
        if (sel && card.classList.contains('is-open') && card.contains(window.getSelection().anchorNode)) return;
        toggleCard();
      });
      card.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCard();
        }
      });
    });
    // Bei Größenänderung (z. B. Handy drehen) festgehaltene Höhen neu setzen
    var resizeTimer;
    window.addEventListener('resize', function(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function(){
        cards.forEach(function(c){ c.style.height = ''; c.classList.remove('row-partner-open'); });
        cards.forEach(function(c, i){ if (c.classList.contains('is-open')) lockPartners(i); });
      }, 150);
    });
  });
})();
