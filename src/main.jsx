import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PanelsTopLeft,
  MessagesSquare,
  FileSearch,
  Target,
  SlidersHorizontal,
  ArrowRight,
  Link2,
} from "lucide-react";
import { api } from "./api";
import { readResumeFile } from "./resumeImport";
import {
  initialWorkspace,
  loadWorkspace,
  questionState,
  acceptAnswer,
  followQuestion,
  STORAGE_KEY,
  beginSession,
} from "./state";
import { ModelSettings } from "./components/ModelSettings";
import { SourceModal } from "./components/Modal";
import { Workspace } from "./components/Workspace";
import { Interview } from "./components/Interview";
import { Report, Plan } from "./components/Report";
import { SessionReport } from "./components/SessionReport";
import { availableSessions } from "./sessionSummary";
import "./styles.css";

const NAV = [
  ["workspace", "训练空间", PanelsTopLeft],
  ["interview", "模拟面试", MessagesSquare],
  ["evidence", "证据报告", FileSearch],
  ["plan", "训练计划", Target],
];
function App() {
  const [workspace, setWorkspace] = useState(() => {
    try {
      return loadWorkspace(sessionStorage);
    } catch {
      return initialWorkspace();
    }
  });
  const [page, setPage] = useState("workspace"),
    [config, setConfig] = useState(null),
    [modelOpen, setModelOpen] = useState(false);
  const [reportView, setReportView] = useState("session"),
    [summarySessionId, setSummarySessionId] = useState(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [storageError, setStorageError] = useState("");
  const [consent, setConsent] = useState(false),
    [source, setSource] = useState(null);
  const lock = useRef(false),
    toastTimer = useRef(null);
  useEffect(() => {
    let alive = true;
    api("/health")
      .then((r) => {
        if (alive) setConfig(r.config);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
        setStorageError("");
      } catch {
        setStorageError(
          "浏览器暂时无法保存本轮记录，请导出重要报告后再关闭页面。",
        );
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [workspace]);
  const session = workspace.session;
  const sessions = availableSessions(workspace);
  const summarySession =
    sessions.find((s) => s.id === summarySessionId) || sessions[0];
  const question = session?.questions[session.current];
  const report =
    workspace.records.find((r) => r.id === workspace.selected) ||
    workspace.records[0];
  const currentReport = workspace.records.find(
    (r) => r.id === question?.attempts.at(-1)?.reportId,
  );
  function notify(message) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }
  function navigate(next) {
    if (lock.current) return;
    setPage(next);
    setError("");
    window.scrollTo(0, 0);
  }
  function openReport(id, next = "evidence") {
    setWorkspace((w) => ({ ...w, selected: id }));
    setReportView("answer");
    setSummarySessionId(
      workspace.records.find((r) => r.id === id)?.sessionId || null,
    );
    navigate(next);
  }
  function openSession(id) {
    setSummarySessionId(id);
    setReportView("session");
    navigate("evidence");
  }
  function toggleTask(id) {
    setWorkspace((w) => ({ ...w, done: { ...w.done, [id]: !w.done[id] } }));
  }
  function authorized() {
    if (!config) {
      setModelOpen(true);
      setError("请先保存模型配置");
      return false;
    }
    if (!consent) {
      setError("请勾选数据发送确认，再开始模型分析");
      return false;
    }
    return true;
  }
  async function run(kind, action) {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
      if (e.status === 409) setConfig(null);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function startInterview() {
    if (!authorized()) return;
    const context = { ...workspace.draft };
    if (!context.jd.trim() || !context.resume.trim()) {
      setError("请填写岗位 JD 与个人简历");
      return;
    }
    await run("prepare", async () => {
      const result = await api("/interview/prepare", {
        method: "POST",
        body: context,
      });
      setWorkspace((w) =>
        beginSession(w, {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          title: result.title,
          ...context,
          capabilities: result.capabilities,
          questions: result.questions.map(questionState),
          current: 0,
        }),
      );
      setPage("interview");
      notify("岗位能力和面试路径已生成");
    });
  }
  async function submitAnswer() {
    if (!authorized() || !question?.ready || !question.draft.trim()) return;
    const payload = {
      jd: session.jd,
      resume: session.resume,
      question: question.prompt,
      answer: question.draft,
      history: question.attempts.map(({ question, answer }) => ({
        question,
        answer,
      })),
    };
    await run("analyze", async () => {
      const result = await api("/interview/analyze", {
        method: "POST",
        body: payload,
      });
      setWorkspace((w) => acceptAnswer(w, result, crypto.randomUUID()));
      notify(
        result.followUp
          ? "分析完成，可以继续回答追问"
          : "分析完成，查看证据或转入专项训练",
      );
    });
  }
  function updateQuestion(update) {
    setWorkspace((w) => ({
      ...w,
      session: {
        ...w.session,
        questions: w.session.questions.map((q, i) =>
          i === w.session.current ? update(q) : q,
        ),
      },
    }));
  }
  function finish() {
    if (session) openSession(session.id);
  }
  function practice(task, original) {
    if (lock.current) return;
    const prompt =
      task?.prompt ||
      original.input.history?.[0]?.question ||
      original.input.question;
    const q = questionState({
      id: crypto.randomUUID(),
      question: prompt,
      skill: task?.gap || "复测",
      why: task?.criterion || "使用新回答验证原来的证据缺口。",
      requirement: original.questionRequirement || undefined,
    });
    setWorkspace((w) =>
      beginSession(w, {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title: task ? "专项练习" : "回答复测",
        jd: original.input.jd,
        resume: original.input.resume,
        capabilities: original.questionRequirement
          ? [original.questionRequirement]
          : [],
        current: 0,
        questions: [q],
        originReportId: original.id,
        practiceKind: task ? "targeted" : "retest",
        practiceGap: task?.gap || null,
      }),
    );
    navigate("interview");
  }
  async function importFile(event) {
    const node = event.currentTarget,
      file = node.files?.[0];
    if (!file) return;
    await run("import", async () => {
      const resume = await readResumeFile(file);
      setWorkspace((w) => ({ ...w, draft: { ...w.draft, resume } }));
      setConsent(false);
      notify("已提取简历文字，请检查识别结果");
    });
    node.value = "";
  }
  function saveConfig(value) {
    setConfig(value);
    setConsent(false);
    notify(
      value.testedAt
        ? "模型已保存，连接测试通过"
        : "配置已保存；尚未完成连接测试",
    );
  }
  const connection = !config
    ? "尚未配置模型"
    : config.testedAt
      ? "连接测试通过"
      : "配置已保存 · 待测试";
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Link2 size={22} />
          </span>
          <span>
            <b>evidence</b>
            <strong>loop</strong>
            <small>面试证据链</small>
          </span>
        </div>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <div className="profile">
          <span>我</span>
          <div>
            <b>我的训练空间</b>
            <small>让回答有据可循</small>
          </div>
        </div>
        <nav aria-label="主要导航">
          {NAV.map(([id, title, Icon]) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              disabled={Boolean(busy)}
              onClick={() => {
                if (id === "evidence") setReportView("session");
                navigate(id);
              }}
            >
              <Icon size={18} aria-hidden="true" />
              {title}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="settings-button"
            disabled={Boolean(busy)}
            onClick={() => setModelOpen(true)}
          >
            <SlidersHorizontal size={18} />
            模型设置
          </button>
          <div className="connection">
            <span
              className={config?.testedAt ? "connected-dot" : "warning-dot"}
            />
            <div>
              <b>{connection}</b>
              <small>{config?.model || "自定义模型与中转服务"}</small>
            </div>
          </div>
        </div>
      </aside>
      <main id="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">MY WORKSPACE / {page.toUpperCase()}</span>
            <h1>{NAV.find((n) => n[0] === page)[1]}</h1>
          </div>
          <button
            className="model-button"
            onClick={() => setModelOpen(true)}
            disabled={Boolean(busy)}
          >
            <span
              className={config?.testedAt ? "connected-dot" : "warning-dot"}
            />
            {config?.model || "连接模型"}
            <SlidersHorizontal size={15} />
          </button>
        </header>
        {storageError && (
          <div className="error" role="alert">
            {storageError}
          </div>
        )}
        {page === "workspace" && (
          <Workspace
            draft={workspace.draft}
            update={(key, value) => {
              setWorkspace((w) => ({
                ...w,
                draft: { ...w.draft, [key]: value },
              }));
              setConsent(false);
            }}
            config={config}
            start={startInterview}
            busy={busy}
            error={error}
            importFile={importFile}
            consent={consent}
            setConsent={setConsent}
            configure={() => setModelOpen(true)}
            session={session}
            resume={() => navigate("interview")}
            records={workspace.records}
            openReport={openReport}
          />
        )}
        {page === "interview" &&
          (session ? (
            <>
              {!consent && (
                <label className="consent session-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  我同意将本轮岗位、简历、问题与回答发送到已配置的模型服务。
                </label>
              )}
              <Interview
                session={session}
                question={question}
                report={currentReport}
                records={workspace.records}
                busy={busy}
                error={error}
                changeAnswer={(draft) =>
                  updateQuestion((q) => ({ ...q, draft }))
                }
                submit={submitAnswer}
                choose={(i) => {
                  if (!lock.current) {
                    setWorkspace((w) => ({
                      ...w,
                      session: { ...w.session, current: i },
                    }));
                    setError("");
                  }
                }}
                follow={() =>
                  updateQuestion((q) => followQuestion(q, currentReport))
                }
                finish={finish}
                openReport={openReport}
                source={setSource}
              />
            </>
          ) : (
            <Empty
              title="从一个目标岗位开始"
              text="填写 JD 与简历，由模型为你准备问题。"
              action={() => navigate("workspace")}
              label="准备面试资料"
            />
          ))}
        {page === "evidence" && (
          <>
            {(sessions.length > 0 || report) && (
              <div className="report-navigation">
                <div
                  className="report-modes"
                  role="group"
                  aria-label="报告范围"
                >
                  <button
                    aria-pressed={reportView === "session"}
                    onClick={() => setReportView("session")}
                    disabled={!summarySession}
                  >
                    整场复盘
                  </button>
                  <button
                    aria-pressed={reportView === "answer"}
                    onClick={() => setReportView("answer")}
                    disabled={!report}
                  >
                    单题证据
                  </button>
                </div>
                {reportView === "session" && summarySession && (
                  <label>
                    面试记录
                    <select
                      value={summarySession.id}
                      onChange={(e) => setSummarySessionId(e.target.value)}
                    >
                      {sessions.map((s, i) => (
                        <option value={s.id} key={s.id}>
                          {s.title} ·{" "}
                          {s.createdAt
                            ? new Date(s.createdAt).toLocaleString("zh-CN")
                            : `记录 ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {reportView === "answer" && report && (
                  <label>
                    回答记录
                    <select
                      value={report.id}
                      onChange={(e) => openReport(e.target.value)}
                    >
                      {workspace.records.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.input.question.slice(0, 60)} ·{" "}
                          {new Date(r.createdAt).toLocaleString("zh-CN")}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {reportView === "session" && summarySession ? (
              <div className="page">
                <SessionReport
                  session={summarySession}
                  records={workspace.records}
                  openReport={openReport}
                  source={setSource}
                  practice={practice}
                  done={workspace.done}
                  toggle={toggleTask}
                />
              </div>
            ) : report ? (
              <Report
                report={report}
                records={workspace.records}
                openReport={openReport}
                source={setSource}
                goPlan={() => navigate("plan")}
                practice={practice}
                goSession={() => openSession(report.sessionId)}
              />
            ) : (
              <Empty
                title="每一份报告，从回答开始"
                text="模型完成分析后，五维评分及其原文依据会展示在这里。"
                action={() => navigate(session ? "interview" : "workspace")}
                label="开始回答"
              />
            )}
          </>
        )}
        {page === "plan" &&
          (report ? (
            <Plan
              report={report}
              records={workspace.records}
              done={workspace.done}
              toggle={toggleTask}
              practice={practice}
              openReport={openReport}
              goSession={() => openSession(report.sessionId)}
            />
          ) : (
            <Empty
              title="下一步训练，要有依据"
              text="先完成至少一次回答，我们会把证据缺口变成练习题。"
              action={() => navigate(session ? "interview" : "workspace")}
              label="去回答"
            />
          ))}
      </main>
      {modelOpen && (
        <ModelSettings
          saved={config}
          close={() => {
            setModelOpen(false);
            api("/health")
              .then((r) => setConfig(r.config))
              .catch(() => {});
          }}
          onSave={saveConfig}
          onClear={() => {
            setConfig(null);
            setConsent(false);
            notify("本会话 Key 与模型配置已清除");
          }}
        />
      )}
      {source && <SourceModal source={source} close={() => setSource(null)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
function Empty({ title, text, action, label }) {
  return (
    <div className="page empty">
      <span className="number-label">YOUR NEXT STEP</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={action}>
        {label}
        <ArrowRight size={17} />
      </button>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
