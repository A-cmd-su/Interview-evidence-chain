import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../server/index.mjs";
import { completion, validateConfig } from "../server/provider.mjs";
import { api } from "../src/api.js";
import {
  config,
  input,
  fixtureFetch,
  chatResponse,
  analysis,
  semanticReview,
  confirmedContext,
  briefingOutput,
} from "./fixtures.mjs";
async function client(t, fetchImpl = fixtureFetch) {
  const app = createApp({ fetchImpl });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        app.close(resolve);
        app.closeAllConnections();
      }),
  );
  let cookie = "";
  return async (path, payload, method = "POST") => {
    const res = await fetch(
      `http://127.0.0.1:${app.address().port}/api${path}`,
      {
        method,
        headers: { "content-type": "application/json", cookie },
        body: payload ? JSON.stringify(payload) : undefined,
      },
    );
    if (res.headers.has("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    return { status: res.status, data: await res.json() };
  };
}

test("难度参与出题和评分缓存，省略难度与标准等价，非法值不调用模型", async (t) => {
  let count = 0;
  const call = await client(t, async (...args) => {
    count++;
    return fixtureFetch(...args);
  });
  await call("/models", config);
  for (const path of ["/interview/prepare", "/interview/analyze"]) {
    const input = path.endsWith("/prepare")
      ? confirmedContext()
      : { ...confirmedContext(), briefing: undefined };
    const before = count;
    assert.equal(
      (await call(path, { ...input, difficulty: "fake" })).status,
      400,
    );
    assert.equal(count, before);
    for (const difficulty of ["basic", "standard", "advanced"]) {
      const result = await call(path, { ...input, difficulty });
      assert.equal(result.status, 200);
      assert.equal(result.data.cached, undefined);
      assert.equal(result.data.difficultyPolicy.id, difficulty);
      assert.equal(
        result.data.evaluation.difficultyVersion,
        result.data.difficultyPolicy.version,
      );
      const after = count;
      assert.equal(
        (await call(path, { ...input, difficulty })).data.cached,
        true,
      );
      assert.equal(count, after);
    }
    const after = count;
    assert.equal((await call(path, input)).data.cached, true);
    assert.equal(count, after);
  }
  assert.equal(count, 9);
});

test("岗位预提取和确认出题分离，编辑后的设置参与缓存，失败不缓存替代结果", async (t) => {
  let calls = 0;
  const call = await client(t, (...args) => {
    calls++;
    return fixtureFetch(...args);
  });
  await call("/models", config);
  assert.equal((await call("/interview/prepare", input)).status, 400);
  assert.equal(calls, 0);
  const proposal = await call("/interview/briefing", input);
  assert.equal(proposal.status, 200);
  assert.equal(proposal.data.confirmed, false);
  assert.equal(proposal.data.questions, undefined);
  assert.equal(calls, 1);
  assert.equal((await call("/interview/briefing", input)).data.cached, true);
  assert.equal(calls, 1);
  const context = confirmedContext(input, {
    title: "用户确认标题",
    focus: "projects",
    durationMinutes: 30,
  });
  const result = await call("/interview/prepare", context);
  assert.equal(result.status, 200);
  assert.equal(result.data.title, "用户确认标题");
  assert.equal(result.data.questions.length, 5);
  assert.equal((await call("/interview/prepare", context)).data.cached, true);
  assert.equal(calls, 2);
  const revised = confirmedContext(input, {
    focus: "behavioral",
    durationMinutes: 15,
  });
  assert.equal(
    (await call("/interview/prepare", revised)).data.questions.length,
    3,
  );
  assert.equal(calls, 3);
});

test("预提取伪造原文返回失败，重试仍调用模型且不生成题目", async (t) => {
  let calls = 0;
  const call = await client(t, () => {
    calls++;
    const value = briefingOutput(input);
    value.capabilities[0].requirementQuote = "fabricated";
    return chatResponse(value);
  });
  await call("/models", config);
  for (let i = 0; i < 2; i++) {
    const result = await call("/interview/briefing", input);
    assert.equal(result.status, 502);
    assert.equal(result.data.capabilities, undefined);
    assert.equal(result.data.questions, undefined);
  }
  assert.equal(calls, 2);
});
test("完整接口、根地址、自定义路径与模型Token参数规范化", async () => {
  assert.equal(validateConfig(config).baseUrl, "http://127.0.0.1:9999/v1");
  assert.equal(
    validateConfig({ ...config, baseUrl: "http://localhost:9999" }).baseUrl,
    "http://localhost:9999/v1",
  );
  assert.equal(
    validateConfig({
      ...config,
      baseUrl: "http://localhost:9999/compatible-mode/v1",
    }).baseUrl,
    "http://localhost:9999/compatible-mode/v1",
  );
  for (const baseUrl of [
    "http://api.example.com/v1",
    "https://192.168.1.1/v1",
    "https://api.local/v1",
    "https://user:secret@example.com/v1",
  ])
    assert.throws(() => validateConfig({ ...config, baseUrl }));
  await completion(
    { ...validateConfig(config), tokenField: "max_completion_tokens" },
    [],
    {
      fetchImpl: async (_, opts) => {
        const body = JSON.parse(opts.body);
        assert.equal(body.temperature, undefined);
        assert.ok(body.max_completion_tokens > 0);
        assert.equal(body.max_tokens, undefined);
        return chatResponse("OK");
      },
    },
  );
});
test("未配置模型不调用；保存不假装连接；测试后配置有测试时间且Key不回传", async (t) => {
  let count = 0;
  const call = await client(t, async (...args) => {
    count++;
    return fixtureFetch(...args);
  });
  assert.equal(
    (await call("/interview/prepare", confirmedContext(input))).status,
    409,
  );
  const save = await call("/models", { ...config, apiKey: "secret-test" });
  assert.equal(count, 0);
  assert.equal(save.data.config.testedAt, null);
  assert.equal(save.data.config.apiKey, undefined);
  await call("/models/test", { ...config, apiKey: "secret-test" });
  const again = await call("/models", { ...config, apiKey: "secret-test" });
  assert.ok(again.data.config.testedAt);
  assert.equal(count, 1);
  assert.ok(
    !JSON.stringify((await call("/health", null, "GET")).data).includes(
      "secret-test",
    ),
  );
});
test("在线生成问题、分析、缓存、切换配置和清除会话", async (t) => {
  let count = 0;
  const call = await client(t, async (...args) => {
    count++;
    return fixtureFetch(...args);
  });
  await call("/models", config);
  const prepared = await call("/interview/prepare", confirmedContext(input));
  assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
  assert.equal(prepared.data.questions.length, 3);
  const report = await call("/interview/analyze", input);
  assert.equal(report.status, 200, JSON.stringify(report.data));
  assert.equal(report.data.mode, "online-model");
  assert.equal((await call("/interview/analyze", input)).data.cached, true);
  assert.equal(count, 3);
  await call("/models", { ...config, model: "another-model" });
  await call("/interview/analyze", input);
  assert.equal(count, 5);
  await call("/session", null, "DELETE");
  assert.equal((await call("/interview/analyze", input)).status, 409);
});
for (const kind of ["network", "http", "json", "quote"]) {
  test(kind + "失败不生成报告、不缓存替代结果", async (t) => {
    let count = 0;
    const call = await client(t, async () => {
      count++;
      if (kind === "network") throw new Error("secret");
      if (kind === "http") return new Response("secret", { status: 401 });
      if (kind === "json") return chatResponse("invalid");
      const value = analysis();
      value.scores[0].answerQuote = "secret-fabricated";
      return chatResponse(value);
    });
    await call("/models", config);
    for (let i = 0; i < 2; i++) {
      const result = await call("/interview/analyze", input);
      assert.equal(result.status, 502);
      assert.equal(result.data.score, undefined);
      assert.ok(!JSON.stringify(result.data).includes("secret"));
    }
    assert.equal(count, 2);
  });
}
test("离线请求和旧接口不存在成功评分路径", async (t) => {
  const call = await client(t);
  await call("/models", config);
  assert.equal(
    (await call("/interview/analyze", { ...input, mode: "offline" })).status,
    400,
  );
  assert.equal((await call("/analyze", input)).status, 404);
});
test("模型请求进行时禁止改变配置，防止跨模型缓存污染", async (t) => {
  let release;
  const call = await client(t, (url, options) =>
    JSON.parse(options.body).messages[0].content.includes("任务=review")
      ? fixtureFetch(url, options)
      : new Promise((resolve) => {
          release = () => resolve(chatResponse(analysis()));
        }),
  );
  await call("/models", config);
  const pending = call("/interview/analyze", input);
  while (!release) await new Promise((resolve) => setTimeout(resolve, 5));
  try {
    assert.equal(
      (await call("/models", { ...config, model: "changed" })).status,
      429,
    );
  } finally {
    release();
  }
  assert.equal((await pending).status, 200);
});
test("前端报错能区分网页响应、网络和供应商失败", async () => {
  await assert.rejects(
    api("/health", {
      fetchImpl: async () =>
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        }),
    }),
    /代理/,
  );
  await assert.rejects(
    api("/health", {
      fetchImpl: async () => {
        throw new TypeError("secret");
      },
    }),
    /npm run dev/,
  );
  await assert.rejects(
    api("/health", {
      fetchImpl: async () =>
        new Response('{"error":"模型服务 HTTP 401"}', {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    }),
    /HTTP 401/,
  );
});

test("完整端点与规范化地址等价时可以复用 Key，改变上游地址则拒绝", async (t) => {
  const call = await client(t, async (_, options) => {
    assert.equal(options.headers.authorization, "Bearer test-private-key");
    return chatResponse("OK");
  });
  await call("/models", { ...config, apiKey: "test-private-key" });
  const probe = await call("/models/test", {
    ...config,
    apiKey: "",
    reuseSavedKey: true,
  });
  assert.equal(probe.status, 200);
  assert.equal(probe.data.protocol, "chat");
  assert.equal(probe.data.endpoint, config.baseUrl);
  assert.equal(
    (
      await call("/models/test", {
        ...config,
        apiKey: "",
        baseUrl: "http://localhost:9998/v1",
        reuseSavedKey: true,
      })
    ).status,
    400,
  );
});

test("测试失败清除成功状态，诊断到达前端但 Key 不回传", async (t) => {
  let fail = false;
  const call = await client(t, async () =>
    fail
      ? new Response(
          JSON.stringify({
            error: { message: "Invalid key: confidential-test-key" },
          }),
          { status: 401 },
        )
      : chatResponse("OK"),
  );
  const settings = { ...config, apiKey: "confidential-test-key" };
  await call("/models", settings);
  await call("/models/test", settings);
  assert.ok((await call("/health", null, "GET")).data.config.testedAt);
  fail = true;
  const result = await call("/models/test", settings);
  assert.equal(result.status, 502);
  assert.equal(result.data.details.upstreamStatus, 401);
  assert.ok(!JSON.stringify(result.data).includes(settings.apiKey));
  assert.equal((await call("/health", null, "GET")).data.config.testedAt, null);
  await assert.rejects(
    api("/models/test", {
      fetchImpl: async () =>
        new Response(JSON.stringify(result.data), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    }),
    (error) => error.details.code === "UPSTREAM_HTTP",
  );
});

test("未填模型 ID 也可获取列表，不触发生成、不改变配置和测试状态", async (t) => {
  const requests = [];
  const call = await client(t, async (url, options) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify({
        data: [{ id: "model-a" }, { id: "model-a" }, { id: "model-b" }],
      }),
    );
  });
  await call("/models", { ...config, apiKey: "list-private-key" });
  const result = await call("/models/list", {
    ...config,
    model: "",
    apiKey: "",
    reuseSavedKey: true,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.models, ["model-a", "model-b"]);
  assert.equal(requests[0].url, "http://127.0.0.1:9999/v1/models");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.body, undefined);
  assert.equal(
    requests[0].options.headers.authorization,
    "Bearer list-private-key",
  );
  const health = (await call("/health", null, "GET")).data;
  assert.equal(health.config.model, config.model);
  assert.equal(health.config.testedAt, null);
  assert.equal(health.config.structureTestedAt, null);
});

test("列表未实现不阻止手填模型和真实调用", async (t) => {
  const call = await client(t, async (url, options) =>
    options.method === "GET"
      ? new Response("{}", { status: 404 })
      : fixtureFetch(url, options),
  );
  assert.equal((await call("/models/list", config)).status, 502);
  assert.equal((await call("/models", config)).status, 200);
  assert.equal(
    (await call("/interview/prepare", confirmedContext(input))).status,
    200,
  );
});

test("结构化测试需明确确认，仅发送合成样例且不保存测试报告", async (t) => {
  let count = 0;
  const call = await client(t, async (url, options) => {
    count++;
    assert.ok(!options.body.includes("USER_PRIVATE_RESUME"));
    return fixtureFetch(url, options);
  });
  assert.equal((await call("/models/test-structure", config)).status, 400);
  assert.equal(count, 0);
  const result = await call("/models/test-structure", {
    ...config,
    confirmPaidTest: true,
    resume: "USER_PRIVATE_RESUME",
  });
  assert.equal(result.status, 200);
  assert.equal(count, 2);
  assert.equal(result.data.checks.length, 5);
  assert.equal(result.data.scores, undefined);
  assert.equal((await call("/health", null, "GET")).data.config, null);
  const saved = await call("/models", config);
  assert.ok(saved.data.config.structureTestedAt);
  assert.equal(saved.data.config.testedAt, null);
});

test("无效结构不能通过结构化测试，失败清除旧状态", async (t) => {
  let fail = false;
  const call = await client(t, async (url, options) =>
    fail ? chatResponse({ ok: true }) : fixtureFetch(url, options),
  );
  await call("/models", config);
  await call("/models/test", config);
  await call("/models/test-structure", { ...config, confirmPaidTest: true });
  fail = true;
  const failed = await call("/models/test-structure", {
    ...config,
    confirmPaidTest: true,
  });
  assert.equal(failed.status, 502);
  const health = (await call("/health", null, "GET")).data;
  assert.equal(health.config.structureTestedAt, null);
  assert.ok(health.config.testedAt);
});

test("结构化测试也拒绝模型伪造的样例引用", async (t) => {
  const call = await client(t, async (_, options) => {
    const data = JSON.parse(JSON.parse(options.body).messages.at(-1).content);
    const value = analysis(data);
    value.scores[0].answerQuote = "fabricated-quote";
    return chatResponse(value);
  });
  const result = await call("/models/test-structure", {
    ...config,
    confirmPaidTest: true,
  });
  assert.equal(result.status, 502);
  assert.ok(!JSON.stringify(result.data).includes("fabricated-quote"));
});

test("配置变化后结构化通过状态失效，报告携带不含 Key 的评估版本", async (t) => {
  const call = await client(t);
  await call("/models/test-structure", { ...config, confirmPaidTest: true });
  await call("/models", {
    ...config,
    model: "other-model",
    apiKey: "metadata-private-key",
  });
  assert.equal(
    (await call("/health", null, "GET")).data.config.structureTestedAt,
    null,
  );
  const result = await call("/interview/analyze", input);
  assert.ok(result.data.evaluation.promptVersion);
  assert.equal(
    result.data.evaluation.reviewVersion,
    result.data.semanticReview.version,
  );
  assert.equal(result.data.evaluation.protocol, "chat");
  assert.ok(!JSON.stringify(result.data).includes("metadata-private-key"));
});

for (const failure of ["network", "invalid-json", "wrong-evidence"]) {
  test(`语义复核${failure}失败不发布初评、不缓存且可以重试`, async (t) => {
    let count = 0;
    let fail = true;
    const call = await client(t, async (url, options) => {
      count++;
      const messages = JSON.parse(options.body).messages;
      if (!fail || !messages[0].content.includes("任务=review"))
        return fixtureFetch(url, options);
      if (failure === "network") throw new Error("private-review-key");
      if (failure === "invalid-json")
        return chatResponse("invalid private-review-key");
      const review = semanticReview(JSON.parse(messages[1].content));
      review.reviews[0].evidenceId = "private-review-key";
      return chatResponse(review);
    });
    await call("/models", config);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await call("/interview/analyze", input);
      assert.equal(result.status, 502);
      assert.match(result.data.error, /语义复核失败/);
      assert.equal(result.data.scores, undefined);
      assert.equal(result.data.cached, undefined);
      assert.ok(!JSON.stringify(result.data).includes("private-review-key"));
    }
    assert.equal(count, 4);
    fail = false;
    assert.equal((await call("/interview/analyze", input)).data.score, 60);
    assert.equal(count, 6);
    assert.equal((await call("/interview/analyze", input)).data.cached, true);
    assert.equal(count, 6);
  });
}

test("复核进行时保持会话互斥；完成后只缓存不含候选分数的最终结果", async (t) => {
  let release;
  const call = await client(t, async (url, options) => {
    const messages = JSON.parse(options.body).messages;
    if (!messages[0].content.includes("任务=review"))
      return fixtureFetch(url, options);
    return new Promise((resolve) => {
      release = () => {
        const review = semanticReview(JSON.parse(messages[1].content));
        review.reviews[2].verdict = "unsupported";
        resolve(chatResponse(review));
      };
    });
  });
  await call("/models", config);
  const pending = call("/interview/analyze", input);
  while (!release) await new Promise((resolve) => setTimeout(resolve, 5));
  try {
    assert.equal((await call("/models", config)).status, 429);
    assert.equal((await call("/interview/analyze", input)).status, 429);
    assert.equal((await call("/session", null, "DELETE")).status, 409);
  } finally {
    release();
  }
  const result = await pending;
  assert.equal(result.status, 200);
  const cached = (await call("/interview/analyze", input)).data;
  assert.equal(cached.cached, true);
  assert.equal(cached.score, null);
  assert.equal(cached.scores[2].score, null);
  assert.equal(cached.coverage, 80);
  assert.ok(!JSON.stringify(cached).includes("proposedScore"));
});

test("结构化复核失败清除旧通过状态，不影响基础连接记录", async (t) => {
  let fail = false;
  const call = await client(t, (url, options) =>
    fail && JSON.parse(options.body).messages[0].content.includes("任务=review")
      ? chatResponse({ reviews: [] })
      : fixtureFetch(url, options),
  );
  await call("/models", config);
  await call("/models/test", config);
  assert.equal(
    (await call("/models/test-structure", { ...config, confirmPaidTest: true }))
      .status,
    200,
  );
  fail = true;
  assert.equal(
    (await call("/models/test-structure", { ...config, confirmPaidTest: true }))
      .status,
    502,
  );
  const health = (await call("/health", null, "GET")).data;
  assert.equal(health.config.structureTestedAt, null);
  assert.ok(health.config.testedAt);
});
