import { test, expect } from "@playwright/test";
import { input, reviewedAnalysis } from "../fixtures.mjs";
import { initialWorkspace, questionState } from "../../src/state.js";

test("complete online flow: resume review, refresh recovery, report, training, history, profiles and mobile", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "准备下一场面试" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "连接模型", exact: true }).click();
  await page
    .getByLabel("API 地址", { exact: false })
    .fill("http://127.0.0.1:8798/v1");
  await page.getByLabel("模型 ID", { exact: false }).fill("fixture-browser");
  await page.getByRole("button", { name: "保存并使用", exact: true }).click();
  await page
    .locator("#jd")
    .fill(
      "产品经理，负责用户增长分析与实验设计，推动跨团队协作并验证业务结果。",
    );
  await page
    .locator("#resume")
    .fill("主导用户增长项目，负责设计实验并协调销售与研发。");
  await page.getByRole("checkbox", { name: /我同意将本轮岗位/ }).check();
  await page.getByRole("button", { name: "用模型提取结构" }).click();
  await expect(page.getByText("待校对 · 1 条")).toBeVisible();
  await page.getByRole("checkbox", { name: /我已校对这些原文/ }).check();
  await page.getByRole("checkbox", { name: /我同意将本轮岗位/ }).check();
  await page.getByRole("button", { name: "提取岗位信息，开始校对" }).click();
  await expect(
    page.getByRole("heading", { name: "先确认岗位，再开始面试" }),
  ).toBeVisible();
  await page.locator("#briefing-duration").selectOption("15");
  await page.getByRole("button", { name: "确认并生成面试问题" }).click();
  await expect(page.locator("#answer")).toBeVisible();
  await page.getByText("可选：语音回答与转写校对", { exact: true }).click();
  await page.locator("#transcript").fill("确认之前不得进入评分的转写");
  await expect(page.locator("#answer")).toHaveValue("");
  await page.getByRole("button", { name: "确认文字，填入回答" }).click();
  await expect(page.locator("#answer")).toHaveValue(
    "确认之前不得进入评分的转写",
  );
  await page
    .locator("#answer")
    .fill(
      "在新用户注册场景，我负责实验设计并协调研发。转化率从12%提升到15%，按两周同口径AB实验测量。",
    );
  await page.getByRole("button", { name: "提交回答", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "取消请求", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "查看本题证据" })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "查看本题证据" }).click();
  await expect(page.getByText("导出报告 JSON")).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "打印 / PDF 报告" }).click();
  const popup = await popupPromise;
  await popup.pdf({
    path: "test-results/evidence-report.pdf",
    format: "A4",
    printBackground: true,
  });
  await expect(
    popup.getByRole("heading", { name: "面试证据报告", exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByText("JD依据", { exact: false }).first(),
  ).toBeVisible();
  await popup.close();
  await page.getByRole("button", { name: "开始专项训练" }).click();
  await expect(page.getByText(/勾选完成只代表做过/)).toBeVisible();
  // Refresh consent is intentionally cleared; switching to workspace re-confirms the recipient.
  await page.getByRole("button", { name: "训练空间", exact: true }).click();
  await page.getByRole("checkbox", { name: /我同意将本轮岗位/ }).check();
  await page.getByRole("button", { name: "训练计划", exact: true }).click();
  await page.getByRole("button", { name: "换场景验证" }).click();
  await expect(
    page.getByRole("button", { name: "确认考察目标一致，开始复测" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "确认考察目标一致，开始复测" })
    .click();
  await page
    .locator("#answer")
    .fill(
      "我负责识别延期风险，以错误率2%作为回退阈值，按两周同口径对照验证结果。",
    );
  await page.getByRole("button", { name: "提交回答", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看本题证据" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "历史与设置", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "长期能力趋势" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "重命名", exact: true })
    .first()
    .click();
  await page.getByLabel("新名称", { exact: true }).fill("复测记录A");
  await page.getByRole("button", { name: "保存名称" }).click();
  await page.getByLabel("搜索岗位、标题或问题").fill("复测记录A");
  await expect(page.getByText("复测记录A", { exact: true })).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出带校验的备份" }).click();
  await expect((await dl).suggestedFilename()).toMatch(/evidence-backup/);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-data.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("cancelled job retains draft; profiles have no plaintext key", async ({
  page,
}) => {
  const state = await (await page.request.get("/api/workspace")).json();
  const report = {
    ...reviewedAnalysis(),
    id: "seed-report",
    sessionId: "seed-session",
    questionId: "q.1",
    model: "fixture-browser",
  };
  const w = {
    ...initialWorkspace(),
    records: [report],
    selected: report.id,
    session: {
      id: "seed-session",
      title: "取消验证",
      jd: input.jd,
      resume: input.resume,
      difficulty: "standard",
      createdAt: new Date().toISOString(),
      capabilities: [],
      current: 0,
      questions: [
        {
          ...questionState({
            id: "q.1",
            question: input.question,
            skill: "风险应对",
          }),
          ready: false,
          attempts: [
            {
              question: input.question,
              answer: input.answer,
              reportId: report.id,
            },
          ],
        },
      ],
    },
  };
  const seeded = await page.request.put("/api/workspace", {
    data: { value: w, revision: state.revision },
  });
  expect(seeded.ok()).toBe(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "准备下一场面试" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "连接模型", exact: true }).click();
  await page
    .getByLabel("API 地址", { exact: false })
    .fill("http://127.0.0.1:8798/v1");
  await page.getByLabel("模型 ID", { exact: false }).fill("fixture-browser");
  await page.getByRole("button", { name: "保存并使用", exact: true }).click();
  await page.getByRole("button", { name: "模型设置", exact: true }).click();
  await page.getByText("多个模型档案与真实供应商验收", { exact: true }).click();
  await page.getByLabel("档案名称", { exact: true }).fill("本机测试配置");
  await page.getByRole("button", { name: "另存当前配置" }).click();
  await expect(
    page.getByText("本机测试配置 · fixture-browser", { exact: true }),
  ).toBeVisible();
  const profiles = await page.request.get("/api/profiles");
  expect(JSON.stringify(await profiles.json())).not.toContain("apiKey");
  await page.getByRole("button", { name: "切换并重新确认发送" }).click();
  await page.getByRole("button", { name: "模拟面试", exact: true }).click();
  await page.getByRole("checkbox", { name: /我同意将本轮岗位/ }).check();
  await page.getByRole("button", { name: "回答追问", exact: true }).click();
  await page.locator("#answer").fill("本次取消后应保留的回答草稿");
  await page.getByRole("button", { name: "提交回答", exact: true }).click();
  await page.getByRole("button", { name: "取消请求", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "归档已结束请求" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "归档已结束请求" }).click();
  await expect(page.locator("#answer")).toHaveValue(
    "本次取消后应保留的回答草稿",
  );
});
