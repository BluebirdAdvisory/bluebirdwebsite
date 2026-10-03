// Job ads published from Recruit Wizard (see recruit-wizard/README.md).
// Each job is a JSON file in /jobs, written by the Recruit Wizard Lambda, never by hand.
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export default async function () {
  const dir = resolve(process.env.JOBS_DIR || "jobs");
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith(".json")); } catch {}
  const all = await Promise.all(files.map(async (f) => JSON.parse(await readFile(resolve(dir, f), "utf8"))));

  // A job is open until Recruit Wizard closes it or the end of its expiry day passes.
  const now = Date.now();
  for (const job of all) {
    const expires = Date.parse(job.expires);
    job.isOpen = job.status === "open" && (Number.isNaN(expires) || expires + 864e5 > now);
    // Recruit Wizard sends a plain date ("December 1, 2026"); keep the calendar day as written.
    const d = new Date(expires);
    job.validThrough = Number.isNaN(expires) ? ""
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  all.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  return { all, open: all.filter((j) => j.isOpen) };
}
