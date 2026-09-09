const TOKEN = process.env.GMB_TOKEN;
const REPO = process.env.REPO || "vorlotitude/Music-box";
const BASE = "https://api.github.com/repos/" + REPO;
async function gh(u) {
  const r = await fetch(BASE + u, {
    headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "gmb-verify", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!r.ok) throw new Error(r.status + " " + r.statusText);
  return r.json();
}
(async () => {
  const ref = await gh("/git/ref/heads/main");
  const tree = await gh(`/git/trees/${ref.object.sha}?recursive=1`);
  const paths = new Set(tree.tree.map((t) => t.path));
  const checks = [
    "src/domain/boxPort.ts",
    "src/pages/MusicBoxesPage.tsx",
    "src/pages/LibraryPage.tsx",
    "src/domain/GameController.test.ts",
    "core/src/adapters/cs2/CS2Adapter.ts",
    "core/src/audio/AudioRouter.ts",
    "core/src/audio/AudioRouter.test.ts",
    "core/src/audio/AudioEngine.ts",
    "core/src/audio/AudioBackend.ts",
    "src/audio/HowlerBackend.ts",
    "readtoken.ps1",
    "push-data-api.js",
  ];
  for (const p of checks) console.log((paths.has(p) ? "  OK     " : "MISSING ") + p);
  console.log("remote head:", ref.object.sha);
  console.log("tree file count:", paths.size);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });