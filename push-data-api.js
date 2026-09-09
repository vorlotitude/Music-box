// Push the last unpushed local commit to the private GitHub repo via the Git
// Database API (bypasses the broken git remote-https helper).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.GMB_TOKEN;
if (!TOKEN) throw new Error("GMB_TOKEN env var required");
const REPO = "vorlotitude/Music-box";
const BASE = "https://api.github.com/repos/" + REPO;
const BRANCH = "main";

const projectDir = __dirname;
function run(cmd) {
  return execSync(cmd, { cwd: projectDir, encoding: "utf8" }).trim();
}

async function gh(method, url, body) {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(BASE + url, {
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "game-music-box-push",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

async function main() {
  // Resolve remote head.
  const refUrl = `/git/ref/heads/${BRANCH}`;
  const ref = await gh("GET", refUrl);
  const headSha = ref.object.sha;
  console.log("remote branch:", BRANCH, "head:", headSha);

  const headCommit = await gh("GET", `/git/commits/${headSha}`);
  const baseTree = headCommit.tree.sha;

  // Files changed in the latest unpushed local commit.
  const status = run(`git diff --name-status HEAD~1..HEAD`);
  const files = status
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [, st, f] = l.match(/^(\S+)\t(.+)$/) || [];
      return { st, f };
    })
    .filter((x) => x.f && x.st !== "D");
  console.log("files to push:", files.map((x) => x.f));

  // Blob each file's full current content.
  const entries = [];
  for (const { st, f } of files) {
    const abs = path.join(projectDir, f);
    if (!fs.existsSync(abs)) {
      console.log("skip missing:", f);
      continue;
    }
    const content = fs.readFileSync(abs, "utf8");
    const blob = await gh("POST", "/git/blobs", { content, encoding: "utf-8" });
    entries.push({ path: f, mode: "100644", type: "blob", sha: blob.sha });
  }

  // New tree = remote base tree with only the changed paths overridden.
  const newTree = await gh("POST", "/git/trees", { base_tree: baseTree, tree: entries });

  const message = run("git log -1 --pretty=%B HEAD").trim();
  const commit = await gh("POST", "/git/commits", {
    message,
    tree: newTree.sha,
    parents: [headSha],
  });
  console.log("created commit:", commit.sha);

  await gh("PATCH", `/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
  console.log("ref", BRANCH, "->", commit.sha);
  console.log("OK");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});