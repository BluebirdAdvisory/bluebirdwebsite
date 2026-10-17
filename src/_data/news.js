// Latest news for the home page ticker, fetched from the Ironbark news page at build time.
// Accepts a JSON feed, RSS/Atom, or a plain HTML page of links to /news/… articles.
// If the source can't be reached the ticker is simply left off the page; the build never fails.
// Set NEWS_SOURCE= (empty) to skip the fetch, e.g. when working offline.

const SOURCE = process.env.NEWS_SOURCE ?? "https://ironbark.axoquant.com/news";
const LIMIT = 8;

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

const tag = (xml, name) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1];

function fromJson(data) {
  const list = Array.isArray(data) ? data : data.items || data.articles || data.news || data.posts || [];
  return list.map((i) => ({
    title: i.title || i.headline || i.name,
    url: i.url || i.link || i.href,
    date: i.date || i.date_published || i.published || i.publishedAt,
  }));
}

function fromFeed(xml) {
  return [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(([item]) => ({
    title: tag(item, "title"),
    url: tag(item, "link") || item.match(/<link\b[^>]*href="([^"]+)"/i)?.[1],
    date: tag(item, "pubDate") || tag(item, "published") || tag(item, "updated"),
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
  if (!SOURCE) return { source: "", items: [] };
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

    const seen = new Set();
    const items = raw
      .map((i) => ({
        title: decode(String(i.title || "")),
        url: i.url ? new URL(decode(String(i.url)), base).href : "",
        date: i.date ? new Date(decode(String(i.date))) : null,
      }))
      .filter((i) => i.title && i.url && !seen.has(i.url) && seen.add(i.url))
      .slice(0, LIMIT);

    console.log(`[news] ${items.length} item(s) from ${SOURCE}`);
    return { source: SOURCE, items };
  } catch (err) {
    console.warn(`[news] Could not load ${SOURCE} (${err.message}); the home page ticker is hidden.`);
    return { source: SOURCE, items: [] };
  }
}
