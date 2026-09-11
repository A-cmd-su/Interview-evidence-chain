export const DEFAULT_DIFFICULTY = "standard";
export const DIFFICULTY_VERSION = "interview-difficulty-1.0";
export const DIFFICULTIES = [
  {
    id: "basic",
    label: "基础",
    description: "从常见场景开始，练清楚方法、本人行动和结果。",
    guidance:
      "围绕岗位常见任务与单一场景出题，每题聚焦一个核心问题。追问一次只补一个缺口，允许用学习、实习或小规模项目举例。评价重点为基本方法是否正确、本人行动是否清楚、结果是否有依据；不额外要求大规模架构、管理职责或复杂跨团队决策。训练题提供明确情境。",
  },
  {
    id: "standard",
    label: "标准",
    description: "贴近岗位实际，解释方案取舍、协作边界和验证方法。",
    guidance:
      "围绕岗位实际项目出题，包含明确业务约束。追问重点为方案取舍、本人职责边界、结果验证与常见风险。评价回答是否解释决策依据、可归因行动和效果口径。训练题要求完整说明背景、方法、行动及验证。",
  },
  {
    id: "advanced",
    label: "进阶",
    description: "加入资源限制与复杂变化，检验决策、归因和风险应对。",
    guidance:
      "在岗位职责范围内设置多重约束、信息不完整或方案失效的复杂场景，不凭空提高岗位职级。追问聚焦替代方案、决策边界、结果归因、不确定性和失败应对。评价是否识别约束、说明取舍与验证边界，不能只堆砌术语。训练题加入一个变化条件，要求重新论证方案。",
  },
];
export const difficultyProfile = (id) =>
  DIFFICULTIES.find((item) => item.id === id);
export const difficultyLabel = (id) => difficultyProfile(id)?.label || "未记录";
export function difficultySnapshot(id) {
  const profile = difficultyProfile(id);
  return profile ? { ...profile, version: DIFFICULTY_VERSION } : null;
}
export function difficultyInstruction(id) {
  const profile = difficultyProfile(id);
  if (!profile) throw new Error("无效的面试难度");
  return `面试难度=${profile.label}（${profile.id}），规则版本=${DIFFICULTY_VERSION}。${profile.guidance}难度用于确定题目复杂度和评价情境，不改变五维量表档位，不按难度加减分。只评价已提问及岗位相关内容，不能要求候选人编造数字或经历。`;
}
