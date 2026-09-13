import React, { useEffect, useRef, useState } from "react";
import { AsrUpload } from "./AsrUpload";

export function MediaInput({
  kind = "voice",
  language = "zh-CN",
  onConfirm,
  disabled,
  onActiveChange,
  deviceOnly = false,
}) {
  const camera = kind === "video";
  const state = useRef({
    generation: 0,
    stream: null,
    recorder: null,
    speech: null,
    timer: null,
    url: "",
    raw: "",
    active: false,
    stopping: false,
  });
  const live = useRef(null);
  const [phase, setPhase] = useState("idle"),
    [url, setUrl] = useState("");
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  const [consent, setConsent] = useState(false),
    [transcribe, setTranscribe] = useState(false);
  const [seconds, setSeconds] = useState(0),
    [devices, setDevices] = useState([]);
  const [microphone, setMicrophone] = useState(""),
    [videoDevice, setVideoDevice] = useState("");
  const [level, setLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null),
    [uploading, setUploading] = useState(false);
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  const active = ["starting", "recording", "preview", "stopping"].includes(
    phase,
  );
  const id = camera ? "video-transcript" : "transcript";
  const release = () => {
    const s = state.current;
    clearInterval(s.timer);
    clearInterval(s.levelTimer);
    s.audioContext?.close().catch(() => {});
    s.audioContext = null;
    s.speech?.abort();
    s.speech = null;
    if (s.audioRecorder) {
      s.audioRecorder.ondataavailable = null;
      s.audioRecorder.onstop = null;
      if (s.audioRecorder.state !== "inactive") s.audioRecorder.stop();
      s.audioRecorder = null;
    }
    if (s.recorder) {
      s.recorder.onstop = null;
      s.recorder.ondataavailable = null;
      s.recorder.onerror = null;
      if (s.recorder.state !== "inactive") s.recorder.stop();
    }
    s.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    s.stream = null;
    s.recorder = null;
    s.active = false;
    s.stopping = false;
    if (live.current) live.current.srcObject = null;
  };
  const clearMedia = () => {
    setAudioBlob(null);
    if (state.current.url) URL.revokeObjectURL(state.current.url);
    state.current.url = "";
    setUrl("");
  };
  useEffect(() => {
    const leave = (e) => {
      if (state.current.active || state.current.url) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const expired = () => {
      state.current.generation++;
      release();
      clearMedia();
      setPhase("idle");
    };
    window.addEventListener("beforeunload", leave);
    window.addEventListener("access-expired", expired);
    return () => {
      state.current.generation++;
      release();
      if (state.current.url) URL.revokeObjectURL(state.current.url);
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("access-expired", expired);
    };
  }, []);
  useEffect(() => {
    onActiveChange?.(active || uploading);
    return () => onActiveChange?.(false);
  }, [active, uploading, onActiveChange]);
  const stop = () => {
    const s = state.current;
    if (!s.recorder || s.recorder.state === "inactive") {
      s.generation++;
      release();
      setPhase("idle");
      return;
    }
    clearInterval(s.timer);
    s.speech?.stop();
    s.stopping = true;
    setPhase("stopping");
    if (s.audioRecorder?.state === "recording") s.audioRecorder.stop();
    s.recorder.stop();
  };
  useEffect(() => {
    const escape = (e) => {
      if (e.key === "Escape" && active) {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [active]);
  async function start(previewOnly = false) {
    if (state.current.active || disabled || uploading || !consent) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      (!previewOnly && !window.MediaRecorder)
    ) {
      setError(
        "录制不可用，请使用 HTTPS 或 localhost 并检查浏览器支持。你仍可填写文字回答。",
      );
      return;
    }
    const s = state.current,
      generation = ++s.generation;
    s.active = true;
    s.stopping = false;
    setPhase("starting");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: microphone ? { deviceId: { exact: microphone } } : true,
        video: camera
          ? videoDevice
            ? { deviceId: { exact: videoDevice } }
            : {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 360 },
              }
          : false,
      });
      if (s.generation !== generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      s.stream = stream;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        try {
          const audio = new AudioContext();
          s.audioContext = audio;
          const analyser = audio.createAnalyser();
          analyser.fftSize = 256;
          audio.createMediaStreamSource(stream).connect(analyser);
          audio.resume().catch(() => {});
          const data = new Uint8Array(analyser.fftSize);
          s.levelTimer = setInterval(() => {
            analyser.getByteTimeDomainData(data);
            const rms = Math.sqrt(
              data.reduce((sum, x) => sum + ((x - 128) / 128) ** 2, 0) /
                data.length,
            );
            setLevel(Math.min(100, Math.round(rms * 400)));
          }, 150);
        } catch {
          /* Recording remains available without a volume meter. */
        }
      }
      navigator.mediaDevices
        .enumerateDevices?.()
        .then((items) => {
          if (s.generation === generation) setDevices(items);
        })
        .catch(() => {});
      if (live.current) {
        live.current.srcObject = stream;
        live.current.play().catch(() => {});
      }
      if (previewOnly) {
        setPhase("preview");
        setSeconds(0);
        let elapsed = 0;
        s.timer = setInterval(() => {
          setSeconds(++elapsed);
          if (elapsed >= 30) stop();
        }, 1000);
        return;
      }
      clearMedia();
      setText("");
      s.raw = "";
      setSeconds(0);
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      let audioDone = Promise.resolve(null);
      if (camera) {
        const audioRecorder = new MediaRecorder(
          new MediaStream(stream.getAudioTracks()),
        );
        s.audioRecorder = audioRecorder;
        const audioChunks = [];
        audioRecorder.ondataavailable = (e) => {
          if (e.data.size) audioChunks.push(e.data);
        };
        audioDone = new Promise((resolve) => {
          audioRecorder.onstop = () =>
            resolve(new Blob(audioChunks, { type: audioRecorder.mimeType }));
        });
        audioRecorder.start(1000);
      }
      s.recorder = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size && generation === s.generation) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        if (generation !== s.generation) return;
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (s.audioRecorder?.state === "recording") s.audioRecorder.stop();
        const audio = camera ? await audioDone : blob;
        if (generation !== s.generation) return;
        release();
        setAudioBlob(audio?.size ? audio : null);
        if (blob.size) {
          s.url = URL.createObjectURL(blob);
          setUrl(s.url);
        } else
          setError("录制过短，未产生可回放媒体，请重新录制。文字可继续校对。");
        setPhase("idle");
      };
      recorder.onerror = () => {
        stop();
        setError("录制中断，请检查设备后重试。已有回答草稿保留。");
      };
      stream.getTracks().forEach((t) => {
        t.onended = () => {
          if (generation === s.generation) {
            stop();
            setError("设备已断开，请检查后重试。");
          }
        };
      });
      recorder.start(1000);
      setPhase("recording");
      let elapsed = 0;
      s.timer = setInterval(() => {
        setSeconds(++elapsed);
        if (elapsed >= 180) stop();
      }, 1000);
      if (transcribe && Speech) {
        try {
          const speech = new Speech();
          s.speech = speech;
          speech.lang = language;
          speech.continuous = true;
          speech.interimResults = false;
          speech.onresult = (e) => {
            if (s.generation !== generation || !s.active) return;
            let chunk = "";
            for (let i = e.resultIndex; i < e.results.length; i++)
              if (e.results[i].isFinal)
                chunk += e.results[i][0].transcript + " ";
            s.raw = (s.raw + chunk).slice(0, 8000);
            setText(s.raw);
          };
          speech.onerror = () => {
            if (s.generation === generation && s.active)
              setError("自动转写不可用，录制继续。结束后回听并手工校对。");
          };
          speech.onend = () => {
            if (s.active && !s.stopping && s.generation === generation) {
              try {
                speech.start();
              } catch {
                /* The browser may reject an immediate restart. */
              }
            }
          };
          speech.start();
        } catch {
          setError("自动转写未启动，录制继续。请回听并校对文字。");
        }
      }
    } catch (e) {
      if (s.generation !== generation) return;
      release();
      setPhase("idle");
      setError(
        e.name === "NotAllowedError"
          ? "摄像头或麦克风权限被拒绝，请在地址栏允许权限后重试，也可以直接输入文字。"
          : "设备不可用或被占用，请检查摄像头/麦克风后重试。",
      );
    }
  }
  return (
    <details className={camera ? "video-input" : "voice-input"}>
      <summary>
        {deviceOnly
          ? "面试前设备检查"
          : camera
            ? "视频面试控制台"
            : "可选：语音回答与转写校对"}
      </summary>
      <p>
        {deviceOnly
          ? "先测试麦克风音量与摄像头。测试最多30秒，不录制、不调用模型。"
          : "每段最多3分钟。媒体只留在本页，切题或离开面试页会清理。评分只发送确认后的文字；不分析表情、情绪或性格。"}
      </p>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={active}
          onChange={(e) => setConsent(e.target.checked)}
        />
        允许{camera ? "摄像头与" : ""}麦克风{deviceOnly ? "访问" : "录制"}
      </label>
      {!deviceOnly && (
        <label className="consent">
          <input
            type="checkbox"
            checked={transcribe}
            disabled={active || !Speech}
            onChange={(e) => setTranscribe(e.target.checked)}
          />
          开启浏览器自动转写：音频可能发送至浏览器供应商，需人工校对
        </label>
      )}
      {!Speech && !deviceOnly && (
        <p>浏览器不支持自动转写，可回听录制并手工输入。</p>
      )}
      <div className="preparation-settings media-devices">
        <label>
          麦克风
          <select
            value={microphone}
            disabled={active}
            onChange={(e) => setMicrophone(e.target.value)}
          >
            <option value="">系统默认</option>
            {devices
              .filter((d) => d.kind === "audioinput")
              .map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "麦克风"}
                </option>
              ))}
          </select>
        </label>
        {camera && (
          <label>
            摄像头
            <select
              value={videoDevice}
              disabled={active}
              onChange={(e) => setVideoDevice(e.target.value)}
            >
              <option value="">默认前置摄像头</option>
              {devices
                .filter((d) => d.kind === "videoinput")
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "摄像头"}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {camera && (
        <div className="video-stage">
          <video
            ref={live}
            autoPlay
            muted
            playsInline
            aria-label="摄像头预览"
          />
          {url && (
            <video src={url} controls playsInline aria-label="录制回放" />
          )}
        </div>
      )}
      {!camera && url && <audio controls src={url} aria-label="录音回放" />}
      {active && (
        <label>
          麦克风音量{" "}
          <meter min="0" max="100" value={level} aria-label="麦克风音量" />{" "}
          {level}%
        </label>
      )}
      <p role="status">
        {phase === "starting"
          ? "等待设备权限…"
          : phase === "preview"
            ? `设备测试中 ${seconds}/30秒`
            : phase === "recording"
              ? `正在录制 ${seconds}/180秒，Esc 停止`
              : phase === "stopping"
                ? "正在生成回放…"
                : deviceOnly
                  ? "设备未启用"
                  : "录制已停止；可以校对文字"}
      </p>
      <div className="button-row">
        {active ? (
          <button className="secondary" type="button" onClick={stop}>
            停止{camera ? "视频与转写" : "录音与转写"}
          </button>
        ) : (
          <>
            <button
              className="secondary"
              type="button"
              disabled={disabled || !consent}
              onClick={() => start(true)}
            >
              测试设备（30秒）
            </button>
            {!deviceOnly && (
              <button
                className="secondary"
                type="button"
                disabled={disabled || !consent}
                onClick={() => start()}
              >
                {camera ? "开始视频面试" : "开始录音"}
              </button>
            )}
          </>
        )}
        {url && (
          <button
            className="text-button"
            type="button"
            disabled={active || uploading}
            onClick={clearMedia}
          >
            清理本地{camera ? "视频" : "录音"}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {!deviceOnly && (
        <AsrUpload
          blob={audioBlob}
          language={language}
          seconds={seconds}
          disabled={active || disabled}
          onBusy={setUploading}
          onResult={(value) => {
            state.current.raw = value;
            setText(value);
          }}
        />
      )}
      {!deviceOnly && (
        <>
          <label htmlFor={id}>转写校对</label>
          <textarea
            id={id}
            maxLength={8000}
            value={text}
            disabled={active || disabled || uploading}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="secondary"
            type="button"
            disabled={disabled || active || uploading || !text.trim()}
            onClick={() =>
              onConfirm(text, {
                kind,
                rawTranscript: state.current.raw,
                confirmedText: text,
                confirmedAt: new Date().toISOString(),
              })
            }
          >
            确认文字，填入回答
          </button>
        </>
      )}
    </details>
  );
}
