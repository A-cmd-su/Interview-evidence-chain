import { createApp } from "../server/index.mjs";
import { passwordRecord } from "../server/access.mjs";
createApp({
  serveWeb: true,
  webRoot: "dist",
  passwordRecord: await passwordRecord("synthetic-browser-password"),
}).listen(8809, "127.0.0.1");
