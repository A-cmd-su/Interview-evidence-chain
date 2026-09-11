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
export const DURATIONS = [
  { minutes: 15, questions: 3 },
  { minutes: 30, questions: 5 },
  { minutes: 45, questions: 7 },
  { minutes: 60, questions: 8 },
];
export const setupLabel = (choices, id) =>
  choices.find((item) => item.id === id)?.label || "未记录";
export function briefingInstruction(briefing) {
  if (!briefing) return "";
  return `用户已确认岗位能力标签及其JD原文。仅依据确认后的标签解释岗位，不能自行覆盖用户校对。目标资历=${SENIORITIES.find((item) => item.id === briefing.seniority).label}：${SENIORITIES.find((item) => item.id === briefing.seniority).guidance}侧重点=${INTERVIEW_FOCI.find((item) => item.id === briefing.focus).label}：${INTERVIEW_FOCI.find((item) => item.id === briefing.focus).guidance}预计${briefing.durationMinutes}分钟，共${briefing.questionCount}道主问题，时长包含回答和追问预算。目标资历与难度是不同条件，用户选择不是已经具备该资历的证据，不得虚构JD要求或候选人经历。`;
}
