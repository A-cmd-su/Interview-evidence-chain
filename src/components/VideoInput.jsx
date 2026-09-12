import React, { useEffect, useRef, useState } from "react";

const MAX_RECORDING_MS = 180000;

export function VideoInput({ onConfirm, disabled, language = "zh-CN" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recognizerRef = useRef(null);
  const timerRef = useRef(null);
  const urlRef = useRef("");
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      recognizerRef.current?.abort();
      if (recorderRef.current?.state === "recording")
        recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("当前浏览器不支持摄像头录制，请改用文字或语言面试。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      setPreview("");
      setText("");
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const url = URL.createObjectURL(
          new Blob(chunks, { type: recorder.mimeType || "video/webm" }),
        );
        urlRef.current = url;
        setPreview(url);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
      timerRef.current = setTimeout(stop, MAX_RECORDING_MS);
      if (Speech) {
        const speech = new Speech();
        recognizerRef.current = speech;
        speech.lang = language;
        speech.continuous = true;
        speech.interimResults = false;
        speech.onresult = (event) => {
          let chunk = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal)
              chunk += event.results[i][0].transcript;
          }
          setText((current) => (current + chunk).slice(0, 8000));
        };
        speech.onerror = () =>
          setError(
            "浏览器转写未完成，请回看视频并手动校对文字。视频不会自动上传。",
          );
        speech.start();
      }
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setError(
        "摄像头或麦克风权限未开启，请允许权限后重试，也可以改用文字面试。",
      );
    }
  }

  function stop() {
    clearTimeout(timerRef.current);
    recognizerRef.current?.stop();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  return (
    <details className="video-input">
      <summary>视频面试控制台</summary>
      <p>
        最长录制3分钟。视频仅保留在当前页面用于回看，默认不会上传；只有你确认后的文字转写会发送给在线评分模型。不会分析表情、情绪、性格或颜值。
      </p>
      {!Speech && <p>此浏览器不支持自动转写，请回看视频并手工填写转写。</p>}
      <p className="device-check" role="status">
        设备检查：摄像头与麦克风{" "}
        {navigator.mediaDevices?.getUserMedia ? "可检测" : "不可用"} · 录制{" "}
        {window.MediaRecorder ? "浏览器支持" : "不可用"} · 转写{" "}
        {Speech ? "浏览器支持" : "需手动校对"}
      </p>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={recording}
        />
        允许摄像头、麦克风录制{Speech ? "及浏览器供应商的语音转写" : ""}
      </label>
      <div className="video-stage">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="摄像头预览"
        />
        {preview && (
          <video src={preview} controls playsInline aria-label="录制回放" />
        )}
      </div>
      <button
        type="button"
        className="secondary"
        disabled={disabled || !consent}
        onClick={recording ? stop : start}
      >
        {recording ? "停止视频与转写" : "开始视频面试"}
      </button>
      <label htmlFor="video-transcript">转写校对</label>
      <textarea
        id="video-transcript"
        maxLength={8000}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={recording || disabled}
        placeholder="回看视频后，校对为你实际说出的内容…"
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
      {preview && (
        <button
          type="button"
          className="text-button"
          disabled={recording}
          onClick={() => {
            URL.revokeObjectURL(preview);
            urlRef.current = "";
            setPreview("");
          }}
        >
          清理本地视频
        </button>
      )}
    </details>
  );
}
