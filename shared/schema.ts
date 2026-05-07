import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ============================================================
 * 模块: 数据模型 (Shared Schema)
 * 说明: 前后端共享的类型与数据库表定义。
 *      所有表均不引用业务逻辑,只承载持久化结构。
 * ============================================================ */

/* ---------- 表 1: 达人档案 talents ---------- */
export const talents = sqliteTable("talents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),                 // 真实姓名
  idCard: text("id_card").notNull().unique(),   // 身份证号(18位)
  mobile: text("mobile"),                       // 手机号
  bankCard: text("bank_card"),                  // 银行卡号
  incomeType: text("income_type").notNull(),    // salary / labor / business / platform
  relation: text("relation").notNull(),         // employee / contractor / studio
  kycStatus: text("kyc_status").notNull().default("unverified"), // unverified / verified / failed
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const insertTalentSchema = createInsertSchema(talents).omit({
  id: true,
  kycStatus: true,
  createdAt: true,
});
export type InsertTalent = z.infer<typeof insertTalentSchema>;
export type Talent = typeof talents.$inferSelect;

/* ---------- 表 2: 收入登记 incomes ---------- */
export const incomes = sqliteTable("incomes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  talentId: integer("talent_id").notNull(),
  period: text("period").notNull(),             // 所属期 YYYY-MM
  amount: real("amount").notNull(),             // 税前金额(元)
  incomeType: text("income_type").notNull(),    // 可覆盖达人默认值
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const insertIncomeSchema = createInsertSchema(incomes).omit({
  id: true,
  createdAt: true,
});
export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type Income = typeof incomes.$inferSelect;

/* ---------- 表 3: 个税计算结果 tax_records ---------- */
export const taxRecords = sqliteTable("tax_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  incomeId: integer("income_id").notNull(),
  taxableIncome: real("taxable_income").notNull(),
  rate: real("rate").notNull(),
  quickDeduction: real("quick_deduction").notNull(),
  taxAmount: real("tax_amount").notNull(),
  netIncome: real("net_income").notNull(),
  explanation: text("explanation").notNull(),  // JSON字符串
  createdAt: text("created_at").notNull(),
});
export type TaxRecord = typeof taxRecords.$inferSelect;

/* ---------- 表 4: 核验日志 kyc_logs ---------- */
/* v1.3 扩展业务字段:便于在日志中按所属期 / 所得类型 / 签约关系筛选,
 *      并直接展示当时的收入金额与税额,避免审计时再跨表关联。 */
export const kycLogs = sqliteTable("kyc_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  talentId: integer("talent_id"),
  talentName: text("talent_name"),             // 冗余存名字,日志可直接显示
  mode: text("mode").notNull(),                // two / three / four
  passed: integer("passed").notNull(),         // 0/1
  reason: text("reason"),
  traceId: text("trace_id"),
  source: text("source"),                      // single / batch / xhs-sync
  period: text("period"),                      // 当时所属期 YYYY-MM
  incomeType: text("income_type"),             // labor / platform / ...
  relation: text("relation"),                  // employee / contractor / studio
  amount: real("amount"),                      // 当时收入金额
  taxAmount: real("tax_amount"),               // 当时应纳税额
  createdAt: text("created_at").notNull(),
});
export type KycLog = typeof kycLogs.$inferSelect;

/* ---------- 表 5: 申报导出记录 filings ---------- */
export const filings = sqliteTable("filings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  period: text("period").notNull(),
  rowCount: integer("row_count").notNull(),
  createdAt: text("created_at").notNull(),
});
export type Filing = typeof filings.$inferSelect;

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
