/* ============================================================
 * 模块: 批量任务调度 (Batch Runner)
 * 职责: 接收一批"达人 + 收入"原始数据,串联 KYC + 计算 + 入库。
 *      内存中执行,返回每行的成功/失败结果。
 * 解耦: 仅依赖各 Repo 与 taxEngine / kycProvider 接口。
 * ============================================================ */

import { kycProvider } from "./kycProvider";
import { calculate, type IncomeType } from "./taxEngine";
import { talentRepo } from "./talentRepo";
import { incomeRepo } from "./incomeRepo";
import { kycLogRepo } from "./kycLogRepo";

export interface BatchRow {
  name: string;
  idCard: string;
  mobile?: string;
  bankCard?: string;
  incomeType: IncomeType;
  relation?: "employee" | "contractor" | "studio";
  period: string;          // YYYY-MM
  amount: number;
}

export interface BatchRowResult {
  index: number;
  name: string;
  idCard: string;
  passed: boolean;
  reason: string;
  taxAmount?: number;
  netIncome?: number;
}

/**
 * v1.3:增加 source 参数(例如 "batch" / "xhs-sync"),同时在 KYC 日志中
 *      写入该记录的业务上下文(姓名 / 期 / 所得类型 / 签约关系 / 金额 / 税额),
 *      以便后续在「核验日志」面板中筛选与复核。
 */
export async function runBatch(rows: BatchRow[], source: "batch" | "xhs-sync" = "batch"): Promise<BatchRowResult[]> {
  const results: BatchRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const baseResult: BatchRowResult = {
      index: i + 1,
      name: r.name,
      idCard: r.idCard,
      passed: false,
      reason: "",
    };

    try {
      /* 步骤 1: 身份核验 */
      const mode = r.bankCard ? "four" : (r.mobile ? "three" : "two");
      const kyc = await kycProvider.verify({
        mode,
        name: r.name,
        idCard: r.idCard,
        mobile: r.mobile,
        bankCard: r.bankCard,
      });

      /* 步骤 2: 落档(已存在则更新) */
      let talent = talentRepo.getByIdCard(r.idCard);
      if (!talent) {
        talent = talentRepo.create({
          name: r.name,
          idCard: r.idCard,
          mobile: r.mobile ?? null,
          bankCard: r.bankCard ?? null,
          incomeType: r.incomeType,
          relation: r.relation ?? "contractor",
          note: null,
        });
      }
      talentRepo.setKycStatus(talent.id, kyc.passed ? "verified" : "failed");

      if (!kyc.passed) {
        /* 核验不通过仍写入日志,但未发生收入计算 */
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
          taxAmount: null,
        });
        baseResult.reason = "核验未通过: " + kyc.reason;
        results.push(baseResult);
        continue;
      }

      /* 步骤 3: 收入登记(走到这一步表示身份核验已通过,可靠收入) */
      const income = incomeRepo.create({
        talentId: talent.id,
        period: r.period,
        amount: r.amount,
        incomeType: r.incomeType,
        note: null,
      });

      /* 步骤 4: 税额计算 */
      const tax = calculate({ incomeType: r.incomeType, income: r.amount });
      incomeRepo.saveTaxResult(income.id, tax);

      /* 步骤 5: 写入日志(含金额/税额) */
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
        taxAmount: tax.taxAmount,
      });

      baseResult.passed = true;
      baseResult.reason = "处理成功";
      baseResult.taxAmount = tax.taxAmount;
      baseResult.netIncome = tax.netIncome;
      results.push(baseResult);
    } catch (err: any) {
      baseResult.reason = "异常: " + (err?.message ?? String(err));
      results.push(baseResult);
    }
  }

  return results;
}
