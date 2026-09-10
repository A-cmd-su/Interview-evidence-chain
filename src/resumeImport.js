export async function readResumeFile(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error("文件不能超过 8 MB");
  let text;
  const extension = file.name.split(".").at(-1).toLowerCase();
  if (["txt", "md"].includes(extension)) text = await file.text();
  else if (extension === "pdf") {
    const [pdfjs, { default: workerUrl }] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 30) throw new Error("简历 PDF 请限制在 30 页以内");
      const pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .filter((i) => "str" in i)
            .map((i) => i.str + (i.hasEOL ? "\n" : " "))
            .join(""),
        );
      }
      text = pages.join("\n\n");
    } finally {
      await task.destroy();
    }
  } else if (extension === "docx") {
    const { default: mammoth } = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    text = result.value;
  } else
    throw new Error(
      "支持 TXT、Markdown、文字版 PDF 和 DOCX；请转换文件格式后导入",
    );
  if (!text.trim())
    throw new Error("未提取到文本。扫描件请先 OCR 或直接粘贴文字");
  if (text.length > 20000) throw new Error("简历超过 20000 字符，请删减后导入");
  return text.trim();
}
