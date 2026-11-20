import { test, expect } from "@playwright/test";

test("sample report is viewable without a model configuration", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "先连接模型，再开始面试" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "先看示例报告（无需模型）" }).click();
  await expect(page.getByText("示例数据 · 只读")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "72 分，依据在这里。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "定位相关性回答" }).click();
  await expect(
    page.getByText("分析时的原文快照", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "返回启动页" }).click();
  await expect(
    page.getByRole("heading", { name: "先连接模型，再开始面试" }),
  ).toBeVisible();
});
