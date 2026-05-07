/* ============================================================
 * 模块: 身份信息数据源抽象 (Talent Source)
 * 职责: 抽象任何"达人身份信息来源",屏蔽具体获取方式。
 *      比对引擎只依赖本接口,不关心数据来自 Excel / API / 数据库。
 * 解耦: 未来接入抖音、B站、快手等新平台数据源,
 *      只需新增一个 TalentSource 实现,引擎与 UI 零改动。
 * ============================================================ */

/** 归一化后的达人记录(来自任何源) */
export interface SourceTalent {
  sourceId: string;          // 数据源内部ID(如小红书UID / Excel行号)
  name: string;              // 姓名
  idCard: string;            // 身份证号
  mobile?: string;
  bankCard?: string;
  extra?: Record<string, any>;  // 源特有字段(如小红书昵称、粉丝数)
}

export interface TalentSource {
  sourceName: string;
  fetch(): Promise<SourceTalent[]>;
}
