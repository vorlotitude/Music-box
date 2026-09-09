// Compare the GitHub remote main tree against local HEAD by blob SHA.
// Usage: $env:GMB_TOKEN=(.\readtoken.ps1); node verify-remote.js
// Exit 0 and prints "IN SYNC" only if every remote path matches local HEAD's
// blob sha and there are no stale/extraneous files.
const { execSync } = require("child_process");
const TOKEN = process.env.GMB_TOKEN;
const REPO = process.env.REPO || "vorlotitude/Music-box";
const BASE = "https://api.github.com/repos/" + REPO;
const projectDir = __dirname;
async function gh(u) {
  const r = await fetch(BASE + u, { headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "gmb-verify", "X-GitHub-Api-Version": "2022-11-28" } });
  if (!r.ok) throw new Error(r.status + " " + r.statusText);
  return r.json();
}
(async () => {
  const localLines = execSync("git ls-tree -r HEAD", { cwd: projectDir, encoding: "utf8" }).split("\n").filter(Boolean);
  const local = new Map();
  for (const l of localLines) {
    const m = l.match(/^(\d{6}) (\w+) (\w+)\t(.*)$/);
    if (!m) continue;
    local.set(m[4], { mode: m[1], type: m[2], sha: m[3] });
  }
  const ref = await gh("/git/ref/heads/main");
  const tree = await gh(`/git/trees/${ref.object.sha}?recursive=1`);
  const remote = new Map();
  for (const t of tree.tree) if (t.type === "blob") remote.set(t.path, t);

  console.log("local files:", local.size, " remote files:", remote.size);

  let problems = 0;
  for (const [p, lt] of local) {
    const rt = remote.get(p);
    if (!rt) { console.log("MISSING on remote:", p); problems++; continue; }
    if (rt.sha !== lt.sha) { console.log("CONTENT DIFF:", p); problems++; }
  }
  for (const p of remote.keys()) {
    if (!local.has(p)) { console.log("STALE on remote (not in HEAD):", p); problems++; }
  }
  if (problems === 0) { console.log("IN SYNC with local HEAD"); process.exit(0); }
  else { console.log("PROBLEMS:", problems); process.exit(1); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });