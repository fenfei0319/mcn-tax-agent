/* ============================================================
 * 模块: Excel 解析器 (Xlsx Parser)
 * 职责: 将个税平台导出的 Excel (xlsx/xls/csv) 解析为归一化的达人记录。
 * 解耦: 只做文件到对象的转换,不接触业务、不接触数据库。
 *      任何模块都可以复用本解析器,比对引擎/批量导入均可调用。
 *
 * 支持的列头(大小写不敏感,允许别名):
 *   - 姓名 / name
 *   - 身份证号 / 证件号码 / idCard / id_card
 *   - 手机 / 手机号 / mobile / phone
 *   - 银行卡 / 银行卡号 / bankCard / bank_card
 * ============================================================ */

import * as XLSX from "xlsx";
import type { SourceTalent, TalentSource } from "./talentSource";

/** 列头别名映射 */
const FIELD_ALIASES: Record<string, string[]> = {
  name:     ["姓名", "name", "纳税人姓名"],
  idCard:   ["身份证号", "身份证号码", "证件号码", "证件号", "idcard", "id_card", "id card"],
  mobile:   ["手机", "手机号", "手机号码", "联系电话", "mobile", "phone"],
  bankCard: ["银行卡", "银行卡号", "银行账号", "bankcard", "bank_card"],
};

/** 查找列索引: 在 headerRow 中按别名匹配 */
function resolveColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = headers.findIndex(h =>
      aliases.some(a => String(h).trim().toLowerCase() === a.toLowerCase())
    );
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

/** 从 Excel Buffer 解析 */
export function parseTaxExcel(buffer: Buffer): SourceTalent[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return [];

  const headers = rows[0].map((h: any) => String(h ?? "").trim());
  const cols = resolveColumns(headers);

  if (cols.name === undefined || cols.idCard === undefined) {
    throw new Error("Excel 缺少必要列:姓名 / 身份证号");
  }

  const list: SourceTalent[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[cols.name] ?? "").trim();
    const idCard = String(r[cols.idCard] ?? "").trim().toUpperCase();
    if (!name || !idCard) continue;
    list.push({
      sourceId: `excel-row-${i + 1}`,
      name,
      idCard,
      mobile: cols.mobile !== undefined ? String(r[cols.mobile] ?? "").trim() : undefined,
      bankCard: cols.bankCard !== undefined ? String(r[cols.bankCard] ?? "").trim() : undefined,
    });
  }
  return list;
}

/** 生成标准模板(供前端下载) */
export function buildExcelTemplate(): Buffer {
  const data = [
    ["姓名", "身份证号", "手机号", "银行卡号"],
    ["张三", "110101199003072816", "13800138000", "6228480000000000017"],
    ["李四", "310115198506040033", "13900139000", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "纳税人信息");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/* ---------- 作为数据源实现: TaxExcelSource ---------- */
export class TaxExcelSource implements TalentSource {
  sourceName = "个税平台 Excel";
  constructor(private buffer: Buffer) {}
  async fetch(): Promise<SourceTalent[]> {
    return parseTaxExcel(this.buffer);
  }
}
