import { z } from "zod";

/* ============================================================
 * 模块: 数据模型 (Shared Schema)
 * 说明: 前后端共享的类型与 Zod 校验。
 *      v1.4 重构: 移除 Drizzle/SQLite 耦合,改为纯 TypeScript 类型,
 *               以兼容 Serverless 部署(Vercel/Edge),
 *               同时不影响业务模块接口。
 * ============================================================ */

/* ---------- 表 1: 达人档案 talents ---------- */
export interface Talent {
  id: number;
  name: string;
  idCard: string;
  mobile: string | null;
  bankCard: string | null;
  incomeType: string;
  relation: string;
  kycStatus: "unverified" | "verified" | "failed";
  note: string | null;
  createdAt: string;
}

export const insertTalentSchema = z.object({
  name: z.string().min(1, "姓名不能为空"),
  idCard: z.string().min(15, "身份证号格式不正确").max(18),
  mobile: z.string().nullable().optional(),
  bankCard: z.string().nullable().optional(),
  incomeType: z.string().min(1),
  relation: z.string().min(1),
  note: z.string().nullable().optional(),
});
export type InsertTalent = z.infer<typeof insertTalentSchema>;

/* ---------- 表 2: 收入登记 incomes ---------- */
export interface Income {
  id: number;
  talentId: number;
  period: string;     // YYYY-MM
  amount: number;
  incomeType: string;
  note: string | null;
  createdAt: string;
}

export const insertIncomeSchema = z.object({
  talentId: z.number().int().positive(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "所属期格式应为 YYYY-MM"),
  amount: z.number().positive("金额必须大于 0"),
  incomeType: z.string().min(1),
  note: z.string().nullable().optional(),
});
export type InsertIncome = z.infer<typeof insertIncomeSchema>;

/* ---------- 表 3: 个税计算结果 tax_records ---------- */
export interface TaxRecord {
  id: number;
  incomeId: number;
  taxableIncome: number;
  rate: number;
  quickDeduction: number;
  taxAmount: number;
  netIncome: number;
  explanation: string;  // JSON 字符串
  createdAt: string;
}

/* ---------- 表 4: 核验日志 kyc_logs ---------- */
/* v1.3 扩展业务字段: 便于在日志中按所属期 / 所得类型 / 签约关系筛选 */
export interface KycLog {
  id: number;
  talentId: number | null;
  talentName: string | null;
  mode: string;                // two / three / four
  passed: number;              // 0 / 1
  reason: string | null;
  traceId: string | null;
  source: string | null;       // single / batch / xhs-sync
  period: string | null;
  incomeType: string | null;
  relation: string | null;
  amount: number | null;
  taxAmount: number | null;
  createdAt: string;
}

/* ---------- 表 5: 申报导出记录 filings ---------- */
export interface Filing {
  id: number;
  period: string;
  rowCount: number;
  createdAt: string;
}

/* ---------- 共享枚举(给前端使用) ---------- */
export const INCOME_TYPES = [
  { value: "labor",    label: "劳务报酬(按次)" },
  { value: "platform", label: "互联网平台劳务(累计预扣)" },
  { value: "salary",   label: "工资薪金(累计预扣)" },
  { value: "business", label: "经营所得" },
] as const;

export const RELATIONS = [
  { value: "employee",   label: "员工(签订劳动合同)" },
  { value: "contractor", label: "经纪合约(劳务)" },
  { value: "studio",     label: "工作室(个体/个独)" },
] as const;
