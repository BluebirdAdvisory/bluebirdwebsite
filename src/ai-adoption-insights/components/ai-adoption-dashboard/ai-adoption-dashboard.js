/*
 * AI adoption tracker dashboard (Route A).
 *
 * Progressive enhancement over the server-rendered fallback in the Twig
 * template: reads one pre-aggregated, pre-suppressed JSON file (uploaded by an
 * editor each quarter) and renders the dashboard with AATCharts. Runs as a
 * Drupal behaviour on the real site and on DOMContentLoaded in the demo.
 */
(function () {
  "use strict";

  const C = () => window.AATCharts;
  const h = (...a) => C().h(...a);

  const TABS = [
    { id: "overview", label: "Overview", intro: "Key patterns in AI adoption by SMEs across Australia." },
    { id: "adoption", label: "AI adoption", intro: "How AI adoption changes over time and differs across industries, business sizes and locations." },
    { id: "applications", label: "AI applications", intro: "Which AI tools businesses use, and which they plan to adopt." },
    { id: "outcomes", label: "Business outcomes", intro: "Which business outcomes SMEs expect AI to support." },
    { id: "attitudes", label: "Benefits and challenges", intro: "How businesses see AI's opportunities, their readiness, and the barriers they face." },
    { id: "responsible", label: "Responsible AI", intro: "Which responsible AI practices businesses have in place or plan to adopt." },
  ];

  // Palettes come from the shared chart library so both routes use the same validated colours.
  const P = window.AATCharts.palettes;
  const STAGE_COLORS = P.stage;
  const APP_COLORS = P.levels;
  const OUTCOME_COLORS = P.levels;
  const AGREE_COLORS = P.agree;
  const SIZE_COLORS = P.categorical;
  // Below this many responses a figure is shown but flagged, and quarter-on-quarter changes are hidden.
  const LOW_N = 30;
  const APP_SHORT = {
    genai_assistant: "Generative AI", doc_processing: "Document processing", chatbots: "Chatbots",
    marketing: "Marketing automation", predictive: "Predictive analytics", sales_forecast: "Sales forecasting",
    fraud: "Fraud detection", hr: "Recruitment and HR", supply_chain: "Supply chain",
  };

  function init(root) {
    if (root.dataset.aadReady) return;
    root.dataset.aadReady = "1";
    const src = root.dataset.src;
    fetch(src, { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((data) => new Dashboard(root, data))
      .catch((err) => {
        root.classList.add("is-error");
        const msg = root.querySelector(".aad__status") || h("p", "aad__status", root);
        msg.textContent = "The dashboard could not load its data. The figures are available in the CSV download below.";
        console.error("ai-adoption-dashboard:", err);
      });
  }

  class Dashboard {
    constructor(root, data) {
      this.root = root;
      // Minimal: the host page carries the data notice and method, so leave out the badge, tab intros and "About this data".
      this.minimal = root.dataset.variant === "minimal";
      this.D = data;
      this.M = data.meta;
      this.quarters = this.M.quarters;
      const latest = this.quarters[this.quarters.length - 1].id;
      this.state = { quarter: latest, group: "all", tab: root.dataset.view || "overview" };
      this.readHash();
      this.build();
      this.render();
    }

    /* ---------- state ---------- */

    readHash() {
      if (this.root.dataset.syncUrl !== "true") return;
      const params = new URLSearchParams(location.hash.slice(1));
      if (params.get("q") && this.quarters.some((q) => q.id === params.get("q"))) this.state.quarter = params.get("q");
      if (params.get("group") && this.D.slices[params.get("group")]) this.state.group = params.get("group");
      if (params.get("view") && TABS.some((t) => t.id === params.get("view"))) this.state.tab = params.get("view");
    }

    writeHash() {
      if (this.root.dataset.syncUrl !== "true") return;
      const p = new URLSearchParams({ view: this.state.tab, group: this.state.group, q: this.state.quarter });
      history.replaceState(null, "", "#" + p.toString());
    }

    set(patch) {
      Object.assign(this.state, patch);
      this.writeHash();
      this.render();
    }

    /* ---------- data helpers ---------- */

    cell(slice, quarter) { return this.D.slices[slice].data[quarter]; }
    qLabel(id) { return this.quarters.find((q) => q.id === id).label; }
    qShort(id) { const [y, q] = id.split("-"); return q + " " + y; }
    prevQuarter(id) { const i = this.quarters.findIndex((q) => q.id === id); return i > 0 ? this.quarters[i - 1].id : null; }
    series(slice, pick) { return this.quarters.map((q) => pick(this.cell(slice, q.id))); }
    groupLabel(key) { return this.D.slices[key].label; }
    dimOf(key) { return this.D.slices[key].dimension; }
    sliceKeys(dim) { return this.M.dimensions[dim].values.map((v) => dim + ":" + v.id); }
    nText(n) { return "n = " + C().fmt.int(n); }
    pctWord(v) { return v == null ? "insufficient data" : v.toFixed(1) + "%"; }

    /* ---------- layout ---------- */

    build() {
      const root = this.root;
      root.replaceChildren();
      root.classList.add("aad", "aat-tokens", "is-live");
      const uid = root.id || "aad-" + Math.random().toString(36).slice(2, 8);

      const bar = h("div", "aad__toolbar", root);
      const filters = h("div", "aad__filters", bar);
      filters.setAttribute("role", "group");
      filters.setAttribute("aria-label", "Filter the dashboard");

      const qField = h("label", "aad__field", filters);
      h("span", "aad__field-label", qField, "Quarter");
      this.qSelect = h("select", "aad__select", qField);
      this.quarters.slice().reverse().forEach((q) => { const o = h("option", null, this.qSelect, q.label); o.value = q.id; });
      this.qSelect.addEventListener("change", () => this.set({ quarter: this.qSelect.value }));

      const gField = h("label", "aad__field aad__field--wide", filters);
      h("span", "aad__field-label", gField, "Business group");
      this.gSelect = h("select", "aad__select", gField);
      const all = h("option", null, this.gSelect, "All SMEs"); all.value = "all";
      Object.entries(this.M.dimensions).forEach(([dim, def]) => {
        const og = h("optgroup", null, this.gSelect); og.label = def.label;
        def.values.forEach((v) => { const o = h("option", null, og, v.label); o.value = dim + ":" + v.id; });
      });
      this.gSelect.addEventListener("change", () => this.set({ group: this.gSelect.value }));

      this.reset = h("button", "aad__reset", filters, "Reset");
      this.reset.type = "button";
      this.reset.addEventListener("click", () => this.set({ group: "all", quarter: this.quarters[this.quarters.length - 1].id }));

      if (!this.minimal) {
        const badge = h("p", "aad__badge", bar);
        h("span", "aad__badge-dot", badge).setAttribute("aria-hidden", "true");
        h("span", null, badge, "Illustrative synthetic data");
        badge.title = this.M.notice;
      }

      this.hero = h("section", "aad__hero", root);
      this.hero.setAttribute("aria-label", "Headline figure");

      const tablist = h("div", "aad__tabs", root);
      tablist.setAttribute("role", "tablist");
      tablist.setAttribute("aria-label", "Dashboard views");
      this.tabButtons = TABS.map((t, i) => {
        const b = h("button", "aad__tab", tablist, t.label);
        b.type = "button";
        b.id = `${uid}-tab-${t.id}`;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-controls", `${uid}-panel`);
        b.addEventListener("click", () => this.set({ tab: t.id }));
        b.addEventListener("keydown", (ev) => {
          const dir = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
          if (ev.key === "Home" || ev.key === "End" || dir) {
            ev.preventDefault();
            const next = ev.key === "Home" ? 0 : ev.key === "End" ? TABS.length - 1 : (i + dir + TABS.length) % TABS.length;
            this.tabButtons[next].focus();
            this.set({ tab: TABS[next].id });
          }
        });
        return b;
      });

      this.panel = h("div", "aad__panel", root);
      this.panel.id = `${uid}-panel`;
      this.panel.setAttribute("role", "tabpanel");
      this.panel.tabIndex = 0;

      if (this.minimal) return;
      const about = h("details", "aad__about", root);
      h("summary", null, about, "About this data");
      const ab = h("div", "aad__about-body", about);
      [
        this.M.notice,
        "The tracker surveys 400 small and medium enterprises (SMEs) each month. Respondents are business owners or decision makers from businesses with 0 to 500 employees. Results are weighted so they reflect the national mix of businesses.",
        "Each month's respondents are different businesses. Changes between quarters compare different samples, so small movements may not be meaningful.",
        `"Adopting AI" means: ${this.M.adopting_definition.toLowerCase()}.`,
        `Where fewer than ${this.M.suppression_min_n} responses sit behind a figure, the dashboard shows "insufficient data". Figures based on fewer than ${LOW_N} responses are flagged for caution, and their quarter-on-quarter changes are not shown.`,
        "Data is updated quarterly. Percentages are weighted; n is the unweighted number of responses.",
      ].forEach((t) => h("p", null, ab, t));
    }

    render() {
      const st = this.state;
      this.qSelect.value = st.quarter;
      this.gSelect.value = st.group;
      this.reset.hidden = st.group === "all" && st.quarter === this.quarters[this.quarters.length - 1].id;
      this.tabButtons.forEach((b, i) => {
        const on = TABS[i].id === st.tab;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
        if (on) this.panel.setAttribute("aria-labelledby", b.id);
      });
      this.renderHero();
      this.panel.replaceChildren();
      const tab = TABS.find((t) => t.id === st.tab);
      if (!this.minimal) h("p", "aad__intro", this.panel, tab.intro);
      this["render_" + st.tab]();
    }

    card(parent, title, subtitle, cls) {
      const art = h("article", "aad-card" + (cls ? " " + cls : ""), parent);
      const head = h("header", "aad-card__head", art);
      h("h3", "aad-card__title", head, title);
      if (subtitle) h("p", "aad-card__sub", head, subtitle);
      const body = h("div", "aad-card__body", art);
      const foot = h("footer", "aad-card__foot", art);
      return { art, head, body, foot };
    }

    tableAndCsv(card, caption, columns, rows, filename) {
      C().dataTable(card.foot, { caption, columns, rows });
      const btn = h("button", "aad__csv", card.foot, "Download CSV");
      btn.type = "button";
      btn.addEventListener("click", () => C().downloadCSV(filename, columns, rows, this.M.notice));
    }

    subtitle(question, base, quarterId, n) {
      return [question, base, quarterId ? this.qLabel(quarterId) : null, n != null ? this.nText(n) : null].filter(Boolean).join(" · ");
    }

    // The base always names the selected group, so a filtered chart never claims to describe all SMEs.
    baseFor(measure) {
      const base = this.M.bases[measure];
      const group = this.groupLabel(this.state.group);
      if (base === "All SMEs") return group;
      return this.state.group === "all" ? base : `${base} (${group})`;
    }

    // Goes in the card header: chart renderers clear the card body.
    cautionNote(card, n) {
      if (n != null && n < LOW_N && n >= this.M.suppression_min_n) {
        h("p", "aad-caution", card.head, `Small sample: ${this.nText(n)}. Treat these figures with caution.`);
      }
    }

    /* ---------- hero ---------- */

    renderHero() {
      const { group, quarter } = this.state;
      const c = this.cell(group, quarter);
      const prev = this.prevQuarter(quarter);
      const first = this.quarters[0].id;
      const pc = prev ? this.cell(group, prev) : null;
      const fc = this.cell(group, first);
      this.hero.replaceChildren();

      const text = h("div", "aad__hero-text", this.hero);
      h("p", "aad__eyebrow", text, `${this.groupLabel(group)} · ${this.qLabel(quarter)}`);
      const big = h("p", "aad__hero-figure", text);
      h("span", "aad__hero-value", big, c.adoption_rate == null ? "Insufficient data" : c.adoption_rate.toFixed(1) + "%");
      h("span", "aad__hero-caption", big, "of SMEs are adopting AI");
      const deltas = h("ul", "aad__hero-deltas", text);
      const reliable = (x) => x && x.adoption_rate != null && x.n >= LOW_N;
      if (c.adoption_rate != null && c.n < LOW_N) {
        h("li", "is-caution", deltas, `Small sample (${this.nText(c.n)}): treat with caution`);
      }
      if (reliable(c) && reliable(pc)) {
        const d = c.adoption_rate - pc.adoption_rate;
        h("li", null, deltas, `${d >= 0 ? "▲" : "▼"} ${C().fmt.pts(d)} on ${this.qLabel(prev)}`);
      }
      if (quarter !== first && reliable(c) && reliable(fc)) {
        const d = c.adoption_rate - fc.adoption_rate;
        h("li", null, deltas, `${d >= 0 ? "▲" : "▼"} ${C().fmt.pts(d)} since ${this.qLabel(first)}`);
      }
      h("p", "aad__hero-note", text, `Based on ${C().fmt.int(c.n)} responses, weighted. Adopting means using AI broadly, using it in part of the business, or implementing it now.`);

      const chartWrap = h("div", "aad__hero-chart aatc-dark", this.hero);
      const values = this.series(group, (x) => x.adoption_rate);
      const idx = this.quarters.findIndex((q) => q.id === quarter);
      C().lineChart(chartWrap, {
        xLabels: this.quarters.map((q) => q.label),
        xTicks: this.quarters.map((q) => this.qShort(q.id)),
        series: [{ key: "rate", label: "Adopting AI", color: "var(--aad-hero-line)", values: values.map((v, i) => (i <= idx ? v : null)) }],
        area: true,
        endLabels: false,
        height: 170,
        ariaLabel: `Share of ${this.groupLabel(group)} adopting AI by quarter`,
      });
    }

    /* ---------- panels ---------- */

    render_overview() {
      const { group, quarter } = this.state;
      const c = this.cell(group, quarter);
      const prev = this.prevQuarter(quarter);
      const pc = prev ? this.cell(group, prev) : null;
      const M = this.M;

      const kpis = h("div", "aad__kpis", this.panel);
      const tile = (label, pick, note) => {
        const t = h("div", "aad-kpi", kpis);
        h("p", "aad-kpi__label", t, label);
        const v = pick(c);
        h("p", "aad-kpi__value", t, v == null ? "n/a" : v.toFixed(1) + "%");
        const pv = pc ? pick(pc) : null;
        if (v != null && pv != null && c.n >= LOW_N && pc.n >= LOW_N) h("p", "aad-kpi__delta", t, `${C().fmt.pts(v - pv)} on ${this.qLabel(prev)}`);
        else if (v != null && c.n < LOW_N) h("p", "aad-kpi__delta", t, `Small sample (${this.nText(c.n)})`);
        if (note) h("p", "aad-kpi__note", t, note);
        const sp = h("div", "aad-kpi__spark", t);
        const idx = this.quarters.findIndex((q) => q.id === quarter);
        C().sparkline(sp, this.series(group, (x) => pick(x)).slice(0, idx + 1));
      };
      tile("Using AI broadly across the business", (x) => (x.stage ? x.stage[0] : null));
      tile("Intend to adopt AI within 12 months", (x) => (x.stage ? x.stage[3] : null));
      tile("Not aware of how to use AI", (x) => (x.stage ? x.stage[5] : null));
      tile("Use a generative AI assistant", (x) => (x.apps ? x.apps[0][0] : null));

      const grid = h("div", "aad__grid", this.panel);
      this.trendCard(grid, "aad-card--wide");

      // Stage composition: by size for all SMEs, otherwise the selected group against all SMEs.
      const rows = group === "all"
        ? [["all", "All SMEs"]].concat(this.sliceKeys("size").map((k) => [k, this.groupLabel(k)]))
        : [[group, this.groupLabel(group)], ["all", "All SMEs"]];
      const card = this.card(grid, `How SMEs describe their AI use`, this.subtitle(M.questions.adoption_stage, null, quarter), "aad-card--wide");
      const segs = M.stages.map((s, i) => ({ label: s.label, color: STAGE_COLORS[i][0], ink: STAGE_COLORS[i][1] }));
      C().stackedBars(card.body, {
        segments: segs,
        rows: rows.map(([k, label]) => { const x = this.cell(k, quarter); return { label: `${label} (${this.nText(x.n)})`, values: x.stage, n: x.n, highlight: k === group && group !== "all" }; }),
      });
      this.tableAndCsv(card, `Adoption stage, ${this.qLabel(quarter)} (weighted %)`, ["Group", "n"].concat(M.stages.map((s) => s.label)),
        rows.map(([k, label]) => { const x = this.cell(k, quarter); return [label, String(x.n)].concat(x.stage || M.stages.map(() => null)); }),
        `adoption-stage-${quarter}.csv`);
    }

    trendCard(parent, cls) {
      const { group } = this.state;
      const M = this.M;
      let series, title;
      if (group === "all") {
        title = "Adoption over time by business size";
        series = this.sliceKeys("size").map((k, i) => ({ key: k, label: this.groupLabel(k), shortLabel: this.groupLabel(k).replace(" employees", ""), color: SIZE_COLORS[i], values: this.series(k, (x) => x.adoption_rate) }));
        series.push({ key: "all", label: "All SMEs", color: "var(--aat-muted-line)", muted: true, values: this.series("all", (x) => x.adoption_rate) });
      } else {
        title = `Adoption over time: ${this.groupLabel(group)} compared with all SMEs`;
        series = [
          { key: group, label: this.groupLabel(group), shortLabel: this.groupLabel(group).length > 18 ? "Selected group" : this.groupLabel(group), color: "var(--aat-s1)", values: this.series(group, (x) => x.adoption_rate) },
          { key: "all", label: "All SMEs", color: "var(--aat-muted-line)", muted: true, values: this.series("all", (x) => x.adoption_rate) },
        ];
      }
      const card = this.card(parent, title, `${M.bases.adoption_rate} adopting AI, weighted % by quarter`, cls);
      C().lineChart(card.body, {
        xLabels: this.quarters.map((q) => q.label),
        xTicks: this.quarters.map((q) => this.qShort(q.id)),
        series,
        ariaLabel: title,
      });
      this.tableAndCsv(card, `${title} (weighted %)`, ["Quarter"].concat(series.map((s) => s.label)),
        this.quarters.map((q, i) => [q.label].concat(series.map((s) => s.values[i]))), `adoption-trend-${group.replace(":", "-")}.csv`);
    }

    rankCard(parent, dim, title, opts) {
      const { group, quarter } = this.state;
      const keys = this.sliceKeys(dim);
      let rows = keys.map((k) => {
        const x = this.cell(k, quarter);
        const small = x.adoption_rate != null && x.n < LOW_N;
        return { key: k, label: this.groupLabel(k) + (small ? " *" : ""), value: x.adoption_rate, n: x.n, highlight: k === group };
      });
      if (opts && opts.ranked) rows.sort((a, b) => (b.value == null ? -1 : b.value) - (a.value == null ? -1 : a.value));
      const card = this.card(parent, title, `Share adopting AI · ${this.qLabel(quarter)}${this.dimOf(group) === dim ? " · selected group highlighted" : ""}`);
      C().barList(card.body, { rows, max: 100, color: "var(--aat-s1)", highlightColor: "var(--aat-s2)", valueLabel: "adopting AI" });
      if (rows.some((r) => r.label.endsWith(" *"))) h("p", "aad-card__note", card.body, `* Fewer than ${LOW_N} responses: treat with caution.`);
      if (opts && opts.note) h("p", "aad-card__note", card.body, opts.note);
      this.tableAndCsv(card, `${title}, ${this.qLabel(quarter)} (weighted %)`, ["Group", "Adopting AI (%)", "n"],
        rows.map((r) => [r.label, r.value, String(r.n)]), `adoption-by-${dim}-${quarter}.csv`);
    }

    render_adoption() {
      const grid = h("div", "aad__grid", this.panel);
      this.trendCard(grid, "aad-card--wide");
      this.rankCard(grid, "size", "Adoption by business size");
      this.rankCard(grid, "state", "Adoption by state or territory", { ranked: true, note: "Smaller states and territories have fewer responses, so their figures move more between quarters." });
      this.rankCard(grid, "industry", "Adoption by industry", { ranked: true, note: "Industry results rest on smaller samples. Differences of a few points may not be meaningful." });
      grid.lastChild.classList.add("aad-card--wide");
    }

    render_applications() {
      const { group, quarter } = this.state;
      const M = this.M;
      const c = this.cell(group, quarter);
      const grid = h("div", "aad__grid", this.panel);
      const card = this.card(grid, "Awareness and use of AI applications", this.subtitle(M.questions.application_use, this.baseFor("application_use"), quarter, c.n), "aad-card--wide");
      this.cautionNote(card, c.n);
      const order = M.applications.map((a, i) => i);
      if (c.apps) order.sort((a, b) => c.apps[b][0] - c.apps[a][0]);
      C().stackedBars(card.body, {
        segments: M.app_levels.map((l, i) => ({ label: l.label, color: APP_COLORS[i][0], ink: APP_COLORS[i][1] })),
        rows: c.apps ? order.map((i) => ({ label: M.applications[i].label, values: c.apps[i], n: c.n })) : [{ label: this.groupLabel(group), values: null }],
      });
      this.tableAndCsv(card, `Awareness and use of AI applications, ${this.groupLabel(group)}, ${this.qLabel(quarter)} (weighted %)`,
        ["Application"].concat(M.app_levels.map((l) => l.label)),
        M.applications.map((a, i) => [a.label].concat(c.apps ? c.apps[i] : M.app_levels.map(() => null))), `applications-${quarter}.csv`);

      // Use over time for the three most-used applications in the selected quarter.
      const top = c.apps ? order.slice(0, 3) : [0, 1, 2];
      const tcard = this.card(grid, "Use of the three most-used applications over time", `Share of ${this.groupLabel(group)} currently using each application, weighted %`, "aad-card--wide");
      const series = top.map((i, k) => ({ key: M.applications[i].id, label: M.applications[i].label, shortLabel: APP_SHORT[M.applications[i].id], color: SIZE_COLORS[k], values: this.series(group, (x) => (x.apps ? x.apps[i][0] : null)) }));
      C().lineChart(tcard.body, { xLabels: this.quarters.map((q) => q.label), xTicks: this.quarters.map((q) => this.qShort(q.id)), series, endLabelWidth: 200, ariaLabel: "Use of the three most-used applications over time" });
      this.tableAndCsv(tcard, "Use of the three most-used applications over time (weighted %)", ["Quarter"].concat(series.map((s) => s.label)),
        this.quarters.map((q, i) => [q.label].concat(series.map((s) => s.values[i]))), `applications-trend.csv`);
    }

    render_outcomes() {
      const { group, quarter } = this.state;
      const M = this.M;
      const c = this.cell(group, quarter);
      const grid = h("div", "aad__grid", this.panel);
      const card = this.card(grid, "Outcomes SMEs expect AI to help achieve", this.subtitle(M.questions.business_outcomes, this.baseFor("business_outcomes"), quarter, c.n), "aad-card--wide");
      this.cautionNote(card, c.n);
      const order = M.outcomes.map((o, i) => i);
      if (c.outcomes) order.sort((a, b) => (c.outcomes[b][0] + c.outcomes[b][1]) - (c.outcomes[a][0] + c.outcomes[a][1]));
      C().stackedBars(card.body, {
        segments: M.outcome_levels.map((l, i) => ({ label: l.label, color: OUTCOME_COLORS[i][0], ink: OUTCOME_COLORS[i][1] })),
        rows: c.outcomes ? order.map((i) => ({ label: M.outcomes[i].label, values: c.outcomes[i], n: c.n })) : [{ label: this.groupLabel(group), values: null }],
      });
      this.tableAndCsv(card, `Expected business outcomes, ${this.groupLabel(group)}, ${this.qLabel(quarter)} (weighted %)`,
        ["Outcome"].concat(M.outcome_levels.map((l) => l.label)),
        M.outcomes.map((o, i) => [o.label].concat(c.outcomes ? c.outcomes[i] : M.outcome_levels.map(() => null))), `outcomes-${quarter}.csv`);
    }

    render_attitudes() {
      const { group, quarter } = this.state;
      const M = this.M;
      const c = this.cell(group, quarter);
      const grid = h("div", "aad__grid", this.panel);
      const segs = M.agree_levels.map((l, i) => ({ label: l.label, color: AGREE_COLORS[i][0], ink: AGREE_COLORS[i][1] }));
      [["opportunity", "Opportunities and readiness", "Statements about AI's potential and how prepared businesses feel"],
       ["barrier", "Barriers to adoption", "Statements about what holds businesses back"]].forEach(([pol, title, lead]) => {
        const idx = M.statements.map((s, i) => [s, i]).filter(([s]) => s.polarity === pol).map(([, i]) => i);
        if (c.attitudes) idx.sort((a, b) => (c.attitudes[b][3] + c.attitudes[b][4]) - (c.attitudes[a][3] + c.attitudes[a][4]));
        const card = this.card(grid, title, `${lead} · ${this.baseFor("attitudes")} · ${this.qLabel(quarter)} · ${this.nText(c.n)}`, "aad-card--wide");
        this.cautionNote(card, c.n);
        C().stackedBars(card.body, {
          segments: segs,
          diverging: { left: [1, 0], neutral: 2, right: [3, 4], exclude: 5 },
          rows: c.attitudes ? idx.map((i) => ({ label: M.statements[i].label, values: c.attitudes[i], n: c.n })) : [{ label: this.groupLabel(group), values: null }],
        });
        h("p", "aad-card__note", card.body, "Bars are centred on neutral: disagreement extends left, agreement right.");
        this.tableAndCsv(card, `${title}, ${this.groupLabel(group)}, ${this.qLabel(quarter)} (weighted %)`,
          ["Statement"].concat(M.agree_levels.map((l) => l.label)),
          idx.map((i) => [M.statements[i].label].concat(c.attitudes ? c.attitudes[i] : M.agree_levels.map(() => null))), `${pol}-${quarter}.csv`);
      });
    }

    render_responsible() {
      const { group, quarter } = this.state;
      const M = this.M;
      const c = this.cell(group, quarter).practices;
      const prev = this.prevQuarter(quarter);
      const pc = prev ? this.cell(group, prev).practices : null;
      const grid = h("div", "aad__grid", this.panel);
      const none = M.practices.length - 1;

      if (c.values) {
        const kpis = h("div", "aad__kpis aad__kpis--two", grid);
        const t1 = h("div", "aad-kpi", kpis);
        h("p", "aad-kpi__label", t1, "Have at least one responsible AI practice");
        h("p", "aad-kpi__value", t1, (100 - c.values[none]).toFixed(1) + "%");
        h("p", "aad-kpi__note", t1, `Of ${M.bases.responsible_practices.toLowerCase()}`);
        const t2 = h("div", "aad-kpi", kpis);
        const best = c.values.slice(0, none).reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0);
        h("p", "aad-kpi__label", t2, "Most common practice");
        h("p", "aad-kpi__value aad-kpi__value--text", t2, M.practices[best].label);
        h("p", "aad-kpi__note", t2, `${c.values[best].toFixed(1)}% have it in place or planned`);
      }

      const card = this.card(grid, "Responsible AI practices", this.subtitle(M.questions.responsible_practices, this.baseFor("responsible_practices"), quarter, c.n), "aad-card--wide");
      this.cautionNote(card, c.n);
      let rows = M.practices.map((p, i) => ({
        label: p.label, value: c.values ? c.values[i] : null, n: c.n, muted: i === none,
        delta: c.values && pc && pc.values ? c.values[i] - pc.values[i] : null,
      }));
      const tail = rows.pop();
      rows.sort((a, b) => (b.value || 0) - (a.value || 0));
      rows.push(tail);
      C().barList(card.body, { rows, max: 100, color: "var(--aat-s1)", valueLabel: "have it in place or planned", deltaLabel: prev ? `since ${this.qLabel(prev)}` : "" });
      if (prev) h("p", "aad-card__note", card.body, `▲ and ▼ show the change in percentage points since ${this.qLabel(prev)}.`);
      this.tableAndCsv(card, `Responsible AI practices, ${this.groupLabel(group)}, ${this.qLabel(quarter)} (weighted %)`,
        ["Practice", "In place or planned (%)", prev ? `Change since ${this.qLabel(prev)} (pts)` : "Change (pts)"],
        rows.map((r) => [r.label, r.value, r.delta == null ? null : Math.round(r.delta * 10) / 10]), `responsible-ai-${quarter}.csv`);
    }
  }

  // Drupal behaviour on the real site; plain DOM ready in the demo.
  if (window.Drupal && window.Drupal.behaviors) {
    window.Drupal.behaviors.aiAdoptionDashboard = {
      attach(context) {
        const roots = window.once ? window.once("ai-adoption-dashboard", "[data-aad]", context) : context.querySelectorAll("[data-aad]");
        roots.forEach(init);
      },
    };
  } else {
    const start = () => document.querySelectorAll("[data-aad]").forEach(init);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})();
