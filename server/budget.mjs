import { InputError } from "../shared/analyze.mjs";

export const DEFAULT_BUDGET = { limit: 0, currency: "CNY", rates: [] };
export function validateBudget(b) {
  const money = (n) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100000;
  if (
    !money(b?.limit) ||
    !["CNY", "USD"].includes(b.currency) ||
    !Array.isArray(b.rates) ||
    b.rates.length > 100
  )
    throw new InputError("预算格式无效");
  const rates = b.rates.map((r) => {
    if (
      typeof r.endpoint !== "string" ||
      r.endpoint.length > 500 ||
      typeof r.model !== "string" ||
      !r.model ||
      r.model.length > 200 ||
      !money(r.inputRate) ||
      !money(r.outputRate)
    )
      throw new InputError("模型费率格式无效");
    return {
      endpoint: r.endpoint,
      model: r.model,
      inputRate: r.inputRate,
      outputRate: r.outputRate,
    };
  });
  if (
    new Set(rates.map((r) => JSON.stringify([r.endpoint, r.model]))).size !==
    rates.length
  )
    throw new InputError("请合并重复模型费率");
  return { limit: b.limit, currency: b.currency, rates };
}
export function priceUsage(u, config, budget) {
  const rate = budget.rates.find(
    (r) => r.endpoint === config.endpoint && r.model === config.model,
  );
  return {
    currency: budget.currency,
    rate: rate || null,
    estimatedCost:
      rate &&
      Number.isSafeInteger(u.inputTokens) &&
      Number.isSafeInteger(u.outputTokens)
        ? (u.inputTokens * rate.inputRate + u.outputTokens * rate.outputRate) /
          1000000
        : null,
  };
}
export function estimateJob(
  operation,
  input,
  configs,
  budget,
  usage,
  sessionId,
) {
  const roles =
    operation === "analyze"
      ? [
          "analyze",
          "review",
          ...(input.criterion ? ["mastery"] : []),
          ...(input.briefing?.languageSettings?.evaluate ? ["language"] : []),
        ]
      : operation === "acceptance"
        ? Array(8).fill("acceptance")
        : [operation];
  // A conservative planning allowance, not a tokenizer count or provider hard cap.
  const inputAllowance = Buffer.byteLength(JSON.stringify(input)) + 24000;
  const calls = roles.map((role) => {
    const c = configs[role] || Object.values(configs)[0];
    const estimate = priceUsage(
      { inputTokens: inputAllowance, outputTokens: c.maxOutputTokens || 8192 },
      c,
      budget,
    );
    return { role, model: c.model, endpoint: c.endpoint, ...estimate };
  });
  const previous = usage.filter((u) => u.sessionId === sessionId);
  const unknown =
    previous.some(
      (u) => u.estimatedCost == null || u.currency !== budget.currency,
    ) || calls.some((c) => c.estimatedCost == null);
  const spent = previous.reduce(
    (sum, u) =>
      sum + (u.currency === budget.currency ? u.estimatedCost || 0 : 0),
    0,
  );
  const estimate = calls.every((c) => c.estimatedCost != null)
    ? calls.reduce((sum, c) => sum + c.estimatedCost, 0)
    : null;
  const exceeded =
    budget.limit > 0 && (unknown || spent + estimate > budget.limit);
  return {
    sessionId,
    currency: budget.currency,
    limit: budget.limit,
    spent,
    estimate,
    unknown,
    exceeded,
    calls,
    explanation:
      "费用依据实际 usage 与保存时费率估算；调用前按文本字节及输出上限预留，非账单或供应商硬上限。缺少 usage、费率或币种改变时不能确定余额。",
  };
}
