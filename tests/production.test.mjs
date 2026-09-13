import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.mjs";
import { createAccess, passwordRecord } from "../server/access.mjs";
import { createStore } from "../server/store.mjs";
import { createBackups, validateBackup } from "../server/backups.mjs";
import { initialWorkspace } from "../src/state.js";

test("personal password protects ALL data endpoints, rejects forged auth, revokes logout and sets Secure cookies", async (t) => {
  const server = createApp({
    passwordRecord: await passwordRecord("test-owner-password"),
    publicOrigin: "https://personal.example",
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    "workspace",
    "health",
    "profiles",
    "jobs",
    "usage",
    "backup",
    "backups",
    "preferences",
    "routing",
    "budget",
    "asr",
    "full-backups",
  ]) {
    const r = await fetch(`${base}/api/${path}`, {
      headers: { cookie: "evidence_access=" + "a".repeat(64) },
    });
    assert.equal(r.status, 401, path);
    assert.equal((await r.json()).code, "ACCESS_REQUIRED");
  }
  const login = (password, origin = "https://personal.example") =>
    fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ password }),
    });
  assert.equal((await login("wrong")).status, 401);
  assert.equal(
    (await login("test-owner-password", "https://evil.example")).status,
    403,
  );
  const success = await login("test-owner-password");
  assert.equal(success.status, 200);
  const cookie = success.headers.get("set-cookie").split(";")[0];
  assert.match(
    success.headers.get("set-cookie"),
    /HttpOnly; SameSite=Strict.*Secure/,
  );
  assert.equal(
    (await fetch(base + "/api/workspace", { headers: { cookie } })).status,
    200,
  );
  const logout = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (await fetch(base + "/api/workspace", { headers: { cookie } })).status,
    401,
  );
});

test("login attempts limited and sessions expire with a controlled clock", async () => {
  let now = 1;
  const record = await passwordRecord("test-owner-password");
  const access = createAccess(record, { now: () => now });
  const req = { headers: {} },
    headers = {},
    res = { setHeader: (k, v) => (headers[k] = v) };
  for (let i = 0; i < 5; i++)
    await assert.rejects(access.login(req, res, { password: "wrong" }), {
      status: 401,
    });
  await assert.rejects(
    access.login(req, res, { password: "test-owner-password" }),
    { status: 429 },
  );
  now += 16 * 60000;
  await access.login(req, res, { password: "test-owner-password" });
  req.headers.cookie = headers["set-cookie"].split(";")[0];
  assert.equal(access.authorized(req), true);
  now += 8 * 3600000;
  assert.equal(access.authorized(req), false);
});

test("production serves real assets on Windows, safe routes, strict headers and same-origin API writes", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "evidence-web-"));
  await mkdir(join(dir, "assets"));
  await writeFile(join(dir, "index.html"), "<!doctype html><h1>app</h1>");
  await writeFile(join(dir, "assets", "app.mjs"), "export const valid = true;");
  const server = createApp({ serveWeb: true, webRoot: dir });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const asset = await fetch(base + "/assets/app.mjs");
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.match(await asset.text(), /export const/);
  assert.equal((await fetch(base + "/assets/missing.js")).status, 404);
  assert.equal((await fetch(base + "/.env")).status, 404);
  assert.equal((await fetch(base + "/assets/%2e%2e%5csecret.txt")).status, 404);
  const deep = await fetch(base + "/interview");
  assert.match(
    deep.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.doesNotMatch(
    deep.headers.get("content-security-policy"),
    /'unsafe-eval'/,
  );
  assert.equal(
    (
      await fetch(base + "/api/workspace", {
        method: "PUT",
        headers: { origin: base, "content-type": "application/json" },
        body: JSON.stringify({ value: initialWorkspace(), revision: 0 }),
      })
    ).status,
    200,
  );
});

test("auto backups are atomic, checksum-validated, bounded, survive recreation and refuse corrupted restores", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "evidence-backups-"));
  const store = createStore();
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  store.put("workspace", initialWorkspace());
  const backups = createBackups(store, { directory: dir, keep: 2 });
  await backups.run(true);
  await backups.run(true);
  const result = await backups.run(true);
  assert.equal(result.files.length, 2);
  assert.ok(result.lastSuccessfulAt);
  assert.equal((await backups.run()).files.length, 2);
  const value = await backups.read(result.files[0]);
  assert.equal(value.workspace.version, 2);
  store.restore(value);
  assert.equal(
    (await createBackups(store, { directory: dir }).status()).files.length,
    2,
  );
  const tampered = JSON.parse(
    await readFile(join(dir, result.files[0]), "utf8"),
  );
  tampered.workspace.draft.jd = "tampered";
  assert.throws(() => validateBackup(tampered), /校验/);
  assert.throws(() => store.restore(tampered), /校验/);
  assert.equal(store.get("workspace").value.draft.jd, "");
  await assert.rejects(backups.read("../other.json"));
  await writeFile(join(dir, "unrelated.txt"), "keep");
  await backups.clear();
  assert.equal((await backups.status()).files.length, 0);
  assert.equal(await readFile(join(dir, "unrelated.txt"), "utf8"), "keep");
});
