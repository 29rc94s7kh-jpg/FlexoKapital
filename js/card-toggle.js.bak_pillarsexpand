(function(){
  var cards = Array.prototype.slice.call(document.querySelectorAll('.services-grid .card.expandable'));
  cards.forEach(function(card, i){
    function rowPartner(){
      var partnerIndex = (i % 2 === 0) ? i + 1 : i - 1;
      return cards[partnerIndex] || null;
    }
    function toggleCard(){
      var open = card.classList.toggle('is-open');
      card.setAttribute('aria-expanded', open ? 'true' : 'false');
      var partner = rowPartner();
      if (partner) partner.classList.toggle('row-partner-open', open);
    }
    card.addEventListener('click', toggleCard);
    card.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCard();
      }
    });
  });
})();
