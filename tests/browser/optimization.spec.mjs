import { test, expect } from "@playwright/test";
import { initialWorkspace, questionState } from "../../src/state.js";
import { input, confirmedContext } from "../fixtures.mjs";
const model = {
  baseUrl: "http://127.0.0.1:8798/v1",
  model: "primary-browser",
  apiKey: "",
};
async function setup(page, mode = "text", evaluate = false) {
  await page.request.put("/api/routing", {
    data: { routes: {}, confirmRecipients: true },
  });
  await page.request.put("/api/budget", {
    data: { limit: 0, currency: "CNY", rates: [] },
  });
  await page.request.post("/api/models", { data: model });
  const context = confirmedContext(input, {
    interviewMode: mode,
    languageSettings: {
      questionLanguage: "en-US",
      answerLanguage: "en-US",
      resumeLanguage: "zh-CN",
      targetLevel: "B2",
      evaluate,
    },
  });
  const old = await (await page.request.get("/api/workspace")).json();
  const value = {
    ...initialWorkspace(),
    draft: { jd: input.jd, resume: input.resume, difficulty: "standard" },
    session: {
      ...context,
      id: "optimization-session",
      createdAt: new Date().toISOString(),
      title: "优化联动测试",
      current: 0,
      capabilities: context.briefing.capabilities,
      questions: [
        questionState({
          id: "q.1",
          question: input.question,
          skill: "岗位能力",
        }),
      ],
    },
  };
  expect(
    (
      await page.request.put("/api/workspace", {
        data: { value, revision: old.revision },
      })
    ).ok(),
  ).toBe(true);
}

test("model routing, budget consent, language evidence, favorites and personal templates persist across refresh", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page, "text", true);
  await page.request.post("/api/models", {
    data: { ...model, model: "review-browser" },
  });
  const profile = await (
    await page.request.post("/api/profiles", { data: { name: "独立复核档案" } })
  ).json();
  await page.request.post("/api/models", { data: model });
  await page.request.put("/api/budget", {
    data: { limit: 0.01, currency: "CNY", rates: [] },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "模型设置", exact: true }).click();
  await page.getByText("多个模型档案与真实供应商验收", { exact: true }).click();
  await page.getByText("模型分工与接收方确认", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "独立证据复核", exact: true })
    .selectOption(profile.id);
  await page.getByRole("checkbox", { name: /确认所选服务接收/ }).check();
  await page
    .getByRole("button", { name: "保存并确认模型分工", exact: true })
    .click();
  await expect(page.getByText("模型分工已保存，接收方已确认")).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.getByRole("checkbox", { name: /我同意将本轮岗位/ }).check();
  await page.getByRole("button", { name: "模拟面试", exact: true }).click();
  await page.locator("#answer").fill(input.answer);
  const before = await (await page.request.get("/api/jobs")).json();
  await page.getByRole("button", { name: "提交回答", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "费用预检提醒" }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/jobs")).json()).jobs.length).toBe(
    before.jobs.length,
  );
  await page
    .getByRole("button", { name: "确认本次继续，可能超出预算", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "查看本题证据", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看本题证据", exact: true }).click();
  await expect(page.getByRole("region", { name: "快速复盘" })).toBeVisible();
  await expect(
    page.getByText("语言表达专项反馈", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "收藏此题到资料库", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/workspace")).json()).value
          .materials.length,
    )
    .toBe(1);
  const stored = (await (await page.request.get("/api/workspace")).json()).value
    .records[0];
  expect(stored.semanticReview.model).toBe("review-browser");
  expect(stored.languageAnalysis.observations[0].quote).toBe(input.answer);
  expect(stored.usage.length).toBe(3);
  await page.getByRole("button", { name: "训练空间", exact: true }).click();
  await page.getByText(/个人资料库 · 岗位/).click();
  await page.getByLabel("版本 / 名称", { exact: true }).fill("增长岗位模板");
  await page.getByRole("button", { name: "保存当前资料", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/workspace")).json()).value
          .materials.length,
    )
    .toBe(2);
  await page.reload();
  await page.getByText(/个人资料库 · 岗位/).click();
  await expect(
    page.getByText("岗位模板 · 增长岗位模板", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("video audio-only ASR needs separate upload consent and confirmation before answer, and retains local playback", async ({
  page,
  context,
}) => {
  await setup(page, "video");
  await context.grantPermissions(["camera", "microphone"]);
  const p = await (
    await page.request.post("/api/profiles", { data: { name: "转写测试凭据" } })
  ).json();
  expect(
    (
      await page.request.put("/api/asr", {
        data: {
          profileId: p.id,
          endpoint: "http://127.0.0.1:8798/v1/audio/transcriptions",
          model: "speech-browser",
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  await page.getByRole("button", { name: "模拟面试", exact: true }).click();
  await expect(page.locator("details.video-input")).toHaveAttribute("open", "");
  await page
    .getByRole("checkbox", { name: "允许摄像头与麦克风录制", exact: true })
    .check();
  await page.getByRole("button", { name: "开始视频面试", exact: true }).click();
  await expect(page.getByText(/正在录制 [1-9]\d*\/180秒/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('video[aria-label="录制回放"]')).toBeVisible();
  await page.getByText("使用专用服务转写录音", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "上传音轨并转写", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /确认上传本段音频至上述服务/ })
    .check();
  await page
    .getByRole("button", { name: "上传音轨并转写", exact: true })
    .click();
  await expect(page.locator("#video-transcript")).toHaveValue(
    "I checked the rollback threshold before launch.",
  );
  await expect(page.locator("#answer")).toHaveValue("");
  await expect(page.locator('video[aria-label="录制回放"]')).toBeVisible();
  await page
    .getByRole("button", { name: "确认文字，填入回答", exact: true })
    .click();
  await expect(page.locator("#answer")).toHaveValue(
    "I checked the rollback threshold before launch.",
  );
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/workspace")).json()).value.session
          .questions[0].answerCapture?.rawTranscript,
    )
    .toBe("I checked the rollback threshold before launch.");
});
