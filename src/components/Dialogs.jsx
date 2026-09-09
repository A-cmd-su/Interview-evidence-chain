import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export function Dialog({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="dialog-title">
    <div className="modal-head"><h2 id="dialog-title">{title}</h2><button className="close" onClick={close} aria-label="关闭弹窗">×</button></div>{children}
  </dialog>;
}
export function ModelModal({ close, saved }) {
  const [form, setForm] = useState({ provider: 'OpenAI Compatible / 中转', baseUrl: '', model: '', apiKey: '', jsonMode: false });
  const [busy, setBusy] = useState(''); const [message, setMessage] = useState('');
  const change = (name, value) => { setForm(f => ({ ...f, [name]: value })); setMessage(''); };
  async function send(action) {
    setBusy(action); setMessage('');
    try {
      const data = await api(action === 'test' ? '/models/test' : '/models', { method: 'POST', body: form });
      if (action === 'save') { saved(data.model); close(); }
      else setMessage(`连接成功，耗时 ${data.latencyMs} ms。${data.message}`);
    } catch (e) { setMessage(e.message); } finally { setBusy(''); }
  }
  return <Dialog title="模型设置" close={close}>
    <p className="modal-desc">兼容 Chat Completions 协议。可填写云模型、中转 API 根地址，或本机 Ollama / LM Studio 的兼容端点。原生协议需额外适配。</p>
    <form onSubmit={e => { e.preventDefault(); send('save'); }}>
      <fieldset disabled={Boolean(busy)}>
        <label>服务类型<select value={form.provider} onChange={e => change('provider', e.target.value)}>
          <option>OpenAI Compatible / 中转</option><option>DeepSeek / 通义 / Kimi 兼容接口</option><option>Ollama / LM Studio 本机接口</option>
        </select></label>
        <label>API Base URL 或完整 Chat Completions 地址<input required type="url" value={form.baseUrl} onChange={e => change('baseUrl', e.target.value)} placeholder="https://api.example.com/v1（也支持 /chat/completions）" /></label>
        <label>模型名称<input required maxLength={160} value={form.model} onChange={e => change('model', e.target.value)} placeholder="供应商提供的完整模型 ID" /></label>
        <label>API Key（本机无鉴权服务可留空）<input type="password" autoComplete="off" maxLength={4096} value={form.apiKey} onChange={e => change('apiKey', e.target.value)} /></label>
        <label className="check-label"><input type="checkbox" checked={form.jsonMode} onChange={e => change('jsonMode', e.target.checked)} />请求 JSON object 格式（仅服务支持时勾选）</label>
        <div className="security-note">Key 仅存后端当前会话内存，不写入浏览器持久存储。连接测试会向你填写的服务发送一条短请求，可能计费。保存配置不会自动测试。</div>
        <div className="modal-actions"><button type="button" className="secondary" onClick={() => send('test')}>测试连接</button><button className="primary" type="submit">保存配置</button></div>
      </fieldset>
    </form>
    {busy && <p role="status">{busy === 'test' ? '正在实际请求模型服务…' : '保存中…'}</p>}
    {message && <p className="notice" role="status">{message}</p>}
  </Dialog>;
}
export function SourceModal({ source, close }) {
  return <Dialog title={source.title} close={close}><p className="modal-desc">字符区间 [{source.span.start}, {source.span.end})，对应本次分析时保存的原文。</p>
    <pre className="source-text">{source.text.slice(0, source.span.start)}<mark>{source.text.slice(source.span.start, source.span.end)}</mark>{source.text.slice(source.span.end)}</pre>
  </Dialog>;
}
