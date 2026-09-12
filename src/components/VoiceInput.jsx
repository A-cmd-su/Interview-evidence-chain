import React, { useEffect, useRef, useState } from "react";
export function VoiceInput({ onConfirm, disabled, language = "zh-CN" }) {
  const recorder = useRef(null),
    stream = useRef(null),
    recognizer = useRef(null),
    audioRef = useRef(null);
  const limitTimer = useRef(null);
  const [recording, setRecording] = useState(false),
    [audio, setAudio] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false);
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  useEffect(
    () => () => {
      clearTimeout(limitTimer.current);
      recorder.current?.state === "recording" && recorder.current.stop();
      recognizer.current?.abort();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (audioRef.current) URL.revokeObjectURL(audioRef.current);
    },
    [],
  );
  async function start() {
    setError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (audioRef.current) URL.revokeObjectURL(audioRef.current);
      setAudio("");
      setText("");
      const chunks = [];
      const r = new MediaRecorder(stream.current);
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: r.mimeType }));
        audioRef.current = url;
        setAudio(url);
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      r.start();
      setRecording(true);
      limitTimer.current = setTimeout(stop, 180000);
      if (Speech) {
        const speech = new Speech();
        recognizer.current = speech;
        speech.lang = language;
        speech.continuous = true;
        speech.interimResults = false;
        speech.onresult = (e) => {
          let chunk = "";
          for (let i = e.resultIndex; i < e.results.length; i++)
            if (e.results[i].isFinal) chunk += e.results[i][0].transcript;
          setText((t) => (t + chunk).slice(0, 8000));
        };
        speech.onerror = () =>
          setError(
            "浏览器转写未完成，请听录音手动校对文字，或重试转写。录音不会自动进入评分。",
          );
        speech.start();
      }
    } catch {
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setError(
        "麦克风或浏览器转写不可用，请允许权限后重试。也可以使用文字回答。",
      );
    }
  }
  function stop() {
    clearTimeout(limitTimer.current);
    recognizer.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  return (
    <details className="voice-input">
      <summary>可选：语音回答与转写校对</summary>
      <p>
        每段最多3分钟，录音只保留在本页。浏览器语音识别可能将音频发送给浏览器供应商；仅确认后的文字会发送给评分模型。不会分析情绪、性格或表情。
      </p>
      {!Speech && (
        <p>
          此浏览器不支持自动语音识别，可录音回听并手工填写转写；建议使用支持 Web
          Speech 的浏览器开启自动转写。
        </p>
      )}
      <p className="device-check" role="status">
        设备检查：麦克风{" "}
        {navigator.mediaDevices?.getUserMedia ? "可检测" : "不可用"} · 转写{" "}
        {Speech ? "浏览器支持" : "需手动校对"}
      </p>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={recording}
        />
        允许麦克风录音{Speech ? "及浏览器供应商的语音转写" : ""}
      </label>
      <button
        type="button"
        className="secondary"
        disabled={disabled || !consent}
        onClick={recording ? stop : start}
      >
        {recording ? "停止录音与转写" : "开始录音"}
      </button>
      {audio && <audio controls src={audio} />}
      {audio && (
        <button
          type="button"
          className="text-button"
          disabled={recording}
          onClick={() => {
            URL.revokeObjectURL(audio);
            audioRef.current = null;
            setAudio("");
          }}
        >
          清理本地录音
        </button>
      )}
      <label htmlFor="transcript">转写校对</label>
      <textarea
        id="transcript"
        maxLength={8000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={recording || disabled}
      />
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="secondary"
        disabled={disabled || recording || !text.trim()}
        onClick={() => onConfirm(text)}
      >
        确认文字，填入回答
      </button>
    </details>
  );
}
