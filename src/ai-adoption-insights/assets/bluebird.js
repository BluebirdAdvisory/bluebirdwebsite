/*
 * Bluebird AI Adoption Insights: page shell.
 * Loaded after aat-charts.js and before the dashboard and assistant components.
 * No inline script, so the page works under a strict Content-Security-Policy.
 */
(function () {
  "use strict";

  var C = window.AATCharts;
  var INK = "#0f161c";
  var WHITE = "#fff";

  // 1. Bluebird chart palettes. The arrays are mutated in place because the components keep
  //    references to them. Colours live in bluebird.css; label inks were contrast-checked there.
  function swap(list, next) { list.splice.apply(list, [0, list.length].concat(next)); }
  swap(C.palettes.stage, [
    ["var(--bb-ind-1)", WHITE], ["var(--bb-ind-2)", WHITE], ["var(--bb-ind-3)", INK], ["var(--aat-s4)", INK],
    ["var(--bb-grey-1)", WHITE], ["var(--bb-grey-2)", INK], ["var(--bb-grey-3)", INK],
  ]);
  swap(C.palettes.levels, [
    ["var(--bb-ind-2)", WHITE], ["var(--bb-lv-2)", INK], ["var(--bb-lv-3)", INK], ["var(--bb-lv-4)", INK],
  ]);
  swap(C.palettes.agree, [
    ["var(--bb-ag-1)", WHITE], ["var(--bb-ag-2)", INK], ["var(--bb-ag-3)", INK],
    ["var(--bb-ag-4)", INK], ["var(--bb-ag-5)", WHITE], ["transparent", null],
  ]);

  // 2. Workspace tabs (ARIA tabs pattern). The selected tab lives in the URL hash, so a link
  //    such as #about opens that tab and an edited address switches tabs without a reload.
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".bb-tab"));
  var tabbar = document.querySelector(".bb-tabbar");

  function nameOf(tab) { return tab.id.replace("bb-tab-", ""); }

  function select(tab, opts) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (opts && opts.focus) tab.focus();
    if (opts && opts.hash) history.replaceState(null, "", "#" + nameOf(tab));
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { select(tab, { hash: true }); });
    tab.addEventListener("keydown", function (ev) {
      var next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[ev.key];
      if (next === undefined) return;
      ev.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], { focus: true, hash: true });
    });
  });

  function fromHash() {
    var tab = document.getElementById("bb-tab-" + location.hash.slice(1));
    if (tab && tabs.indexOf(tab) >= 0) select(tab);
  }
  fromHash();
  window.addEventListener("hashchange", fromHash);

  // 3. When a question is asked, bring the workspace to the top so the conversation has the screen.
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Deferred one tick: these listeners run before the assistant swaps the welcome for the
  // conversation, and scrolling while the page is still short stops the scroll part-way.
  function focusWorkspace() {
    setTimeout(function () {
      var top = tabbar.getBoundingClientRect().top;
      if (top > 1) window.scrollBy({ top: top, behavior: reduce ? "auto" : "smooth" });
    }, 0);
  }
  var assistant = document.getElementById("bb-assistant");
  if (!assistant) return; // the static build has no assistant
  assistant.addEventListener("submit", function () {
    var input = assistant.querySelector("textarea");
    if (input && input.value.trim()) focusWorkspace();
  }, true);
  assistant.addEventListener("click", function (ev) {
    if (ev.target.closest && ev.target.closest(".aaa-chip")) focusWorkspace();
  }, true);
})();
