/* ============================================================
 * 模块: 核验日志数据访问层 (Kyc Log Repository)
 * 职责: 持久化每一次身份核验调用,供审计追溯。
 * ============================================================ */

import { db } from "../db";
import { kycLogs, type KycLog } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

/* v1.3 变更:
 *  - 日志可插入业务字段(period / incomeType / relation / amount / taxAmount / source / talentName)
 *  - listAll 取消默认 200 条限制,返回全量,由前端做筛选 + 分页。 */
export interface IKycLogRepo {
  add(log: Omit<KycLog, "id" | "createdAt">): KycLog;
  listByTalent(talentId: number): KycLog[];
  listAll(limit?: number): KycLog[];
}

class KycLogRepo implements IKycLogRepo {
  add(log: Omit<KycLog, "id" | "createdAt">): KycLog {
    return db.insert(kycLogs).values({
      ...log,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  listByTalent(talentId: number): KycLog[] {
    return db.select().from(kycLogs)
      .where(eq(kycLogs.talentId, talentId))
      .orderBy(desc(kycLogs.id))
      .all();
  }

  listAll(limit = 1000): KycLog[] {
    return db.select().from(kycLogs)
      .orderBy(desc(kycLogs.id))
      .limit(limit).all();
  }
}

export const kycLogRepo: IKycLogRepo = new KycLogRepo();
