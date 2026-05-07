/* ============================================================
 * 模块: 达人档案数据访问层 (Talent Repository)
 * 职责: 封装 talents 表的 CRUD,屏蔽底层数据库。
 *      上层(API/批量任务)只依赖该接口,不直接 SQL。
 * ============================================================ */

import { db } from "../db";
import { talents, type InsertTalent, type Talent } from "@shared/schema";
import { eq, like, or } from "drizzle-orm";

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
    if (keyword && keyword.trim()) {
      const k = `%${keyword.trim()}%`;
      return db.select().from(talents)
        .where(or(like(talents.name, k), like(talents.idCard, k)))
        .all();
    }
    return db.select().from(talents).all();
  }

  getById(id: number) {
    return db.select().from(talents).where(eq(talents.id, id)).get();
  }

  getByIdCard(idCard: string) {
    return db.select().from(talents).where(eq(talents.idCard, idCard)).get();
  }

  create(t: InsertTalent): Talent {
    return db.insert(talents).values({
      ...t,
      kycStatus: "unverified",
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  update(id: number, patch: Partial<InsertTalent>): Talent | undefined {
    db.update(talents).set(patch).where(eq(talents.id, id)).run();
    return this.getById(id);
  }

  remove(id: number): boolean {
    const r = db.delete(talents).where(eq(talents.id, id)).run();
    return r.changes > 0;
  }

  setKycStatus(id: number, status: "verified" | "failed" | "unverified") {
    db.update(talents).set({ kycStatus: status }).where(eq(talents.id, id)).run();
  }
}

export const talentRepo: ITalentRepo = new TalentRepo();
