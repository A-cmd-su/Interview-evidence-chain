import http from "node:http";
import { createApp } from "../server/index.mjs";
import { fixtureFetch, chatResponse } from "./fixtures.mjs";
// HTTP test provider only. Never imported by product source.
http
  .createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const sys = body.messages?.find((m) => m.role === "system")?.content || "";
    const user = body.messages?.find((m) => m.role === "user")?.content || "{}";
    let response;
    if (sys.includes("任务=resume")) {
      const data = JSON.parse(user);
      response = chatResponse({
        items: [{ kind: "项目", quote: data.resume, start: 0 }],
      });
    } else if (sys.includes("任务=equivalent"))
      response = chatResponse({
        question: "在跨部门交付延期的情境中，你会如何识别风险并制定回退条件？",
        equivalenceReason:
          "仍考察风险识别、本人行动与回退验证，但更换为交付场景。",
      });
    else if (sys.includes("任务=mastery")) {
      const d = JSON.parse(user);
      response = chatResponse({
        passed: true,
        quote: d.answer,
        reason: "新回答说明了本人行动、风险阈值和验证方法。",
      });
    } else
      response = await fixtureFetch(req.url, { body: JSON.stringify(body) });
    const data = await response.json();
    data.usage = {
      prompt_tokens: 123,
      completion_tokens: 45,
      total_tokens: 168,
    };
    if (sys.includes("任务=analyze"))
      await new Promise((r) => setTimeout(r, 700));
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  })
  .listen(8798, "127.0.0.1");
createApp({ webPort: 5199 }).listen(8799, "127.0.0.1");
