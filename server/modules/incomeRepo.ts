/* ============================================================
 * 模块: 收入登记与税额结果数据访问层 (Income Repository)
 * 职责: 封装 incomes / tax_records 两表的读写。
 * ============================================================ */

import { db } from "../db";
import { incomes, taxRecords, talents, type InsertIncome, type Income, type TaxRecord, type Talent } from "@shared/schema";
import { eq, and } from "drizzle-orm";
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
    const rows = period
      ? db.select().from(incomes).where(eq(incomes.period, period)).all()
      : db.select().from(incomes).all();

    return rows.map(row => {
      const t = db.select().from(talents).where(eq(talents.id, row.talentId)).get();
      const tax = db.select().from(taxRecords).where(eq(taxRecords.incomeId, row.id)).get();
      return { ...row, talent: t, tax };
    });
  }

  create(i: InsertIncome): Income {
    return db.insert(incomes).values({
      ...i,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  remove(id: number): boolean {
    db.delete(taxRecords).where(eq(taxRecords.incomeId, id)).run();
    const r = db.delete(incomes).where(eq(incomes.id, id)).run();
    return r.changes > 0;
  }

  saveTaxResult(incomeId: number, r: TaxResult): TaxRecord {
    // 删除旧结果
    db.delete(taxRecords).where(eq(taxRecords.incomeId, incomeId)).run();
    return db.insert(taxRecords).values({
      incomeId,
      taxableIncome: r.taxableIncome,
      rate: r.rate,
      quickDeduction: r.quickDeduction,
      taxAmount: r.taxAmount,
      netIncome: r.netIncome,
      explanation: JSON.stringify(r.explanation),
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  getTaxByIncome(incomeId: number): TaxRecord | undefined {
    return db.select().from(taxRecords).where(eq(taxRecords.incomeId, incomeId)).get();
  }
}

export const incomeRepo: IIncomeRepo = new IncomeRepo();
