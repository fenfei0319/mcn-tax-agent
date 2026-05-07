/* ============================================================
 * 模块: 双源比对引擎 (Reconcile Engine)
 * 职责: 对两份达人身份数据做自动比对,产出 4 类结果。
 * 特性: 纯函数,无副作用。输入两个数组,输出比对结果对象。
 * ============================================================ */

import type { SourceTalent } from "./talentSource";

export type ReconcileStatus = "MATCH" | "CONFLICT" | "TAX_ONLY" | "PLATFORM_ONLY";

export interface ReconcileRow {
  status: ReconcileStatus;
  idCard: string;
  taxRecord?: SourceTalent;        // 税务 Excel 记录
  platformRecord?: SourceTalent;   // 小红书平台记录
  conflicts: string[];             // 冲突的字段列表(仅 CONFLICT 有值)
}

export interface ReconcileResult {
  total: number;
  matched: ReconcileRow[];
  conflicted: ReconcileRow[];
  taxOnly: ReconcileRow[];
  platformOnly: ReconcileRow[];
  summary: {
    MATCH: number;
    CONFLICT: number;
    TAX_ONLY: number;
    PLATFORM_ONLY: number;
  };
}

/* ---------- 工具: 归一化字段 ---------- */
function norm(s?: string): string {
  return (s ?? "").trim();
}

/* ---------- 工具: 比较单行,返回不一致的字段名数组 ---------- */
function diffFields(a: SourceTalent, b: SourceTalent): string[] {
  const diffs: string[] = [];
  if (norm(a.name) !== norm(b.name)) diffs.push("姓名");
  // 手机/银行卡:只在两源都有值时才比对差异;若一方缺失,不算冲突
  if (norm(a.mobile) && norm(b.mobile) && norm(a.mobile) !== norm(b.mobile)) diffs.push("手机号");
  if (norm(a.bankCard) && norm(b.bankCard) && norm(a.bankCard) !== norm(b.bankCard)) diffs.push("银行卡号");
  return diffs;
}

/* ---------- 主入口: 比对两源 ---------- */
export function reconcile(
  taxSource: SourceTalent[],
  platformSource: SourceTalent[]
): ReconcileResult {
  // 以身份证号为主键建索引
  const taxMap = new Map<string, SourceTalent>();
  for (const t of taxSource) taxMap.set(norm(t.idCard).toUpperCase(), t);
  const pfMap = new Map<string, SourceTalent>();
  for (const p of platformSource) pfMap.set(norm(p.idCard).toUpperCase(), p);

  const matched: ReconcileRow[] = [];
  const conflicted: ReconcileRow[] = [];
  const taxOnly: ReconcileRow[] = [];
  const platformOnly: ReconcileRow[] = [];

  // 扫描税务源
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

  // 扫描平台独有
  pfMap.forEach((pfRec, idCard) => {
    if (!taxMap.has(idCard)) {
      platformOnly.push({ status: "PLATFORM_ONLY", idCard, platformRecord: pfRec, conflicts: [] });
    }
  });

  return {
    total: taxMap.size + platformOnly.length,
    matched, conflicted, taxOnly, platformOnly,
    summary: {
      MATCH: matched.length,
      CONFLICT: conflicted.length,
      TAX_ONLY: taxOnly.length,
      PLATFORM_ONLY: platformOnly.length,
    },
  };
}
