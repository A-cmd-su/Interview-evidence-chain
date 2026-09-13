import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.mjs";

async function request(server, path, options = {}) {
  const base = `http://127.0.0.1:${server.address().port}`;
  return fetch(base + path, options);
}

test("saved local model settings are restored before the workspace loads", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "evidence-model-persistence-"),
  );
  const dbPath = join(directory, "evidence.sqlite");
  let first = createApp({ dbPath });
  await new Promise((resolve) => first.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    if (first.listening) await new Promise((resolve) => first.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const config = {
    baseUrl: "http://127.0.0.1:34567/v1",
    model: "local-persistent-model",
    apiKey: "",
  };
  const save = await request(first, "/api/models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.config.model, config.model);
  assert.equal(saved.config.hasKey, false);
  assert.ok(saved.config.profileId);
  await new Promise((resolve) => first.close(resolve));

  const second = createApp({ dbPath });
  first = second;
  await new Promise((resolve) => second.listen(0, "127.0.0.1", resolve));
  const health = await request(second, "/api/health");
  const body = await health.json();
  assert.equal(health.status, 200);
  assert.equal(body.config.model, config.model);
  assert.equal(body.config.baseUrl, "http://127.0.0.1:34567/v1");
  assert.equal(body.config.hasKey, false);
  const profiles = await (await request(second, "/api/profiles")).json();
  assert.equal(profiles.profiles.length, 1);
  assert.ok(!JSON.stringify(profiles).includes("apiKey"));
});
