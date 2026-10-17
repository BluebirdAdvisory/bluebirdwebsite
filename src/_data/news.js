// Latest news for the home page ticker and the /news/ page, fetched from the Ironbark news
// page at build time. Accepts a JSON feed, RSS/Atom, or a plain HTML page of links to
// /news/… articles. If the source can't be reached there are no items: the ticker is left off
// and /news/ links to Ironbark instead. The build never fails.
// Set NEWS_SOURCE= (empty) to skip the fetch, e.g. when working offline.

const SOURCE = process.env.NEWS_SOURCE ?? "https://ironbark.axoquant.com/news";
const LIMIT = 24;

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|ldquo|rdquo|ndash|mdash|hellip);/g, (_, e) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
         ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" })[e])
    .replace(/\s+/g, " ")
    .trim();

const shorten = (s, max = 220) => (s.length > max ? s.slice(0, s.lastIndexOf(" ", max)) + "…" : s);

const tag = (xml, name) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1];

function fromJson(data) {
  const list = Array.isArray(data) ? data : data.items || data.articles || data.news || data.posts || [];
  return list.map((i) => ({
    title: i.title || i.headline || i.name,
    url: i.url || i.link || i.href,
    date: i.date || i.date_published || i.published || i.publishedAt,
    summary: i.summary || i.description || i.excerpt,
  }));
}

function fromFeed(xml) {
  return [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(([item]) => ({
    title: tag(item, "title"),
    url: tag(item, "link") || item.match(/<link\b[^>]*href="([^"]+)"/i)?.[1],
    date: tag(item, "pubDate") || tag(item, "published") || tag(item, "updated"),
    summary: tag(item, "description") || tag(item, "summary"),
  }));
}

// Links to individual articles below /news/, in page order
function fromHtml(html, base) {
  const items = [];
  for (const [, href, text] of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(href, base);
    if (url.host !== base.host || !/^\/news\/[^/]+/.test(url.pathname)) continue;
    items.push({ title: text, url: url.href });
  }
  return items;
}

export default async function () {
  if (!SOURCE) return { source: "", items: [], ticker: [] };
  try {
    const res = await fetch(SOURCE, {
      headers: { accept: "application/json, application/rss+xml, application/atom+xml, text/html;q=0.9" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const base = new URL(res.url || SOURCE);
    const body = await res.text();
    const type = res.headers.get("content-type") || "";

    let raw;
    if (type.includes("json") || /^\s*[[{]/.test(body)) raw = fromJson(JSON.parse(body));
    else if (/<(rss|feed)\b/i.test(body)) raw = fromFeed(body);
    else raw = fromHtml(body, base);

    // One item per article; when a page links to it more than once ("Read more"), keep the longest text
    const byUrl = new Map();
    for (const i of raw) {
      const item = {
        title: decode(String(i.title || "")),
        url: i.url ? new URL(decode(String(i.url)), base).href : "",
        date: i.date ? new Date(decode(String(i.date))) : null,
        summary: shorten(decode(String(i.summary || ""))),
      };
      if (item.date && isNaN(item.date)) item.date = null;
      if (!item.title || !item.url) continue;
      const prev = byUrl.get(item.url);
      if (!prev || item.title.length > prev.title.length) byUrl.set(item.url, { ...item, date: item.date || prev?.date || null, summary: item.summary || prev?.summary || "" });
    }
    const items = [...byUrl.values()].slice(0, LIMIT).map((i) => ({
      ...i,
      dateLabel: i.date ? i.date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" }) : "",
    }));

    console.log(`[news] ${items.length} item(s) from ${SOURCE}`);
    return { source: SOURCE, items, ticker: items.slice(0, 8) };
  } catch (err) {
    console.warn(`[news] Could not load ${SOURCE} (${err.message}); no news items will be shown.`);
    return { source: SOURCE, items: [], ticker: [] };
  }
}
