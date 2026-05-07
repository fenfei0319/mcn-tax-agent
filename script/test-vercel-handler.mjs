/* 本地模拟 Vercel 调用 api/index.js 的 default handler */
import handler from "../api/index.js";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

console.log("[test] handler type:", typeof handler);
if (typeof handler !== "function") {
  console.error("[test] FAIL: default export is not a function");
  process.exit(1);
}

// 构造一个最小可用的 req/res 来驱动 Express
const socket = new Socket();
const req = new IncomingMessage(socket);
req.method = "GET";
req.url = "/api/talents";
req.headers = { host: "localhost", "user-agent": "test" };

const res = new ServerResponse(req);
let body = "";
res.write = (chunk) => { body += chunk; return true; };
res.end = (chunk) => {
  if (chunk) body += chunk;
  console.log("[test] status:", res.statusCode);
  console.log("[test] body:", body);
  process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 2);
};

handler(req, res).catch((e) => {
  console.error("[test] handler threw:", e);
  process.exit(3);
});

setTimeout(() => { console.error("[test] timeout"); process.exit(4); }, 5000);
