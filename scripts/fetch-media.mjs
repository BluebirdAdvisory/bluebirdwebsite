// One-off: copy every image/PDF the site references from the old WordPress site
// into src/uploads/, keeping the same folder structure.
// Run once while the old site is still live:   npm run fetch-media
import { readdir, readFile, mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";

const OLD = "https://bluebirdadvisory.com.au/wp-content/uploads/";
const SRC = "src";
const DEST = "src/uploads";
const pattern = /\/uploads\/([^"'\s)]+\.(?:png|jpe?g|gif|webp|svg|pdf))/gi;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!p.startsWith(DEST)) yield* walk(p); }
    else if (/\.(md|njk|json|html)$/.test(e.name)) yield p;
  }
}

const wanted = new Set();
for await (const f of walk(SRC)) for (const m of (await readFile(f, "utf8")).matchAll(pattern)) wanted.add(m[1]);

let ok = 0, skipped = 0; const failed = [];
for (const rel of [...wanted].sort()) {
  const out = join(DEST, rel);
  try { await access(out); skipped++; continue; } catch {}
  try {
    const res = await fetch(OLD + rel);
    if (!res.ok) throw new Error(res.status);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    ok++; console.log("✓", rel);
  } catch (e) { failed.push(`${rel} (${e.message})`); }
}
console.log(`\nDownloaded ${ok}, already present ${skipped}, failed ${failed.length}`);
if (failed.length) { console.log("Failed:\n  " + failed.join("\n  ")); process.exitCode = 1; }
