import { sourceSegments } from "../shared/resume.mjs";
export async function readResumeFile(
  file,
  { ocr = false, progress = () => {} } = {},
) {
  if (file.size > 8 * 1024 * 1024) throw new Error("文件不能超过 8 MB");
  let text;
  let pages;
  let ocrWorker;
  const timed = async (promise, milliseconds) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error("OCR资源加载或识别超时，请检查语言包下载网络后重试"),
              ),
            milliseconds,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const recognize = async (image) => {
    if (!ocrWorker) {
      const [{ createWorker }, { default: workerPath }, { default: corePath }] =
        await Promise.all([
          import("tesseract.js"),
          import("tesseract.js/dist/worker.min.js?url"),
          import("tesseract.js-core/tesseract-core-lstm.wasm.js?url"),
        ]);
      let rejectInitialization;
      const failure = new Promise((_, reject) => {
        rejectInitialization = reject;
      });
      const pending = createWorker("chi_sim+eng", 1, {
        workerPath,
        corePath,
        workerBlobURL: false,
        errorHandler: () =>
          rejectInitialization(
            new Error("OCR加载失败，请检查语言包网络后重试"),
          ),
        logger: (m) =>
          progress(`${m.status} ${Math.round((m.progress || 0) * 100)}%`),
      });
      try {
        ocrWorker = await timed(Promise.race([pending, failure]), 60000);
      } catch (e) {
        pending.then((w) => w.terminate()).catch(() => {});
        throw e;
      }
    }
    return (await timed(ocrWorker.recognize(image), 90000)).data.text;
  };
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
      pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        let pageText = content.items
          .filter((i) => "str" in i)
          .map((i) => i.str + (i.hasEOL ? "\n" : " "))
          .join("");
        if (ocr) {
          const viewport = page.getViewport({ scale: 1.5 });
          if (viewport.width * viewport.height > 16000000)
            throw new Error("扫描页面过大，请缩小分辨率后导入");
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
          pageText = await recognize(canvas);
        }
        pages.push(pageText);
      }
      text = pages.join("\n\n");
    } finally {
      await task.destroy();
      await ocrWorker?.terminate();
    }
  } else if (extension === "docx") {
    const { default: mammoth } = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    text = result.value;
  } else if (["png", "jpg", "jpeg", "webp"].includes(extension) && ocr) {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 16000000)
          throw new Error("图片超过1600万像素，请缩小后再识别");
      } finally {
        bitmap.close();
      }
      text = await recognize(file);
    } finally {
      await ocrWorker?.terminate();
    }
  } else
    throw new Error(
      "支持 TXT、Markdown、文字版 PDF 和 DOCX；请转换文件格式后导入",
    );
  if (!text.trim())
    throw new Error("未提取到文本。扫描件请先 OCR 或直接粘贴文字");
  if (text.length > 20000) throw new Error("简历超过 20000 字符，请删减后导入");
  return {
    text,
    segments: sourceSegments(text, pages),
    filename: file.name,
    ocr,
  };
}
