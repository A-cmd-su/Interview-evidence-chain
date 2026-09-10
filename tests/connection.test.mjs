import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import {
  completion,
  validateConfig,
  ProviderError,
  prepareInterview,
  analyzeInterview,
  listModels,
} from "../server/provider.mjs";
import { configureProxy } from "../server/network.mjs";
import { resolveEndpoint } from "../shared/modelConfig.mjs";
import {
  config,
  input,
  prepared,
  analysis,
  semanticReview,
  chatResponse,
} from "./fixtures.mjs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const responseOutput = (value) => ({
  status: "completed",
  output: [
    { type: "reasoning", summary: [] },
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: typeof value === "string" ? value : JSON.stringify(value),
        },
      ],
    },
  ],
});

test("API 根地址、完整端点和自定义 Responses 路径正确解析", () => {
  for (const [url, protocol, expected] of [
    [
      "https://relay.example",
      "auto",
      "https://relay.example/v1/chat/completions",
    ],
    [
      "https://relay.example/chat/completions/",
      "auto",
      "https://relay.example/chat/completions",
    ],
    [
      "https://relay.example/v1/responses/",
      "auto",
      "https://relay.example/v1/responses",
    ],
    [
      "https://relay.example/responses",
      "auto",
      "https://relay.example/responses",
    ],
    [
      "https://relay.example/api/v2",
      "responses",
      "https://relay.example/api/v2/responses",
    ],
    [
      "https://relay.example",
      "responses",
      "https://relay.example/v1/responses",
    ],
    [
      "https://relay.example/v1beta/openai",
      "chat",
      "https://relay.example/v1beta/openai/chat/completions",
    ],
  ]) {
    const resolved = resolveEndpoint(url, protocol);
    assert.equal(resolved.endpoint, expected);
    assert.deepEqual(
      resolveEndpoint(resolved.endpoint, resolved.protocol),
      resolved,
    );
  }
  assert.throws(
    () => resolveEndpoint("https://relay.example/v1/responses", "chat"),
    /不一致/,
  );
  assert.throws(
    () => resolveEndpoint("https://relay.example/?key=secret"),
    /凭据/,
  );
});

test("粘贴的 Bearer 前缀和首尾空白被规范化，不接受非法配置", () => {
  const normalized = validateConfig({
    ...config,
    apiKey: "  Bearer sample-key\n",
    model: "model-id\n",
  });
  assert.equal(normalized.apiKey, "sample-key");
  assert.equal(normalized.model, "model-id");
  assert.equal(normalized.tokenField, "auto");
  for (const patch of [
    { apiKey: "key\ninjected" },
    { protocol: "invalid" },
    { tokenField: "invalid" },
    { maxOutputTokens: 0 },
    { maxOutputTokens: 32769 },
  ])
    assert.throws(() => validateConfig({ ...config, ...patch }));
});

test("只有上游明确拒绝 Token 参数时自动兼容一次，认证和地址不变", async () => {
  const requests = [];
  const saved = validateConfig({ ...config, apiKey: "sample-key" });
  const result = await completion(saved, [{ role: "user", content: "JSON" }], {
    probe: true,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      assert.equal(url, saved.endpoint);
      assert.equal(options.headers.authorization, "Bearer sample-key");
      assert.equal(options.redirect, "error");
      return requests.length === 1
        ? json(
            {
              error: {
                message:
                  "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead.",
                param: "max_tokens",
              },
            },
            400,
          )
        : chatResponse("OK");
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].max_tokens, undefined);
  assert.equal(requests[1].max_completion_tokens, 8192);
  assert.equal(requests[1].temperature, undefined);
  assert.equal(result.tokenField, "max_completion_tokens");
});

test("手动 Token 参数、鉴权、限额和无关参数错误不重试", async () => {
  for (const [tokenField, status, message] of [
    ["max_tokens", 400, "max_tokens is not supported"],
    ["auto", 401, "max_tokens is not supported"],
    ["auto", 429, "max_tokens is not supported"],
    ["auto", 400, "response_format is not supported"],
    ["auto", 400, "max_tokens exceeds model context length"],
  ]) {
    let calls = 0;
    await assert.rejects(
      completion(validateConfig({ ...config, tokenField }), [], {
        fetchImpl: async () => {
          calls++;
          return json({ error: { message } }, status);
        },
      }),
      ProviderError,
    );
    assert.equal(calls, 1);
  }
});

test("自动兼容失败最多请求两次，不把第二次错误当成功", async () => {
  let calls = 0;
  await assert.rejects(
    completion(validateConfig(config), [], {
      fetchImpl: async () => {
        calls++;
        return json(
          {
            error: {
              message: `Unsupported parameter: ${calls === 1 ? "max_tokens" : "max_completion_tokens"}`,
            },
          },
          400,
        );
      },
    }),
    /HTTP 400/,
  );
  assert.equal(calls, 2);
});

test("Responses 使用原生 input/output 协议且不持久化资料", async () => {
  const saved = validateConfig({
    ...config,
    baseUrl: "http://localhost:9999/responses",
    jsonMode: true,
  });
  const fetchImpl = async (url, options) => {
    assert.equal(url, "http://localhost:9999/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.equal(body.messages, undefined);
    assert.equal(body.max_tokens, undefined);
    assert.equal(body.max_output_tokens, 8192);
    assert.deepEqual(body.text, { format: { type: "json_object" } });
    const value = JSON.parse(body.input.at(-1).content);
    return json(
      responseOutput(
        body.input[0].content.includes("任务=prepare")
          ? prepared(value)
          : body.input[0].content.includes("任务=review")
            ? semanticReview(value)
            : analysis(value),
      ),
    );
  };
  assert.equal(
    (await prepareInterview(input, saved, { fetchImpl })).questions.length,
    3,
  );
  assert.equal(
    (await analyzeInterview(input, saved, { fetchImpl })).mode,
    "online-model",
  );
});

test("推理预算截断只确认连通性并警告，正式分析仍必须失败", async () => {
  for (const protocol of ["chat", "responses"]) {
    const saved = validateConfig({
      ...config,
      baseUrl: "http://localhost:9999/v1",
      protocol,
    });
    const fetchImpl = async () =>
      json(
        protocol === "chat"
          ? {
              choices: [
                {
                  finish_reason: "length",
                  message: {
                    role: "assistant",
                    content: null,
                    reasoning_content: "test-only",
                  },
                },
              ],
            }
          : {
              status: "incomplete",
              incomplete_details: { reason: "max_output_tokens" },
              output: [],
            },
      );
    const probe = await completion(saved, [], { fetchImpl, probe: true });
    assert.match(probe.warning, /截断/);
    await assert.rejects(
      completion(saved, [], { fetchImpl }),
      (error) => error.details.code === "OUTPUT_TRUNCATED",
    );
  }
});

test("错误协议、网页、空文本和上游错误对象不能通过连接测试", async () => {
  for (const body of [
    null,
    {},
    { ok: true },
    { choices: [] },
    { error: { message: "upstream failure" } },
    { choices: [{ message: { content: null }, finish_reason: "stop" }] },
    { choices: [{ message: [], finish_reason: "length" }] },
  ]) {
    await assert.rejects(
      completion(validateConfig(config), [], {
        probe: true,
        fetchImpl: async () => json(body),
      }),
      ProviderError,
    );
  }
  await assert.rejects(
    completion(validateConfig(config), [], {
      probe: true,
      fetchImpl: async () => new Response("<html>secret page</html>"),
    }),
    /非 JSON/,
  );
  const responses = validateConfig({
    ...config,
    baseUrl: "http://localhost:9999/v1/responses",
  });
  for (const body of [
    { status: "failed", output: [] },
    {
      status: "incomplete",
      output: [],
      incomplete_details: { reason: "content_filter" },
    },
    { status: "completed", output: [null] },
  ])
    await assert.rejects(
      completion(responses, [], {
        probe: true,
        fetchImpl: async () => json(body),
      }),
      ProviderError,
    );
});

test("上游诊断保留有用消息，但隐藏密钥及鉴权字段", async () => {
  const saved = validateConfig({ ...config, apiKey: "private-config-key" });
  await assert.rejects(
    completion(saved, [], {
      fetchImpl: async () =>
        json(
          {
            error: {
              message:
                "model not found: private-config-key; Bearer another-private-key; api_key=third-private-key",
            },
          },
          404,
        ),
    }),
    (error) => {
      assert.match(error.message, /model not found/);
      assert.equal(error.details.upstreamStatus, 404);
      assert.equal(error.details.endpoint, saved.endpoint);
      for (const secret of [
        "private-config-key",
        "another-private-key",
        "third-private-key",
      ])
        assert.ok(!error.message.includes(secret));
      return true;
    },
  );
  await assert.rejects(
    completion(saved, [], {
      fetchImpl: async () => new Response(null, { status: 401 }),
    }),
    /HTTP 401/,
  );
});

test("网络错误区分 DNS、拒绝连接、超时与证书且不暴露内部错误", async () => {
  for (const code of [
    "ENOTFOUND",
    "ECONNREFUSED",
    "UND_ERR_CONNECT_TIMEOUT",
    "CERT_HAS_EXPIRED",
  ]) {
    await assert.rejects(
      completion(validateConfig(config), [], {
        fetchImpl: async () => {
          throw new TypeError("private-key", {
            cause: Object.assign(new Error("private-key"), { code }),
          });
        },
      }),
      (error) =>
        error.details.code === code && !error.message.includes("private-key"),
    );
  }
});

test("超时覆盖响应体读取，且超大响应会中止", async () => {
  await assert.rejects(
    completion(validateConfig(config), [], {
      timeout: 10,
      fetchImpl: async (_, { signal }) =>
        new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener(
                "abort",
                () => controller.error(signal.reason),
                { once: true },
              );
            },
          }),
        ),
    }),
    (error) => error.details.code === "TIMEOUT",
  );
  await assert.rejects(
    completion(validateConfig(config), [], {
      fetchImpl: async () => new Response("a".repeat(240001)),
    }),
    /过大/,
  );
});

test("环境代理保留配置并绕过本机，不隐式启用系统代理", () => {
  let calls = 0;
  const apply = (env) => {
    calls++;
    assert.equal(env.HTTPS_PROXY, "http://proxy.example:8888");
    assert.equal(env.no_proxy, "internal.example,localhost,127.0.0.1,::1");
    assert.equal(env.NO_PROXY, env.no_proxy);
  };
  configureProxy({}, apply);
  assert.equal(calls, 0);
  configureProxy(
    { HTTPS_PROXY: "http://proxy.example:8888", NO_PROXY: "internal.example" },
    apply,
  );
  assert.equal(calls, 1);
  assert.throws(
    () => configureProxy({ HTTPS_PROXY: "http://proxy.example:8888" }, null),
    /Node.js/,
  );
});

test("真实 HTTP 传输验证完整端点、Bearer 和请求体，不依赖 fetch 替身", async (t) => {
  const requests = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({
      url: req.url,
      authorization: req.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        req.url === "/relay/responses"
          ? responseOutput("OK")
          : {
              choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
            },
      ),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        upstream.close(resolve);
        upstream.closeAllConnections();
      }),
  );
  for (const endpoint of ["/chat/completions", "/relay/responses"]) {
    const saved = validateConfig({
      ...config,
      baseUrl: `http://127.0.0.1:${upstream.address().port}${endpoint}`,
      apiKey: "Bearer test-only-key",
    });
    assert.equal(
      await completion(saved, [{ role: "user", content: "JSON" }]),
      "OK",
    );
    assert.equal(requests.at(-1).url, endpoint);
    assert.equal(requests.at(-1).authorization, "Bearer test-only-key");
  }
});

test("模型列表仅提取合法 ID，去重且不回传密钥或供应商私有字段", async () => {
  const saved = validateConfig({ ...config, apiKey: "private-list-key" });
  const result = await listModels(saved, {
    fetchImpl: async () =>
      json({
        data: [
          { id: "model-a", private: "private-list-key" },
          { id: "model-a" },
          { id: "model-b" },
          { id: "private-list-key" },
          { id: "bad\nmodel" },
          { id: "" },
          { id: "a".repeat(201) },
          null,
        ],
      }),
  });
  assert.deepEqual(result.models, ["model-a", "model-b"]);
  assert.ok(!JSON.stringify(result).includes("private-list-key"));
});

test("列表错误、网页响应和超大数据不替换成内置模型列表", async () => {
  for (const fetchImpl of [
    async () => json({ error: { message: "invalid key" } }, 401),
    async () => json({ data: {} }),
    async () => json({ data: new Array(2001).fill({ id: "model-a" }) }),
    async () => new Response("<html>Model website</html>"),
    async () => {
      throw new TypeError("network failed");
    },
  ])
    await assert.rejects(
      listModels(validateConfig(config), { fetchImpl }),
      ProviderError,
    );
});
