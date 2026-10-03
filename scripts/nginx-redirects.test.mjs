// Run with: npm run test:redirects
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { toNginx } from "./nginx-redirects.mjs";

test("converts exact, folder and catch-all rules", () => {
  const conf = toNginx([
    { source: "/careers", target: "/join-our-team/", status: "301" },
    { source: "/careers/", target: "/join-our-team/", status: "301" },
    { source: "/wp-content/uploads/<*>", target: "/uploads/<*>", status: "301" },
    { source: "/promo", target: "/what-we-do/", status: "302" },
    { source: "/<*>", target: "/404.html", status: "404-200" },
  ]);
  assert.deepEqual(conf.trim().split("\n").slice(1), [
    "location = /careers { return 301 /join-our-team/; }",
    "location = /careers/ { return 301 /join-our-team/; }",
    "location ^~ /wp-content/uploads/ { rewrite ^/wp-content/uploads/(.*)$ /uploads/$1 permanent; }",
    "location = /promo { return 302 /what-we-do/; }",
  ]);
});

test("refuses anything that could break or take down the server config", () => {
  const bad = [
    { source: "/a b", target: "/x/", status: "301" },
    { source: "/a", target: "/x/; return 200", status: "301" },
    { source: "/a", target: "https://evil.example/", status: "301" },
    { source: "/", target: "/x/", status: "301" },
    { source: "/a", target: "/x/", status: "200" },
    { source: "/a/<*>/b", target: "/x/", status: "301" },
  ];
  for (const r of bad) assert.throws(() => toNginx([r]), undefined, JSON.stringify(r));
  assert.throws(() => toNginx([{ source: "/a", target: "/b", status: "301" }, { source: "/a", target: "/c", status: "301" }]));
});

test("the site's redirects.json converts cleanly", async () => {
  const rules = JSON.parse(await readFile(new URL("../redirects.json", import.meta.url), "utf8"));
  const conf = toNginx(rules);
  assert.equal(conf.split("\n").filter((l) => l.startsWith("location")).length, rules.filter((r) => r.status !== "404-200").length);
});
