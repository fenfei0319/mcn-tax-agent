/* ============================================================
 * 模块: 个税计算引擎 (Tax Engine)
 * 职责: 根据所得类型与金额,纯函数计算预扣预缴税额。
 * 特性: 纯函数,无副作用,不依赖数据库/HTTP/任何外部资源。
 *      可独立单元测试,UI 层与持久层均可复用。
 * 依据: 《中华人民共和国个人所得税法》及实施条例
 *      《个人所得税扣缴申报管理办法(试行)》
 * ============================================================ */

/* ---------- 类型定义 ---------- */
export type IncomeType = "labor" | "platform" | "salary" | "business";

export interface TaxInput {
  incomeType: IncomeType;
  income: number;                  // 本期税前收入(元)
  cumulativeIncome?: number;       // 累计收入(累计预扣法用)
  monthsWorked?: number;           // 在职/连续月份数
  alreadyWithheld?: number;        // 已预扣预缴税额
  specialDeduction?: number;       // 专项扣除
  additionalDeduction?: number;    // 专项附加扣除
  otherDeduction?: number;         // 其他扣除
}

export interface TaxResult {
  taxableIncome: number;           // 应纳税所得额
  rate: number;                    // 适用税率(小数,如 0.2)
  quickDeduction: number;          // 速算扣除数
  taxAmount: number;               // 应纳税额
  netIncome: number;               // 税后金额
  explanation: string[];           // 推导过程(供前端展示)
}

/* ---------- 税率常量(可配置,便于政策调整) ---------- */

// 劳务报酬预扣率表(三级超额累进)
const LABOR_BRACKETS = [
  { upTo: 20000,  rate: 0.20, qd: 0 },
  { upTo: 50000,  rate: 0.30, qd: 2000 },
  { upTo: Infinity, rate: 0.40, qd: 7000 },
];

// 综合所得年度税率表(7级)—— 工资薪金、互联网平台累计预扣使用
const COMPREHENSIVE_BRACKETS = [
  { upTo: 36000,    rate: 0.03, qd: 0 },
  { upTo: 144000,   rate: 0.10, qd: 2520 },
  { upTo: 300000,   rate: 0.20, qd: 16920 },
  { upTo: 420000,   rate: 0.25, qd: 31920 },
  { upTo: 660000,   rate: 0.30, qd: 52920 },
  { upTo: 960000,   rate: 0.35, qd: 85920 },
  { upTo: Infinity, rate: 0.45, qd: 181920 },
];

// 经营所得年度税率表(5级)
const BUSINESS_BRACKETS = [
  { upTo: 30000,    rate: 0.05, qd: 0 },
  { upTo: 90000,    rate: 0.10, qd: 1500 },
  { upTo: 300000,   rate: 0.20, qd: 10500 },
  { upTo: 500000,   rate: 0.30, qd: 40500 },
  { upTo: Infinity, rate: 0.35, qd: 65500 },
];

const BASIC_DEDUCTION_PER_MONTH = 5000; // 减除费用 5000元/月

/* ---------- 工具: 按金额查找适用档位 ---------- */
function findBracket(amount: number, table: typeof LABOR_BRACKETS) {
  for (const b of table) {
    if (amount <= b.upTo) return b;
  }
  return table[table.length - 1];
}

/* ---------- 计算 1: 劳务报酬(按次预扣预缴) ---------- */
function calcLabor(input: TaxInput): TaxResult {
  const exp: string[] = [];
  const income = input.income;

  // 减除费用
  let taxable: number;
  if (income <= 4000) {
    taxable = Math.max(0, income - 800);
    exp.push(`收入 ${income} ≤ 4000,减除费用 800 元`);
  } else {
    taxable = income * 0.8;
    exp.push(`收入 ${income} > 4000,减除 20% 费用`);
  }
  exp.push(`应纳税所得额 = ${taxable.toFixed(2)} 元`);

  const b = findBracket(taxable, LABOR_BRACKETS);
  const tax = Math.max(0, taxable * b.rate - b.qd);
  exp.push(`适用预扣率 ${(b.rate * 100).toFixed(0)}%,速算扣除数 ${b.qd}`);
  exp.push(`应纳税额 = ${taxable.toFixed(2)} × ${b.rate} - ${b.qd} = ${tax.toFixed(2)} 元`);

  return {
    taxableIncome: round2(taxable),
    rate: b.rate,
    quickDeduction: b.qd,
    taxAmount: round2(tax),
    netIncome: round2(income - tax),
    explanation: exp,
  };
}

/* ---------- 计算 2: 工资薪金(累计预扣法) ---------- */
function calcSalary(input: TaxInput): TaxResult {
  const exp: string[] = [];
  const months = input.monthsWorked ?? 1;
  const cumIncome = (input.cumulativeIncome ?? 0) + input.income;
  const basicDed = BASIC_DEDUCTION_PER_MONTH * months;
  const special = input.specialDeduction ?? 0;
  const addl = input.additionalDeduction ?? 0;
  const other = input.otherDeduction ?? 0;

  const taxable = Math.max(0, cumIncome - basicDed - special - addl - other);
  exp.push(`累计收入 = ${cumIncome.toFixed(2)} 元`);
  exp.push(`累计减除费用 = 5000 × ${months} = ${basicDed} 元`);
  exp.push(`累计应纳税所得额 = ${taxable.toFixed(2)} 元`);

  const b = findBracket(taxable, COMPREHENSIVE_BRACKETS);
  const cumTax = Math.max(0, taxable * b.rate - b.qd);
  const already = input.alreadyWithheld ?? 0;
  const tax = Math.max(0, cumTax - already);
  exp.push(`适用税率 ${(b.rate * 100).toFixed(0)}%,速算扣除数 ${b.qd}`);
  exp.push(`累计应纳税额 = ${cumTax.toFixed(2)},已预扣 ${already.toFixed(2)}`);
  exp.push(`本期应预扣预缴 = ${tax.toFixed(2)} 元`);

  return {
    taxableIncome: round2(taxable),
    rate: b.rate,
    quickDeduction: b.qd,
    taxAmount: round2(tax),
    netIncome: round2(input.income - tax),
    explanation: exp,
  };
}

/* ---------- 计算 3: 互联网平台劳务(累计预扣法,2025-10-01 起) ---------- */
function calcPlatform(input: TaxInput): TaxResult {
  const exp: string[] = [];
  const months = input.monthsWorked ?? 1;
  const cumIncome = (input.cumulativeIncome ?? 0) + input.income;
  const cumExpense = cumIncome * 0.20;            // 累计费用 = 累计收入 × 20%
  const basicDed = BASIC_DEDUCTION_PER_MONTH * months;

  const taxable = Math.max(0, cumIncome - cumExpense - basicDed);
  exp.push(`累计收入 = ${cumIncome.toFixed(2)} 元`);
  exp.push(`累计费用(20%) = ${cumExpense.toFixed(2)} 元`);
  exp.push(`累计减除费用 = 5000 × ${months} = ${basicDed} 元`);
  exp.push(`累计应纳税所得额 = ${taxable.toFixed(2)} 元`);

  const b = findBracket(taxable, COMPREHENSIVE_BRACKETS);
  const cumTax = Math.max(0, taxable * b.rate - b.qd);
  const already = input.alreadyWithheld ?? 0;
  const tax = Math.max(0, cumTax - already);
  exp.push(`适用税率 ${(b.rate * 100).toFixed(0)}%,速算扣除数 ${b.qd}`);
  exp.push(`累计应纳税额 = ${cumTax.toFixed(2)},已预扣 ${already.toFixed(2)}`);
  exp.push(`本期应预扣预缴 = ${tax.toFixed(2)} 元`);

  return {
    taxableIncome: round2(taxable),
    rate: b.rate,
    quickDeduction: b.qd,
    taxAmount: round2(tax),
    netIncome: round2(input.income - tax),
    explanation: exp,
  };
}

/* ---------- 计算 4: 经营所得(年度5级超额累进) ---------- */
function calcBusiness(input: TaxInput): TaxResult {
  const exp: string[] = [];
  // 简化:此处将 income 视为年度应纳税所得额(已扣减成本费用)
  const taxable = Math.max(0, input.income);
  exp.push(`年度应纳税所得额 = ${taxable.toFixed(2)} 元(已扣除成本/费用/损失)`);

  const b = findBracket(taxable, BUSINESS_BRACKETS);
  const tax = Math.max(0, taxable * b.rate - b.qd);
  exp.push(`适用税率 ${(b.rate * 100).toFixed(0)}%,速算扣除数 ${b.qd}`);
  exp.push(`应纳税额 = ${taxable.toFixed(2)} × ${b.rate} - ${b.qd} = ${tax.toFixed(2)} 元`);

  return {
    taxableIncome: round2(taxable),
    rate: b.rate,
    quickDeduction: b.qd,
    taxAmount: round2(tax),
    netIncome: round2(input.income - tax),
    explanation: exp,
  };
}

/* ---------- 工具: 保留两位小数 ---------- */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ---------- 对外唯一入口 ---------- */
export function calculate(input: TaxInput): TaxResult {
  switch (input.incomeType) {
    case "labor":    return calcLabor(input);
    case "salary":   return calcSalary(input);
    case "platform": return calcPlatform(input);
    case "business": return calcBusiness(input);
    default:
      throw new Error(`不支持的所得类型: ${input.incomeType}`);
  }
}
