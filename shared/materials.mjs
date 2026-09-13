import { validateResumeReview } from "./resume.mjs";
export function validateMaterials(items = []) {
  if (!Array.isArray(items) || items.length > 300)
    throw new Error("资料库最多保存300项");
  const ids = new Set();
  for (const item of items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      ids.has(item.id) ||
      !["job", "resume", "claim", "question"].includes(item.kind) ||
      typeof item.label !== "string" ||
      !item.label.trim() ||
      item.label.length > 100 ||
      !Number.isFinite(Date.parse(item.createdAt))
    )
      throw new Error("资料库条目无效");
    ids.add(item.id);
    if (
      item.kind !== "question" &&
      (typeof item.source !== "string" ||
        !item.source ||
        item.source.length > 20000)
    )
      throw new Error("资料库原文缺失或过长");
    if (item.kind === "resume" && item.review)
      validateResumeReview(item.review, item.source);
    if (
      item.kind === "job" &&
      item.briefing &&
      (!Array.isArray(item.briefing.capabilities) ||
        item.briefing.capabilities.some(
          (c) =>
            typeof c.quote !== "string" ||
            !c.quote ||
            !item.source.includes(c.quote),
        ))
    )
      throw new Error("岗位模板依据必须来自保存的JD原文");
    if (
      item.kind === "claim" &&
      (!item.quote ||
        !Number.isInteger(item.start) ||
        item.start < 0 ||
        item.end !== item.start + item.quote.length ||
        item.source.slice(item.start, item.end) !== item.quote)
    )
      throw new Error("项目主张必须绑定简历连续原文及位置");
    if (
      item.kind === "question" &&
      (typeof item.question !== "string" ||
        !item.question ||
        item.question.length > 2000 ||
        typeof item.reportId !== "string")
    )
      throw new Error("收藏问题缺少原始报告");
  }
  return items;
}
