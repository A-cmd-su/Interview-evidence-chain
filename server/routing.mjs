import { InputError } from "../shared/analyze.mjs";
import { credential } from "./credentials.mjs";
import { digest } from "./store.mjs";
import { validateConfig } from "./provider.mjs";

export const TASK_ROLES = [
  "briefing",
  "resume",
  "prepare",
  "analyze",
  "review",
  "equivalent",
  "mastery",
  "language",
];
export const safeConfig = ({ apiKey, ...config }) => config;
export function routeStamp(store, session) {
  const routes = store.get("routing").value || {};
  return digest({
    routes,
    current: session.config && safeConfig(session.config),
    profiles: store
      .profiles()
      .filter((p) => Object.values(routes).includes(p.id))
      .map((p) => [p.id, p.config]),
  });
}
export async function resolveRoutes(store, session, operation, input = {}) {
  const routes = store.get("routing").value || {};
  if (
    Object.values(routes).some(Boolean) &&
    session.routeConsent !== routeStamp(store, session)
  ) {
    throw new InputError(
      "任务接收方发生变化，请在模型分工中确认所有资料接收方",
    );
  }
  const roles =
    operation === "analyze"
      ? [
          "analyze",
          "review",
          ...(input.criterion ? ["mastery"] : []),
          ...(input.briefing?.languageSettings?.evaluate ? ["language"] : []),
        ]
      : [operation];
  const result = {};
  for (const role of roles) {
    const id = routes[role];
    if (!id) {
      result[role] = session.config;
      continue;
    }
    const profile = store.profiles().find((p) => p.id === id);
    if (!profile)
      throw new InputError("任务引用的模型档案已删除，请重新选择并确认");
    const key = profile.hasStoredKey
      ? (await credential("get", id)).secret
      : session.profileKeys?.get(id);
    try {
      result[role] = validateConfig({
        ...profile.config,
        baseUrl: profile.config.endpoint,
        apiKey: key || "",
      });
    } catch {
      throw new InputError(`请先解锁模型档案「${profile.name}」的 Key`);
    }
  }
  return result;
}
export function routingRoutes({ store, jobs, readBody, send }) {
  return async (req, res, s, path) => {
    const reply = (value) => {
      send(res, 200, value);
      return true;
    };
    if (path === "/api/routing" && req.method === "GET")
      return reply({
        routes: store.get("routing").value || {},
        confirmed: s.routeConsent === routeStamp(store, s),
        profiles: store.profiles().map((p) => ({
          ...p,
          unlocked: p.hasStoredKey || Boolean(s.profileKeys?.has(p.id)),
        })),
        acceptance: store.get("acceptance").value || [],
      });
    if (path === "/api/routing" && req.method === "PUT") {
      if (jobs.busy || s.busy)
        throw new InputError("请等待当前任务结束后修改模型分工");
      const b = await readBody(req);
      if (b.confirmRecipients !== true)
        throw new InputError("请确认列出的所有接收方会收到对应任务所需资料");
      const profiles = store.profiles();
      const routes = {};
      for (const role of TASK_ROLES) {
        const id = b.routes?.[role] || "";
        if (id && !profiles.some((p) => p.id === id))
          throw new InputError("模型档案不存在");
        routes[role] = id;
      }
      store.put("routing", routes);
      s.routeConsent = routeStamp(store, s);
      return reply({ routes, confirmed: true });
    }
    const match = path.match(/^\/api\/profiles\/([\w-]+)\/unlock$/);
    if (match && req.method === "POST") {
      if (jobs.busy || s.busy) throw new InputError("请等待当前任务结束");
      const p = store.profiles().find((p) => p.id === match[1]);
      if (!p) throw new InputError("模型档案不存在");
      const b = await readBody(req);
      const c = validateConfig({
        ...p.config,
        baseUrl: p.config.endpoint,
        apiKey: b.apiKey,
      });
      s.profileKeys ||= new Map();
      s.profileKeys.set(p.id, c.apiKey);
      return reply({ ok: true });
    }
    return false;
  };
}
