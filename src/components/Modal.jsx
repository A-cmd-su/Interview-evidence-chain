import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Modal({ title, children, close, locked = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) close();
      }}
    >
      <div className="modal-title">
        <h2 id="modal-title">{title}</h2>
        <button
          className="close"
          onClick={close}
          disabled={locked}
          aria-label="关闭弹窗"
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SourceModal({ source, close }) {
  return (
    <Modal title={source.title} close={close}>
      <p>
        分析时的原文快照 · 字符区间 [{source.span.start}, {source.span.end})
      </p>
      <pre className="source-text">
        {source.text.slice(0, source.span.start)}
        <mark>{source.text.slice(source.span.start, source.span.end)}</mark>
        {source.text.slice(source.span.end)}
      </pre>
    </Modal>
  );
}
