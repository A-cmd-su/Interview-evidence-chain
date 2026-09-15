import React, { useEffect, useRef, useState } from "react";
import { Volume2, Square } from "lucide-react";

export function QuestionReadout({ text, language, disabled }) {
  const utterance = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const supported = Boolean(
    window.speechSynthesis && window.SpeechSynthesisUtterance,
  );
  const stop = () => {
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current = null;
      window.speechSynthesis?.cancel();
    }
    setSpeaking(false);
  };
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);
  useEffect(() => {
    const onExpired = () => stop();
    window.addEventListener("access-expired", onExpired);
    return () => {
      stop();
      window.removeEventListener("access-expired", onExpired);
    };
  }, [text, language]);
  function read() {
    if (!supported || disabled) return;
    stop();
    setError("");
    const next = new SpeechSynthesisUtterance(text);
    next.lang = language;
    next.rate = 1;
    const localVoice = window.speechSynthesis
      .getVoices()
      .find(
        (voice) =>
          voice.localService && voice.lang.replace("_", "-") === language,
      );
    if (localVoice) next.voice = localVoice;
    next.onend = () => {
      if (utterance.current === next) stop();
    };
    next.onerror = () => {
      if (utterance.current !== next) return;
      stop();
      setError("题目朗读不可用，请阅读上方题目后回答。");
    };
    utterance.current = next;
    setSpeaking(true);
    try {
      window.speechSynthesis.speak(next);
    } catch {
      stop();
      setError("题目朗读未能启动，请阅读上方题目。");
    }
  }
  return (
    <div className="question-readout">
      <button
        type="button"
        className="secondary"
        disabled={disabled || !supported}
        onClick={speaking ? stop : read}
      >
        {speaking ? (
          <Square size={16} aria-hidden="true" />
        ) : (
          <Volume2 size={16} aria-hidden="true" />
        )}
        {speaking ? "停止朗读" : "朗读本题"}
      </button>
      <small>
        {supported
          ? "由浏览器朗读；可能使用其在线语音服务。开始录制时自动停止朗读。"
          : "当前浏览器不支持题目朗读。"}
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
