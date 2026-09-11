import { randomUUID } from "node:crypto";
import { InputError, OutputError } from "../shared/analyze.mjs";
import { digest } from "./store.mjs";

export function createJobs(store) {
  const active = new Map();
  const publicJob = ({ fingerprint, ...job }) => job;
  return {
    get(id) {
      const j = store.job(id);
      if (!j) {
        const e = new InputError("请求 ID 不存在");
        e.status = 404;
        throw e;
      }
      return publicJob(j);
    },
    list: () => store.jobs().slice(0, 100).map(publicJob),
    start(id, operation, input, config, execute) {
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(id || ""))
        throw new InputError("请求 ID 无效");
      const fingerprint = digest({ operation, input, config });
      const old = store.job(id);
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new InputError("相同请求 ID 不得用于不同输入或配置");
        return publicJob(old);
      }
      if (active.size) {
        const e = new InputError("已有模型任务正在运行");
        e.status = 429;
        throw e;
      }
      const controller = new AbortController();
      const job = {
        id,
        operation,
        fingerprint,
        config: {
          model: config.model,
          endpoint: config.endpoint,
          protocol: config.protocol,
        },
        status: "running",
        createdAt: new Date().toISOString(),
      };
      store.saveJob(job);
      active.set(id, controller);
      Promise.resolve()
        .then(() => execute(controller.signal, id))
        .then((result) => {
          if (!controller.signal.aborted)
            Object.assign(job, { status: "succeeded", result });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            Object.assign(job, {
              status: "failed",
              error:
                error instanceof InputError ||
                error instanceof OutputError ||
                error.details?.code
                  ? error.message
                  : "程序处理失败，请查看请求 ID",
              failureType:
                error instanceof OutputError
                  ? "model_format"
                  : error.details?.code || "program_error",
            });
        })
        .finally(() => {
          if (controller.signal.aborted)
            Object.assign(job, {
              status: "cancelled",
              error: "已请求取消上游调用；已产生的费用不一定能撤销。",
            });
          job.finishedAt = new Date().toISOString();
          job.latencyMs = Date.now() - Date.parse(job.createdAt);
          store.saveJob(job);
          active.delete(id);
        });
      return publicJob(job);
    },
    cancel(id) {
      const controller = active.get(id);
      controller?.abort();
      return { ...this.get(id), cancellationRequested: Boolean(controller) };
    },
    get busy() {
      return active.size > 0;
    },
    close() {
      for (const controller of active.values()) controller.abort();
    },
    newId: randomUUID,
  };
}
