// Recruit Wizard → website job ads.
//
// Recruit Wizard publishes job ads to a website by calling the same REST endpoints as its
// WordPress add-on (wp-json/RecruitWizard/...). This AWS Lambda function answers those calls,
// saves each job as jobs/<id>.json in the GitHub repo, and the commit makes Amplify rebuild
// the site. No database, and no applicant data passes through here: the "Apply" button on
// each job page goes to Recruit Wizard's own hosted application form.
//
// Runtime: Node.js 22 (no dependencies). Set these environment variables on the function:
//   RW_USERNAME, RW_PASSWORD  credentials you enter in Recruit Wizard for the website
//   GITHUB_TOKEN              fine-grained token: this repo only, Contents read and write
//   GITHUB_REPO               e.g. alexia2727/bluebird-website
//   GITHUB_BRANCH             optional, defaults to main
// See recruit-wizard/README.md for setup.

import { timingSafeEqual, createHash } from "node:crypto";

// Options Recruit Wizard can pick from when posting a job. Edit freely; slugs are stored on the job.
const TERMS = {
  categories: [
    "Digital and Cloud Transformation", "Data and Artificial Intelligence", "Cyber Security",
    "Program and Project Delivery", "People and Change", "Financial and Benefit Management",
    "Business Support",
  ],
  jobTypes: ["Contract", "Fixed term", "Permanent", "Full time", "Part time", "Casual"],
  regions: [
    "Australian Capital Territory", "New South Wales", "Victoria", "Queensland",
    "South Australia", "Western Australia", "Tasmania", "Northern Territory", "Remote",
  ],
};
const TAXONOMY = { categories: "job_listing_category", jobTypes: "job_listing_type", regions: "job_listing_region" };

const env = (k, d) => process.env[k] ?? d;

export async function handler(event) {
  try {
    const method = (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
    const path = (event.rawPath || event.path || "/").toLowerCase().replace(/\/+$/, "");
    const route = path.split("/recruitwizard/")[1] ?? "";

    if (!authorised(event.headers || {})) return wpError(401, "forbidden", "Not Authorized");

    if (method === "GET" && route === "categories") return ok(terms("categories"));
    if (method === "GET" && route === "job-types") return ok(terms("jobTypes"));
    if (method === "GET" && route === "regions") return ok(terms("regions"));
    if (["POST", "PUT", "PATCH"].includes(method) && route === "create-job") {
      let body = event.body || "";
      if (event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");
      let input;
      try { input = JSON.parse(body); } catch { return wpError(400, "invalid_json", "Body must be JSON"); }
      return ok(await saveJob(input));
    }
    return wpError(404, "rest_no_route", "No route was found matching the URL and request method.");
  } catch (err) {
    console.error(err);
    return wpError(500, "server_error", "Could not save the job. Please try again.");
  }
}

// ---------- jobs ----------

export async function saveJob(input) {
  const repo = new Repo();
  let id = toId(input.id);
  let existing = id ? await repo.get(`jobs/${id}.json`) : null;
  if (!id) {
    // WordPress post IDs are small integers; keep ours int32-safe for Recruit Wizard.
    id = Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 1000);
    while (await repo.get(`jobs/${id}.json`)) id++;
  }
  const prev = existing ? JSON.parse(existing.text) : {};
  const now = new Date().toISOString();
  const title = clean(input.title) || prev.title || "Untitled role";
  const job = {
    id,
    slug: prev.slug || `${slugify(title)}-${id}`,
    title,
    status: String(input.status || "publish").toLowerCase() === "publish" ? "open" : "closed",
    location: clean(input.location),
    salary: clean(input.jobsalary),
    expires: clean(input.jobexpires),
    applyUrl: safeUrl(input.applyurl),
    categories: names(input.categories, "categories"),
    jobTypes: names(input.jobtypes, "jobTypes"),
    regions: names(input.regions, "regions"),
    descriptionHtml: sanitiseHtml(String(input.content || "")),
    created: prev.created || now,
    updated: now,
  };
  const verb = existing ? (job.status === "open" ? "Update" : "Close") : "Publish";
  await repo.put(`jobs/${id}.json`, JSON.stringify(job, null, 2) + "\n", `${verb} job ad: ${title}`, existing?.sha);
  return id;
}

function toId(v) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const clean = (v) => String(v ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 300);

export function slugify(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "job";
}

function safeUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch { return ""; }
}

// Recruit Wizard sends term slugs (or names); store the readable names.
function names(list, key) {
  const arr = Array.isArray(list) ? list : list ? Object.values(list) : [];
  return arr.map((v) => {
    const s = clean(v);
    return TERMS[key].find((n) => slugify(n) === slugify(s)) || s;
  }).filter(Boolean);
}

// Job descriptions come from Recruit Wizard's editor as HTML. Keep the formatting tags,
// drop anything that could run code or restyle the page.
const ALLOWED = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "a", "blockquote"]);
export function sanitiseHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>|</gi, (tag, name, attrs) => {
      if (!name) return "&lt;"; // a stray or unfinished tag: show it as text
      name = name.toLowerCase();
      if (name === "h1") name = "h2";
      if (!ALLOWED.has(name)) return name === "div" && tag.startsWith("</") ? "\n" : "";
      if (tag.startsWith("</")) return `</${name}>`;
      if (name !== "a") return `<${name}>`;
      const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const url = href ? (href[2] ?? href[3] ?? href[4]).replace(/&amp;/g, "&") : "";
      return /^(https?:|mailto:|tel:)/i.test(url.trim())
        ? `<a href="${url.trim().replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" rel="noopener nofollow">`
        : "<a>";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function terms(key) {
  return TERMS[key].map((name, i) => ({
    term_id: i + 1, name, slug: slugify(name), term_group: 0, term_taxonomy_id: i + 1,
    taxonomy: TAXONOMY[key], description: "", parent: 0, count: 0, filter: "raw",
  }));
}

// ---------- auth ----------

function authorised(headers) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const m = /^Basic\s+(.+)$/i.exec(h.authorization || "");
  const user = env("RW_USERNAME"), pass = env("RW_PASSWORD");
  if (!m || !user || !pass) return false;
  const given = Buffer.from(m[1], "base64").toString("utf8");
  const digest = (s) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(`${user}:${pass}`));
}

// ---------- GitHub ----------

class Repo {
  constructor() {
    this.repo = env("GITHUB_REPO");
    this.branch = env("GITHUB_BRANCH", "main");
    this.token = env("GITHUB_TOKEN");
    if (!this.repo || !this.token) throw new Error("GITHUB_REPO and GITHUB_TOKEN must be set");
  }
  async call(method, path, body) {
    const res = await fetch(`https://api.github.com/repos/${this.repo}/contents/${path}${method === "GET" ? `?ref=${encodeURIComponent(this.branch)}` : ""}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`, accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28", "user-agent": "bluebird-recruit-wizard",
      },
      body: body && JSON.stringify(body),
    });
    if (method === "GET" && res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  }
  async get(path) {
    const f = await this.call("GET", path);
    return f && { sha: f.sha, text: Buffer.from(f.content, "base64").toString("utf8") };
  }
  put(path, text, message, sha) {
    return this.call("PUT", path, {
      message, branch: this.branch, sha,
      content: Buffer.from(text, "utf8").toString("base64"),
    });
  }
}

// ---------- responses (shaped like the WordPress REST API) ----------

const ok = (data) => ({ statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const wpError = (status, code, message) => ({
  statusCode: status, headers: { "content-type": "application/json" },
  body: JSON.stringify({ code, message, data: { status } }),
});
