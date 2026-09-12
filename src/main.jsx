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
import { usePersistentWorkspace } from "./usePersistentWorkspace";
import { pollJob } from "./jobs";
import { applyJobResult } from "./jobResults";
import { FLOW_VERSION } from "../shared/flow.mjs";
import { validateResumeReview, redactPersonal } from "../shared/resume.mjs";
import { DataCenter } from "./components/DataCenter";
import { readResumeFile } from "./resumeImport";
import {
  questionState,
  followQuestion,
  beginSession,
  isPreparationCurrent,
} from "./state";
import { ModelSettings } from "./components/ModelSettings";
import { SourceModal } from "./components/Modal";
import { Workspace } from "./components/Workspace";
import { Interview } from "./components/Interview";
import { Report, Plan } from "./components/Report";
import { SessionReport } from "./components/SessionReport";
import { availableSessions } from "./sessionSummary";
import { validatePreparation } from "../shared/analyze.mjs";
import {
  DEFAULT_DIFFICULTY,
  difficultySnapshot,
} from "../shared/difficulty.mjs";
import "./styles.css";

const NAV = [
  ["workspace", "训练空间", PanelsTopLeft],
  ["interview", "模拟面试", MessagesSquare],
  ["evidence", "证据报告", FileSearch],
  ["plan", "训练计划", Target],
  ["data", "历史与设置", FileSearch],
];
function App() {
  const { workspace, setWorkspace, ready, storageError, persist, replace } =
    usePersistentWorkspace();
  const [jobStatus, setJobStatus] = useState(null),
    [ocr, setOcr] = useState(false);
  const recovering = useRef(false);
  const [page, setPage] = useState("workspace"),
    [config, setConfig] = useState(null),
    [modelOpen, setModelOpen] = useState(false);
  const [reportView, setReportView] = useState("session"),
    [summarySessionId, setSummarySessionId] = useState(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [consent, setConsent] = useState(false),
    [source, setSource] = useState(null);
  const lock = useRef(false),
    toastTimer = useRef(null);
  const errorSummary = useRef(null);
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error]);
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
    if (!ready || !workspace.pending || recovering.current || lock.current)
      return;
    recovering.current = true;
    run(workspace.pending.operation, async () => {
      const pending = workspace.pending;
      const result = await pollJob(pending.id, setJobStatus);
      setWorkspace((w) => applyJobResult(w, pending, result));
      setPage(
        ["analyze", "prepare", "equivalent"].includes(pending.operation)
          ? "interview"
          : "workspace",
      );
    }).finally(() => {
      recovering.current = false;
    });
  }, [ready]);
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
    if (!ready || storageError || workspace.pending) {
      setError("请先恢复或处理当前保存/请求状态");
      return false;
    }
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
  async function executeJob(operation, input, extra = {}) {
    const pending = { id: crypto.randomUUID(), operation, input, ...extra };
    const saved = { ...workspace, pending };
    await persist(saved);
    setWorkspace(saved);
    await api("/jobs", { method: "POST", body: pending });
    const result = await pollJob(pending.id, setJobStatus);
    setWorkspace((w) => applyJobResult(w, pending, result));
    return result;
  }
  async function extractResume() {
    if (!authorized()) return;
    await run("resume", () =>
      executeJob("resume", {
        jd: workspace.draft.jd,
        resume: workspace.draft.resume,
        difficulty: workspace.draft.difficulty,
      }),
    );
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
    let context;
    try {
      context = {
        ...workspace.draft,
        flowVersion: FLOW_VERSION,
        resumeReview: validateResumeReview(
          workspace.draft.resumeReview,
          workspace.draft.resume,
        ),
      };
    } catch (e) {
      setError(e.message);
      return;
    }
    if (!context.jd.trim() || !context.resume.trim()) {
      setError("请填写岗位 JD 与个人简历");
      return;
    }
    await run("briefing", async () => {
      await executeJob("briefing", context);
      notify("岗位信息已提取，请校对确认后再出题");
    });
  }
  async function confirmPreparation() {
    if (!authorized() || !workspace.preparation) return;
    const preparation = workspace.preparation;
    await run("prepare", async () => {
      if (!isPreparationCurrent(preparation, workspace.draft))
        throw new Error("资料已变化，请返回重新提取岗位信息");
      const context = validatePreparation({
        ...preparation.source,
        briefing: { ...preparation.edited, confirmed: true },
      });
      await executeJob("prepare", context);
      setWorkspace((w) => ({ ...w, preparation: null }));
      setPage("interview");
      notify("岗位能力和面试路径已生成");
    });
  }
  async function submitAnswer() {
    if (!authorized() || !question?.ready || !question.draft.trim()) return;
    const payload = {
      jd: session.jd,
      resume: session.resume,
      ...(session.flowVersion
        ? {
            flowVersion: session.flowVersion,
            resumeReview: session.resumeReview,
            remainingSeconds: session.deadline
              ? Math.max(0, (session.deadline - Date.now()) / 1000)
              : 3600,
          }
        : {}),
      ...(session.practiceCriterion
        ? { criterion: session.practiceCriterion }
        : {}),
      difficulty: session.difficulty || DEFAULT_DIFFICULTY,
      ...(session.briefing ? { briefing: session.briefing } : {}),
      question: question.prompt,
      answer: question.draft,
      history: question.attempts.map(({ question, answer }) => ({
        question,
        answer,
      })),
    };
    await run("analyze", async () => {
      if (session.equivalence && !session.equivalence.confirmed)
        throw new Error("请先确认新场景与原训练目标相符");
      const result = await executeJob("analyze", payload, {
        sessionId: session.id,
        questionId: question.id,
      });
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
  async function practice(task, original, equivalent = false) {
    if (lock.current) return;
    const prompt =
      task?.prompt ||
      original.input.history?.[0]?.question ||
      original.input.question;
    const criterion =
      task?.criterion ||
      original.trainingPlan.tasks
        .map((t) => t.criterion)
        .join("；")
        .slice(0, 2000) ||
      "五维均有经复核支持的原文证据，且不再出现原有缺口。";
    if (equivalent) {
      if (!authorized()) return;
      await run("equivalent", async () => {
        await executeJob(
          "equivalent",
          {
            jd: original.input.jd,
            resume: original.input.resume,
            difficulty: original.input.difficulty || DEFAULT_DIFFICULTY,
            interviewMode: original.input.interviewMode || "text",
            language: original.input.language || "zh-CN",
            ...(original.input.flowVersion
              ? {
                  flowVersion: original.input.flowVersion,
                  resumeReview: original.input.resumeReview,
                }
              : {}),
            question: prompt,
            criterion,
            requirement: original.questionRequirement,
          },
          { originReportId: original.id },
        );
        setPage("interview");
      });
      return;
    }
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
        ...(original.input.briefing
          ? { briefing: original.input.briefing }
          : {}),
        difficulty: original.input.difficulty || DEFAULT_DIFFICULTY,
        interviewMode: original.input.interviewMode || "text",
        language: original.input.language || "zh-CN",
        difficultyPolicy: difficultySnapshot(
          original.input.difficulty || DEFAULT_DIFFICULTY,
        ),
        capabilities: original.questionRequirement
          ? [original.questionRequirement]
          : [],
        current: 0,
        questions: [q],
        originReportId: original.id,
        practiceKind: task ? "targeted" : "retest",
        practiceGap: task?.gap || null,
        practiceCriterion: criterion,
        ...(original.input.flowVersion
          ? {
              flowVersion: original.input.flowVersion,
              resumeReview: original.input.resumeReview,
            }
          : {}),
      }),
    );
    navigate("interview");
  }
  async function importFile(event) {
    const node = event.currentTarget,
      file = node.files?.[0];
    if (!file) return;
    await run("import", async () => {
      const document = await readResumeFile(file, { ocr, progress: setToast });
      const resume = document.text;
      setWorkspace((w) => ({
        ...w,
        preparation: null,
        draft: {
          ...w.draft,
          resume,
          resumeDocument: document,
          resumeReview: null,
        },
      }));
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
  if (!ready)
    return (
      <div className="page">
        <h1>正在恢复本地工作区…</h1>
        {storageError && (
          <p role="alert">
            {storageError}{" "}
            <button onClick={() => location.reload()}>重新连接</button>
          </p>
        )}
      </div>
    );
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
        {error && (
          <div
            className="error global-error"
            role="alert"
            tabIndex={-1}
            ref={errorSummary}
          >
            {error}
          </div>
        )}
        {workspace.pending && (
          <div className="utility-panel" role="status">
            <b>请求 {workspace.pending.id}</b>
            <p>
              {busy
                ? "处理中，可刷新后查询原任务。"
                : "请求尚未归档，请查询原任务；不要重复提交。"}{" "}
              {jobStatus?.status}
            </p>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() =>
                  api(`/jobs/${workspace.pending.id}/cancel`, {
                    method: "POST",
                    body: {},
                  })
                    .then(() => notify("已请求取消，已产生费用不一定能撤销"))
                    .catch((e) => setError(e.message))
                }
              >
                取消请求
              </button>
              {!busy && (
                <>
                  <button
                    className="secondary"
                    onClick={() =>
                      run(workspace.pending.operation, async () => {
                        const p = workspace.pending;
                        const result = await pollJob(p.id, setJobStatus);
                        setWorkspace((w) => applyJobResult(w, p, result));
                      })
                    }
                  >
                    查询原任务
                  </button>
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        const job = await api(`/jobs/${workspace.pending.id}`);
                        if (["running", "queued"].includes(job.status))
                          throw new Error("任务仍在运行，请等待或取消");
                        if (job.status === "succeeded") {
                          setWorkspace((w) =>
                            applyJobResult(w, w.pending, job.result),
                          );
                          return;
                        }
                        setWorkspace((w) => ({ ...w, pending: null }));
                      } catch (e) {
                        if (e.status === 404)
                          setWorkspace((w) => ({ ...w, pending: null }));
                        else setError(e.message);
                      }
                    }}
                  >
                    归档已结束请求
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {page === "data" && (
          <DataCenter
            workspace={workspace}
            setWorkspace={setWorkspace}
            replace={replace}
            persist={persist}
            openSession={openSession}
            openReport={openReport}
          />
        )}
        {page === "workspace" && (
          <Workspace
            draft={workspace.draft}
            extractResume={extractResume}
            changeResumeReview={(resumeReview) => {
              setWorkspace((w) => ({
                ...w,
                preparation: null,
                draft: { ...w.draft, resumeReview },
              }));
              setConsent(false);
            }}
            ocr={ocr}
            setOcr={setOcr}
            redact={() => {
              setWorkspace((w) => ({
                ...w,
                preparation: null,
                draft: {
                  ...w.draft,
                  jd: redactPersonal(w.draft.jd),
                  resume: redactPersonal(w.draft.resume),
                  resumeReview: null,
                  resumeDocument: null,
                },
              }));
              setConsent(false);
              notify(
                "已替换手机号、邮箱和身份证号，请检查姓名、公司和自定义敏感信息后重新校对",
              );
            }}
            update={(key, value) => {
              setWorkspace((w) => ({
                ...w,
                preparation: null,
                draft: { ...w.draft, [key]: value },
              }));
              setConsent(false);
            }}
            config={config}
            start={startInterview}
            preparation={workspace.preparation}
            changePreparation={(edited) => {
              setWorkspace((w) => ({
                ...w,
                preparation: { ...w.preparation, edited },
              }));
              setError("");
            }}
            confirmPreparation={confirmPreparation}
            backToDraft={() => {
              setWorkspace((w) => ({ ...w, preparation: null }));
              setError("");
            }}
            source={setSource}
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
              <label className="consent session-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                我同意将本轮岗位、简历、问题与回答发送到已配置的模型服务。视频或录音不会上传。
              </label>
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
                  updateQuestion((q) =>
                    followQuestion(q, currentReport, session),
                  )
                }
                skip={() =>
                  updateQuestion((q) => ({ ...q, skipped: true, ready: false }))
                }
                confirmEquivalent={() =>
                  setWorkspace((w) => ({
                    ...w,
                    session: {
                      ...w.session,
                      equivalence: {
                        ...w.session.equivalence,
                        confirmed: true,
                      },
                    },
                  }))
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
