/* ============================================================
 * 模块: 收入登记与税额结果数据访问层 (Income Repository)
 * 职责: 封装 incomes / tax_records 集合的读写。
 * v1.4: 从 SQL 改为内存 Map,接口签名零变化。
 * ============================================================ */

import { store } from "../db";
import type { InsertIncome, Income, TaxRecord, Talent } from "../shared/schema";
import type { TaxResult } from "./taxEngine";

export interface IncomeWithTalent extends Income {
  talent?: Talent;
  tax?: TaxRecord;
}

export interface IIncomeRepo {
  list(period?: string): IncomeWithTalent[];
  create(i: InsertIncome): Income;
  remove(id: number): boolean;
  saveTaxResult(incomeId: number, r: TaxResult): TaxRecord;
  getTaxByIncome(incomeId: number): TaxRecord | undefined;
}

class IncomeRepo implements IIncomeRepo {
  list(period?: string): IncomeWithTalent[] {
    const rows = Array.from(store.incomes.values())
      .filter(i => !period || i.period === period);

    return rows.map(row => ({
      ...row,
      talent: store.talents.get(row.talentId),
      tax: this.getTaxByIncome(row.id),
    }));
  }

  create(i: InsertIncome): Income {
    const id = store.seq.incomes.next();
    const created: Income = {
      id,
      talentId: i.talentId,
      period: i.period,
      amount: i.amount,
      incomeType: i.incomeType,
      note: i.note ?? null,
      createdAt: new Date().toISOString(),
    };
    store.incomes.set(id, created);
    return created;
  }

  remove(id: number): boolean {
    /* 级联删除该收入对应的税额记录 */
    for (const [taxId, tr] of store.taxRecords.entries()) {
      if (tr.incomeId === id) store.taxRecords.delete(taxId);
    }
    return store.incomes.delete(id);
  }

  saveTaxResult(incomeId: number, r: TaxResult): TaxRecord {
    /* 删除旧结果 */
    for (const [taxId, tr] of store.taxRecords.entries()) {
      if (tr.incomeId === incomeId) store.taxRecords.delete(taxId);
    }
    const id = store.seq.taxRecords.next();
    const created: TaxRecord = {
      id,
      incomeId,
      taxableIncome: r.taxableIncome,
      rate: r.rate,
      quickDeduction: r.quickDeduction,
      taxAmount: r.taxAmount,
      netIncome: r.netIncome,
      explanation: JSON.stringify(r.explanation),
      createdAt: new Date().toISOString(),
    };
    store.taxRecords.set(id, created);
    return created;
  }

  getTaxByIncome(incomeId: number): TaxRecord | undefined {
    for (const tr of store.taxRecords.values()) {
      if (tr.incomeId === incomeId) return tr;
    }
    return undefined;
  }
}

export const incomeRepo: IIncomeRepo = new IncomeRepo();
