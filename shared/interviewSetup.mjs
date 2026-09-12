export const BRIEFING_VERSION = "interview-briefing-1.0";
export const SENIORITIES = [
  {
    id: "unspecified",
    label: "未限定资历",
    guidance: "按JD实际任务考察，不推定候选人工作年限或管理职责。",
  },
  {
    id: "entry",
    label: "应届 / 初级",
    guidance: "围绕可执行的基础职责，可使用学习、实习和初期工作经历。",
  },
  {
    id: "mid",
    label: "中级 / 独立负责",
    guidance: "考察独立推进任务、方案选择、协作边界与结果验证。",
  },
  {
    id: "senior",
    label: "高级 / 资深",
    guidance:
      "考察复杂决策、影响范围、风险与长期取舍，管理职责仅在JD明确要求时考察。",
  },
];
export const INTERVIEW_FOCI = [
  {
    id: "balanced",
    label: "综合考察",
    guidance: "均衡覆盖确认的岗位能力、经历、方法与结果。",
  },
  {
    id: "expertise",
    label: "专业方法",
    guidance: "侧重岗位专业知识的应用、方法选择、验证和边界，不限于技术岗位。",
  },
  {
    id: "projects",
    label: "项目与个人贡献",
    guidance: "侧重项目背景、个人决策、职责边界、协作及可归因成果。",
  },
  {
    id: "behavioral",
    label: "沟通与行为经历",
    guidance: "侧重沟通、冲突处理、协作和复盘，用具体事件评价，不推断性格。",
  },
];
export const INTERVIEW_MODES = [
  {
    id: "text",
    label: "文字面试",
    guidance: "以键盘输入回答，适合快速练习和低权限环境。",
  },
  {
    id: "voice",
    label: "语言面试",
    guidance: "使用浏览器麦克风录音并校对转写，再提交文字证据。",
  },
  {
    id: "video",
    label: "视频面试",
    guidance: "使用摄像头和麦克风本地录制，确认转写文字后再评分。",
  },
];
export const INTERVIEW_LANGUAGES = [
  { id: "zh-CN", label: "中文", instruction: "使用简体中文提问、追问和解释。" },
  {
    id: "en-US",
    label: "English",
    instruction:
      "Ask questions and follow-ups in English; keep explanations in English.",
  },
  {
    id: "ja-JP",
    label: "日本語",
    instruction: "質問、追質問、説明を日本語で行う。",
  },
];
export const DURATIONS = [
  { minutes: 15, questions: 3 },
  { minutes: 30, questions: 5 },
  { minutes: 45, questions: 7 },
  { minutes: 60, questions: 8 },
];
export const setupLabel = (choices, id) =>
  choices.find((item) => item.id === id)?.label || "未记录";
export const setupChoice = (choices, id) =>
  choices.find((item) => item.id === id) || null;
export function briefingInstruction(briefing) {
  if (!briefing) return "";
  const mode = setupChoice(INTERVIEW_MODES, briefing.interviewMode || "text");
  const language = setupChoice(
    INTERVIEW_LANGUAGES,
    briefing.language || "zh-CN",
  );
  return `用户已确认岗位能力标签及其JD原文。仅依据确认后的标签解释岗位，不能自行覆盖用户校对。目标资历=${SENIORITIES.find((item) => item.id === briefing.seniority).label}：${SENIORITIES.find((item) => item.id === briefing.seniority).guidance}侧重点=${INTERVIEW_FOCI.find((item) => item.id === briefing.focus).label}：${INTERVIEW_FOCI.find((item) => item.id === briefing.focus).guidance}面试模式=${mode.label}：${mode.guidance}；目标语言=${language.label}：${language.instruction}预计${briefing.durationMinutes}分钟，共${briefing.questionCount}道主问题，时长包含回答和追问预算。目标资历与难度是不同条件，用户选择不是已经具备该资历的证据，不得虚构JD要求或候选人经历。`;
}
