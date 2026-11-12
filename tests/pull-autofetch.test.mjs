// The graph's Pull, Manygit's Pull all, and the background fetch with its
// back-off after a failure. Run: node tests/pull-autofetch.test.mjs
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

// The back-off: 3 minutes, then twice as long for each failure in a row, up to 6 hours.
const MIN = 60 * 1000;
assert.equal(R.autofetchWait(), 3 * MIN); assert.equal(R.autofetchWait(0), 3 * MIN);
assert.equal(R.autofetchWait(1), 6 * MIN); assert.equal(R.autofetchWait(3), 24 * MIN);
assert.equal(R.autofetchWait(50), R.AUTOFETCH_MAX, "capped");
assert.equal(R.autofetchDue(undefined, 0, 1e12), true, "never tried: due");
assert.ok(!/[\u0000-\u001f]/.test(R.fetchKey("/a/b", "vps")), "a shared key has no control characters (Herdr cuts it at a NUL)");
assert.notEqual(R.fetchKey("/a/b", null), R.fetchKey("/a/b", "vps"), "the same path on two machines");
assert.notEqual(R.fetchKey("/a/b", null), R.fetchKey("/a/c", null));
assert.equal(R.autofetchDue(1e12 - 2 * MIN, 0, 1e12), false, "tried 2 minutes ago");
assert.equal(R.autofetchDue(1e12 - 3 * MIN, 0, 1e12), true, "3 minutes after a success");
assert.equal(R.autofetchDue(1e12 - 3 * MIN, 1, 1e12), false, "3 minutes after one failure: not yet");
assert.equal(R.autofetchDue(1e12 - 6 * MIN, 1, 1e12), true, "6 minutes after one failure");
assert.equal(R.autofetchDue(1e12 - 40 * MIN, 4, 1e12), false, "40 minutes after four failures (48 minutes wait)");
assert.equal(R.autofetchDue(1e12 - 60 * MIN, 4, 1e12), true, "an hour after four failures");
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
// A plain fetch reaches the remote the branch tracks, so a broken extra remote never blocks it.
sh(a, "remote", "add", "aaa-gone", join(ws, "missing.git"));
commit(other, "two"); sh(other, "push", "-q");
assert.equal(run(a, R.FETCH).code, 0, "fetch works with a broken remote beside origin");
const status = () => R.parseRepoStatus(sh(a, ...R.REPO_STATUS));
assert.equal(status().behind, 1, "origin's new commit arrived");
// Pull all: fast-forwards, and refuses to merge diverged history.
assert.equal(run(a, R.PULL).code, 0); assert.equal(status().behind, 0, "pulled");
commit(other, "three"); sh(other, "push", "-q"); commit(a, "mine");
const diverged = run(a, R.PULL);
assert.notEqual(diverged.code, 0, "a pull that can't fast-forward fails"); assert.ok(diverged.stderr.trim());
assert.equal(status().ahead, 1, "and changes nothing");
console.log("pull and autofetch ok");
