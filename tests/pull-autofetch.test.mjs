// The graph's Pull, Manygit's Pull all, and the background fetch of every
// remote (origin first, each on its own). Run: node tests/pull-autofetch.test.mjs
import * as R from "../mods/git-graph/repos.js";
import * as G from "../mods/git-graph/git.js";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const env = { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null" };
const sh = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const run = (cwd, argv) => { const r = spawnSync("env", argv, { cwd, env, encoding: "utf8" }); return { code: r.status, stderr: r.stderr }; };
const commit = (cwd, msg) => { writeFileSync(join(cwd, `${msg}.txt`), msg); sh(cwd, "add", "."); sh(cwd, "commit", "-qm", msg); };

assert.deepEqual(R.fetchOrder(["upstream", "origin", "fork", ""]), ["origin", "upstream", "fork"], "origin first");
assert.deepEqual(R.fetchOrder(["b", "a", "b"]), ["b", "a"], "no origin: as listed, once each");
assert.deepEqual(R.fetchOrder(["--upload-pack=x", "origin"]), ["origin"], "a name that reads as an option is skipped");
assert.equal(R.syncOf({ branch: "main" }, "fatal: Not possible to fast-forward", "pull").text, "pull failed");
assert.equal(R.syncOf({ branch: "main" }, "x").text, "fetch failed", "fetch stays the default");
assert.equal(G.doneText({ type: "pull" }), "Pulled");
assert.equal(R.autofetchOn(undefined), false, "the background fetch is off until ticked");
assert.equal(R.autofetchOn(true), true);
const pullAll = G.dialogFor({ type: "pullAll", count: 3 }, { current: null });
assert.equal(pullAll.confirm, "Pull all"); assert.match(pullAll.detail, /3 repositories/);
assert.match(G.dialogFor({ type: "pullAll", count: 1 }, { current: null }).detail, /1 repository to its upstream/);
assert.equal(G.validate({ type: "pullAll", count: 2 }, {}, { current: null }), null, "nothing to type");
assert.equal(G.doneText({ type: "pull", upstream: "origin/main" }), "Pulled origin/main");

const ws = mkdtempSync(join(tmpdir(), "herdr-pull-")), bare = join(ws, "origin.git"), a = join(ws, "a"), other = join(ws, "other");
sh(ws, "init", "-q", "--bare", "-b", "main", bare);
sh(ws, "clone", "-q", bare, "a"); commit(a, "one"); sh(a, "push", "-q", "-u", "origin", "main");
sh(ws, "clone", "-q", bare, "other");
// A broken remote listed before origin: origin still fetches, and the broken one fails alone.
sh(a, "remote", "add", "aaa-gone", join(ws, "missing.git"));
commit(other, "two"); sh(other, "push", "-q");
const order = R.fetchOrder(sh(a, "remote").split("\n"));
assert.deepEqual(order, ["origin", "aaa-gone"]);
const results = order.map((name) => run(a, R.fetchRemote(name)));
assert.equal(results[0].code, 0, "origin fetched"); assert.notEqual(results[1].code, 0, "the broken remote failed on its own");
const status = () => R.parseRepoStatus(sh(a, ...R.REPO_STATUS));
assert.equal(status().behind, 1, "origin's new commit arrived despite the broken remote");
// Pull all: fast-forwards, and refuses to merge diverged history.
assert.equal(run(a, R.PULL).code, 0); assert.equal(status().behind, 0, "pulled");
commit(other, "three"); sh(other, "push", "-q"); commit(a, "mine");
const diverged = run(a, R.PULL);
assert.notEqual(diverged.code, 0, "a pull that can't fast-forward fails"); assert.ok(diverged.stderr.trim());
assert.equal(status().ahead, 1, "and changes nothing");
console.log("pull and autofetch ok");
