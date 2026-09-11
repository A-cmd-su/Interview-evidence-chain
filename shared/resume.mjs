export const RESUME_VERSION = "resume-review-1";
export function sourceSegments(text, pages) {
  if (pages) {
    let offset = 0;
    return pages.map((page, i) => {
      const row = {
        id: `page.${i + 1}`,
        page: i + 1,
        start: offset,
        end: offset + page.length,
      };
      offset += page.length + 2;
      return row;
    });
  }
  return [...text.matchAll(/[^\n]+/g)]
    .filter((m) => m[0].trim())
    .map((m, i) => ({
      id: `paragraph.${i + 1}`,
      paragraph: i + 1,
      start: m.index,
      end: m.index + m[0].length,
    }));
}
export function validateResumeReview(review, text) {
  if (
    !review ||
    review.version !== RESUME_VERSION ||
    review.confirmed !== true ||
    review.sourceText !== text ||
    !Array.isArray(review.items) ||
    !review.items.length ||
    review.items.length > 60
  )
    throw new Error("请校对并确认当前简历的项目、职责、成果和时间线");
  const items = review.items.map((item, i) => {
    if (
      !["项目", "职责", "成果", "时间线", "其他"].includes(item.kind) ||
      typeof item.quote !== "string" ||
      !item.quote.trim() ||
      !Number.isInteger(item.start) ||
      text.slice(item.start, item.start + item.quote.length) !== item.quote
    )
      throw new Error("简历条目必须关联有效原文位置，不得补写经历");
    const segment = sourceSegments(text).find(
      (s) => s.start <= item.start && s.end > item.start,
    );
    return {
      id: `resume.${i + 1}`,
      kind: item.kind,
      quote: item.quote,
      start: item.start,
      end: item.start + item.quote.length,
      paragraph: segment?.paragraph || null,
      page:
        Number.isInteger(item.page) && item.page > 0 && item.page <= 30
          ? item.page
          : null,
    };
  });
  return { version: RESUME_VERSION, sourceText: text, confirmed: true, items };
}
export function reviewFromSegments(text, segments = sourceSegments(text)) {
  return {
    version: RESUME_VERSION,
    sourceText: text,
    confirmed: false,
    items: segments
      .filter((s) => text.slice(s.start, s.end).trim())
      .map((s, i) => ({
        ...s,
        id: `resume.${i + 1}`,
        kind: "其他",
        quote: text.slice(s.start, s.end),
      })),
  };
}
export function redactPersonal(text) {
  // Preserve string length so existing source offsets still point to the same passages.
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) =>
      "＊".repeat(m.length),
    )
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, (m) =>
      "＊".repeat(m.length),
    )
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, (m) => "＊".repeat(m.length));
}
