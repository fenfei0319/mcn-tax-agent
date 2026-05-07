# MCN 达人个税申报 Agent

面向 MCN 机构财务人员的「达人个税核验—试算—申报」一体化操作台。覆盖从达人档案、双源身份核验、收入登记、税额试算、批量同步、申报导出到核验日志的完整月度作业链路。

> 当前版本:**v1.3 体验细化**
> 完整产品需求与版本演进见 [PRD.md](./PRD.md)。

---

## 在线 Demo

项目已适配 Vercel 一键部署(内置 Serverless Function + 静态主机):

1. 访问 [vercel.com/new](https://vercel.com/new) 使用 GitHub 账号登录
2. 导入本仓库 `fenfei0319/mcn-tax-agent`
3. 保留默认设置(Vercel 会识别 `vercel.json` 的 `vercel-build` 脚本)点击 Deploy
4. ~30 秒后得到形如 `https://mcn-tax-agent.vercel.app` 的公网链接

本地运行见下方「快速开始」,一条命令启动。

---

## 核心能力

| 模块 | 能力 |
| ---- | ---- |
| 达人档案 | 三/四要素录入、签约关系与所得类型登记、详情抽屉 |
| 双源验证 | 单条核验(三/四要素 Mock 算法) + 批量比对(税务 Excel × 平台流水) |
| 收入登记 | 仅展示已通过双源验证的可靠收入,支持手工补录零散场景 |
| 税额试算 | 按所得类型自动套用税率表,展示应纳税所得额、税率、速算扣除、税额、净收入 |
| 批量同步 | 一键从小红书拉取本期结算流水 → 自动核验 → 自动计税 → 自动入库;兜底支持 CSV 粘贴 |
| 申报导出 | 输出符合自然人电子税务局批量导入模板的 CSV 文件 |
| 核验日志 | 6 项筛选 + 11 列业务字段(收入/税额/所属期/签约关系/来源等),支持事后复核 |

---

## 技术栈

- **前端**: React 18 + Vite + TypeScript + Tailwind CSS v3 + shadcn/ui + TanStack Query + wouter
- **后端**: Express + TypeScript
- **数据**: 内存 Map(零依赖,备期可中心化替换为 SQL/Supabase)
- **构建**: tsx + esbuild + Vite
- **部署**: Vercel Serverless(静态资源 + API 函数分离)

## 架构原则

1. **模块解耦**:每个业务模块(talentRepo / kycLogRepo / batchRunner / xhsTalentSource …)单一职责,模块间仅通过明确接口调用。
2. **UI 与逻辑分离**:所有 UI 面板通过 `client/src/lib/api.ts` 统一访问后端,UI 层重写不影响业务模块。
3. **统一中文注释**:每个模块顶部以中文标注「模块/职责/接口」三段。

详见 PRD「七、技术与架构原则」与「12.5 / 13.5 解耦原则落实」章节。

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务(前后端同端口 5000)
npm run dev

# 3. 浏览器打开
open http://localhost:5000
```

首次启动时,SQLite 数据库 `data.db` 会自动创建并建表。无需任何环境变量。

### 生产构建

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

---

## 目录结构

```
mcn-tax-agent/
├── client/                 # 前端 React 应用
│   └── src/
│       ├── modules/        # 7 大业务面板(KycPanel / IncomePanel / ...)
│       ├── lib/            # API 封装、格式化助手
│       └── pages/          # 路由页面
├── server/                 # Express 后端
│   ├── modules/            # 业务模块(talentRepo / kycLogRepo / batchRunner / xhsTalentSource ...)
│   ├── routes.ts           # 路由注册(薄壳层)
│   └── db.ts               # SQLite 连接与建表
├── shared/                 # 前后端共享 schema(Drizzle + Zod)
└── PRD.md                  # 完整产品需求文档
```

---

## 版本演进

| 版本 | 主题 |
| ---- | ---- |
| v1.0 | MVP:7 模块完整链路 |
| v1.1 | 批量处理与 CSV 导出 |
| v1.2 | 双源验证拆分 + 小红书一键同步 |
| v1.3 | 体验细化:核验日志复核视图、数字样式标准化、文案克制化 |
| v1.4 | 部署适配:数据层从 SQLite 重构为内存存储 + Vercel Serverless |

每个版本的设计目标、变更明细与架构落实详见 PRD 各章节。
