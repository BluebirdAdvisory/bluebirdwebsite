/*
 * Bluebird AI Solutions: enhancement for the hub and product pages.
 * Optional. Without this file the pages read in full and every <details> panel
 * still opens and closes natively. There is no mobile menu code here because
 * the site's header script already handles it, and a second handler would cancel it.
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  function $all(selector, context) {
    return Array.prototype.slice.call((context || doc).querySelectorAll(selector));
  }

  /* ------------------------------------------------------------------
   * On-this-page bar: height for scroll offsets, and current section
   * ------------------------------------------------------------------ */
  function syncOnpageHeight() {
    var bar = doc.querySelector('.onpage');
    if (!bar) { return; }
    root.style.setProperty('--onpage-h', bar.offsetHeight + 'px');
  }

  function initOnpage() {
    var bar = doc.querySelector('.onpage');
    if (!bar) { return; }
    syncOnpageHeight();
    window.addEventListener('resize', syncOnpageHeight);
    window.addEventListener('load', syncOnpageHeight);

    if (!('IntersectionObserver' in window)) { return; }
    var list = bar.querySelector('ul');
    var links = $all('a[href^="#"]', bar);
    var byId = {};
    links.forEach(function (link) { byId[link.getAttribute('href').slice(1)] = link; });
    var current = '';

    function reveal(link) {
      if (!list) { return; }
      var left = link.offsetLeft;
      var right = left + link.offsetWidth;
      if (left < list.scrollLeft) {
        list.scrollLeft = Math.max(0, left - 16);
      } else if (right > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = right - list.clientWidth + 16;
      }
    }

    function setCurrent(id) {
      if (id === current) { return; }
      current = id;
      links.forEach(function (link) {
        if (byId[id] === link) { link.setAttribute('aria-current', 'true'); }
        else { link.removeAttribute('aria-current'); }
      });
      if (byId[id]) { reveal(byId[id]); }
    }

    // A thin band just under the bar: the section crossing it is "current"
    var observer = new IntersectionObserver(function (entries) {
      var next = current;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting && entry.target.id === next) { next = ''; }
      });
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { next = entry.target.id; }
      });
      setCurrent(next);
    }, { rootMargin: '-20% 0px -75% 0px', threshold: 0 });

    Object.keys(byId).forEach(function (id) {
      var section = doc.getElementById(id);
      if (section) { observer.observe(section); }
    });
  }

  /* ------------------------------------------------------------------
   * Deep links: #id of a <details> opens it
   * ------------------------------------------------------------------ */
  function hashId() {
    var raw = window.location.hash.slice(1);
    if (!raw) { return ''; }
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function goToHash() {
    var id = hashId();
    if (!id) { return; }
    var target = doc.getElementById(id);
    if (!target) { return; }
    if (target.tagName === 'DETAILS') { target.open = true; }
    if (typeof target.scrollIntoView === 'function') { target.scrollIntoView({ block: 'start' }); }
  }

  function setHash(id) {
    try {
      window.history.replaceState(null, '', id ? '#' + id : window.location.pathname + window.location.search);
    } catch (e) { /* blocked on some file:// setups: harmless */ }
  }

  function initDeepLinks() {
    goToHash();
    window.addEventListener('hashchange', goToHash);
    // Only a real click on a summary updates the URL; programmatic opens never do.
    doc.addEventListener('click', function (event) {
      var summary = event.target && event.target.closest ? event.target.closest('summary') : null;
      if (!summary) { return; }
      var panel = summary.parentNode;
      if (!panel || panel.tagName !== 'DETAILS' || !panel.id) { return; }
      if (!panel.open) { setHash(panel.id); }
      else if (hashId() === panel.id) { setHash(''); }
    });
  }

  /* ------------------------------------------------------------------
   * Expand all / Collapse all, scoped to [data-acc-scope]
   * ------------------------------------------------------------------ */
  function initExpandAll() {
    $all('[data-expand-all]').forEach(function (button) {
      var scope = button.closest('[data-acc-scope]');
      if (!scope) { return; }
      var panels = $all('details', scope);
      if (!panels.length) { return; }
      var label = button.querySelector('.js-label') || button;

      function allOpen() { return panels.every(function (p) { return p.open; }); }
      function sync() {
        var open = allOpen();
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        label.textContent = open ? 'Collapse all' : 'Expand all';
      }

      button.setAttribute('aria-controls', panels.map(function (p) { return p.id; }).join(' '));
      button.hidden = false;
      button.addEventListener('click', function () {
        var open = !allOpen();
        panels.forEach(function (p) { p.open = open; });
        sync();
      });
      panels.forEach(function (p) { p.addEventListener('toggle', sync); });
      sync();
    });
  }

  /* ------------------------------------------------------------------
   * Print: open every panel, then restore
   * ------------------------------------------------------------------ */
  var closedBeforePrint = null;

  function openAllForPrint() {
    if (closedBeforePrint) { return; }
    closedBeforePrint = $all('details').filter(function (p) { return !p.open; });
    closedBeforePrint.forEach(function (p) { p.open = true; });
  }

  function restoreAfterPrint() {
    if (!closedBeforePrint) { return; }
    closedBeforePrint.forEach(function (p) { p.open = false; });
    closedBeforePrint = null;
  }

  function initPrint() {
    window.addEventListener('beforeprint', openAllForPrint);
    window.addEventListener('afterprint', restoreAfterPrint);
    if (typeof window.matchMedia !== 'function') { return; }
    var query = window.matchMedia('print');
    var onChange = function (event) { if (event.matches) { openAllForPrint(); } else { restoreAfterPrint(); } };
    try {
      if (typeof query.addEventListener === 'function') { query.addEventListener('change', onChange); }
      else if (typeof query.addListener === 'function') { query.addListener(onChange); }
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------
   * AnswerHatch example: one answer shape at a time. Without this
   * script both shapes stay visible and the buttons stay hidden.
   * ------------------------------------------------------------------ */
  function initRefuse() {
    $all('[data-refuse]').forEach(function (block) {
      var controls = block.querySelector('.refuse-btns');
      var buttons = $all('.refuse-btn', block);
      var panels = $all('.refuse-panel', block);
      if (!controls || buttons.length !== panels.length) { return; }
      function show(index) {
        buttons.forEach(function (b, i) { b.setAttribute('aria-pressed', i === index ? 'true' : 'false'); });
        panels.forEach(function (p, i) { p.hidden = i !== index; });
      }
      controls.hidden = false;
      buttons.forEach(function (b, i) { b.addEventListener('click', function () { show(i); }); });
      show(0);
    });
  }

  function init() {
    initRefuse();
    initExpandAll();
    initPrint();
    initOnpage();
    initDeepLinks(); // last, so the bar height is in place before scrolling
  }

  if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();
