// server/serverlessEntry.ts
import express from "express";
import { createServer } from "node:http";

// server/routes.ts
import { z as z2 } from "zod";
import multer from "multer";

// shared/schema.ts
import { z } from "zod";
var insertTalentSchema = z.object({
  name: z.string().min(1, "\u59D3\u540D\u4E0D\u80FD\u4E3A\u7A7A"),
  idCard: z.string().min(15, "\u8EAB\u4EFD\u8BC1\u53F7\u683C\u5F0F\u4E0D\u6B63\u786E").max(18),
  mobile: z.string().nullable().optional(),
  bankCard: z.string().nullable().optional(),
  incomeType: z.string().min(1),
  relation: z.string().min(1),
  note: z.string().nullable().optional()
});
var insertIncomeSchema = z.object({
  talentId: z.number().int().positive(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "\u6240\u5C5E\u671F\u683C\u5F0F\u5E94\u4E3A YYYY-MM"),
  amount: z.number().positive("\u91D1\u989D\u5FC5\u987B\u5927\u4E8E 0"),
  incomeType: z.string().min(1),
  note: z.string().nullable().optional()
});

// server/db.ts
var AutoIncrement = class {
  id = 0;
  next() {
    return ++this.id;
  }
};
var MemoryStore = class {
  talents = /* @__PURE__ */ new Map();
  incomes = /* @__PURE__ */ new Map();
  taxRecords = /* @__PURE__ */ new Map();
  kycLogs = /* @__PURE__ */ new Map();
  filings = /* @__PURE__ */ new Map();
  seq = {
    talents: new AutoIncrement(),
    incomes: new AutoIncrement(),
    taxRecords: new AutoIncrement(),
    kycLogs: new AutoIncrement(),
    filings: new AutoIncrement()
  };
};
var globalAny = globalThis;
var store = globalAny.__mcnStore ?? (globalAny.__mcnStore = new MemoryStore());

// server/modules/talentRepo.ts
var TalentRepo = class {
  list(keyword) {
    const all = Array.from(store.talents.values());
    if (keyword && keyword.trim()) {
      const k = keyword.trim();
      return all.filter((t) => t.name.includes(k) || t.idCard.includes(k));
    }
    return all;
  }
  getById(id) {
    return store.talents.get(id);
  }
  getByIdCard(idCard) {
    for (const t of store.talents.values()) {
      if (t.idCard === idCard) return t;
    }
    return void 0;
  }
  create(t) {
    const id = store.seq.talents.next();
    const created = {
      id,
      name: t.name,
      idCard: t.idCard,
      mobile: t.mobile ?? null,
      bankCard: t.bankCard ?? null,
      incomeType: t.incomeType,
      relation: t.relation,
      kycStatus: "unverified",
      note: t.note ?? null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.talents.set(id, created);
    return created;
  }
  update(id, patch) {
    const existed = store.talents.get(id);
    if (!existed) return void 0;
    const next = {
      ...existed,
      ...patch.name !== void 0 && { name: patch.name },
      ...patch.idCard !== void 0 && { idCard: patch.idCard },
      ...patch.mobile !== void 0 && { mobile: patch.mobile ?? null },
      ...patch.bankCard !== void 0 && { bankCard: patch.bankCard ?? null },
      ...patch.incomeType !== void 0 && { incomeType: patch.incomeType },
      ...patch.relation !== void 0 && { relation: patch.relation },
      ...patch.note !== void 0 && { note: patch.note ?? null }
    };
    store.talents.set(id, next);
    return next;
  }
  remove(id) {
    return store.talents.delete(id);
  }
  setKycStatus(id, status) {
    const t = store.talents.get(id);
    if (t) store.talents.set(id, { ...t, kycStatus: status });
  }
};
var talentRepo = new TalentRepo();

// server/modules/incomeRepo.ts
var IncomeRepo = class {
  list(period) {
    const rows = Array.from(store.incomes.values()).filter((i) => !period || i.period === period);
    return rows.map((row) => ({
      ...row,
      talent: store.talents.get(row.talentId),
      tax: this.getTaxByIncome(row.id)
    }));
  }
  create(i) {
    const id = store.seq.incomes.next();
    const created = {
      id,
      talentId: i.talentId,
      period: i.period,
      amount: i.amount,
      incomeType: i.incomeType,
      note: i.note ?? null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.incomes.set(id, created);
    return created;
  }
  remove(id) {
    for (const [taxId, tr] of store.taxRecords.entries()) {
      if (tr.incomeId === id) store.taxRecords.delete(taxId);
    }
    return store.incomes.delete(id);
  }
  saveTaxResult(incomeId, r) {
    for (const [taxId, tr] of store.taxRecords.entries()) {
      if (tr.incomeId === incomeId) store.taxRecords.delete(taxId);
    }
    const id = store.seq.taxRecords.next();
    const created = {
      id,
      incomeId,
      taxableIncome: r.taxableIncome,
      rate: r.rate,
      quickDeduction: r.quickDeduction,
      taxAmount: r.taxAmount,
      netIncome: r.netIncome,
      explanation: JSON.stringify(r.explanation),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.taxRecords.set(id, created);
    return created;
  }
  getTaxByIncome(incomeId) {
    for (const tr of store.taxRecords.values()) {
      if (tr.incomeId === incomeId) return tr;
    }
    return void 0;
  }
};
var incomeRepo = new IncomeRepo();

// server/modules/kycProvider.ts
function validateIdCard(idCard) {
  if (!/^\d{17}[\dXx]$/.test(idCard)) {
    return { ok: false, reason: "\u8EAB\u4EFD\u8BC1\u53F7\u683C\u5F0F\u9519\u8BEF,\u9700\u4E3A18\u4F4D\u6570\u5B57(\u672B\u4F4D\u53EF\u4E3AX)" };
  }
  const y = parseInt(idCard.substring(6, 10), 10);
  const m = parseInt(idCard.substring(10, 12), 10);
  const d = parseInt(idCard.substring(12, 14), 10);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { ok: false, reason: "\u8EAB\u4EFD\u8BC1\u53F7\u4E2D\u51FA\u751F\u65E5\u671F\u975E\u6CD5" };
  }
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += parseInt(idCard[i], 10) * weights[i];
  const expect = codes[sum % 11];
  if (expect !== idCard[17].toUpperCase()) {
    return { ok: false, reason: "\u8EAB\u4EFD\u8BC1\u53F7\u6821\u9A8C\u7801\u4E0D\u6B63\u786E" };
  }
  return { ok: true, reason: "OK" };
}
function validateMobile(mobile) {
  return /^1[3-9]\d{9}$/.test(mobile);
}
function validateBankCard(bankCard) {
  if (!/^\d{15,19}$/.test(bankCard)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = bankCard.length - 1; i >= 0; i--) {
    let n = parseInt(bankCard[i], 10);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
var MockKycProvider = class {
  async verify(req) {
    const traceId = "mock-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    if (!req.name || req.name.trim().length < 2) {
      return { passed: false, reason: "\u59D3\u540D\u4E0D\u80FD\u4E3A\u7A7A\u4E14\u81F3\u5C112\u4E2A\u5B57\u7B26", traceId };
    }
    const idChk = validateIdCard(req.idCard);
    if (!idChk.ok) return { passed: false, reason: idChk.reason, traceId };
    if (req.mode === "three" || req.mode === "four") {
      if (!req.mobile || !validateMobile(req.mobile)) {
        return { passed: false, reason: "\u624B\u673A\u53F7\u683C\u5F0F\u9519\u8BEF", traceId };
      }
    }
    if (req.mode === "four") {
      if (!req.bankCard || !validateBankCard(req.bankCard)) {
        return { passed: false, reason: "\u94F6\u884C\u5361\u53F7 Luhn \u6821\u9A8C\u5931\u8D25", traceId };
      }
    }
    return { passed: true, reason: "Mock \u6838\u9A8C\u901A\u8FC7(\u57FA\u7840\u683C\u5F0F\u4E0E\u7B97\u6CD5\u5747\u5408\u6CD5)", traceId };
  }
};
var kycProvider = new MockKycProvider();

// server/modules/kycLogRepo.ts
var KycLogRepo = class {
  add(log) {
    const id = store.seq.kycLogs.next();
    const created = {
      id,
      talentId: log.talentId ?? null,
      talentName: log.talentName ?? null,
      mode: log.mode,
      passed: log.passed,
      reason: log.reason ?? null,
      traceId: log.traceId ?? null,
      source: log.source ?? null,
      period: log.period ?? null,
      incomeType: log.incomeType ?? null,
      relation: log.relation ?? null,
      amount: log.amount ?? null,
      taxAmount: log.taxAmount ?? null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.kycLogs.set(id, created);
    return created;
  }
  listByTalent(talentId) {
    return Array.from(store.kycLogs.values()).filter((l) => l.talentId === talentId).sort((a, b) => b.id - a.id);
  }
  listAll(limit = 1e3) {
    return Array.from(store.kycLogs.values()).sort((a, b) => b.id - a.id).slice(0, limit);
  }
};
var kycLogRepo = new KycLogRepo();

// server/modules/taxEngine.ts
var LABOR_BRACKETS = [
  { upTo: 2e4, rate: 0.2, qd: 0 },
  { upTo: 5e4, rate: 0.3, qd: 2e3 },
  { upTo: Infinity, rate: 0.4, qd: 7e3 }
];
var COMPREHENSIVE_BRACKETS = [
  { upTo: 36e3, rate: 0.03, qd: 0 },
  { upTo: 144e3, rate: 0.1, qd: 2520 },
  { upTo: 3e5, rate: 0.2, qd: 16920 },
  { upTo: 42e4, rate: 0.25, qd: 31920 },
  { upTo: 66e4, rate: 0.3, qd: 52920 },
  { upTo: 96e4, rate: 0.35, qd: 85920 },
  { upTo: Infinity, rate: 0.45, qd: 181920 }
];
var BUSINESS_BRACKETS = [
  { upTo: 3e4, rate: 0.05, qd: 0 },
  { upTo: 9e4, rate: 0.1, qd: 1500 },
  { upTo: 3e5, rate: 0.2, qd: 10500 },
  { upTo: 5e5, rate: 0.3, qd: 40500 },
  { upTo: Infinity, rate: 0.35, qd: 65500 }
];
var BASIC_DEDUCTION_PER_MONTH = 5e3;
function findBracket(amount, table) {
  for (const b of table) {
    if (amount <= b.upTo) return b;
  }
  return table[table.length - 1];
}
function calcLabor(input) {
  const exp = [];
  const income = input.income;
  let taxable;
  if (income <= 4e3) {
    taxable = Math.max(0, income - 800);
    exp.push(`\u6536\u5165 ${income} \u2264 4000,\u51CF\u9664\u8D39\u7528 800 \u5143`);
  } else {
    taxable = income * 0.8;
    exp.push(`\u6536\u5165 ${income} > 4000,\u51CF\u9664 20% \u8D39\u7528`);
  }
  exp.push(`\u5E94\u7EB3\u7A0E\u6240\u5F97\u989D = ${taxable.toFixed(2)} \u5143`);
  const b = findBracket(taxable, LABOR_BRACKETS);
  const tax = Math.max(0, taxable * b.rate - b.qd);
  exp.push(`\u9002\u7528\u9884\u6263\u7387 ${(b.rate * 100).toFixed(0)}%,\u901F\u7B97\u6263\u9664\u6570 ${b.qd}`);
  exp.push(`\u5E94\u7EB3\u7A0E\u989D = ${taxable.toFixed(2)} \xD7 ${b.rate} - ${b.qd} = ${tax.toFixed(2)} \u5143`);
  return {
    taxableIncome: round2(taxable),
    rate: b.rate,
    quickDeduction: b.qd,
    taxAmount: round2(tax),
    netIncome: round2(income - tax),
    explanation: exp
  };
}
function calcSalary(input) {
  const exp = [];
  const months = input.monthsWorked ?? 1;
  const cumIncome = (input.cumulativeIncome ?? 0) + input.income;
  const basicDed = BASIC_DEDUCTION_PER_MONTH * months;
  const special = input.specialDeduction ?? 0;
  const addl = input.additionalDeduction ?? 0;
  const other = input.otherDeduction ?? 0;
  const taxable = Math.max(0, cumIncome - basicDed - special - addl - other);
  exp.push(`\u7D2F\u8BA1\u6536\u5165 = ${cumIncome.toFixed(2)} \u5143`);
  exp.push(`\u7D2F\u8BA1\u51CF\u9664\u8D39\u7528 = 5000 \xD7 ${months} = ${basicDed} \u5143`);
  exp.push(`\u7D2F\u8BA1\u5E94\u7EB3\u7A0E\u6240\u5F97\u989D = ${taxable.toFixed(2)} \u5143`);
  const b = findBracket(taxable, COMPREHENSIVE_BRACKETS);
  const cumTax = Math.max(0, taxable * b.rate - b.qd);
  const already = input.alreadyWithheld ?? 0;
  const tax = Math.max(0, cumTax - already);
  exp.push(`\u9002\u7528\u7A0E\u7387 ${(b.rate * 100).toFixed(0)}%,\u901F\u7B97\u6263\u9664\u6570 ${b.qd}`);
  exp.push(`\u7D2F\u8BA1\u5E94\u7EB3\u7A0E\u989D = ${cumTax.toFixed(2)},\u5DF2\u9884\u6263 ${already.toFixed(2)}`);
  exp.push(`\u672C\u671F\u5E94\u9884\u6263\u9884\u7F34 = ${tax.toFixed(2)} \u5143`);
  return {
    taxableIncome: round2(taxable),
    rate: b.rate,
    quickDeduction: b.qd,
    taxAmount: round2(tax),
    netIncome: round2(input.income - tax),
    explanation: exp
  };
}
function calcPlatform(input) {
  const exp = [];
  const months = input.monthsWorked ?? 1;
  const cumIncome = (input.cumulativeIncome ?? 0) + input.income;
  const cumExpense = cumIncome * 0.2;
  const basicDed = BASIC_DEDUCTION_PER_MONTH * months;
  const taxable = Math.max(0, cumIncome - cumExpense - basicDed);
  exp.push(`\u7D2F\u8BA1\u6536\u5165 = ${cumIncome.toFixed(2)} \u5143`);
  exp.push(`\u7D2F\u8BA1\u8D39\u7528(20%) = ${cumExpense.toFixed(2)} \u5143`);
  exp.push(`\u7D2F\u8BA1\u51CF\u9664\u8D39\u7528 = 5000 \xD7 ${months} = ${basicDed} \u5143`);
  exp.push(`\u7D2F\u8BA1\u5E94\u7EB3\u7A0E\u6240\u5F97\u989D = ${taxable.toFixed(2)} \u5143`);
  const b = findBracket(taxable, COMPREHENSIVE_BRACKETS);
  const cumTax = Math.max(0, taxable * b.rate - b.qd);
  const already = input.alreadyWithheld ?? 0;
  const tax = Math.max(0, cumTax - already);
  exp.push(`\u9002\u7528\u7A0E\u7387 ${(b.rate * 100).toFixed(0)}%,\u901F\u7B97\u6263\u9664\u6570 ${b.qd}`);
  exp.push(`\u7D2F\u8BA1\u5E94\u7EB3\u7A0E\u989D = ${cumTax.toFixed(2)},\u5DF2\u9884\u6263 ${already.toFixed(2)}`);
  exp.push(`\u672C\u671F\u5E94\u9884\u6263\u9884\u7F34 = ${tax.toFixed(2)} \u5143`);
  return {
    taxableIncome: round2(taxable),
    rate: b.rate,
    quickDeduction: b.qd,
    taxAmount: round2(tax),
    netIncome: round2(input.income - tax),
    explanation: exp
  };
}
function calcBusiness(input) {
  const exp = [];
  const taxable = Math.max(0, input.income);
  exp.push(`\u5E74\u5EA6\u5E94\u7EB3\u7A0E\u6240\u5F97\u989D = ${taxable.toFixed(2)} \u5143(\u5DF2\u6263\u9664\u6210\u672C/\u8D39\u7528/\u635F\u5931)`);
  const b = findBracket(taxable, BUSINESS_BRACKETS);
  const tax = Math.max(0, taxable * b.rate - b.qd);
  exp.push(`\u9002\u7528\u7A0E\u7387 ${(b.rate * 100).toFixed(0)}%,\u901F\u7B97\u6263\u9664\u6570 ${b.qd}`);
  exp.push(`\u5E94\u7EB3\u7A0E\u989D = ${taxable.toFixed(2)} \xD7 ${b.rate} - ${b.qd} = ${tax.toFixed(2)} \u5143`);
  return {
    taxableIncome: round2(taxable),
    rate: b.rate,
    quickDeduction: b.qd,
    taxAmount: round2(tax),
    netIncome: round2(input.income - tax),
    explanation: exp
  };
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function calculate(input) {
  switch (input.incomeType) {
    case "labor":
      return calcLabor(input);
    case "salary":
      return calcSalary(input);
    case "platform":
      return calcPlatform(input);
    case "business":
      return calcBusiness(input);
    default:
      throw new Error(`\u4E0D\u652F\u6301\u7684\u6240\u5F97\u7C7B\u578B: ${input.incomeType}`);
  }
}

// server/modules/filingBuilder.ts
var TYPE_LABEL = {
  labor: "\u52B3\u52A1\u62A5\u916C\u6240\u5F97",
  salary: "\u5DE5\u8D44\u85AA\u91D1\u6240\u5F97",
  platform: "\u4E92\u8054\u7F51\u5E73\u53F0\u52B3\u52A1\u6240\u5F97",
  business: "\u7ECF\u8425\u6240\u5F97"
};
var HEADERS = [
  "\u6240\u5F97\u671F\u95F4",
  "\u59D3\u540D",
  "\u8BC1\u4EF6\u7C7B\u578B",
  "\u8BC1\u4EF6\u53F7\u7801",
  "\u6240\u5F97\u9879\u76EE",
  "\u6536\u5165\u989D",
  "\u51CF\u9664\u8D39\u7528",
  "\u5E94\u7EB3\u7A0E\u6240\u5F97\u989D",
  "\u7A0E\u7387",
  "\u901F\u7B97\u6263\u9664\u6570",
  "\u5E94\u7EB3\u7A0E\u989D",
  "\u5DF2\u7F34\u7A0E\u989D",
  "\u5E94\u8865(\u9000)\u7A0E\u989D"
];
function csvEscape(v) {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function buildFilingCsv(rows) {
  const lines = [];
  lines.push(HEADERS.map(csvEscape).join(","));
  for (const r of rows) {
    const supplement = r.taxAmount - r.alreadyPaid;
    lines.push([
      r.period,
      r.name,
      "\u5C45\u6C11\u8EAB\u4EFD\u8BC1",
      r.idCard,
      TYPE_LABEL[r.incomeType] ?? r.incomeType,
      r.income.toFixed(2),
      r.deduction.toFixed(2),
      r.taxable.toFixed(2),
      (r.rate * 100).toFixed(0) + "%",
      r.quickDeduction.toFixed(2),
      r.taxAmount.toFixed(2),
      r.alreadyPaid.toFixed(2),
      supplement.toFixed(2)
    ].map(csvEscape).join(","));
  }
  return "\uFEFF" + lines.join("\n");
}
function buildFilingFileName(period) {
  const ts = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  return `\u7533\u62A5\u6570\u636E_${period.replace("-", "")}_${stamp}.csv`;
}

// server/modules/batchRunner.ts
async function runBatch(rows, source = "batch") {
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const baseResult = {
      index: i + 1,
      name: r.name,
      idCard: r.idCard,
      passed: false,
      reason: ""
    };
    try {
      const mode = r.bankCard ? "four" : r.mobile ? "three" : "two";
      const kyc = await kycProvider.verify({
        mode,
        name: r.name,
        idCard: r.idCard,
        mobile: r.mobile,
        bankCard: r.bankCard
      });
      let talent = talentRepo.getByIdCard(r.idCard);
      if (!talent) {
        talent = talentRepo.create({
          name: r.name,
          idCard: r.idCard,
          mobile: r.mobile ?? null,
          bankCard: r.bankCard ?? null,
          incomeType: r.incomeType,
          relation: r.relation ?? "contractor",
          note: null
        });
      }
      talentRepo.setKycStatus(talent.id, kyc.passed ? "verified" : "failed");
      if (!kyc.passed) {
        kycLogRepo.add({
          talentId: talent.id,
          talentName: talent.name,
          mode,
          passed: 0,
          reason: kyc.reason,
          traceId: kyc.traceId,
          source,
          period: r.period,
          incomeType: r.incomeType,
          relation: r.relation ?? talent.relation ?? null,
          amount: r.amount,
          taxAmount: null
        });
        baseResult.reason = "\u6838\u9A8C\u672A\u901A\u8FC7: " + kyc.reason;
        results.push(baseResult);
        continue;
      }
      const income = incomeRepo.create({
        talentId: talent.id,
        period: r.period,
        amount: r.amount,
        incomeType: r.incomeType,
        note: null
      });
      const tax = calculate({ incomeType: r.incomeType, income: r.amount });
      incomeRepo.saveTaxResult(income.id, tax);
      kycLogRepo.add({
        talentId: talent.id,
        talentName: talent.name,
        mode,
        passed: 1,
        reason: kyc.reason,
        traceId: kyc.traceId,
        source,
        period: r.period,
        incomeType: r.incomeType,
        relation: r.relation ?? talent.relation ?? null,
        amount: r.amount,
        taxAmount: tax.taxAmount
      });
      baseResult.passed = true;
      baseResult.reason = "\u5904\u7406\u6210\u529F";
      baseResult.taxAmount = tax.taxAmount;
      baseResult.netIncome = tax.netIncome;
      results.push(baseResult);
    } catch (err) {
      baseResult.reason = "\u5F02\u5E38: " + (err?.message ?? String(err));
      results.push(baseResult);
    }
  }
  return results;
}

// server/modules/xlsxParser.ts
import * as XLSX from "xlsx";
var FIELD_ALIASES = {
  name: ["\u59D3\u540D", "name", "\u7EB3\u7A0E\u4EBA\u59D3\u540D"],
  idCard: ["\u8EAB\u4EFD\u8BC1\u53F7", "\u8EAB\u4EFD\u8BC1\u53F7\u7801", "\u8BC1\u4EF6\u53F7\u7801", "\u8BC1\u4EF6\u53F7", "idcard", "id_card", "id card"],
  mobile: ["\u624B\u673A", "\u624B\u673A\u53F7", "\u624B\u673A\u53F7\u7801", "\u8054\u7CFB\u7535\u8BDD", "mobile", "phone"],
  bankCard: ["\u94F6\u884C\u5361", "\u94F6\u884C\u5361\u53F7", "\u94F6\u884C\u8D26\u53F7", "bankcard", "bank_card"]
};
function resolveColumns(headers) {
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = headers.findIndex(
      (h) => aliases.some((a) => String(h).trim().toLowerCase() === a.toLowerCase())
    );
    if (idx >= 0) map[field] = idx;
  }
  return map;
}
function parseTaxExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h ?? "").trim());
  const cols = resolveColumns(headers);
  if (cols.name === void 0 || cols.idCard === void 0) {
    throw new Error("Excel \u7F3A\u5C11\u5FC5\u8981\u5217:\u59D3\u540D / \u8EAB\u4EFD\u8BC1\u53F7");
  }
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[cols.name] ?? "").trim();
    const idCard = String(r[cols.idCard] ?? "").trim().toUpperCase();
    if (!name || !idCard) continue;
    list.push({
      sourceId: `excel-row-${i + 1}`,
      name,
      idCard,
      mobile: cols.mobile !== void 0 ? String(r[cols.mobile] ?? "").trim() : void 0,
      bankCard: cols.bankCard !== void 0 ? String(r[cols.bankCard] ?? "").trim() : void 0
    });
  }
  return list;
}
function buildExcelTemplate() {
  const data = [
    ["\u59D3\u540D", "\u8EAB\u4EFD\u8BC1\u53F7", "\u624B\u673A\u53F7", "\u94F6\u884C\u5361\u53F7"],
    ["\u5F20\u4E09", "110101199003072816", "13800138000", "6228480000000000017"],
    ["\u674E\u56DB", "310115198506040033", "13900139000", ""]
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "\u7EB3\u7A0E\u4EBA\u4FE1\u606F");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
var TaxExcelSource = class {
  constructor(buffer) {
    this.buffer = buffer;
  }
  sourceName = "\u4E2A\u7A0E\u5E73\u53F0 Excel";
  async fetch() {
    return parseTaxExcel(this.buffer);
  }
};

// server/modules/xhsTalentSource.ts
var MOCK_DATA = [
  // 与样例 Excel 完全一致 → MATCH
  {
    sourceId: "xhs-1001",
    name: "\u5F20\u4E09",
    idCard: "110101199003072818",
    mobile: "13800138000",
    bankCard: "6228480000000000018",
    extra: {
      xhsNickname: "@\u7F8E\u5986\u5F20\u4E09",
      followers: 128e3,
      registeredAt: "2022-03-15",
      verifiedAt: "2022-03-16",
      idCardFrontUrl: "MOCK://idcard-front/zhangsan.jpg",
      idCardBackUrl: "MOCK://idcard-back/zhangsan.jpg",
      contractType: "\u54C1\u724C\u5408\u4F5C + \u521B\u4F5C\u6FC0\u52B1",
      tier: "\u8170\u90E8\u8FBE\u4EBA"
    }
  },
  // 与税务 Excel 姓名冲突 → CONFLICT
  {
    sourceId: "xhs-1002",
    name: "\u674E\u601D",
    idCard: "310115198506040034",
    mobile: "13900139000",
    bankCard: "",
    extra: {
      xhsNickname: "@\u7F8E\u98DF\u674E\u601D",
      followers: 56e3,
      registeredAt: "2023-07-08",
      verifiedAt: "2023-07-10",
      idCardFrontUrl: "MOCK://idcard-front/lisi.jpg",
      idCardBackUrl: "MOCK://idcard-back/lisi.jpg",
      contractType: "\u54C1\u724C\u5408\u4F5C",
      tier: "\u5C3E\u90E8\u8FBE\u4EBA"
    }
  },
  // PLATFORM_ONLY
  {
    sourceId: "xhs-1003",
    name: "\u738B\u5C0F\u660E",
    idCard: "440301199906080533",
    mobile: "13712345678",
    bankCard: "6228480000000000026",
    extra: {
      xhsNickname: "@\u65C5\u884C\u738B\u5C0F\u660E",
      followers: 24e4,
      registeredAt: "2021-11-20",
      verifiedAt: "2021-11-21",
      idCardFrontUrl: "MOCK://idcard-front/wangxiaoming.jpg",
      idCardBackUrl: "MOCK://idcard-back/wangxiaoming.jpg",
      contractType: "\u54C1\u724C\u5408\u4F5C + \u76F4\u64AD\u5206\u6210",
      tier: "\u5934\u90E8\u8FBE\u4EBA"
    }
  },
  // PLATFORM_ONLY
  {
    sourceId: "xhs-1004",
    name: "\u8D75\u6653\u82B3",
    idCard: "32010619970218764X",
    mobile: "13611112222",
    bankCard: "",
    extra: {
      xhsNickname: "@\u7A7F\u642D\u8D75\u6653\u82B3",
      followers: 98e3,
      registeredAt: "2023-01-12",
      verifiedAt: "2023-01-15",
      idCardFrontUrl: "MOCK://idcard-front/zhaoxiaofang.jpg",
      idCardBackUrl: "MOCK://idcard-back/zhaoxiaofang.jpg",
      contractType: "\u54C1\u724C\u5408\u4F5C",
      tier: "\u8170\u90E8\u8FBE\u4EBA"
    }
  }
];
var MOCK_INCOMES = [
  // 张三 当月 2 笔
  { recordId: "xhs-inc-001", idCard: "110101199003072818", period: "2026-05", grossAmount: 18500, bizType: "\u54C1\u724C\u5408\u4F5C-\u67D0\u7F8E\u5986\u54C1\u724C", settledAt: "2026-05-03" },
  { recordId: "xhs-inc-002", idCard: "110101199003072818", period: "2026-05", grossAmount: 6800, bizType: "\u521B\u4F5C\u6FC0\u52B1", settledAt: "2026-05-15" },
  // 李思 当月 1 笔
  { recordId: "xhs-inc-003", idCard: "310115198506040034", period: "2026-05", grossAmount: 4200, bizType: "\u54C1\u724C\u5408\u4F5C-\u67D0\u9910\u996E\u54C1\u724C", settledAt: "2026-05-08" },
  // 王小明 当月 3 笔(头部)
  { recordId: "xhs-inc-004", idCard: "440301199906080533", period: "2026-05", grossAmount: 42e3, bizType: "\u54C1\u724C\u5408\u4F5C-\u67D0OTA\u54C1\u724C", settledAt: "2026-05-02" },
  { recordId: "xhs-inc-005", idCard: "440301199906080533", period: "2026-05", grossAmount: 15e3, bizType: "\u76F4\u64AD\u5206\u6210", settledAt: "2026-05-18" },
  { recordId: "xhs-inc-006", idCard: "440301199906080533", period: "2026-05", grossAmount: 9500, bizType: "\u521B\u4F5C\u6FC0\u52B1", settledAt: "2026-05-25" },
  // 赵晓芳 当月 1 笔
  { recordId: "xhs-inc-007", idCard: "32010619970218764X", period: "2026-05", grossAmount: 7200, bizType: "\u54C1\u724C\u5408\u4F5C-\u67D0\u670D\u9970\u54C1\u724C", settledAt: "2026-05-10" }
];
var XhsTalentSource = class {
  sourceName = "\u5C0F\u7EA2\u4E66\u8FBE\u4EBA\u5E93";
  async fetch() {
    return MOCK_DATA;
  }
  /** 拉取指定身份证的小红书结算流水。不传 idCards 表示全量。 */
  async fetchIncomes(idCards, period) {
    let list = MOCK_INCOMES;
    if (period) list = list.filter((r) => r.period === period);
    if (idCards && idCards.length > 0) {
      const set = new Set(idCards);
      list = list.filter((r) => set.has(r.idCard));
    }
    return list;
  }
};
var xhsTalentSource = new XhsTalentSource();

// server/modules/reconcileEngine.ts
function norm(s) {
  return (s ?? "").trim();
}
function diffFields(a, b) {
  const diffs = [];
  if (norm(a.name) !== norm(b.name)) diffs.push("\u59D3\u540D");
  if (norm(a.mobile) && norm(b.mobile) && norm(a.mobile) !== norm(b.mobile)) diffs.push("\u624B\u673A\u53F7");
  if (norm(a.bankCard) && norm(b.bankCard) && norm(a.bankCard) !== norm(b.bankCard)) diffs.push("\u94F6\u884C\u5361\u53F7");
  return diffs;
}
function reconcile(taxSource, platformSource) {
  const taxMap = /* @__PURE__ */ new Map();
  for (const t of taxSource) taxMap.set(norm(t.idCard).toUpperCase(), t);
  const pfMap = /* @__PURE__ */ new Map();
  for (const p of platformSource) pfMap.set(norm(p.idCard).toUpperCase(), p);
  const matched = [];
  const conflicted = [];
  const taxOnly = [];
  const platformOnly = [];
  taxMap.forEach((taxRec, idCard) => {
    const pfRec = pfMap.get(idCard);
    if (!pfRec) {
      taxOnly.push({ status: "TAX_ONLY", idCard, taxRecord: taxRec, conflicts: [] });
      return;
    }
    const diffs = diffFields(taxRec, pfRec);
    if (diffs.length === 0) {
      matched.push({ status: "MATCH", idCard, taxRecord: taxRec, platformRecord: pfRec, conflicts: [] });
    } else {
      conflicted.push({ status: "CONFLICT", idCard, taxRecord: taxRec, platformRecord: pfRec, conflicts: diffs });
    }
  });
  pfMap.forEach((pfRec, idCard) => {
    if (!taxMap.has(idCard)) {
      platformOnly.push({ status: "PLATFORM_ONLY", idCard, platformRecord: pfRec, conflicts: [] });
    }
  });
  return {
    total: taxMap.size + platformOnly.length,
    matched,
    conflicted,
    taxOnly,
    platformOnly,
    summary: {
      MATCH: matched.length,
      CONFLICT: conflicted.length,
      TAX_ONLY: taxOnly.length,
      PLATFORM_ONLY: platformOnly.length
    }
  };
}

// server/routes.ts
var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
var ok = (res, data) => res.json({ success: true, data });
var fail = (res, msg, code = 400) => res.status(code).json({ success: false, error: msg });
async function registerRoutes(httpServer2, app2) {
  app2.get("/api/talents", (req, res) => {
    const keyword = String(req.query.keyword ?? "");
    ok(res, talentRepo.list(keyword));
  });
  app2.post("/api/talents", (req, res) => {
    const parsed = insertTalentSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, "\u53C2\u6570\u9519\u8BEF: " + parsed.error.message);
    if (talentRepo.getByIdCard(parsed.data.idCard)) {
      return fail(res, "\u8BE5\u8EAB\u4EFD\u8BC1\u53F7\u5DF2\u5B58\u5728");
    }
    ok(res, talentRepo.create(parsed.data));
  });
  app2.patch("/api/talents/:id", (req, res) => {
    const id = Number(req.params.id);
    const t = talentRepo.update(id, req.body);
    if (!t) return fail(res, "\u8FBE\u4EBA\u4E0D\u5B58\u5728", 404);
    ok(res, t);
  });
  app2.delete("/api/talents/:id", (req, res) => {
    const id = Number(req.params.id);
    ok(res, { removed: talentRepo.remove(id) });
  });
  const verifySchema = z2.object({
    mode: z2.enum(["two", "three", "four"]),
    name: z2.string().min(1),
    idCard: z2.string().min(15),
    mobile: z2.string().optional(),
    bankCard: z2.string().optional(),
    talentId: z2.number().optional()
  });
  app2.post("/api/verify", async (req, res) => {
    const p = verifySchema.safeParse(req.body);
    if (!p.success) return fail(res, "\u53C2\u6570\u9519\u8BEF: " + p.error.message);
    const result = await kycProvider.verify(p.data);
    const linkedTalent = p.data.talentId ? talentRepo.getById(p.data.talentId) : void 0;
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
      taxAmount: null
    });
    if (p.data.talentId) {
      talentRepo.setKycStatus(p.data.talentId, result.passed ? "verified" : "failed");
    }
    ok(res, result);
  });
  app2.get("/api/kyc-logs", (_req, res) => ok(res, kycLogRepo.listAll()));
  app2.get("/api/incomes", (req, res) => {
    const period = req.query.period ? String(req.query.period) : void 0;
    ok(res, incomeRepo.list(period));
  });
  app2.post("/api/incomes", (req, res) => {
    const p = insertIncomeSchema.safeParse(req.body);
    if (!p.success) return fail(res, "\u53C2\u6570\u9519\u8BEF: " + p.error.message);
    const inc = incomeRepo.create(p.data);
    const taxResult = calculate({
      incomeType: p.data.incomeType,
      income: p.data.amount
    });
    incomeRepo.saveTaxResult(inc.id, taxResult);
    ok(res, { income: inc, tax: taxResult });
  });
  app2.delete("/api/incomes/:id", (req, res) => {
    ok(res, { removed: incomeRepo.remove(Number(req.params.id)) });
  });
  const calcSchema = z2.object({
    incomeType: z2.enum(["labor", "salary", "platform", "business"]),
    income: z2.number().positive(),
    cumulativeIncome: z2.number().optional(),
    monthsWorked: z2.number().int().positive().optional(),
    alreadyWithheld: z2.number().optional()
  });
  app2.post("/api/calc", (req, res) => {
    const p = calcSchema.safeParse(req.body);
    if (!p.success) return fail(res, "\u53C2\u6570\u9519\u8BEF: " + p.error.message);
    ok(res, calculate(p.data));
  });
  app2.get("/api/filing/preview", (req, res) => {
    const period = String(req.query.period ?? "");
    if (!period) return fail(res, "\u8BF7\u63D0\u4F9B\u6240\u5C5E\u671F period=YYYY-MM");
    const rows = incomeRepo.list(period);
    const filingRows = rows.filter((r) => r.tax).map((r) => ({
      period: r.period,
      name: r.talent?.name ?? "",
      idCard: r.talent?.idCard ?? "",
      incomeType: r.incomeType,
      income: r.amount,
      deduction: r.amount - r.tax.taxableIncome,
      taxable: r.tax.taxableIncome,
      rate: r.tax.rate,
      quickDeduction: r.tax.quickDeduction,
      taxAmount: r.tax.taxAmount,
      alreadyPaid: 0
    }));
    ok(res, filingRows);
  });
  app2.get("/api/filing/export", (req, res) => {
    const period = String(req.query.period ?? "");
    if (!period) return fail(res, "\u8BF7\u63D0\u4F9B\u6240\u5C5E\u671F period=YYYY-MM");
    const rows = incomeRepo.list(period).filter((r) => r.tax);
    const filingRows = rows.map((r) => ({
      period: r.period,
      name: r.talent?.name ?? "",
      idCard: r.talent?.idCard ?? "",
      incomeType: r.incomeType,
      income: r.amount,
      deduction: r.amount - r.tax.taxableIncome,
      taxable: r.tax.taxableIncome,
      rate: r.tax.rate,
      quickDeduction: r.tax.quickDeduction,
      taxAmount: r.tax.taxAmount,
      alreadyPaid: 0
    }));
    const csv = buildFilingCsv(filingRows);
    const fileName = buildFilingFileName(period);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(csv);
  });
  const batchSchema = z2.object({
    rows: z2.array(z2.object({
      name: z2.string().min(1),
      idCard: z2.string().min(15),
      mobile: z2.string().optional(),
      bankCard: z2.string().optional(),
      incomeType: z2.enum(["labor", "salary", "platform", "business"]),
      relation: z2.enum(["employee", "contractor", "studio"]).optional(),
      period: z2.string().regex(/^\d{4}-\d{2}$/),
      amount: z2.number().positive()
    })).max(1e3)
  });
  app2.post("/api/batch", async (req, res) => {
    const p = batchSchema.safeParse(req.body);
    if (!p.success) return fail(res, "\u53C2\u6570\u9519\u8BEF: " + p.error.message);
    const results = await runBatch(p.data.rows);
    ok(res, results);
  });
  app2.get("/api/dashboard", (_req, res) => {
    const allTalents = talentRepo.list();
    const allIncomes = incomeRepo.list();
    const totalIncome = allIncomes.reduce((s, r) => s + r.amount, 0);
    const totalTax = allIncomes.reduce((s, r) => s + (r.tax?.taxAmount ?? 0), 0);
    const verified = allTalents.filter((t) => t.kycStatus === "verified").length;
    ok(res, {
      talentCount: allTalents.length,
      verifiedCount: verified,
      incomeCount: allIncomes.length,
      totalIncome,
      totalTax
    });
  });
  app2.get("/api/reconcile/template", (_req, res) => {
    const buf = buildExcelTemplate();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="tax_talents_template.xlsx"`);
    res.send(buf);
  });
  app2.get("/api/xhs/talents", async (_req, res) => {
    const list = await xhsTalentSource.fetch();
    ok(res, list);
  });
  const xhsImportSchema = z2.object({
    defaultIncomeType: z2.enum(["labor", "platform", "salary", "business"]).default("platform"),
    defaultRelation: z2.enum(["employee", "contractor", "studio"]).default("contractor")
  });
  app2.post("/api/xhs/import", async (req, res) => {
    const p = xhsImportSchema.safeParse(req.body ?? {});
    if (!p.success) return fail(res, "\u53C2\u6570\u9519\u8BEF: " + p.error.message);
    const xhsList = await xhsTalentSource.fetch();
    const summary = { created: 0, updated: 0, skipped: 0 };
    const failures = [];
    for (const t of xhsList) {
      if (!t.name || !t.idCard) {
        summary.skipped++;
        failures.push({ name: t.name || "(\u672A\u77E5)", reason: "\u7F3A\u5C11\u59D3\u540D\u6216\u8EAB\u4EFD\u8BC1\u53F7" });
        continue;
      }
      const exists = talentRepo.getByIdCard(t.idCard);
      if (exists) {
        talentRepo.update(exists.id, {
          name: exists.name || t.name,
          mobile: exists.mobile || t.mobile || null,
          bankCard: exists.bankCard || t.bankCard || null,
          note: exists.note || `\u6765\u6E90: \u5C0F\u7EA2\u4E66 ${t.sourceId}`
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
          note: `\u6765\u6E90: \u5C0F\u7EA2\u4E66 ${t.sourceId}` + (t.extra?.xhsNickname ? ` \xB7 ${t.extra.xhsNickname}` : "")
        });
        summary.created++;
      }
    }
    ok(res, { ...summary, total: xhsList.length, failures });
  });
  app2.get("/api/xhs/incomes", async (req, res) => {
    const period = req.query.period || void 0;
    const idCards = req.query.idCards ? String(req.query.idCards).split(",").map((s) => s.trim()).filter(Boolean) : void 0;
    const list = await xhsTalentSource.fetchIncomes(idCards, period);
    ok(res, list);
  });
  const xhsSyncSchema = z2.object({
    period: z2.string().regex(/^\d{4}-\d{2}$/, "period \u683C\u5F0F\u5E94\u4E3A YYYY-MM"),
    idCards: z2.array(z2.string()).optional(),
    incomeType: z2.enum(["labor", "platform", "salary", "business"]).default("platform"),
    relation: z2.enum(["employee", "contractor", "studio"]).default("contractor")
  });
  app2.post("/api/batch/xhs-sync", async (req, res) => {
    const p = xhsSyncSchema.safeParse(req.body ?? {});
    if (!p.success) return fail(res, "\u53C2\u6570\u9519\u8BEF: " + p.error.message);
    const { period, idCards, incomeType, relation } = p.data;
    const allTalents = await xhsTalentSource.fetch();
    const talentsToSync = idCards && idCards.length > 0 ? allTalents.filter((t) => idCards.includes(t.idCard)) : allTalents;
    const incomes = await xhsTalentSource.fetchIncomes(
      talentsToSync.map((t) => t.idCard),
      period
    );
    const byIdCard = /* @__PURE__ */ new Map();
    for (const inc of incomes) {
      const cur = byIdCard.get(inc.idCard) ?? { sum: 0, details: [] };
      cur.sum += inc.grossAmount;
      cur.details.push(`${inc.bizType} \xA5${inc.grossAmount}`);
      byIdCard.set(inc.idCard, cur);
    }
    const rows = [];
    for (const t of talentsToSync) {
      const agg = byIdCard.get(t.idCard);
      if (!agg || agg.sum <= 0) continue;
      rows.push({
        name: t.name,
        idCard: t.idCard,
        mobile: t.mobile,
        bankCard: t.bankCard,
        incomeType,
        relation,
        period,
        amount: agg.sum
      });
    }
    const results = await runBatch(rows, "xhs-sync");
    const summary = {
      talentsScanned: talentsToSync.length,
      incomesFetched: incomes.length,
      rowsBuilt: rows.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      totalTax: results.reduce((s, r) => s + (r.taxAmount ?? 0), 0),
      totalNet: results.reduce((s, r) => s + (r.netIncome ?? 0), 0)
    };
    ok(res, { period, summary, results });
  });
  app2.post("/api/reconcile/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return fail(res, "\u672A\u68C0\u6D4B\u5230\u4E0A\u4F20\u6587\u4EF6 (\u5B57\u6BB5\u540D\u5E94\u4E3A file)");
    try {
      const taxSource = new TaxExcelSource(req.file.buffer);
      const [taxList, xhsList] = await Promise.all([
        taxSource.fetch(),
        xhsTalentSource.fetch()
      ]);
      const result = reconcile(taxList, xhsList);
      ok(res, result);
    } catch (e) {
      return fail(res, "Excel \u89E3\u6790\u5931\u8D25: " + (e?.message ?? String(e)));
    }
  });
  const commitSchema = z2.object({
    rows: z2.array(z2.object({
      idCard: z2.string(),
      status: z2.enum(["MATCH", "CONFLICT", "TAX_ONLY", "PLATFORM_ONLY"]),
      preferSource: z2.enum(["tax", "platform"]).optional(),
      taxRecord: z2.any().optional(),
      platformRecord: z2.any().optional()
    })),
    defaultIncomeType: z2.enum(["labor", "platform", "salary", "business"]).default("labor"),
    defaultRelation: z2.enum(["employee", "contractor", "studio"]).default("contractor")
  });
  app2.post("/api/reconcile/commit", (req, res) => {
    const p = commitSchema.safeParse(req.body);
    if (!p.success) return fail(res, "\u53C2\u6570\u9519\u8BEF: " + p.error.message);
    const summary = { created: 0, updated: 0, skipped: 0 };
    for (const row of p.data.rows) {
      let winner;
      if (row.status === "MATCH") {
        winner = row.taxRecord;
      } else if (row.status === "CONFLICT") {
        winner = row.preferSource === "platform" ? row.platformRecord : row.taxRecord;
      } else if (row.status === "TAX_ONLY") {
        winner = row.taxRecord;
      } else if (row.status === "PLATFORM_ONLY") {
        winner = row.platformRecord;
      }
      if (!winner || !winner.name || !winner.idCard) {
        summary.skipped++;
        continue;
      }
      const exists = talentRepo.getByIdCard(winner.idCard);
      if (exists) {
        talentRepo.update(exists.id, {
          name: winner.name,
          idCard: winner.idCard,
          mobile: winner.mobile ?? exists.mobile ?? null,
          bankCard: winner.bankCard ?? exists.bankCard ?? null
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
          note: "\u6765\u6E90: \u53CC\u6E90\u6BD4\u5BF9"
        });
        summary.created++;
      }
    }
    ok(res, summary);
  });
  return httpServer2;
}

// server/serverlessEntry.ts
var app = express();
var httpServer = createServer(app);
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: false }));
var initPromise = null;
function ensureRoutes() {
  if (!initPromise) {
    initPromise = registerRoutes(httpServer, app).then(() => {
      app.use((err, _req, res, _next) => {
        const status = err?.status || err?.statusCode || 500;
        res.status(status).json({ message: err?.message || "Internal Server Error" });
      });
    });
  }
  return initPromise;
}
async function handler(req, res) {
  await ensureRoutes();
  return app(req, res);
}
export {
  handler as default
};
