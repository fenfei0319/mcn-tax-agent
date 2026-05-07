/* ============================================================
 * Vercel Serverless Function 入口 (api/index.ts)
 * 职责: 复用 server/routes 里的 Express 路由处理所有 /api/* 请求
 * 路由: vercel.json 通过 rewrites 把 /api/(.*) 全部转发到此函数
 * 备注: 本地开发仍走 server/index.ts;此文件仅在 Vercel 上被调用
 * ============================================================ */

import express from "express";
import type { Request, Response } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

let initPromise: Promise<void> | null = null;
function ensureRoutes(): Promise<void> {
  if (!initPromise) {
    initPromise = registerRoutes(httpServer, app).then(() => {
      app.use((err: any, _req: Request, res: Response, _next: any) => {
        const status = err?.status || err?.statusCode || 500;
        res.status(status).json({ message: err?.message || "Internal Server Error" });
      });
    });
  }
  return initPromise;
}

export default async function handler(req: Request, res: Response) {
  await ensureRoutes();
  return app(req, res);
}
