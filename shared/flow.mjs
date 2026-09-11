export const FLOW_VERSION = "adaptive-flow-1";
export const normalizeQuestion = (q) =>
  q.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
export function similarQuestion(a, b) {
  a = normalizeQuestion(a);
  b = normalizeQuestion(b);
  if (a === b) return true;
  const grams = (s) =>
    new Set([...s].slice(1).map((_, i) => s.slice(i, i + 2)));
  const x = grams(a),
    y = grams(b);
  return (
    x.size &&
    y.size &&
    [...x].filter((v) => y.has(v)).length / new Set([...x, ...y]).size > 0.8
  );
}
export function followDecision({
  missing,
  question,
  history = [],
  remainingSeconds = Infinity,
  skipped = false,
}) {
  if (skipped) return { continue: false, reason: "用户已跳过本题。" };
  if (remainingSeconds <= 30)
    return {
      continue: false,
      reason: "本轮时间预算已用完，保留已有回答并进入复盘。",
    };
  if (!missing.length) return { continue: false, reason: "本题暂无新增缺口。" };
  if (history.length >= 8)
    return { continue: false, reason: "达到保护性请求上限，转入专项训练。" };
  if (!question)
    return { continue: false, reason: "模型未提供新的有效追问，转入训练。" };
  if (history.some((t) => similarQuestion(t.question, question)))
    return { continue: false, reason: "追问与已提问内容重复，停止重复追问。" };
  return { continue: true, reason: "继续补齐：" + missing.join("、") };
}
export function coveragePlan(briefing) {
  const sorted = [...briefing.capabilities].sort(
    (a, b) => (b.importance || 2) - (a.importance || 2),
  );
  const plan = [],
    counts = new Map();
  for (let i = 0; i < briefing.questionCount; i++) {
    const candidates = sorted.filter(
      (c) => c.id !== plan.at(-1)?.requirementId || sorted.length === 1,
    );
    const c = [...candidates].sort(
      (a, b) =>
        (counts.get(a.id) || 0) / (a.importance || 2) -
        (counts.get(b.id) || 0) / (b.importance || 2),
    )[0];
    counts.set(c.id, (counts.get(c.id) || 0) + 1);
    plan.push({
      requirementId: c.id,
      angle: ["实际经历", "方案与取舍", "个人贡献", "结果验证", "风险应对"][
        i % 5
      ],
    });
  }
  return plan;
}
