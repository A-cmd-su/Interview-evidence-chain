import { analyzeInterview } from "./provider.mjs";
import { OutputError } from "../shared/analyze.mjs";

// Synthetic input only; the diagnostic never receives the user's workspace.
const SAMPLE = Object.freeze({
  jd: "负责客户需求调研，独立设计改进方案，协调团队实施并验证业务结果。",
  resume: "参与服务流程改进，负责需求访谈、试点设计与结果分析。",
  question: "请描述一次流程改进，你如何决策、验证结果并应对失败？",
  answer:
    "服务请求积压时，我访谈了12位客户并整理高频问题。我负责分流规则设计，研发负责实现。比较全量改造与分组试点后，我选择试点降低风险。两周内平均响应时间从24小时降至16小时，按同类请求比较，但尚不能排除季节影响。错误率超过2%时暂停试点并回退原流程。",
  history: [],
});

export async function testStructure(config, options) {
  const report = await analyzeInterview(SAMPLE, config, options);
  if (!report.semanticReview.reviewedCount)
    throw new OutputError("合成样例未产生可复核维度，尚未验证语义复核能力");
  return {
    checks: [
      "五维评分结构",
      "回答与岗位原文引用",
      "量表关联",
      "语义复核结构与证据关联",
      "追问与训练计划结构",
    ],
  };
}
