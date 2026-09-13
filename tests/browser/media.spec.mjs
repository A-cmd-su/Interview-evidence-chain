import { test, expect } from "@playwright/test";
import { initialWorkspace, questionState } from "../../src/state.js";
import { input, confirmedContext } from "../fixtures.mjs";

async function seed(page, base = "") {
  await page.request.post(base + "/api/models", {
    data: {
      baseUrl: "http://127.0.0.1:8798/v1",
      model: "fixture-media",
      apiKey: "",
    },
  });
  const current = await (
    await page.request.get(base + "/api/workspace")
  ).json();
  const context = confirmedContext(input, {
    language: "en-US",
    interviewMode: "video",
  });
  const value = {
    ...initialWorkspace(),
    session: {
      ...context,
      id: "media-test-session",
      title: "视频验证",
      capabilities: [],
      current: 0,
      questions: ["Describe your contribution.", "What did you learn?"].map(
        (question, i) =>
          questionState({ id: `q.${i}`, question, skill: "沟通" }),
      ),
    },
  };
  expect(
    (
      await page.request.put(base + "/api/workspace", {
        data: { value, revision: current.revision },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(base || "/");
  await page.getByRole("button", { name: "模拟面试", exact: true }).click();
  await page.getByText("视频面试控制台", { exact: true }).click();
}

test("production app assets and login work, authenticated drafts save under same origin", async ({
  page,
}) => {
  const base = "http://127.0.0.1:8809";
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByLabel("个人访问密码").fill("synthetic-browser-password");
  await page.getByRole("button", { name: "进入工作区" }).click();
  await expect(
    page.getByRole("heading", { name: "先连接模型，再开始面试" }),
  ).toBeVisible();
  await page
    .getByLabel("API 地址", { exact: false })
    .fill("http://127.0.0.1:8798/v1");
  await page.getByLabel("模型 ID", { exact: false }).fill("production-browser");
  await page.getByRole("button", { name: "保存并使用", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "准备下一场面试" }),
  ).toBeVisible();
  await page.locator("#jd").fill("生产环境保存验证");
  await expect
    .poll(
      async () =>
        (await (await page.request.get(base + "/api/workspace")).json()).value
          ?.draft.jd,
    )
    .toBe("生产环境保存验证");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByLabel("个人访问密码")).toBeVisible();
  expect((await page.request.get(base + "/api/workspace")).status()).toBe(401);
  expect(errors).toEqual([]);
});

test("real MediaRecorder preview, English Speech config, transcript confirmation and track cleanup", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera", "microphone"]);
  await page.addInitScript(() => {
    window.mediaStreams = [];
    const get = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await get(c);
      window.mediaStreams.push(s);
      return s;
    };
    window.SpeechRecognition = class {
      start() {
        window.testSpeechLanguage = this.lang;
        this.onresult?.({
          resultIndex: 0,
          results: [
            Object.assign([{ transcript: "I led the experiment." }], {
              isFinal: true,
            }),
          ],
        });
      }
      stop() {}
      abort() {}
    };
  });
  await seed(page);
  await page
    .getByRole("checkbox", { name: "允许摄像头与麦克风录制", exact: true })
    .check();
  await page.getByRole("checkbox", { name: /开启浏览器自动转写/ }).check();
  await page.getByRole("button", { name: "开始视频面试", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止视频与转写" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('video[aria-label="摄像头预览"]')
        .evaluate((v) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.testSpeechLanguage))
    .toBe("en-US");
  await expect(page.getByText(/正在录制 [1-9]\d*\/180秒/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('video[aria-label="录制回放"]')).toBeVisible();
  await expect(page.locator("#answer")).toHaveValue("");
  await page
    .locator("#video-transcript")
    .fill("I led a controlled experiment.");
  await page.getByRole("button", { name: "确认文字，填入回答" }).click();
  await expect(page.locator("#answer")).toHaveValue(
    "I led a controlled experiment.",
  );
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/workspace")).json()).value?.session
          .questions[0].answerCapture?.rawTranscript,
    )
    .toContain("I led the experiment.");
  expect(
    await page.evaluate(() =>
      window.mediaStreams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "下一道主问题" }).click();
  await expect(page.locator("#answer")).toHaveValue("");
  expect(await page.locator('video[aria-label="录制回放"]').count()).toBe(0);
  await page.getByText("视频面试控制台", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "允许摄像头与麦克风录制", exact: true })
    .check();
  await page.getByRole("button", { name: "开始视频面试", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('video[aria-label="摄像头预览"]')
        .evaluate((v) => v.videoWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "训练空间", exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.mediaStreams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});

test("permission rejected and late permission after navigation cannot leak camera tracks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await seed(page);
  await page
    .getByRole("checkbox", { name: "允许摄像头与麦克风录制", exact: true })
    .check();
  await page.getByRole("button", { name: "开始视频面试", exact: true }).click();
  await expect(page.getByText(/权限被拒绝/)).toBeVisible();
  await page.locator("#answer").fill("权限失败仍可输入文字");
  await page.evaluate(() => {
    window.trackStopped = false;
    navigator.mediaDevices.getUserMedia = () =>
      new Promise(
        (r) =>
          (window.allowLate = () =>
            r({
              getTracks: () => [
                {
                  stop() {
                    window.trackStopped = true;
                  },
                },
              ],
            })),
      );
  });
  await page.getByRole("button", { name: "开始视频面试", exact: true }).click();
  await expect(page.getByText("等待设备权限…")).toBeVisible();
  await page.getByRole("button", { name: "训练空间", exact: true }).click();
  await page.evaluate(() => window.allowLate());
  await expect.poll(() => page.evaluate(() => window.trackStopped)).toBe(true);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
