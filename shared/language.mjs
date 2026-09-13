export const LEVELS = ["general", "A1", "A2", "B1", "B2", "C1", "C2"];
export function languageSettings(input = {}, fallback = "zh-CN") {
  const value = {
    questionLanguage: input.questionLanguage || fallback,
    answerLanguage: input.answerLanguage || fallback,
    resumeLanguage: input.resumeLanguage || "auto",
    targetLevel: input.targetLevel || "general",
    evaluate: input.evaluate === true,
  };
  const languages = ["zh-CN", "en-US", "ja-JP"];
  if (
    !languages.includes(value.questionLanguage) ||
    !languages.includes(value.answerLanguage) ||
    !["auto", ...languages].includes(value.resumeLanguage) ||
    !LEVELS.includes(value.targetLevel)
  )
    throw new Error("语言设置无效");
  return value;
}
