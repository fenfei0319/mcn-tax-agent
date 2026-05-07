/* ============================================================
 * 模块: 前端展示格式化工具
 * 职责: 金额脱敏、身份证脱敏、文本格式化等纯函数。
 * ============================================================ */

/* ============================================================
 * v1.3 数字展示规范(统一全系统):
 *  - 货币与金额一律使用¥ + 千分位 + 2 位小数(¥号与数字中间不加空格,
 *    摆脱「¥ 25,300.00 」被换行的不美观问题)。
 *  - 提供 fmtMoneyCompact 用于表格右对齐列:以 NBSP 连接,防止被换行。
 *  - 提供 fmtCount 统一计数列示例化。
 *  调用者请为数字列补加 className="tabular-nums whitespace-nowrap"。
 * ============================================================ */

const NBSP = "\u00a0";

/** 金额格式化为带千分位的人民币(¥ 与数字中间用不换行空格连接) */
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return "¥" + NBSP + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 表格右对齐专用:与 fmtMoney 一致但保证不换行 */
export function fmtMoneyCompact(n: number | null | undefined): string {
  return fmtMoney(n);
}

/** 纯计数格式化为带千分位的整数(不加¥) */
export function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/** 百分比(入参 0.03 -> "3%") */
export function fmtPercent(rate: number | null | undefined, digits = 0): string {
  if (rate === null || rate === undefined || isNaN(rate)) return "—";
  return (rate * 100).toFixed(digits) + "%";
}

/** 身份证脱敏:保留前6后4 */
export function maskIdCard(id?: string | null): string {
  if (!id) return "—";
  if (id.length < 10) return id;
  return id.slice(0, 6) + "********" + id.slice(-4);
}

/** 银行卡脱敏 */
export function maskBankCard(c?: string | null): string {
  if (!c) return "—";
  if (c.length < 8) return c;
  return c.slice(0, 4) + " **** **** " + c.slice(-4);
}

/** 手机号脱敏 */
export function maskMobile(m?: string | null): string {
  if (!m) return "—";
  if (m.length !== 11) return m;
  return m.slice(0, 3) + "****" + m.slice(-4);
}

/** 所得类型中文 */
export const incomeTypeLabel: Record<string, string> = {
  labor: "劳务报酬",
  platform: "互联网平台",
  salary: "工资薪金",
  business: "经营所得",
};

/** 签约关系中文 */
export const relationLabel: Record<string, string> = {
  employee: "员工",
  contractor: "经纪合约",
  studio: "工作室",
};

/** 核验状态中文 */
export const kycLabel: Record<string, string> = {
  unverified: "未核验",
  verified: "已通过",
  failed: "未通过",
};
