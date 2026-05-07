/* ============================================================
 * 模块: 达人档案数据访问层 (Talent Repository)
 * 职责: 封装 talents 集合的 CRUD,屏蔽底层存储。
 *      上层(API/批量任务)只依赖该接口,不直接访问存储。
 * v1.4: 从 SQL 改为内存 Map,接口签名零变化。
 * ============================================================ */

import { store } from "../db";
import type { InsertTalent, Talent } from "@shared/schema";

export interface ITalentRepo {
  list(keyword?: string): Talent[];
  getById(id: number): Talent | undefined;
  getByIdCard(idCard: string): Talent | undefined;
  create(t: InsertTalent): Talent;
  update(id: number, patch: Partial<InsertTalent>): Talent | undefined;
  remove(id: number): boolean;
  setKycStatus(id: number, status: "verified" | "failed" | "unverified"): void;
}

class TalentRepo implements ITalentRepo {
  list(keyword?: string): Talent[] {
    const all = Array.from(store.talents.values());
    if (keyword && keyword.trim()) {
      const k = keyword.trim();
      return all.filter(t => t.name.includes(k) || t.idCard.includes(k));
    }
    return all;
  }

  getById(id: number) {
    return store.talents.get(id);
  }

  getByIdCard(idCard: string) {
    for (const t of store.talents.values()) {
      if (t.idCard === idCard) return t;
    }
    return undefined;
  }

  create(t: InsertTalent): Talent {
    const id = store.seq.talents.next();
    const created: Talent = {
      id,
      name: t.name,
      idCard: t.idCard,
      mobile: t.mobile ?? null,
      bankCard: t.bankCard ?? null,
      incomeType: t.incomeType,
      relation: t.relation,
      kycStatus: "unverified",
      note: t.note ?? null,
      createdAt: new Date().toISOString(),
    };
    store.talents.set(id, created);
    return created;
  }

  update(id: number, patch: Partial<InsertTalent>): Talent | undefined {
    const existed = store.talents.get(id);
    if (!existed) return undefined;
    const next: Talent = {
      ...existed,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.idCard !== undefined && { idCard: patch.idCard }),
      ...(patch.mobile !== undefined && { mobile: patch.mobile ?? null }),
      ...(patch.bankCard !== undefined && { bankCard: patch.bankCard ?? null }),
      ...(patch.incomeType !== undefined && { incomeType: patch.incomeType }),
      ...(patch.relation !== undefined && { relation: patch.relation }),
      ...(patch.note !== undefined && { note: patch.note ?? null }),
    };
    store.talents.set(id, next);
    return next;
  }

  remove(id: number): boolean {
    return store.talents.delete(id);
  }

  setKycStatus(id: number, status: "verified" | "failed" | "unverified") {
    const t = store.talents.get(id);
    if (t) store.talents.set(id, { ...t, kycStatus: status });
  }
}

export const talentRepo: ITalentRepo = new TalentRepo();
