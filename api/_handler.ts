/* ============================================================
 * Vercel Serverless Function 入口
 * 职责: 复用 server/routes 注册的 Express 路由,兼容 Vercel Lambda 环境。
 * 路由形态: /api/* 全部转发到此函数,Express 内部识别完整路径。
 * 备注: 仅在 Vercel/Serverless 环境使用;本地 dev 仍走 server/index.ts。
 * ============================================================ */

import express from "express";
import { registerRoutes } from "../server/routes";
import { createServer } from "node:http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false }));

let ready: Promise<void> | null = null;
function ensureRoutes() {
  if (!ready) {
    ready = registerRoutes(httpServer, app).then(() => {
      app.use((err: any, _req: any, res: any, _next: any) => {
        const status = err?.status || err?.statusCode || 500;
        res.status(status).json({ message: err?.message || "Internal Server Error" });
      });
    });
  }
  return ready;
}

export default async function handler(req: any, res: any) {
  await ensureRoutes();
  return app(req, res);
}
