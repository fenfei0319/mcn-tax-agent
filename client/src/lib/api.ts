/* ============================================================
 * 模块: 前端 API 封装层
 * 职责: 唯一对外的 HTTP 调用入口,前端任何组件都通过本模块访问后端。
 *      若未来更换 UI 框架,只需重新实现各组件,本文件可零改动复用。
 * 解耦: 不依赖任何 UI 库,纯 TS。
 * ============================================================ */
import { apiRequest } from "./queryClient";

/** 与 queryClient 保持一致的 API_BASE,用于窗口直接跳转(如下载CSV) */
export const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "请求失败");
  return json.data as T;
}

/* ---------- 达人档案 API ---------- */
export const TalentApi = {
  list: async (keyword = "") =>
    unwrap<any[]>(await apiRequest("GET", `/api/talents?keyword=${encodeURIComponent(keyword)}`)),
  create: async (body: any) =>
    unwrap<any>(await apiRequest("POST", "/api/talents", body)),
  update: async (id: number, body: any) =>
    unwrap<any>(await apiRequest("PATCH", `/api/talents/${id}`, body)),
  remove: async (id: number) =>
    unwrap<any>(await apiRequest("DELETE", `/api/talents/${id}`)),
  /** 从小红书一键拉取并批量入库 */
  importFromXhs: async (body?: { defaultIncomeType?: string; defaultRelation?: string }) =>
    unwrap<{ created: number; updated: number; skipped: number; total: number; failures: Array<{ name: string; reason: string }> }>(
      await apiRequest("POST", "/api/xhs/import", body ?? {})
    ),
};

/* ---------- 身份核验 API ---------- */
export const KycApi = {
  verify: async (body: any) =>
    unwrap<any>(await apiRequest("POST", "/api/verify", body)),
  logs: async () =>
    unwrap<any[]>(await apiRequest("GET", "/api/kyc-logs")),
};

/* ---------- 收入与税额 API ---------- */
export const IncomeApi = {
  list: async (period?: string) => {
    const url = period ? `/api/incomes?period=${period}` : "/api/incomes";
    return unwrap<any[]>(await apiRequest("GET", url));
  },
  create: async (body: any) =>
    unwrap<any>(await apiRequest("POST", "/api/incomes", body)),
  remove: async (id: number) =>
    unwrap<any>(await apiRequest("DELETE", `/api/incomes/${id}`)),
};

/* ---------- 试算 API ---------- */
export const CalcApi = {
  trial: async (body: any) =>
    unwrap<any>(await apiRequest("POST", "/api/calc", body)),
};

/* ---------- 申报 API ---------- */
export const FilingApi = {
  preview: async (period: string) =>
    unwrap<any[]>(await apiRequest("GET", `/api/filing/preview?period=${period}`)),
  exportUrl: (period: string) => `/api/filing/export?period=${period}`,
};

/* ---------- 批量任务 API ---------- */
export const BatchApi = {
  /** 经典: 粘贴 CSV 行,逐行核验 + 计算 + 入库 */
  run: async (rows: any[]) =>
    unwrap<any[]>(await apiRequest("POST", "/api/batch", { rows })),

  /** v1.2: 一站式从小红书同步收入 → 自动核验 → 自动计税 */
  xhsSync: async (body: { period: string; idCards?: string[]; incomeType?: string; relation?: string }) =>
    unwrap<{
      period: string;
      summary: {
        talentsScanned: number;
        incomesFetched: number;
        rowsBuilt: number;
        passed: number;
        failed: number;
        totalTax: number;
        totalNet: number;
      };
      results: any[];
    }>(await apiRequest("POST", "/api/batch/xhs-sync", body)),
};

/* ---------- 小红书数据 API (v1.2) ---------- */
export const XhsApi = {
  /** 拉取小红书达人库(含身份证照片、注册时间等扩展字段) */
  talents: async () =>
    unwrap<any[]>(await apiRequest("GET", "/api/xhs/talents")),

  /** 拉取小红书结算流水(可按身份证/期间过滤) */
  incomes: async (period?: string, idCards?: string[]) => {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (idCards && idCards.length) params.set("idCards", idCards.join(","));
    const qs = params.toString();
    return unwrap<any[]>(await apiRequest("GET", `/api/xhs/incomes${qs ? "?" + qs : ""}`));
  },
};

/* ---------- 仪表盘 API ---------- */
export const DashboardApi = {
  overview: async () =>
    unwrap<any>(await apiRequest("GET", "/api/dashboard")),
};

/* ---------- 双源比对 API (v1.1) ---------- */
export const ReconcileApi = {
  /** 拉取小红书达人库(平台源) */
  xhsList: async () =>
    unwrap<any[]>(await apiRequest("GET", "/api/xhs/talents")),

  /** 上传税务 Excel,返回比对结果(不入库) */
  upload: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(API_BASE + "/api/reconcile/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "上传失败");
    return json.data as any;
  },

  /** 将比对结果落库 */
  commit: async (body: {
    rows: Array<{
      idCard: string;
      status: "MATCH" | "CONFLICT" | "TAX_ONLY" | "PLATFORM_ONLY";
      preferSource?: "tax" | "platform";
      taxRecord?: any;
      platformRecord?: any;
    }>;
    defaultIncomeType?: "labor" | "platform" | "salary" | "business";
    defaultRelation?: "employee" | "contractor" | "studio";
  }) => unwrap<{ created: number; updated: number; skipped: number }>(
    await apiRequest("POST", "/api/reconcile/commit", body)
  ),

  /** 模板下载 URL(window.open 用) */
  templateUrl: () => API_BASE + "/api/reconcile/template",
};
