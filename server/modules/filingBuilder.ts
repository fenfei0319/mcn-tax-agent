/* ============================================================
 * 模块: 申报数据生成 (Filing Builder)
 * 职责: 将"达人 + 收入 + 税额"组合为符合自然人电子税务局
 *      批量导入模板格式的 CSV 文本。
 * 解耦: 输入纯数据对象,输出字符串。不接触数据库与文件系统。
 * ============================================================ */

export interface FilingRow {
  period: string;           // 所得期间 YYYY-MM
  name: string;             // 姓名
  idCard: string;           // 证件号码
  incomeType: string;       // labor / salary / platform / business
  income: number;           // 收入额
  deduction: number;        // 减除费用
  taxable: number;          // 应纳税所得额
  rate: number;             // 税率
  quickDeduction: number;   // 速算扣除数
  taxAmount: number;        // 应纳税额
  alreadyPaid: number;      // 已缴税额
}

const TYPE_LABEL: Record<string, string> = {
  labor:    "劳务报酬所得",
  salary:   "工资薪金所得",
  platform: "互联网平台劳务所得",
  business: "经营所得",
};

const HEADERS = [
  "所得期间", "姓名", "证件类型", "证件号码", "所得项目",
  "收入额", "减除费用", "应纳税所得额", "税率", "速算扣除数",
  "应纳税额", "已缴税额", "应补(退)税额",
];

/* ---------- 转义 CSV 字段(逗号、引号、换行) ---------- */
function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/* ---------- 生成 CSV 内容(UTF-8 BOM,Excel 中文不乱码) ---------- */
export function buildFilingCsv(rows: FilingRow[]): string {
  const lines: string[] = [];
  lines.push(HEADERS.map(csvEscape).join(","));
  for (const r of rows) {
    const supplement = r.taxAmount - r.alreadyPaid;
    lines.push([
      r.period,
      r.name,
      "居民身份证",
      r.idCard,
      TYPE_LABEL[r.incomeType] ?? r.incomeType,
      r.income.toFixed(2),
      r.deduction.toFixed(2),
      r.taxable.toFixed(2),
      (r.rate * 100).toFixed(0) + "%",
      r.quickDeduction.toFixed(2),
      r.taxAmount.toFixed(2),
      r.alreadyPaid.toFixed(2),
      supplement.toFixed(2),
    ].map(csvEscape).join(","));
  }
  return "\uFEFF" + lines.join("\n");
}

/* ---------- 生成默认文件名 ---------- */
export function buildFilingFileName(period: string): string {
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
                `${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  return `申报数据_${period.replace("-", "")}_${stamp}.csv`;
}
