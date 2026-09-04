// AgentFlow landing reveals — vanilla mirror of frontend/src/anim.
// Elements with [data-anim] play once when scrolled into view.
// Variants: fade-up (default), fade-in, scale-in. Optional data-delay (ms).
(function () {
  try {
    document.documentElement.classList.add('af-js');
  } catch (e) { return; }
  var reduce = false;
  try {
    reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-anim]'));
  if (!els.length) return;
  function show(el) { el.classList.add('af-in'); }
  if (reduce || typeof IntersectionObserver === 'undefined') {
    els.forEach(show);
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        show(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  els.forEach(function (el) {
    var v = el.getAttribute('data-anim') || 'fade-up';
    el.classList.add('af-' + v);
    var d = parseInt(el.getAttribute('data-delay') || '0', 10);
    if (d > 0) el.style.setProperty('--af-delay', d + 'ms');
    io.observe(el);
  });
})();
