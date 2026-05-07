/* ============================================================
 * 模块: 核验日志数据访问层 (Kyc Log Repository)
 * 职责: 持久化每一次身份核验调用,供审计追溯。
 * v1.4: 从 SQL 改为内存 Map,接口签名零变化。
 * v1.3: 日志带业务字段 (period / incomeType / relation / amount / taxAmount / source / talentName)
 *       listAll 默认上限 1000,前端做筛选 + 分页。
 * ============================================================ */

import { store } from "../db";
import type { KycLog } from "@shared/schema";

export interface IKycLogRepo {
  add(log: Omit<KycLog, "id" | "createdAt">): KycLog;
  listByTalent(talentId: number): KycLog[];
  listAll(limit?: number): KycLog[];
}

class KycLogRepo implements IKycLogRepo {
  add(log: Omit<KycLog, "id" | "createdAt">): KycLog {
    const id = store.seq.kycLogs.next();
    const created: KycLog = {
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
      createdAt: new Date().toISOString(),
    };
    store.kycLogs.set(id, created);
    return created;
  }

  listByTalent(talentId: number): KycLog[] {
    return Array.from(store.kycLogs.values())
      .filter(l => l.talentId === talentId)
      .sort((a, b) => b.id - a.id);
  }

  listAll(limit = 1000): KycLog[] {
    return Array.from(store.kycLogs.values())
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }
}

export const kycLogRepo: IKycLogRepo = new KycLogRepo();
