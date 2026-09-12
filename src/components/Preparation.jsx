import React, { useEffect, useRef } from "react";
import { ArrowRight, Plus, Search, Trash2 } from "lucide-react";
import {
  SENIORITIES,
  INTERVIEW_FOCI,
  INTERVIEW_MODES,
  INTERVIEW_LANGUAGES,
  DURATIONS,
  setupLabel,
} from "../../shared/interviewSetup.mjs";
import { difficultyLabel } from "../../shared/difficulty.mjs";

export function Preparation({
  preparation,
  changePreparation,
  confirmPreparation,
  backToDraft,
  source,
  busy,
  error,
  consent,
  setConsent,
}) {
  const { edited, proposal, source: input } = preparation;
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const change = (key, value) => changePreparation({ ...edited, [key]: value });
  const changeCapability = (index, key, value) =>
    change(
      "capabilities",
      edited.capabilities.map((c, i) =>
        i === index ? { ...c, [key]: value } : c,
      ),
    );
  const duration = DURATIONS.find(
    (item) => item.minutes === edited.durationMinutes,
  );
  return (
    <div className="page preparation">
      <span className="number-label">面试准备 · 校对岗位</span>
      <h2 ref={heading} tabIndex={-1}>
        先确认岗位，再开始面试
      </h2>
      <p>
        检查模型是否读对了
        JD。能力名称可以修正，依据必须来自岗位原文。目标资历用于确定考察范围，不代表系统认定你已具备该资历。
      </p>
      <p className="difficulty-context">
        本轮难度：{difficultyLabel(input.difficulty)} ·
        修改难度或资料请返回上一步。
      </p>
      <details className="preparation-source">
        <summary>查看岗位 JD 原文</summary>
        <pre>{input.jd}</pre>
      </details>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          confirmPreparation();
        }}
      >
        <fieldset disabled={Boolean(busy)}>
          <div className="preparation-settings">
            <label>
              岗位标题
              <input
                type="text"
                required
                maxLength={100}
                value={edited.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <div>
              <label htmlFor="briefing-seniority">目标资历</label>
              <select
                id="briefing-seniority"
                value={edited.seniority}
                onChange={(e) => change("seniority", e.target.value)}
              >
                {SENIORITIES.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="briefing-focus">面试侧重点</label>
              <select
                id="briefing-focus"
                value={edited.focus}
                onChange={(e) => change("focus", e.target.value)}
              >
                {INTERVIEW_FOCI.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="briefing-duration">预计时长</label>
              <select
                id="briefing-duration"
                value={edited.durationMinutes}
                onChange={(e) =>
                  change("durationMinutes", Number(e.target.value))
                }
              >
                {DURATIONS.map((item) => (
                  <option value={item.minutes} key={item.minutes}>
                    {item.minutes} 分钟 · {item.questions} 道主问题
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="briefing-mode">面试方式</label>
              <select
                id="briefing-mode"
                value={edited.interviewMode || "text"}
                onChange={(e) => change("interviewMode", e.target.value)}
              >
                {INTERVIEW_MODES.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="briefing-language">回答语言</label>
              <select
                id="briefing-language"
                value={edited.language || "zh-CN"}
                onChange={(e) => change("language", e.target.value)}
              >
                {INTERVIEW_LANGUAGES.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="storage-note">
            时长用于问题数量和追问预算；超时后保留正在输入的回答，停止新增追问。
          </p>
          <p className="storage-note">
            JD 资历提取建议：{setupLabel(SENIORITIES, proposal.seniority)}
            {proposal.seniorityEvidence
              ? `，依据：“${proposal.seniorityEvidence.quote}”`
              : "，未提取到明确资历依据。"}
          </p>
          <div className="section-heading">
            <h3>确认岗位能力 · {edited.capabilities.length}/10</h3>
          </div>
          <div className="preparation-capabilities">
            {edited.capabilities.map((capability, index) => {
              const start = input.jd.indexOf(capability.quote);
              const validQuote = Boolean(capability.quote.trim()) && start >= 0;
              return (
                <article className="preparation-capability" key={capability.id}>
                  <label>
                    能力 {index + 1}
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={capability.label}
                      onChange={(e) =>
                        changeCapability(index, "label", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    岗位重要性
                    <select
                      value={capability.importance || 2}
                      onChange={(e) =>
                        changeCapability(
                          index,
                          "importance",
                          Number(e.target.value),
                        )
                      }
                    >
                      <option value={3}>核心要求</option>
                      <option value={2}>一般要求</option>
                      <option value={1}>加分项</option>
                    </select>
                  </label>
                  <label htmlFor={`capability-quote-${capability.id}`}>
                    能力 {index + 1} 的 JD 依据
                  </label>
                  <textarea
                    id={`capability-quote-${capability.id}`}
                    required
                    maxLength={20000}
                    value={capability.quote}
                    aria-invalid={!validQuote}
                    onChange={(e) =>
                      changeCapability(index, "quote", e.target.value)
                    }
                  />
                  {!validQuote && (
                    <p className="error">请从上方 JD 复制一段连续原文。</p>
                  )}
                  <div className="button-row">
                    <button
                      type="button"
                      className="text-button"
                      disabled={!validQuote}
                      onClick={() =>
                        source({
                          title: capability.label + " · JD依据",
                          text: input.jd,
                          span: {
                            quote: capability.quote,
                            start,
                            end: start + capability.quote.length,
                          },
                        })
                      }
                    >
                      <Search size={15} aria-hidden="true" />
                      定位原文
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`删除能力 ${index + 1}`}
                      disabled={edited.capabilities.length <= 1}
                      onClick={() =>
                        change(
                          "capabilities",
                          edited.capabilities.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <button
            type="button"
            className="secondary"
            disabled={edited.capabilities.length >= 10}
            onClick={() =>
              change("capabilities", [
                ...edited.capabilities,
                { id: crypto.randomUUID(), label: "", quote: "" },
              ])
            }
          >
            <Plus size={16} aria-hidden="true" />
            添加能力
          </button>
          <details className="preparation-source">
            <summary>查看模型最初提取的标签</summary>
            <ul>
              {proposal.capabilities.map((c) => (
                <li key={c.id}>
                  <b>{c.label}</b>
                  <blockquote>{c.quote}</blockquote>
                </li>
              ))}
            </ul>
          </details>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            我同意将确认后的岗位信息、简历和回答发送至当前模型服务。
          </label>
          {error && (
            <div className="error" role="alert">
              {error} 校对内容已保留。
            </div>
          )}
          <p className="storage-note">
            确认后调用模型生成 {duration?.questions || ""}{" "}
            道主问题，可能产生费用。调整标签和设置本身不会调用模型。
          </p>
          <div className="button-row preparation-actions">
            <button type="button" className="secondary" onClick={backToDraft}>
              返回修改资料
            </button>
            <button className="primary" disabled={!consent}>
              {busy === "prepare" ? "正在生成面试问题…" : "确认并生成面试问题"}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

export function BriefingSummary({ briefing, practice = false }) {
  if (!briefing) return null;
  return (
    <p className="difficulty-context">
      {practice ? "来源面试设置" : "已确认"}：
      {setupLabel(SENIORITIES, briefing.seniority)} ·{" "}
      {setupLabel(INTERVIEW_FOCI, briefing.focus)} · 预计{" "}
      {briefing.durationMinutes} 分钟 / {briefing.questionCount} 道主问题 ·{" "}
      {setupLabel(INTERVIEW_MODES, briefing.interviewMode || "text")} ·{" "}
      {setupLabel(INTERVIEW_LANGUAGES, briefing.language || "zh-CN")}
    </p>
  );
}
