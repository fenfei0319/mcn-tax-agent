/* ============================================================
 * Vercel 部署专用构建脚本
 * 职责:
 *   1. 用 Vite 构建前端到 dist/public(Vercel 自动 serve)
 *   2. 用 esbuild 把 api/[...all].ts 与整个 server/ 打包成单文件 api/index.js
 *   3. 解决 @shared / @ alias、ESM/CJS 互操作、Serverless cold-start 体积
 * 注意: 不使用 better-sqlite3(已在 v1.4 移除),所有数据走内存。
 * ============================================================ */

import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

async function buildVercel() {
  /* 1. 清理输出 */
  await rm("dist", { recursive: true, force: true });

  /* 2. 构建前端 */
  console.log("building client for Vercel...");
  await viteBuild();

  /* 3. 打包 Serverless Function */
  console.log("bundling Serverless function...");
  await mkdir("api", { recursive: true });

  await esbuild({
    entryPoints: ["api/_handler.ts"],
    platform: "node",
    target: "node20",
    bundle: true,
    format: "cjs",
    outfile: "api/[...all].js",
    /* 内联所有依赖避免 Vercel runtime 找不到模块 */
    external: ["aws-sdk", "mock-aws-s3", "nock"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    /* 解析 tsconfig paths */
    tsconfig: "tsconfig.json",
    logLevel: "info",
    loader: { ".node": "file" },
    banner: {
      js: "/* MCN Tax Agent - Vercel Serverless bundle */",
    },
    /* footer: 把 esbuild 默认输出的 module.exports={default:handler} 拆包,
     * 让 Vercel runtime 能直接 require() 拿到 handler 函数 */
    footer: {
      js: "if (module.exports && module.exports.default) { module.exports = module.exports.default; }",
    },
  });

  /* 4. 写 api/package.json 覆盖项目根的 "type":"module",
   *   让 api/[...all].js 被 Node 当 CommonJS 加载 */
  await writeFile(
    path.resolve("api/package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
  );

  console.log("\nVercel build complete.");
  console.log("  dist/public        - 静态资源");
  console.log("  api/[...all].js    - Serverless function");
}

buildVercel().catch((err) => {
  console.error(err);
  process.exit(1);
});
