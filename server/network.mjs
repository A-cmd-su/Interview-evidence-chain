import http from "node:http";

export function configureProxy(
  env = process.env,
  apply = http.setGlobalProxyFromEnv,
) {
  if (!(env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY))
    return;
  if (typeof apply !== "function")
    throw new Error(
      "当前 Node.js 不支持内置网络代理，请安装最新 Node.js 24 LTS 或 26 后重试",
    );
  const noProxy = [
    env.no_proxy ?? env.NO_PROXY,
    "localhost",
    "127.0.0.1",
    "::1",
  ]
    .filter(Boolean)
    .join(",");
  return apply({ ...env, NO_PROXY: noProxy, no_proxy: noProxy });
}
