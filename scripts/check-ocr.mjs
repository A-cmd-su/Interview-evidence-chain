import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
});
const page = await browser.newPage();
let timer;
try {
  await page.goto(process.env.CHECK_URL || "http://127.0.0.1:5176/", {
    timeout: 15000,
    waitUntil: "domcontentloaded",
  });
  const result = await Promise.race([
    page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 180;
      const c = canvas.getContext("2d");
      c.fillStyle = "white";
      c.fillRect(0, 0, 1000, 180);
      c.fillStyle = "black";
      c.font = "42px Arial";
      c.fillText("PROJECT CUSTOMER FEEDBACK", 30, 90);
      const blob = await new Promise((r) => canvas.toBlob(r));
      const { readResumeFile } = await import("/src/resumeImport.js");
      const result = await readResumeFile(
        new File([blob], "ocr-check.png", { type: "image/png" }),
        { ocr: true },
      );
      return { text: result.text, segments: result.segments.length };
    }),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("OCR首次下载/识别超过90秒，未完成网络验收")),
        90000,
      );
    }),
  ]);
  if (!result.text.includes("CUSTOMER FEEDBACK"))
    throw new Error("OCR未正确识别合成文字");
  console.log("真实OCR合成图片识别通过：", result);
} finally {
  clearTimeout(timer);
  await browser.close();
}
