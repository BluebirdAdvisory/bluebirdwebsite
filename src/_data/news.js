// Latest news for the home page ticker and the /news/ page, fetched from the news API at build
// time. Also accepts RSS/Atom or a plain HTML page of links to /news/… articles. Only articles
// with their own link are shown. If the source can't be reached there are no items: the ticker
// is left off and /news/ shows a short message. The build never fails; the build log shows a
// "[news]" line either way.
// Each article's summary is then written by Claude when ANTHROPIC_API_KEY is set
// (scripts/summarise-news.mjs).
// Set NEWS_SOURCE= (empty) to skip the fetch, e.g. when working offline.

import { addSummaries } from "../../scripts/summarise-news.mjs";

const SOURCE = process.env.NEWS_SOURCE ?? "https://ironbark.axoquant.com/api/v1/snapshot/news";
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

const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v != null && v !== "");
const TITLE = ["title", "headline", "name"];

const isList = (v) => Array.isArray(v) && v.some((i) => typeof pick(i, TITLE) === "string");
// The news API's response (data.headlines) also holds other lists, such as data.documents
// (budget papers), so a list with one of these names wins over the first titled list found
const LIST_NAMES = ["headlines", "news", "articles", "items", "posts"];

// A titled list stored under the key `name`, nested up to a few levels down
function findNamed(data, name, depth = 0) {
  if (!data || typeof data !== "object" || Array.isArray(data) || depth > 4) return null;
  if (isList(data[name])) return data[name];
  for (const v of Object.values(data)) {
    const found = findNamed(v, name, depth + 1);
    if (found) return found;
  }
  return null;
}

// The first list of objects with a title, at the top level or nested a few levels down
function findFirst(data, depth = 0) {
  if (isList(data)) return data;
  if (!data || typeof data !== "object" || Array.isArray(data) || depth > 4) return null;
  for (const v of Object.values(data)) {
    const found = findFirst(v, depth + 1);
    if (found) return found;
  }
  return null;
}

const findList = (data) => LIST_NAMES.map((n) => findNamed(data, n)).find(Boolean) || findFirst(data);

function fromJson(data) {
  return (findList(data) || []).map((i) => {
    let date = pick(i, ["date", "published_at", "publishedAt", "date_published", "published", "pubDate",
      "created_at", "createdAt", "updated_at", "updatedAt", "timestamp"]);
    if (typeof date === "number" && date < 1e12) date *= 1000; // Unix seconds
    return {
      title: pick(i, TITLE),
      url: pick(i, ["url", "link", "href", "article_url", "articleUrl", "source_url", "sourceUrl", "permalink"]),
      date,
      summary: pick(i, ["summary", "description", "excerpt", "snippet", "abstract", "dek", "content"]),
      site: typeof i.source === "string" ? i.source : "",
    };
  });
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
  if (!SOURCE) return { items: [], ticker: [] };
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
    const byKey = new Map();
    for (const i of raw) {
      const item = {
        title: decode(String(i.title || "")),
        url: i.url ? new URL(decode(String(i.url)), base).href : "",
        date: i.date ? new Date(typeof i.date === "number" ? i.date : decode(String(i.date))) : null,
        summary: shorten(decode(String(i.summary || ""))),
        site: decode(String(i.site || "")),
      };
      if (item.date && isNaN(item.date)) item.date = null;
      if (!item.title || !item.url) continue;
      if (item.summary === item.title) item.summary = "";
      const prev = byKey.get(item.url);
      if (!prev || item.title.length > prev.title.length) byKey.set(item.url, { ...item, date: item.date || prev?.date || null, summary: item.summary || prev?.summary || "" });
    }
    let list = [...byKey.values()];
    if (list.length && list.every((i) => i.date)) list.sort((a, b) => b.date - a.date);
    const items = (await addSummaries(list.slice(0, LIMIT), { decode })).map((i) => ({
      ...i,
      dateLabel: i.date ? i.date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" }) : "",
      site: (i.site || new URL(i.url).hostname).replace(/^www\./, ""), // shown on the /news/ tiles
    }));

    console.log(`[news] ${items.length} item(s) from ${SOURCE}`);
    if (!items.length) console.warn(`[news] No articles found in the response. It starts: ${body.slice(0, 300).replace(/\s+/g, " ")}`);
    return { items, ticker: items.slice(0, 8) };
  } catch (err) {
    console.warn(`[news] Could not load ${SOURCE} (${err.message}); no news items will be shown.`);
    return { items: [], ticker: [] };
  }
}
