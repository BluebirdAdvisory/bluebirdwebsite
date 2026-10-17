// Checks the redirects in vercel.json. Run with: npm run test:redirects
// Supported entries:
//   { "source": "/old", "destination": "/new/", "statusCode": 301 }                          exact path
//   { "source": "/old/:path*", "destination": "/new/:path*", "statusCode": 301 }              a whole folder
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, access } from "node:fs/promises";

const { redirects = [] } = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const PATH = /^\/[A-Za-z0-9._~\-/%]*$/;
const FOLDER = /\/:path\*$/;

test("every redirect is a supported, local 301 or 302", () => {
  for (const r of redirects) {
    const label = JSON.stringify(r);
    assert.deepEqual(Object.keys(r).sort(), ["destination", "source", "statusCode"], `${label}: use source, destination and statusCode only`);
    assert.ok([301, 302].includes(r.statusCode), `${label}: statusCode must be 301 or 302`);
    assert.notEqual(r.source, "/", `${label}: redirecting / would take the home page offline`);
    const folder = FOLDER.test(r.source);
    assert.ok(PATH.test(r.source.replace(FOLDER, "/")), `${label}: unsupported source path`);
    assert.ok(PATH.test(r.destination.replace(FOLDER, "/")), `${label}: destination must be a path on this site`);
    if (FOLDER.test(r.destination)) assert.ok(folder, `${label}: only a folder source can use :path* in its destination`);
  }
});

test("no source is listed twice", () => {
  const sources = redirects.map((r) => r.source);
  assert.deepEqual(sources.filter((s, i) => sources.indexOf(s) !== i), []);
});

test("exact redirects point at pages that exist (after npm run build)", async (t) => {
  try { await access(new URL("../_site/index.html", import.meta.url)); }
  catch { return t.skip("run npm run build first"); }
  for (const { destination } of redirects.filter((r) => !FOLDER.test(r.destination))) {
    const file = destination.endsWith("/") ? `${destination}index.html` : destination;
    await assert.doesNotReject(access(new URL(`../_site${file}`, import.meta.url)), `${destination} isn't in the built site`);
  }
});
