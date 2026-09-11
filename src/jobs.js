import { api } from "./api";
export async function pollJob(id, onStatus = () => {}) {
  for (;;) {
    const job = await api(`/jobs/${id}`);
    onStatus(job);
    if (job.status === "succeeded") return job.result;
    if (!["queued", "running"].includes(job.status))
      throw new Error(`${job.error || "任务未完成"}（请求 ID：${id}）`);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}
