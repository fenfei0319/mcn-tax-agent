/* ============================================================
 * 模块: 内存存储中心 (In-Memory Store)
 * 职责: 提供进程内的实体集合,屏蔽底层存储介质。
 *      v1.4 重构:从 better-sqlite3 切换为纯内存,
 *               避免 Serverless 环境下的 native 依赖问题,
 *               兼容 Vercel/Edge 等无文件系统平台。
 * 数据生命周期: 随进程存在,重启后丢失。本系统为评审/演示场景,无持久化诉求。
 * ============================================================ */

import type { Talent, Income, TaxRecord, KycLog, Filing } from "../shared/schema";

interface Sequencer {
  next(): number;
}

class AutoIncrement implements Sequencer {
  private id = 0;
  next() { return ++this.id; }
}

/* ---------- 单例存储 ---------- */
class MemoryStore {
  talents = new Map<number, Talent>();
  incomes = new Map<number, Income>();
  taxRecords = new Map<number, TaxRecord>();
  kycLogs = new Map<number, KycLog>();
  filings = new Map<number, Filing>();

  seq = {
    talents: new AutoIncrement(),
    incomes: new AutoIncrement(),
    taxRecords: new AutoIncrement(),
    kycLogs: new AutoIncrement(),
    filings: new AutoIncrement(),
  };
}

/* Serverless 冷启动会复用全局单例,避免每次请求新建 */
const globalAny = globalThis as any;
export const store: MemoryStore =
  globalAny.__mcnStore ?? (globalAny.__mcnStore = new MemoryStore());
