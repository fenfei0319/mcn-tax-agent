/* ============================================================
 * 模块: 小红书达人库适配器 (XHS Talent Source)
 * 职责: 实现 TalentSource 接口,默认返回 Mock 数据;
 *      未来对接小红书开放平台/MCN后台 API 时,只需修改本文件 fetch 方法。
 * 解耦: 比对引擎不知道这是 Mock 还是真实API。
 * 扩展: v1.2 增加身份证照片、注册时间、结算流水(用于一站式同步)
 * ============================================================ */

import type { SourceTalent, TalentSource } from "./talentSource";

/** 小红书结算流水(单笔达人收入) */
export interface XhsIncomeRecord {
  recordId: string;        // 小红书结算单号
  idCard: string;          // 关联达人身份证(主键)
  period: string;          // 所属期 yyyy-MM
  grossAmount: number;     // 税前收入(元)
  bizType: string;         // 业务类型(品牌合作/直播分成/创作激励等)
  settledAt: string;       // 结算时间
}

/* ---------- Mock 数据(演示用,模拟两源的各种差异情况) ---------- */
const MOCK_DATA: SourceTalent[] = [
  // 与样例 Excel 完全一致 → MATCH
  {
    sourceId: "xhs-1001",
    name: "张三",
    idCard: "110101199003072818",
    mobile: "13800138000",
    bankCard: "6228480000000000018",
    extra: {
      xhsNickname: "@美妆张三",
      followers: 128000,
      registeredAt: "2022-03-15",
      verifiedAt: "2022-03-16",
      idCardFrontUrl: "MOCK://idcard-front/zhangsan.jpg",
      idCardBackUrl:  "MOCK://idcard-back/zhangsan.jpg",
      contractType: "品牌合作 + 创作激励",
      tier: "腰部达人",
    },
  },
  // 与税务 Excel 姓名冲突 → CONFLICT
  {
    sourceId: "xhs-1002",
    name: "李思",
    idCard: "310115198506040034",
    mobile: "13900139000",
    bankCard: "",
    extra: {
      xhsNickname: "@美食李思",
      followers: 56000,
      registeredAt: "2023-07-08",
      verifiedAt: "2023-07-10",
      idCardFrontUrl: "MOCK://idcard-front/lisi.jpg",
      idCardBackUrl:  "MOCK://idcard-back/lisi.jpg",
      contractType: "品牌合作",
      tier: "尾部达人",
    },
  },
  // PLATFORM_ONLY
  {
    sourceId: "xhs-1003",
    name: "王小明",
    idCard: "440301199906080533",
    mobile: "13712345678",
    bankCard: "6228480000000000026",
    extra: {
      xhsNickname: "@旅行王小明",
      followers: 240000,
      registeredAt: "2021-11-20",
      verifiedAt: "2021-11-21",
      idCardFrontUrl: "MOCK://idcard-front/wangxiaoming.jpg",
      idCardBackUrl:  "MOCK://idcard-back/wangxiaoming.jpg",
      contractType: "品牌合作 + 直播分成",
      tier: "头部达人",
    },
  },
  // PLATFORM_ONLY
  {
    sourceId: "xhs-1004",
    name: "赵晓芳",
    idCard: "32010619970218764X",
    mobile: "13611112222",
    bankCard: "",
    extra: {
      xhsNickname: "@穿搭赵晓芳",
      followers: 98000,
      registeredAt: "2023-01-12",
      verifiedAt: "2023-01-15",
      idCardFrontUrl: "MOCK://idcard-front/zhaoxiaofang.jpg",
      idCardBackUrl:  "MOCK://idcard-back/zhaoxiaofang.jpg",
      contractType: "品牌合作",
      tier: "腰部达人",
    },
  },
];

/* ---------- 小红书结算流水 Mock(用于"批量同步收入") ---------- */
const MOCK_INCOMES: XhsIncomeRecord[] = [
  // 张三 当月 2 笔
  { recordId: "xhs-inc-001", idCard: "110101199003072818", period: "2026-05", grossAmount: 18500, bizType: "品牌合作-某美妆品牌", settledAt: "2026-05-03" },
  { recordId: "xhs-inc-002", idCard: "110101199003072818", period: "2026-05", grossAmount:  6800, bizType: "创作激励",            settledAt: "2026-05-15" },
  // 李思 当月 1 笔
  { recordId: "xhs-inc-003", idCard: "310115198506040034", period: "2026-05", grossAmount:  4200, bizType: "品牌合作-某餐饮品牌", settledAt: "2026-05-08" },
  // 王小明 当月 3 笔(头部)
  { recordId: "xhs-inc-004", idCard: "440301199906080533", period: "2026-05", grossAmount: 42000, bizType: "品牌合作-某OTA品牌",  settledAt: "2026-05-02" },
  { recordId: "xhs-inc-005", idCard: "440301199906080533", period: "2026-05", grossAmount: 15000, bizType: "直播分成",            settledAt: "2026-05-18" },
  { recordId: "xhs-inc-006", idCard: "440301199906080533", period: "2026-05", grossAmount:  9500, bizType: "创作激励",            settledAt: "2026-05-25" },
  // 赵晓芳 当月 1 笔
  { recordId: "xhs-inc-007", idCard: "32010619970218764X", period: "2026-05", grossAmount:  7200, bizType: "品牌合作-某服饰品牌", settledAt: "2026-05-10" },
];

export class XhsTalentSource implements TalentSource {
  sourceName = "小红书达人库";

  async fetch(): Promise<SourceTalent[]> {
    // TODO: 生产环境替换为 axios.get(XHS_OPEN_API_URL) 或数据仓库查询
    return MOCK_DATA;
  }

  /** 拉取指定身份证的小红书结算流水。不传 idCards 表示全量。 */
  async fetchIncomes(idCards?: string[], period?: string): Promise<XhsIncomeRecord[]> {
    let list = MOCK_INCOMES;
    if (period) list = list.filter((r) => r.period === period);
    if (idCards && idCards.length > 0) {
      const set = new Set(idCards);
      list = list.filter((r) => set.has(r.idCard));
    }
    return list;
  }
}

/** 默认单例 */
export const xhsTalentSource = new XhsTalentSource();
