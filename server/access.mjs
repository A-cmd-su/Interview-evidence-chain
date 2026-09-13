import {
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(derive);
const ttl = 8 * 3600000;
export async function passwordRecord(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("访问密码需要12–256个字符");
  const salt = randomBytes(16).toString("hex");
  return {
    version: 1,
    salt,
    hash: (await scrypt(password, salt, 64)).toString("hex"),
  };
}
export function createAccess(record, { secure = false, now = Date.now } = {}) {
  if (
    record &&
    (record.version !== 1 ||
      !/^[a-f0-9]{32}$/.test(record.salt) ||
      !/^[a-f0-9]{128}$/.test(record.hash))
  )
    throw new Error("访问密码文件无效，请重新运行 npm run set-password");
  const sessions = new Map();
  // Single owner: bounded global limit also covers reverse proxies without trusting forwarded IPs.
  let attempts = 0,
    resetAt = 0;
  const cookieName = "evidence_access";
  const token = (req) =>
    (req.headers.cookie || "").match(
      /(?:^|;\s*)evidence_access=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
  const key = (t) =>
    createHash("sha256")
      .update(t || "")
      .digest("hex");
  const cookie = (t, age) =>
    `${cookieName}=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
  return {
    required: Boolean(record),
    authorized(req) {
      if (!record) return true;
      for (const [id, expires] of sessions)
        if (expires <= now()) sessions.delete(id);
      return (sessions.get(key(token(req))) || 0) > now();
    },
    async login(req, res, body) {
      if (!record) return;
      if (now() >= resetAt) {
        attempts = 0;
        resetAt = now() + 15 * 60000;
      }
      if (attempts >= 5) {
        res.setHeader("retry-after", Math.ceil((resetAt - now()) / 1000));
        throw Object.assign(new Error("登录尝试过多，请15分钟后重试"), {
          status: 429,
        });
      }
      attempts++;
      if (typeof body.password !== "string" || body.password.length > 256)
        throw Object.assign(new Error("密码不正确"), { status: 401 });
      const hash = await scrypt(body.password, record.salt, 64);
      if (!timingSafeEqual(hash, Buffer.from(record.hash, "hex")))
        throw Object.assign(new Error("密码不正确"), { status: 401 });
      attempts = 0;
      sessions.delete(key(token(req)));
      if (sessions.size >= 20) sessions.delete(sessions.keys().next().value);
      const next = randomBytes(32).toString("hex");
      sessions.set(key(next), now() + ttl);
      res.setHeader("set-cookie", cookie(next, ttl / 1000));
    },
    logout(req, res) {
      sessions.delete(key(token(req)));
      res.setHeader("set-cookie", [
        cookie("", 0),
        `evidence_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`,
      ]);
    },
  };
}
