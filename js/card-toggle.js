(function(){
  var grids = Array.prototype.slice.call(document.querySelectorAll('.services-grid, .pillars-grid'));
  grids.forEach(function(grid){
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.card.expandable'));
    if (!cards.length) return;
    function columnCount(){
      var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean);
      return cols.length || 1;
    }
    function rowPartners(i){
      var cols = columnCount();
      if (cols <= 1) return [];
      var rowStart = Math.floor(i / cols) * cols;
      var rowEnd = Math.min(rowStart + cols, cards.length);
      var partners = [];
      for (var j = rowStart; j < rowEnd; j++){
        if (j !== i) partners.push(cards[j]);
      }
      return partners;
    }
    cards.forEach(function(card, i){
      function toggleCard(){
        var open = card.classList.toggle('is-open');
        card.setAttribute('aria-expanded', open ? 'true' : 'false');
        rowPartners(i).forEach(function(partner){
          partner.classList.toggle('row-partner-open', open);
        });
      }
      card.addEventListener('click', toggleCard);
      card.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCard();
        }
      });
    });
  });
})();
