// Run with: npm run test:recruit-wizard
// Simulates Recruit Wizard's calls against a fake GitHub, so no network or credentials are needed.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RW_USERNAME = "recruitwizard";
process.env.RW_PASSWORD = "correct horse battery staple";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_REPO = "example/site";

const files = new Map(); // path -> { sha, text }
const commits = [];
globalThis.fetch = async (url, init = {}) => {
  const path = decodeURIComponent(new URL(url).pathname.split("/contents/")[1]);
  const json = (status, body) => new Response(JSON.stringify(body), { status });
  if ((init.method || "GET") === "GET") {
    const f = files.get(path);
    return f ? json(200, { sha: f.sha, content: Buffer.from(f.text).toString("base64") }) : json(404, {});
  }
  const body = JSON.parse(init.body);
  const cur = files.get(path);
  if (cur && body.sha !== cur.sha) return json(409, { message: "sha mismatch" });
  if (!cur && body.sha) return json(422, { message: "sha for new file" });
  const sha = `sha${commits.length + 1}`;
  files.set(path, { sha, text: Buffer.from(body.content, "base64").toString("utf8") });
  commits.push({ path, message: body.message, branch: body.branch });
  return json(201, { content: { sha } });
};

const { handler, sanitiseHtml, slugify } = await import("./index.mjs");

const auth = (u = "recruitwizard", p = "correct horse battery staple") =>
  ({ authorization: "Basic " + Buffer.from(`${u}:${p}`).toString("base64") });
const call = (method, route, { headers = auth(), body } = {}) => handler({
  rawPath: `/wp-json/RecruitWizard/${route}`,
  requestContext: { http: { method } },
  headers, body: body && JSON.stringify(body),
});
const job = (overrides = {}) => ({
  id: "", username: "recruitwizard", title: "Senior Data Engineer", status: "publish",
  content: "<p>Join a <strong>major</strong> data program.</p><script>alert(1)</script><p onclick=\"x()\" style=\"color:red\">Canberra based.</p>",
  location: "Canberra", applyurl: "https://apply.recruitwizard.com/Apply/Index/8/232360_1/52",
  jobexpires: "December 1, 2026", jobsalary: "$1,200 per day", categories: ["data"],
  jobtypes: ["contract"], regions: ["australian-capital-territory"], thumbnailid: "", ...overrides,
});

test("rejects missing or wrong credentials", async () => {
  assert.equal((await call("GET", "categories", { headers: {} })).statusCode, 401);
  assert.equal((await call("GET", "categories", { headers: auth("recruitwizard", "nope") })).statusCode, 401);
  assert.equal((await call("POST", "create-job", { headers: auth("x", "y"), body: job() })).statusCode, 401);
  assert.equal(commits.length, 0);
});

test("lists categories, job types and regions like WordPress terms", async () => {
  for (const route of ["categories", "job-types", "regions"]) {
    const res = await call("GET", route);
    assert.equal(res.statusCode, 200);
    const terms = JSON.parse(res.body);
    assert.ok(terms.length > 0);
    assert.ok(terms.every((t) => t.term_id && t.name && t.slug && t.taxonomy));
  }
  assert.ok(JSON.parse((await call("GET", "job-types")).body).some((t) => t.slug === "contract"));
});

let id;
test("publishes a new job and returns its numeric id", async () => {
  const res = await call("POST", "create-job", { body: job() });
  assert.equal(res.statusCode, 200);
  id = JSON.parse(res.body);
  assert.ok(Number.isInteger(id) && id > 0 && id < 2 ** 31);
  const saved = JSON.parse(files.get(`jobs/${id}.json`).text);
  assert.equal(saved.status, "open");
  assert.equal(saved.slug, `senior-data-engineer-${id}`);
  assert.deepEqual(saved.categories, ["Data"]);
  assert.deepEqual(saved.jobTypes, ["Contract"]);
  assert.deepEqual(saved.regions, ["Australian Capital Territory"]);
  assert.equal(saved.descriptionHtml, "<p>Join a <strong>major</strong> data program.</p><p>Canberra based.</p>");
  assert.equal(commits.at(-1).message, "Publish job ad: Senior Data Engineer");
  assert.equal(commits.at(-1).branch, "main");
});

test("updating keeps the URL and created date", async () => {
  const before = JSON.parse(files.get(`jobs/${id}.json`).text);
  const res = await call("PUT", "create-job", { body: job({ id: String(id), title: "Lead Data Engineer" }) });
  assert.equal(JSON.parse(res.body), id);
  const after = JSON.parse(files.get(`jobs/${id}.json`).text);
  assert.equal(after.title, "Lead Data Engineer");
  assert.equal(after.slug, before.slug);
  assert.equal(after.created, before.created);
  assert.equal(commits.at(-1).message, "Update job ad: Lead Data Engineer");
});

test("expiring a job closes it", async () => {
  await call("POST", "create-job", { body: job({ id, status: "expired" }) });
  assert.equal(JSON.parse(files.get(`jobs/${id}.json`).text).status, "closed");
  assert.match(commits.at(-1).message, /^Close job ad/);
});

test("bad input is refused without committing", async () => {
  const n = commits.length;
  const res = await handler({ rawPath: "/wp-json/RecruitWizard/create-job", requestContext: { http: { method: "POST" } }, headers: auth(), body: "{not json" });
  assert.equal(res.statusCode, 400);
  assert.equal((await call("DELETE", "create-job")).statusCode, 404);
  assert.equal(commits.length, n);
});

test("drops unsafe apply links", async () => {
  const res = await call("POST", "create-job", { body: job({ applyurl: "javascript:alert(1)" }) });
  assert.equal(JSON.parse(files.get(`jobs/${JSON.parse(res.body)}.json`).text).applyUrl, "");
});

test("sanitiser keeps formatting and strips anything active", () => {
  assert.equal(sanitiseHtml('<h1>Role</h1><div><ul><li>One</li></ul></div>'), "<h2>Role</h2><ul><li>One</li></ul>");
  assert.equal(sanitiseHtml('<a href="javascript:alert(1)">x</a>'), "<a>x</a>");
  assert.equal(sanitiseHtml('<a href="https://x.test/?a=1&b=2" onmouseover="y()">x</a>'), '<a href="https://x.test/?a=1&amp;b=2" rel="noopener nofollow">x</a>');
  assert.equal(sanitiseHtml('<img src=x onerror=alert(1)><iframe src="//evil"></iframe>ok'), "ok");
  assert.equal(sanitiseHtml("<p>5 < 6</p><img src=x onerror=alert(1)//"), "<p>5 &lt; 6</p>&lt;img src=x onerror=alert(1)//");
  assert.equal(sanitiseHtml("<p>{{ site.email }}</p>"), "<p>{{ site.email }}</p>"); // rendered as data, never as a template
});

test("slugify", () => {
  assert.equal(slugify("Cyber Security Analyst – ACT (NV1) & Remote"), "cyber-security-analyst-act-nv1-and-remote");
});
