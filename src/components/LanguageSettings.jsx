import React from "react";
import { INTERVIEW_LANGUAGES } from "../../shared/interviewSetup.mjs";
import { languageSettings, LEVELS } from "../../shared/language.mjs";
export function LanguageSettings({ value, fallback, onChange }) {
  const settings = languageSettings(value, fallback);
  return (
    <details className="utility-panel">
      <summary>分别设置提问、回答与简历语言</summary>
      <div className="preparation-settings">
        {[
          ["questionLanguage", "提问语言"],
          ["answerLanguage", "回答与转写语言"],
          ["resumeLanguage", "简历原文语言"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <select
              value={settings[key]}
              onChange={(e) => onChange({ ...settings, [key]: e.target.value })}
            >
              {key === "resumeLanguage" && (
                <option value="auto">自动识别</option>
              )}
              {INTERVIEW_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          语言练习目标
          <select
            value={settings.targetLevel}
            onChange={(e) =>
              onChange({ ...settings, targetLevel: e.target.value })
            }
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "general" ? "日常面试表达" : l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="consent">
        <input
          type="checkbox"
          checked={settings.evaluate}
          onChange={(e) =>
            onChange({ ...settings, evaluate: e.target.checked })
          }
        />
        增加文字表达专项评估（额外模型调用）
      </label>
      <p>
        只分析确认文字的清晰度、用词与结构，附原文引用。练习目标不是语言等级认证，不据口音或表情评分。
      </p>
    </details>
  );
}
