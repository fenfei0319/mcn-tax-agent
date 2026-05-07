/* ============================================================
 * 脚本: 构建 Vercel Serverless 入口 (api/index.js)
 * 职责: 将 api/index.ts + 整个 server/ 打包为单文件 CJS,
 *      避免 Vercel @vercel/node 在 ESM + TS 路径解析下的兼容问题。
 * 产物: api/index.js (CommonJS,自包含业务依赖,第三方包外置)
 * ============================================================ */

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

await build({
  entryPoints: [path.join(root, "server/serverlessEntry.ts")],
  outfile: path.join(root, "api/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Vercel 安装的 node_modules 直接引用,不打进产物
  external: [
    "express",
    "express-session",
    "multer",
    "zod",
    "zod-validation-error",
    "xlsx",
    "ws",
    "memorystore",
    "passport",
    "passport-local",
    "@supabase/supabase-js",
  ],
  logLevel: "info",
});

console.log("[build-api] api/index.js 构建完成");
