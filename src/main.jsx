import React, { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const capabilities = [
  { name: 'Redis 缓存', type: '核心能力', score: 46, tone: 'orange', detail: '缺少击穿与故障降级证据' },
  { name: '性能优化', type: '岗位要求', score: 68, tone: 'blue', detail: '有动作描述，量化结果不足' },
  { name: '数据库设计', type: '岗位要求', score: 84, tone: 'green', detail: '能说明索引设计与取舍' },
  { name: '项目协作', type: '个人经历', score: 72, tone: 'purple', detail: '贡献边界表达清晰' },
];

const questions = [
  { id: 1, tag: '项目深挖', title: '你在项目中是如何解决 Redis 缓存问题的？', state: '当前问题', skill: 'Redis 缓存', duration: '预计 2 分钟' },
  { id: 2, tag: '故障场景', title: '如果 Redis 集群不可用，你会如何保证核心请求继续处理？', state: '待追问', skill: '故障兜底', duration: '预计 1 分钟' },
  { id: 3, tag: '结果验证', title: '这个优化最终带来了哪些可量化的变化？', state: '待追问', skill: '量化结果', duration: '预计 1 分钟' },
];

const evidence = [
  { label: '回答证据', text: '“我们把商品详情放到了 Redis 里，减少数据库压力。”', color: 'orange' },
  { label: '岗位要求', text: '能够处理缓存异常与高并发场景，具备故障降级意识。', color: 'blue' },
  { label: '知识依据', text: '缓存击穿：热点 Key 失效瞬间大量请求回源；可通过互斥锁、逻辑过期等方式控制。', color: 'purple' },
];

function App() {
  const [page, setPage] = useState('overview');
  const [mode, setMode] = useState('offline');
  const [jd, setJd] = useState('Java 后端工程师，要求熟悉 Redis 缓存、高并发、数据库设计和故障降级。');
  const [resume, setResume] = useState('电商项目：负责系统优化，使用 Redis 缓存商品详情，降低数据库压力。');
  const [answer, setAnswer] = useState('我们在商品详情页使用 Redis 缓存热点数据，先查缓存，未命中再查询数据库并回填。');
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(1);

  const notice = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };
  const currentQuestion = questions.find(q => q.id === selectedQuestion) || questions[0];
  const score = analysis?.score ?? (submitted ? 52 : 46);
  const evidenceCount = analysis?.evidence?.length ?? (submitted ? 4 : 3);

  const navItems = [
    { id: 'overview', icon: '⌂', label: '总览' },
    { id: 'interview', icon: '◉', label: '模拟面试' },
    { id: 'evidence', icon: '◇', label: '证据中心' },
    { id: 'plan', icon: '↗', label: '训练计划' },
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark"><span className="brand-icon">E</span><div><strong>evidence<span>loop</span></strong><small>INTERVIEW INTELLIGENCE</small></div></div>
      <div className="workspace"><span className="avatar">L</span><div><b>Leo 的训练空间</b><small>个人账户</small></div><span className="chevron">⌄</span></div>
      <nav>{navItems.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><i>{item.icon}</i>{item.label}{item.id === 'interview' && <em>进行中</em>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="settings" onClick={() => setModelOpen(true)}><i>⚙</i>模型设置</button><div className="api-status"><span className="status-dot"></span><div><b>{mode === 'offline' ? '离线演示模式' : '在线模型模式'}</b><small>{mode === 'offline' ? '本地规则与预置结果' : '自定义 API 已连接'}</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="breadcrumb">我的训练空间　/　<span>Java 后端工程师</span></span><h1>{page === 'overview' ? '准备下一场面试' : page === 'interview' ? '模拟面试工作台' : page === 'evidence' ? '证据中心' : '你的训练计划'}</h1></div><div className="top-actions"><div className="mode-switch"><span className="status-dot"></span><select value={mode} onChange={e => { setMode(e.target.value); notice(e.target.value === 'offline' ? '已切换到离线演示模式' : '在线模型配置已启用'); }}><option value="offline">离线演示</option><option value="online">在线模型</option></select></div><button className="icon-btn" onClick={() => notice('没有新的通知')}>♢</button><button className="avatar top-avatar">L</button></div></header>
      {page === 'overview' && <Overview onStart={() => setPage('interview')} onPlan={() => setPage('plan')} capabilities={capabilities} />}
      {page === 'interview' && <Interview jd={jd} setJd={setJd} resume={resume} setResume={setResume} answer={answer} setAnswer={setAnswer} submitted={submitted} setSubmitted={setSubmitted} analysis={analysis} setAnalysis={setAnalysis} analyzing={analyzing} setAnalyzing={setAnalyzing} currentQuestion={currentQuestion} selectedQuestion={selectedQuestion} setSelectedQuestion={setSelectedQuestion} onEvidence={() => setPage('evidence')} onPlan={() => setPage('plan')} notice={notice} score={score} evidenceCount={evidenceCount} />}
      {page === 'evidence' && <Evidence analysis={analysis} onBack={() => setPage('interview')} />}
      {page === 'plan' && <Plan onStart={() => { setPage('interview'); notice('训练题已载入面试工作台'); }} />}
    </main>
    {modelOpen && <ModelModal close={() => setModelOpen(false)} save={() => { setModelOpen(false); setMode('online'); notice('模型配置已保存（当前为演示连接）'); }} />}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </div>;
}

function Overview({ onStart, onPlan }) { return <div className="content fade-in">
  <section className="hero"><div><div className="eyebrow"><span className="pulse"></span>训练进度 · 第 3 轮</div><h2>把每一次回答，<br /><em>变成下一次进步的证据。</em></h2><p>不只告诉你得了多少分。定位回答中缺失的能力证据，给出下一步应该练什么。</p><div className="hero-actions"><button className="primary" onClick={onStart}>继续模拟面试 <span>→</span></button><button className="secondary" onClick={onPlan}>查看训练计划</button></div></div><div className="hero-orbit"><div className="orbit orbit-1"></div><div className="orbit orbit-2"></div><div className="orbit-core"><b>52</b><span>当前匹配度</span></div><div className="orbit-node node-a">回答<br /><strong>12</strong></div><div className="orbit-node node-b">证据<br /><strong>28</strong></div><div className="orbit-node node-c">缺口<br /><strong>04</strong></div></div></section>
  <section className="section-head"><div><span className="section-kicker">能力雷达</span><h3>岗位能力画像</h3></div><button className="text-btn" onClick={() => onPlan()}>查看完整分析　→</button></section><div className="capability-grid">{capabilities.map(c => <Capability key={c.name} {...c} />)}</div>
  <section className="lower-grid"><div className="card recent-card"><div className="card-head"><div><span className="section-kicker">最近一次</span><h3>面试记录</h3></div><span className="date">2026.09.09</span></div><div className="record-row"><div className="record-icon">⌘</div><div className="record-info"><b>Java 后端工程师 · 模拟面试</b><span>8 道问题　·　4 个证据缺口</span></div><div className="record-score"><strong>52</strong><small>/ 100</small></div><button className="round-arrow" onClick={onStart}>→</button></div></div><div className="card insight-card"><div className="insight-icon">✦</div><div><span className="section-kicker">AI 洞察</span><p>你的项目背景讲得很清楚，但在<strong>故障兜底</strong>和<strong>量化结果</strong>上还可以更具体。</p><button className="text-btn" onClick={onPlan}>去完成训练　→</button></div></div></section>
</div> }
function Capability({ name, type, score, tone, detail }) { return <div className="capability"><div className="cap-top"><div><b>{name}</b><span>{type}</span></div><strong className={tone}>{score}<small>/100</small></strong></div><div className="bar"><i className={tone} style={{width: `${score}%`}}></i></div><div className="cap-bottom"><span className={`dot ${tone}`}></span>{detail}<span className="mini-arrow">↗</span></div></div> }

function Interview({ jd, setJd, resume, setResume, answer, setAnswer, submitted, setSubmitted, analysis, setAnalysis, analyzing, setAnalyzing, currentQuestion, selectedQuestion, setSelectedQuestion, onEvidence, onPlan, notice, score, evidenceCount }) { return <div className="content interview-page fade-in"><div className="interview-layout"><section className="interview-main"><div className="session-progress"><div><span className="section-kicker">LIVE SESSION 03</span><b>项目经历深挖</b></div><div className="progress-track"><i style={{width:'42%'}}></i></div><span>3 / 8</span><button onClick={() => notice('面试已暂停，可随时继续')}>暂停</button></div><div className="question-card"><div className="q-meta"><span className="tag">{currentQuestion.tag}</span><span>{currentQuestion.duration}</span></div><h2>{currentQuestion.title}</h2><p>请尽量使用 STAR 结构，重点说明你的个人贡献和最终结果。</p><div className="question-foot"><span>关联能力 <b>{currentQuestion.skill}</b></span><span className="ai-label">✦ AI 正在倾听</span></div></div><details className="context-panel"><summary>本场上下文：岗位 JD 与简历主张 <span>点击展开 / 收起</span></summary><div className="context-fields"><label>岗位 JD<textarea value={jd} onChange={e=>setJd(e.target.value)} /></label><label>简历摘要<textarea value={resume} onChange={e=>setResume(e.target.value)} /></label></div></details><div className="answer-area"><div className="answer-head"><div><span className="section-kicker">YOUR ANSWER</span><h3>记录你的回答</h3></div><span className="word-count">{answer.length} / 500</span></div><textarea value={answer} maxLength={500} onChange={e => setAnswer(e.target.value)} placeholder="从项目背景开始，说说你具体做了什么……"/><div className="answer-actions"><span className="hint">⌨ 建议回答 1–2 分钟</span><button className="primary" disabled={analyzing || !answer.trim()} onClick={async () => { setAnalyzing(true); try { const r=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jd,resume,answer,question:currentQuestion.title})}); const result=await r.json(); setAnalysis(result); setSubmitted(true); notice(`规则分析完成，发现 ${result.missing?.length ?? 0} 个缺口`); } catch (e) { notice('分析服务不可用，仍可使用离线示例结果'); setSubmitted(true); } finally { setAnalyzing(false); } }}>{analyzing ? '正在分析…' : submitted ? '重新分析　↻' : '提交回答　→'}</button></div></div>{submitted && <div className="followup"><div className="follow-icon">↳</div><div><span className="section-kicker">基于你的回答 · {analysis?.mode === 'rules' ? '规则分析' : '预置结果'}</span><h3>{analysis?.followUp || '如果 Redis 集群不可用，你会如何保证核心请求继续处理？'}</h3><p>{analysis?.missing?.length ? `检测到回答缺少：${analysis.missing.join('、')}。` : '回答已覆盖当前问题的主要证据项。'}</p></div><button className="secondary" onClick={() => {setSelectedQuestion(2); setSubmitted(false); setAnswer('');}}>回答追问</button></div>}</section><aside className="interview-side"><div className="side-card score-card"><div className="score-ring"><svg viewBox="0 0 100 100"><circle className="ring-bg" cx="50" cy="50" r="42"/><circle className="ring-fill" cx="50" cy="50" r="42" strokeDasharray={`${score * 2.64} 264`}/></svg><div><b>{score}</b><span>本题得分</span></div></div><div className="score-note"><span className="dot orange"></span>低于岗位期望 <b>18%</b></div><button className="text-btn" onClick={onEvidence}>查看评分证据　↗</button></div><div className="side-card queue-card"><div className="side-title"><b>面试路径</b><span>共 8 题</span></div>{questions.map(q => <button key={q.id} className={`queue-item ${selectedQuestion===q.id?'selected':''}`} onClick={() => {setSelectedQuestion(q.id); setSubmitted(false);}}><span className="q-number">0{q.id}</span><span><b>{q.title}</b><small>{q.skill}</small></span><i>{q.id < 3 ? '✓' : '·'}</i></button>)}</div><div className="side-card evidence-mini"><div className="side-title"><b>证据捕获</b><span className="live-dot">● LIVE</span></div><div className="evidence-stats"><div><strong>{evidenceCount}</strong><span>已捕获</span></div><div><strong>2</strong><span>待补充</span></div><div><strong>1</strong><span>待澄清</span></div></div><button className="secondary full" onClick={onPlan}>查看训练建议　→</button></div></aside></div></div> }

function Evidence({ analysis, onBack }) { return <div className="content evidence-page fade-in"><div className="page-intro"><button className="back" onClick={onBack}>← 返回面试</button><div className="eyebrow">回答 03 · Redis 缓存</div><h2>这 {analysis?.score ?? 52} 分，证据在哪里？</h2><p>评分不是黑箱。展开每个维度，查看它对应的回答片段、岗位要求和知识依据。</p></div><div className="evidence-layout"><section><div className="score-summary"><div><span>综合匹配度</span><strong>{analysis?.score ?? 52}<small>/100</small></strong></div><div className="summary-meta"><span className="pill orange-pill">需要提升</span><span>证据完整度　<b>48%</b></span></div></div>{['技术深度','个人贡献','量化结果','故障兜底'].map((x,i) => { const covered=analysis?.evidence?.some(e=>e.label===x); return <EvidenceRow key={x} title={x} score={covered ? 4 : 1} max="5" note={covered ? '回答中有可定位证据' : '当前回答没有足够的可定位证据'} analysis={analysis} />; })}</section><aside className="evidence-aside"><div className="card"><span className="section-kicker">待澄清主张</span><h3>“负责系统优化”</h3><p>简历中出现，但当前回答还无法支撑「个人贡献」和「量化结果」。</p><div className="compare"><span>简历</span><b>负责系统优化</b><span>回答</span><b>我们使用 Redis 缓存</b></div><button className="secondary full" onClick={() => onBack()}>回到面试澄清　→</button></div><div className="card knowledge"><span className="section-kicker">知识库依据</span><b>Redis 缓存异常处理</b><p>缓存击穿、缓存雪崩、缓存穿透、降级与回源控制。</p></div></aside></div></div> }
function EvidenceRow({ title, score, max, note, analysis }) { return <details className="evidence-row" open={title==='技术深度'}><summary><span><b>{title}</b><small>{note}</small></span><strong>{score}<small>/{max}</small></strong><i>⌄</i></summary><div className="evidence-detail">{(analysis?.evidence?.length ? analysis.evidence : evidence).map(e => <div className="evidence-line" key={e.label}><span className={`evidence-label ${e.color || 'blue'}`}>{e.label}</span><p>{e.quote || e.text}</p><span className="link">原文定位 ↗</span></div>)}</div></details> }
function Plan({ onStart }) { return <div className="content plan-page fade-in"><div className="page-intro"><div className="eyebrow"><span className="pulse"></span>基于最近一次面试</div><h2>下一步，练得更精准。</h2><p>训练计划会针对你实际回答中的证据缺口安排练习，而不是泛泛推荐课程。</p></div><div className="plan-highlight"><div className="plan-icon">↗</div><div><span className="section-kicker">本轮核心缺口</span><h3>故障兜底 · Redis 缓存</h3><p>你能说明缓存的正常读写流程，但还缺少缓存击穿和 Redis 不可用时的处理方案。</p><div className="plan-meta"><span>预计 25 分钟</span><span>3 道练习题</span><span>复测：2026.09.11</span></div></div><button className="primary" onClick={onStart}>开始训练　→</button></div><div className="task-list"><div className="section-head"><div><span className="section-kicker">训练任务</span><h3>从缺口到证据</h3></div><span className="progress-text">0 / 3 完成</span></div>{['缓存击穿：识别高并发回源风险','方案设计：互斥锁与逻辑过期的取舍','故障演练：Redis 不可用时如何降级'].map((t,i) => <div className="task" key={t}><span className="task-num">0{i+1}</span><div><b>{t}</b><small>{['概念辨析 · 8 分钟','场景题 · 10 分钟','开放题 · 7 分钟'][i]}</small></div><button className="round-arrow" onClick={onStart}>→</button></div>)}</div></div> }
function ModelModal({ close, save }) {
  const [provider, setProvider] = useState('OpenAI Compatible');
  const [baseUrl, setBaseUrl] = useState('https://api.example.com/v1');
  const [model, setModel] = useState('your-model-name');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch('/api/models', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({provider,baseUrl,model,apiKey}) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      save();
    } catch (e) { window.alert(`保存失败：${e.message}`); } finally { setTesting(false); }
  };
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><span className="section-kicker">MODEL PROVIDER</span><h2>模型设置</h2></div><button className="close" onClick={close} aria-label="关闭模型设置">×</button></div><p className="modal-desc">支持主流模型和 OpenAI-compatible 中转。API Key 只在本次后端进程内存中使用，不写入浏览器存储或 Git。</p><label>供应商<select value={provider} onChange={e=>setProvider(e.target.value)}><option>OpenAI Compatible</option><option>OpenAI</option><option>DeepSeek</option><option>通义千问</option><option>Ollama（本地）</option></select></label><label>API Base URL<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} /></label><label>模型名称<input value={model} onChange={e=>setModel(e.target.value)} /></label><label>API Key<input value={apiKey} onChange={e=>setApiKey(e.target.value)} type="password" placeholder="sk-••••••••••••" autoComplete="off" /></label><div className="security-note">安全提示：不要在共享电脑使用生产 Key；关闭本地 API 服务后配置会失效。</div><div className="modal-actions"><button className="secondary" onClick={close}>取消</button><button className="primary" disabled={testing} onClick={test}>{testing ? '保存中…' : '保存并启用'}</button></div></div></div>;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);


