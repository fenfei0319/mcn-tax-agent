/* ============================================================
 * 模块: API 网关 (Express Routes)
 * 职责: 接收 HTTP 请求 → 参数校验 → 调用对应核心模块 → 包装响应。
 *      本层不含任何业务规则,所有逻辑下沉至 modules/*。
 * ============================================================ */

import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { z } from "zod";
import multer from "multer";
import { insertTalentSchema, insertIncomeSchema } from "@shared/schema";

import { talentRepo } from "./modules/talentRepo";
import { incomeRepo } from "./modules/incomeRepo";
import { kycProvider } from "./modules/kycProvider";
import { kycLogRepo } from "./modules/kycLogRepo";
import { calculate } from "./modules/taxEngine";
import { buildFilingCsv, buildFilingFileName, type FilingRow } from "./modules/filingBuilder";
import { runBatch, type BatchRow } from "./modules/batchRunner";
import { TaxExcelSource, buildExcelTemplate } from "./modules/xlsxParser";
import { xhsTalentSource } from "./modules/xhsTalentSource";
import { reconcile, type ReconcileRow } from "./modules/reconcileEngine";

/* ---------- 文件上传中间件(内存存储,20MB 上限) ---------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/* ---------- 工具: 统一响应 ---------- */
const ok = (res: Response, data: any) => res.json({ success: true, data });
const fail = (res: Response, msg: string, code = 400) =>
  res.status(code).json({ success: false, error: msg });

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  /* ============== 路由组 1: 达人档案 ============== */
  app.get("/api/talents", (req, res) => {
    const keyword = String(req.query.keyword ?? "");
    ok(res, talentRepo.list(keyword));
  });

  app.post("/api/talents", (req, res) => {
    const parsed = insertTalentSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "参数错误: " + parsed.error.message);
    if (talentRepo.getByIdCard(parsed.data.idCard)) {
      return fail(res, "该身份证号已存在");
    }
    ok(res, talentRepo.create(parsed.data));
  });

  app.patch("/api/talents/:id", (req, res) => {
    const id = Number(req.params.id);
    const t = talentRepo.update(id, req.body);
    if (!t) return fail(res, "达人不存在", 404);
    ok(res, t);
  });

  app.delete("/api/talents/:id", (req, res) => {
    const id = Number(req.params.id);
    ok(res, { removed: talentRepo.remove(id) });
  });

  /* ============== 路由组 2: 身份核验 ============== */
  const verifySchema = z.object({
    mode: z.enum(["two", "three", "four"]),
    name: z.string().min(1),
    idCard: z.string().min(15),
    mobile: z.string().optional(),
    bankCard: z.string().optional(),
    talentId: z.number().optional(),
  });
  app.post("/api/verify", async (req, res) => {
    const p = verifySchema.safeParse(req.body);
    if (!p.success) return fail(res, "参数错误: " + p.error.message);
    const result = await kycProvider.verify(p.data);
    /* v1.3 日志补全:带上达人姓名与来源标签 */
    const linkedTalent = p.data.talentId ? talentRepo.getById(p.data.talentId) : undefined;
    kycLogRepo.add({
      talentId: p.data.talentId ?? null,
      talentName: linkedTalent?.name ?? p.data.name ?? null,
      mode: p.data.mode,
      passed: result.passed ? 1 : 0,
      reason: result.reason,
      traceId: result.traceId,
      source: "single",
      period: null,
      incomeType: linkedTalent?.incomeType ?? null,
      relation: linkedTalent?.relation ?? null,
      amount: null,
      taxAmount: null,
    });
    if (p.data.talentId) {
      talentRepo.setKycStatus(p.data.talentId, result.passed ? "verified" : "failed");
    }
    ok(res, result);
  });

  app.get("/api/kyc-logs", (_req, res) => ok(res, kycLogRepo.listAll()));

  /* ============== 路由组 3: 收入登记 + 税额 ============== */
  app.get("/api/incomes", (req, res) => {
    const period = req.query.period ? String(req.query.period) : undefined;
    ok(res, incomeRepo.list(period));
  });

  app.post("/api/incomes", (req, res) => {
    const p = insertIncomeSchema.safeParse(req.body);
    if (!p.success) return fail(res, "参数错误: " + p.error.message);
    const inc = incomeRepo.create(p.data);
    // 创建后立即计算
    const taxResult = calculate({
      incomeType: p.data.incomeType as any,
      income: p.data.amount,
    });
    incomeRepo.saveTaxResult(inc.id, taxResult);
    ok(res, { income: inc, tax: taxResult });
  });

  app.delete("/api/incomes/:id", (req, res) => {
    ok(res, { removed: incomeRepo.remove(Number(req.params.id)) });
  });

  /* ============== 路由组 4: 试算(不入库) ============== */
  const calcSchema = z.object({
    incomeType: z.enum(["labor", "salary", "platform", "business"]),
    income: z.number().positive(),
    cumulativeIncome: z.number().optional(),
    monthsWorked: z.number().int().positive().optional(),
    alreadyWithheld: z.number().optional(),
  });
  app.post("/api/calc", (req, res) => {
    const p = calcSchema.safeParse(req.body);
    if (!p.success) return fail(res, "参数错误: " + p.error.message);
    ok(res, calculate(p.data));
  });

  /* ============== 路由组 5: 申报数据导出 ============== */
  app.get("/api/filing/preview", (req, res) => {
    const period = String(req.query.period ?? "");
    if (!period) return fail(res, "请提供所属期 period=YYYY-MM");
    const rows = incomeRepo.list(period);
    const filingRows: FilingRow[] = rows
      .filter(r => r.tax)
      .map(r => ({
        period: r.period,
        name: r.talent?.name ?? "",
        idCard: r.talent?.idCard ?? "",
        incomeType: r.incomeType,
        income: r.amount,
        deduction: r.amount - r.tax!.taxableIncome,
        taxable: r.tax!.taxableIncome,
        rate: r.tax!.rate,
        quickDeduction: r.tax!.quickDeduction,
        taxAmount: r.tax!.taxAmount,
        alreadyPaid: 0,
      }));
    ok(res, filingRows);
  });

  app.get("/api/filing/export", (req, res) => {
    const period = String(req.query.period ?? "");
    if (!period) return fail(res, "请提供所属期 period=YYYY-MM");
    const rows = incomeRepo.list(period).filter(r => r.tax);
    const filingRows: FilingRow[] = rows.map(r => ({
      period: r.period,
      name: r.talent?.name ?? "",
      idCard: r.talent?.idCard ?? "",
      incomeType: r.incomeType,
      income: r.amount,
      deduction: r.amount - r.tax!.taxableIncome,
      taxable: r.tax!.taxableIncome,
      rate: r.tax!.rate,
      quickDeduction: r.tax!.quickDeduction,
      taxAmount: r.tax!.taxAmount,
      alreadyPaid: 0,
    }));
    const csv = buildFilingCsv(filingRows);
    const fileName = buildFilingFileName(period);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(csv);
  });

  /* ============== 路由组 6: 批量处理 ============== */
  const batchSchema = z.object({
    rows: z.array(z.object({
      name: z.string().min(1),
      idCard: z.string().min(15),
      mobile: z.string().optional(),
      bankCard: z.string().optional(),
      incomeType: z.enum(["labor", "salary", "platform", "business"]),
      relation: z.enum(["employee", "contractor", "studio"]).optional(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
      amount: z.number().positive(),
    })).max(1000),
  });
  app.post("/api/batch", async (req, res) => {
    const p = batchSchema.safeParse(req.body);
    if (!p.success) return fail(res, "参数错误: " + p.error.message);
    const results = await runBatch(p.data.rows as BatchRow[]);
    ok(res, results);
  });

  /* ============== 路由组 7: 统计概览 ============== */
  app.get("/api/dashboard", (_req, res) => {
    const allTalents = talentRepo.list();
    const allIncomes = incomeRepo.list();
    const totalIncome = allIncomes.reduce((s, r) => s + r.amount, 0);
    const totalTax = allIncomes.reduce((s, r) => s + (r.tax?.taxAmount ?? 0), 0);
    const verified = allTalents.filter(t => t.kycStatus === "verified").length;
    ok(res, {
      talentCount: allTalents.length,
      verifiedCount: verified,
      incomeCount: allIncomes.length,
      totalIncome,
      totalTax,
    });
  });

  /* ============== 路由组 8: 双源比对(v1.1 新增) ============== */

  /** 下载税务 Excel 标准模板 */
  app.get("/api/reconcile/template", (_req, res) => {
    const buf = buildExcelTemplate();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="tax_talents_template.xlsx"`);
    res.send(buf);
  });

  /** 拉取小红书达人库(用于前端预览) */
  app.get("/api/xhs/talents", async (_req, res) => {
    const list = await xhsTalentSource.fetch();
    ok(res, list);
  });

  /**
   * 一键从小红书拉取并批量导入达人主档。
   * 以身份证号为主键做 upsert：存在则补全空字段,不存在则创建。
   * 请求体可选：{ defaultIncomeType?, defaultRelation? }
   */
  const xhsImportSchema = z.object({
    defaultIncomeType: z.enum(["labor", "platform", "salary", "business"]).default("platform"),
    defaultRelation: z.enum(["employee", "contractor", "studio"]).default("contractor"),
  });
  app.post("/api/xhs/import", async (req, res) => {
    const p = xhsImportSchema.safeParse(req.body ?? {});
    if (!p.success) return fail(res, "参数错误: " + p.error.message);

    const xhsList = await xhsTalentSource.fetch();
    const summary = { created: 0, updated: 0, skipped: 0 };
    const failures: Array<{ name: string; reason: string }> = [];

    for (const t of xhsList) {
      if (!t.name || !t.idCard) { summary.skipped++; failures.push({ name: t.name || "(未知)", reason: "缺少姓名或身份证号" }); continue; }
      const exists = talentRepo.getByIdCard(t.idCard);
      if (exists) {
        // 只补全原本为空的字段,不覆盖已有值(保护人工修订)
        talentRepo.update(exists.id, {
          name: exists.name || t.name,
          mobile: exists.mobile || t.mobile || null,
          bankCard: exists.bankCard || t.bankCard || null,
          note: exists.note || `来源: 小红书 ${t.sourceId}`,
        });
        summary.updated++;
      } else {
        talentRepo.create({
          name: t.name,
          idCard: t.idCard,
          mobile: t.mobile ?? null,
          bankCard: t.bankCard ?? null,
          incomeType: p.data.defaultIncomeType,
          relation: p.data.defaultRelation,
          note: `来源: 小红书 ${t.sourceId}` + (t.extra?.xhsNickname ? ` · ${t.extra.xhsNickname}` : ""),
        });
        summary.created++;
      }
    }

    ok(res, { ...summary, total: xhsList.length, failures });
  });

  /**
   * 拉取小红书结算流水(不入库,仅预览)。
   * Query: ?period=2026-05  &idCards=110...,310...
   */
  app.get("/api/xhs/incomes", async (req, res) => {
    const period = (req.query.period as string) || undefined;
    const idCards = req.query.idCards
      ? String(req.query.idCards).split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const list = await xhsTalentSource.fetchIncomes(idCards, period);
    ok(res, list);
  });

  /**
   * 一站式: 从小红书同步达人 + 拉取当期收入 + 自动核验 + 自动计税。
   * 请求: { period, idCards?: string[], incomeType?: 'platform'|'labor', relation? }
   *   不传 idCards 表示同步全部达人。
   */
  const xhsSyncSchema = z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/, "period 格式应为 YYYY-MM"),
    idCards: z.array(z.string()).optional(),
    incomeType: z.enum(["labor", "platform", "salary", "business"]).default("platform"),
    relation: z.enum(["employee", "contractor", "studio"]).default("contractor"),
  });
  app.post("/api/batch/xhs-sync", async (req, res) => {
    const p = xhsSyncSchema.safeParse(req.body ?? {});
    if (!p.success) return fail(res, "参数错误: " + p.error.message);

    const { period, idCards, incomeType, relation } = p.data;

    // 1) 拉取达人主数据 (可选过滤)
    const allTalents = await xhsTalentSource.fetch();
    const talentsToSync = idCards && idCards.length > 0
      ? allTalents.filter((t) => idCards.includes(t.idCard))
      : allTalents;

    // 2) 拉取该期间结算流水
    const incomes = await xhsTalentSource.fetchIncomes(
      talentsToSync.map((t) => t.idCard),
      period,
    );

    // 3) 转换为 BatchRow。同一达人多笔汇总为 1 行脱敏计算
    const byIdCard = new Map<string, { sum: number; details: string[] }>();
    for (const inc of incomes) {
      const cur = byIdCard.get(inc.idCard) ?? { sum: 0, details: [] };
      cur.sum += inc.grossAmount;
      cur.details.push(`${inc.bizType} ¥${inc.grossAmount}`);
      byIdCard.set(inc.idCard, cur);
    }

    const rows: BatchRow[] = [];
    for (const t of talentsToSync) {
      const agg = byIdCard.get(t.idCard);
      if (!agg || agg.sum <= 0) continue; // 该达人当期无收入,跳过
      rows.push({
        name: t.name,
        idCard: t.idCard,
        mobile: t.mobile,
        bankCard: t.bankCard,
        incomeType,
        relation,
        period,
        amount: agg.sum,
      });
    }

    // 4) 复用现有 batchRunner;标记 source 以便日志筛选
    const results = await runBatch(rows, "xhs-sync");

    const summary = {
      talentsScanned: talentsToSync.length,
      incomesFetched: incomes.length,
      rowsBuilt: rows.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      totalTax: results.reduce((s, r) => s + (r.taxAmount ?? 0), 0),
      totalNet: results.reduce((s, r) => s + (r.netIncome ?? 0), 0),
    };

    ok(res, { period, summary, results });
  });

  /**
   * 上传税务 Excel,返回比对结果。本接口只做计算,不修改数据库。
   * 使用 multipart/form-data,字段名 'file'
   */
  app.post("/api/reconcile/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return fail(res, "未检测到上传文件 (字段名应为 file)");
    try {
      const taxSource = new TaxExcelSource(req.file.buffer);
      const [taxList, xhsList] = await Promise.all([
        taxSource.fetch(),
        xhsTalentSource.fetch(),
      ]);
      const result = reconcile(taxList, xhsList);
      ok(res, result);
    } catch (e: any) {
      return fail(res, "Excel 解析失败: " + (e?.message ?? String(e)));
    }
  });

  /**
   * 将选定的比对行并入主档。
   * 对 CONFLICT 行,前端传入 preferSource="tax"|"platform" 指明以哪方为准。
   */
  const commitSchema = z.object({
    rows: z.array(z.object({
      idCard: z.string(),
      status: z.enum(["MATCH", "CONFLICT", "TAX_ONLY", "PLATFORM_ONLY"]),
      preferSource: z.enum(["tax", "platform"]).optional(),
      taxRecord: z.any().optional(),
      platformRecord: z.any().optional(),
    })),
    defaultIncomeType: z.enum(["labor", "platform", "salary", "business"]).default("labor"),
    defaultRelation: z.enum(["employee", "contractor", "studio"]).default("contractor"),
  });
  app.post("/api/reconcile/commit", (req, res) => {
    const p = commitSchema.safeParse(req.body);
    if (!p.success) return fail(res, "参数错误: " + p.error.message);

    const summary = { created: 0, updated: 0, skipped: 0 };

    for (const row of p.data.rows) {
      // 选出应落库的权威记录
      let winner: any;
      if (row.status === "MATCH") {
        winner = row.taxRecord;                             // 一致,任选其一
      } else if (row.status === "CONFLICT") {
        winner = row.preferSource === "platform" ? row.platformRecord : row.taxRecord;
      } else if (row.status === "TAX_ONLY") {
        winner = row.taxRecord;
      } else if (row.status === "PLATFORM_ONLY") {
        winner = row.platformRecord;
      }
      if (!winner || !winner.name || !winner.idCard) { summary.skipped++; continue; }

      const exists = talentRepo.getByIdCard(winner.idCard);
      if (exists) {
        talentRepo.update(exists.id, {
          name: winner.name,
          idCard: winner.idCard,
          mobile: winner.mobile ?? exists.mobile ?? null,
          bankCard: winner.bankCard ?? exists.bankCard ?? null,
        });
        summary.updated++;
      } else {
        talentRepo.create({
          name: winner.name,
          idCard: winner.idCard,
          mobile: winner.mobile ?? null,
          bankCard: winner.bankCard ?? null,
          incomeType: p.data.defaultIncomeType,
          relation: p.data.defaultRelation,
          note: "来源: 双源比对",
        });
        summary.created++;
      }
    }

    ok(res, summary);
  });

  return httpServer;
}
