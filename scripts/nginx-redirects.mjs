// Turns redirects.json into nginx rules for the VPS, so redirects.json stays the one list.
// The deploy workflow runs:  node scripts/nginx-redirects.mjs > redirects.conf
//
// Supported entries:
//   { "source": "/old", "target": "/new/", "status": "301" }                       exact path
//   { "source": "/old/<*>", "target": "/new/<*>", "status": "301" }               a whole folder
//   { "source": "/<*>", "target": "/404.html", "status": "404-200" }             skipped: nginx's
//                                                                                   404 page does this
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SAFE = /^\/[A-Za-z0-9._~\-/%]*$/; // no spaces, quotes or ; that could break out of the rule
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function toNginx(rules) {
  const out = ["# Generated from redirects.json by scripts/nginx-redirects.mjs. Do not edit on the server."];
  const seen = new Set();
  for (const { source, target, status } of rules) {
    if (status === "404-200" && source === "/<*>") continue;
    const kind = { 301: "permanent", 302: "redirect" }[status];
    if (!kind) throw new Error(`redirects.json: status "${status}" for ${source} isn't supported on the VPS (use 301 or 302)`);
    if (seen.has(source)) throw new Error(`redirects.json: ${source} is listed twice`);
    seen.add(source);

    if (source.endsWith("/<*>")) {
      const prefix = source.slice(0, -3); // keeps the trailing slash
      const to = target.replace(/<\*>$/, "");
      check(prefix, source); check(to, target);
      const tail = target.endsWith("<*>") ? "$1" : "";
      out.push(`location ^~ ${prefix} { rewrite ^${escapeRegex(prefix)}(.*)$ ${to}${tail} ${kind}; }`);
    } else {
      check(source, source); check(target, target);
      if (source === "/") throw new Error("redirects.json: redirecting / would take the whole site offline");
      out.push(`location = ${source} { return ${status} ${target}; }`);
    }
  }
  return out.join("\n") + "\n";
}

function check(path, original) {
  if (!SAFE.test(path) || path.includes("<")) throw new Error(`redirects.json: unsupported path "${original}"`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rules = JSON.parse(await readFile(new URL("../redirects.json", import.meta.url), "utf8"));
  process.stdout.write(toNginx(rules));
}
