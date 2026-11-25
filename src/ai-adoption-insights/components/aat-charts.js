/*
 * AAT charts: a small, dependency-free chart kit for the AI adoption tracker.
 * Shared by the static dashboard (Route A) and the AI assistant (Route B), so a
 * chart looks and behaves the same whichever route renders it.
 *
 * Security: every label and value is inserted with textContent, never innerHTML,
 * because labels can come from data files or model output. No inline <script>
 * or style attributes are emitted; dynamic sizes use CSS custom properties set
 * through the CSSOM, which a strict Content-Security-Policy allows.
 */
(function (global) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var REDUCED_MOTION = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function h(tag, cls, parent, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  function s(tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function paint(node, prop, color) { node.style.setProperty(prop, color); return node; }

  var fmt = {
    pct0: function (v) { return v == null ? "n/a" : Math.round(v) + "%"; },
    pct1: function (v) { return v == null ? "Insufficient data" : v.toFixed(1) + "%"; },
    pts: function (v) {
      if (v == null) return "";
      var r = Math.round(v * 10) / 10;
      if (r === 0) return "no change";
      return (r > 0 ? "up " : "down ") + Math.abs(r).toFixed(1) + " pts";
    },
    int: function (v) { return v == null ? "n/a" : v.toLocaleString("en-AU"); }
  };

  /* ---------- shared pieces ---------- */

  function createTooltip(host) {
    var tip = h("div", "aatc-tip", host);
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    return {
      show: function (x, y, title, rows) {
        tip.replaceChildren();
        h("div", "aatc-tip__title", tip, title);
        rows.forEach(function (r) {
          var row = h("div", "aatc-tip__row", tip);
          if (r.color) paint(h("span", "aatc-tip__key" + (r.box ? " is-box" : ""), row), "--c", r.color);
          h("strong", "aatc-tip__value", row, r.value);
          h("span", "aatc-tip__label", row, r.label);
        });
        tip.hidden = false;
        var hostW = host.clientWidth, tipW = tip.offsetWidth, tipH = tip.offsetHeight;
        var left = x + 14;
        if (left + tipW > hostW - 4) left = Math.max(4, x - tipW - 14);
        var top = Math.max(4, y - tipH / 2);
        tip.style.setProperty("--x", left + "px");
        tip.style.setProperty("--y", top + "px");
      },
      hide: function () { tip.hidden = true; }
    };
  }

  function legend(host, items, kind) {
    var ul = h("ul", "aatc-legend", host);
    ul.setAttribute("aria-label", "Legend");
    items.forEach(function (it) {
      var li = h("li", "aatc-legend__item", ul);
      paint(h("span", "aatc-legend__key aatc-legend__key--" + (it.kind || kind), li), "--c", it.color);
      h("span", null, li, it.label);
    });
    return ul;
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    var steps = [10, 20, 25, 40, 50, 60, 75, 80, 100];
    for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 10) * 10;
  }

  function onResize(node, fn) {
    // Seed with the current width so the observer's first callback does not redraw (and cut the intro animation).
    var last = Math.round(node.getBoundingClientRect().width), frame = 0;
    if (!global.ResizeObserver) return;
    var ro = new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (w === last || w === 0) return;
      last = w;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fn);
    });
    ro.observe(node);
  }

  /* ---------- line chart (crosshair + tooltip, end labels with leaders) ---------- */

  function lineChart(host, opts) {
    host.replaceChildren();
    host.classList.add("aatc", "aatc-line");
    var series = opts.series;
    var valueFmt = opts.format || fmt.pct1;
    if (series.length > 1) legend(host, series.map(function (sr) { return { label: sr.label, color: sr.color }; }), "line");
    var plot = h("div", "aatc-plot", host);
    var tip = createTooltip(plot);
    var live = h("div", "aatc-sr", host);
    live.setAttribute("aria-live", "polite");
    var n = opts.xLabels.length;

    function draw() {
      plot.querySelectorAll("svg").forEach(function (old) { old.remove(); });
      var W = Math.max(260, plot.clientWidth);
      var narrow = W < 540;
      var H = opts.height || (narrow ? 230 : 290);
      var endLabels = opts.endLabels !== false && !narrow;
      var m = { t: 14, r: endLabels ? (opts.endLabelWidth || 168) : 18, b: 34, l: 40 };
      var pw = W - m.l - m.r, ph = H - m.t - m.b;

      var maxVal = 0;
      series.forEach(function (sr) { sr.values.forEach(function (v) { if (v != null && v > maxVal) maxVal = v; }); });
      var yMax = opts.yMax || niceMax(maxVal * 1.08);
      var yStep = yMax <= 50 ? 10 : yMax <= 80 ? 20 : 25;
      var x = function (i) { return m.l + (n === 1 ? pw / 2 : (i * pw) / (n - 1)); };
      var y = function (v) { return m.t + ph - (v / yMax) * ph; };

      // The drawing is hidden from assistive tech; the focusable crosshair layer (added to root below)
      // is the accessible element, so it must sit outside the aria-hidden group.
      var root = s("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, class: "aatc-svg" }, plot);
      var svg = s("g", { "aria-hidden": "true" }, root);

      for (var t = 0; t <= yMax + 0.001; t += yStep) {
        s("line", { x1: m.l, x2: m.l + pw, y1: y(t), y2: y(t), class: t === 0 ? "aatc-axis" : "aatc-grid" }, svg);
        s("text", { x: m.l - 8, y: y(t) + 4, class: "aatc-tick", "text-anchor": "end" }, svg).textContent = t + "%";
      }
      var maxTicks = Math.max(2, Math.floor(pw / 74));
      var every = Math.ceil(n / maxTicks);
      for (var i = 0; i < n; i++) {
        if ((n - 1 - i) % every !== 0) continue;
        s("text", { x: x(i), y: H - 10, class: "aatc-tick", "text-anchor": i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle" }, svg)
          .textContent = (opts.xTicks || opts.xLabels)[i];
      }

      // Muted (context) series first so the story series draws on top.
      var ordered = series.slice().sort(function (a, b) { return (b.muted ? 1 : 0) - (a.muted ? 1 : 0); });
      var ends = [];
      ordered.forEach(function (sr) {
        var d = "", pen = false, lastIdx = -1;
        sr.values.forEach(function (v, i) {
          if (v == null) { pen = false; return; }
          d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1);
          pen = true; lastIdx = i;
        });
        if (opts.area && series.length === 1 && d) {
          var first = sr.values.findIndex(function (v) { return v != null; });
          paint(s("path", { d: d + "L" + x(lastIdx) + "," + y(0) + "L" + x(first) + "," + y(0) + "Z", class: "aatc-area" }, svg), "--c", sr.color);
        }
        var path = paint(s("path", { d: d, class: "aatc-line__path" + (sr.muted ? " is-muted" : "") }, svg), "--c", sr.color);
        // A quarter with suppressed neighbours on both sides has no line segment, so mark it with a dot.
        sr.values.forEach(function (v, i) {
          if (v != null && sr.values[i - 1] == null && sr.values[i + 1] == null && i !== lastIdx) {
            paint(s("circle", { cx: x(i), cy: y(v), r: 3.5, class: "aatc-dot" }, svg), "--c", sr.color);
          }
        });
        if (!REDUCED_MOTION && opts.animate !== false) {
          var len = path.getTotalLength ? path.getTotalLength() : 0;
          if (len) { path.style.setProperty("--len", len); path.classList.add("is-drawing"); }
        }
        if (lastIdx >= 0) {
          paint(s("circle", { cx: x(lastIdx), cy: y(sr.values[lastIdx]), r: 4.5, class: "aatc-dot" }, svg), "--c", sr.color);
          ends.push({ sr: sr, x: x(lastIdx), y: y(sr.values[lastIdx]), v: sr.values[lastIdx] });
        }
      });

      if (endLabels && ends.length) {
        // Space labels at least 18px apart; leader lines keep each label tied to its line.
        ends.sort(function (a, b) { return a.y - b.y; });
        var gap = 18;
        ends.forEach(function (e, k) { e.ly = k === 0 ? e.y : Math.max(e.y, ends[k - 1].ly + gap); });
        var overflow = ends[ends.length - 1].ly - (m.t + ph);
        if (overflow > 0) ends.forEach(function (e) { e.ly -= overflow; });
        for (var k = 1; k < ends.length; k++) ends[k].ly = Math.max(ends[k].ly, ends[k - 1].ly + gap);
        ends.forEach(function (e) {
          var lx = m.l + pw + 14;
          if (Math.abs(e.ly - e.y) > 1) s("path", { d: "M" + (e.x + 7) + "," + e.y + "L" + (lx - 4) + "," + e.ly, class: "aatc-leader" }, svg);
          var label = s("text", { x: lx, y: e.ly + 4, class: "aatc-endlabel" }, svg);
          s("tspan", { class: "aatc-endlabel__value" }, label).textContent = fmt.pct0(e.v) + " ";
          var name = s("tspan", {}, label);
          var full = e.sr.shortLabel || e.sr.label;
          name.textContent = full;
          // Never let an end label run off the chart: trim it (the legend carries the full name).
          var room = W - lx - 4;
          if (label.getComputedTextLength && label.getComputedTextLength() > room) {
            for (var cut = full.length - 1; cut > 3 && label.getComputedTextLength() > room; cut--) name.textContent = full.slice(0, cut) + "…";
          }
        });
      }

      // Crosshair layer: the pointer finds the nearest quarter; keyboard does the same.
      var cross = s("line", { y1: m.t, y2: m.t + ph, class: "aatc-cross", visibility: "hidden" }, svg);
      var marks = series.map(function (sr) { return paint(s("circle", { r: 5, class: "aatc-dot is-hover", visibility: "hidden" }, svg), "--c", sr.color); });
      var hit = s("rect", { x: m.l - 10, y: m.t, width: pw + 20, height: ph, class: "aatc-hit", tabindex: "0", role: "img",
        "aria-label": (opts.ariaLabel || "Line chart") + ". Use the left and right arrow keys to read values for each quarter." }, root);
      var current = n - 1;

      function show(i) {
        current = i;
        cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
        var rows = [];
        series.forEach(function (sr, k) {
          var v = sr.values[i];
          if (v == null) { marks[k].setAttribute("visibility", "hidden"); }
          else { marks[k].setAttribute("cx", x(i)); marks[k].setAttribute("cy", y(v)); marks[k].setAttribute("visibility", "visible"); }
          rows.push({ color: sr.color, label: sr.label, value: valueFmt(v) });
        });
        rows.sort(function (a, b) { return (parseFloat(b.value) || -1) - (parseFloat(a.value) || -1); });
        var top = Math.min.apply(null, series.map(function (sr) { return sr.values[i] == null ? m.t + ph : y(sr.values[i]); }));
        tip.show(x(i), Math.max(m.t + 20, top), opts.xLabels[i], rows);
        live.textContent = opts.xLabels[i] + ": " + rows.map(function (r) { return r.label + " " + r.value; }).join(", ");
      }
      function hide() {
        cross.setAttribute("visibility", "hidden");
        marks.forEach(function (mk) { mk.setAttribute("visibility", "hidden"); });
        tip.hide();
      }
      hit.addEventListener("pointermove", function (ev) {
        var rect = root.getBoundingClientRect();
        var px = ev.clientX - rect.left;
        var i = n === 1 ? 0 : Math.round(((px - m.l) / pw) * (n - 1));
        show(Math.min(n - 1, Math.max(0, i)));
      });
      hit.addEventListener("pointerleave", hide);
      hit.addEventListener("focus", function () { show(current); });
      hit.addEventListener("blur", hide);
      hit.addEventListener("keydown", function (ev) {
        var keys = { ArrowLeft: -1, ArrowRight: 1 };
        if (ev.key in keys) { ev.preventDefault(); show(Math.min(n - 1, Math.max(0, current + keys[ev.key]))); }
        else if (ev.key === "Home") { ev.preventDefault(); show(0); }
        else if (ev.key === "End") { ev.preventDefault(); show(n - 1); }
        else if (ev.key === "Escape") { hide(); }
      });
    }

    draw();
    onResize(plot, function () { opts.animate = false; draw(); });
  }

  /* ---------- ranked horizontal bars ---------- */

  function barList(host, opts) {
    host.replaceChildren();
    host.classList.add("aatc", "aatc-bars");
    var valueFmt = opts.format || fmt.pct0;
    var max = opts.max || niceMax(Math.max.apply(null, opts.rows.map(function (r) { return r.value || 0; })));
    var tip = createTooltip(host);
    var list = h("ol", "aatc-bars__list", host);
    opts.rows.forEach(function (r, idx) {
      var li = h("li", "aatc-bar" + (r.highlight ? " is-highlight" : "") + (r.muted ? " is-muted" : ""), list);
      h("span", "aatc-bar__label", li, r.label);
      var track = h("span", "aatc-bar__track", li);
      if (r.value == null) {
        h("span", "aatc-bar__na", track, "Insufficient data");
      } else {
        var lane = h("span", "aatc-bar__lane", track);
        var fill = h("span", "aatc-bar__fill", lane);
        paint(fill, "--c", r.highlight ? (opts.highlightColor || opts.color) : r.muted ? (opts.mutedColor || "var(--aat-muted-mark)") : opts.color);
        fill.style.setProperty("--w", Math.max(0.5, (r.value / max) * 100).toFixed(2) + "%");
        fill.style.setProperty("--delay", REDUCED_MOTION ? "0ms" : (idx * 35) + "ms");
        h("span", "aatc-bar__value", lane, valueFmt(r.value));
      }
      if (r.delta != null) {
        var cls = r.delta > 0.05 ? " is-up" : r.delta < -0.05 ? " is-down" : "";
        var d = h("span", "aatc-bar__delta" + cls, li);
        d.textContent = (r.delta > 0.05 ? "▲ " : r.delta < -0.05 ? "▼ " : "") + Math.abs(Math.round(r.delta * 10) / 10).toFixed(1);
        d.setAttribute("aria-label", fmt.pts(r.delta) + (opts.deltaLabel ? " " + opts.deltaLabel : ""));
        d.title = fmt.pts(r.delta) + (opts.deltaLabel ? " " + opts.deltaLabel : "");
      }
      li.addEventListener("pointermove", function (ev) {
        var rect = host.getBoundingClientRect();
        var rows = [{ color: r.highlight ? (opts.highlightColor || opts.color) : opts.color, box: true, label: opts.valueLabel || "of SMEs", value: fmt.pct1(r.value) }];
        if (r.n != null) rows.push({ label: "responses (unweighted)", value: fmt.int(r.n) });
        if (r.delta != null) rows.push({ label: opts.deltaLabel || "", value: fmt.pts(r.delta) });
        tip.show(ev.clientX - rect.left, ev.clientY - rect.top, r.label, rows);
      });
      li.addEventListener("pointerleave", tip.hide);
    });
    if (!REDUCED_MOTION) requestAnimationFrame(function () { host.classList.add("is-ready"); });
    else host.classList.add("is-ready");
  }

  /* ---------- stacked and diverging stacked bars ---------- */

  function stackedBars(host, opts) {
    host.replaceChildren();
    host.classList.add("aatc", "aatc-stack");
    var segs = opts.segments;
    var div = opts.diverging || null;
    var excluded = div && div.exclude != null ? div.exclude : null;
    legend(host, segs.filter(function (_, i) { return i !== excluded; })
      .map(function (sg) { return { label: sg.label, color: sg.color }; }), "box");
    var tip = createTooltip(host);
    var body = h("div", "aatc-stack__rows" + (div ? " is-diverging" : ""), host);

    var maxLeft = 0, maxRight = 0;
    if (div) {
      opts.rows.forEach(function (r) {
        if (!r.values) return;
        var neutral = r.values[div.neutral] / 2;
        var left = div.left.reduce(function (a, i) { return a + r.values[i]; }, 0) + neutral;
        var right = div.right.reduce(function (a, i) { return a + r.values[i]; }, 0) + neutral;
        maxLeft = Math.max(maxLeft, left); maxRight = Math.max(maxRight, right);
      });
    }
    var span = maxLeft + maxRight || 100;

    opts.rows.forEach(function (r) {
      var row = h("div", "aatc-stack__row" + (r.highlight ? " is-highlight" : ""), body);
      var head = h("div", "aatc-stack__head", row);
      h("span", "aatc-stack__label", head, r.label);
      if (excluded != null && r.values) h("span", "aatc-stack__aside", head, segs[excluded].label + " " + fmt.pct0(r.values[excluded]));
      var bar = h("div", "aatc-stack__bar", row);
      if (!r.values) { h("span", "aatc-bar__na", bar, "Insufficient data"); return; }

      var order, starts = {};
      if (div) {
        var pos = maxLeft - r.values[div.neutral] / 2;
        div.left.slice().reverse().forEach(function (i) { pos -= r.values[i]; });
        order = div.left.slice().reverse().concat([div.neutral], div.right);
        order.forEach(function (i) { starts[i] = pos; pos += r.values[i]; });
        paint(bar, "--center", ((maxLeft / span) * 100).toFixed(2) + "%");
      } else {
        order = segs.map(function (_, i) { return i; });
      }
      order.forEach(function (i, k) {
        var v = r.values[i];
        if (!v) return;
        var seg = h("span", "aatc-seg" + (k === 0 ? " is-first" : "") + (k === order.length - 1 ? " is-last" : ""), bar);
        paint(seg, "--c", segs[i].color);
        paint(seg, "--ink", segs[i].ink || "#fff");
        if (div) {
          seg.classList.add("is-abs");
          seg.style.setProperty("--l", ((starts[i] / span) * 100).toFixed(3) + "%");
          seg.style.setProperty("--w", ((v / span) * 100).toFixed(3) + "%");
        } else {
          seg.style.setProperty("--w", v.toFixed(3) + "%");
        }
        // ink: null means neither white nor near-black text reaches 4.5:1 on this fill, so no inline label.
        if (segs[i].ink !== null) {
          var lab = h("span", "aatc-seg__label", seg, fmt.pct0(v));
          lab.setAttribute("aria-hidden", "true");
        }
        seg.addEventListener("pointermove", function (ev) {
          var rect = host.getBoundingClientRect();
          tip.show(ev.clientX - rect.left, ev.clientY - rect.top, r.label, [
            { color: segs[i].color, box: true, label: segs[i].label, value: fmt.pct1(v) },
            r.n != null ? { label: "responses (unweighted)", value: fmt.int(r.n) } : null
          ].filter(Boolean));
        });
        seg.addEventListener("pointerleave", tip.hide);
      });
      if (div) h("span", "aatc-stack__center", bar);
    });

    // Labels go inside a segment only when they fit with padding; otherwise the tooltip and table carry them.
    function fit() {
      host.querySelectorAll(".aatc-seg").forEach(function (seg) {
        var lab = seg.firstChild;
        if (!lab) return;
        seg.classList.remove("is-tight");
        if (lab.scrollWidth + 10 > seg.clientWidth) seg.classList.add("is-tight");
      });
    }
    requestAnimationFrame(fit);
    onResize(body, fit);
  }

  /* ---------- sparkline ---------- */

  function sparkline(host, values, opts) {
    opts = opts || {};
    host.replaceChildren();
    var W = 120, H = 34, pad = 4;
    var vals = values.filter(function (v) { return v != null; });
    if (vals.length < 2) return;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var range = max - min || 1;
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, class: "aatc-spark", "aria-hidden": "true", focusable: "false" }, host);
    var d = "", pen = false, last = null;
    values.forEach(function (v, i) {
      if (v == null) { pen = false; return; }
      var px = pad + (i * (W - pad * 2)) / (values.length - 1);
      var py = H - pad - ((v - min) / range) * (H - pad * 2);
      d += (pen ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1);
      pen = true; last = [px, py];
    });
    paint(s("path", { d: d, class: "aatc-spark__line" }, svg), "--c", opts.color || "var(--aat-muted-line)");
    if (last) paint(s("circle", { cx: last[0], cy: last[1], r: 3.5, class: "aatc-spark__dot" }, svg), "--c", opts.accent || "var(--aat-s1)");
  }

  /* ---------- table view and CSV ---------- */

  function dataTable(host, spec) {
    var details = h("details", "aatc-table", host);
    h("summary", "aatc-table__toggle", details, spec.toggleLabel || "Show data table");
    var scroller = h("div", "aatc-table__scroll", details);
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", spec.caption);
    var table = h("table", null, scroller);
    h("caption", null, table, spec.caption);
    var thead = h("thead", null, table), tr = h("tr", null, thead);
    spec.columns.forEach(function (c, i) { var th = h("th", i ? "is-num" : null, tr, c); th.scope = "col"; });
    var tbody = h("tbody", null, table);
    spec.rows.forEach(function (row) {
      var r = h("tr", null, tbody);
      row.forEach(function (cell, i) {
        if (i === 0) { var th = h("th", null, r, cell); th.scope = "row"; }
        else h("td", "is-num", r, cell == null ? "Insufficient data" : typeof cell === "number" ? cell.toFixed(1) : cell);
      });
    });
    return details;
  }

  function csvCell(v) {
    var str = v == null ? "" : String(v);
    // Guard against spreadsheet formula injection as well as quoting.
    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }

  function downloadCSV(filename, columns, rows, notice) {
    var lines = [];
    if (notice) lines.push(csvCell(notice));
    lines.push(columns.map(csvCell).join(","));
    rows.forEach(function (r) { lines.push(r.map(csvCell).join(",")); });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // Validated palette assignments shared by both components: [fill, label ink].
  // Ink null = no inline label (neither white nor near-black text reaches 4.5:1 on that fill).
  var INK = "#0f161c";
  var palettes = {
    categorical: ["var(--aat-s1)", "var(--aat-s2)", "var(--aat-s3)", "var(--aat-s4)"],
    stage: [["var(--aat-jade-1)", "#fff"], ["var(--aat-jade-2)", INK], ["var(--aat-jade-3)", INK], ["var(--aat-s4)", INK],
      ["var(--aat-grey-1)", "#fff"], ["var(--aat-grey-2)", INK], ["var(--aat-grey-3)", INK]],
    levels: [["var(--aat-jade-1)", "#fff"], ["var(--aat-jade-3)", INK], ["var(--aat-grey-2)", INK], ["var(--aat-grey-3)", INK]],
    agree: [["var(--aat-orange-1)", null], ["var(--aat-orange-2)", INK], ["var(--aat-neutral)", INK],
      ["var(--aat-jade-3)", INK], ["var(--aat-jade-1)", "#fff"], ["transparent", null]],
    agreeLayout: { left: [1, 0], neutral: 2, right: [3, 4], exclude: 5 }
  };

  global.AATCharts = {
    palettes: palettes,
    lineChart: lineChart,
    barList: barList,
    stackedBars: stackedBars,
    sparkline: sparkline,
    dataTable: dataTable,
    downloadCSV: downloadCSV,
    legend: legend,
    fmt: fmt,
    h: h
  };
})(window);
