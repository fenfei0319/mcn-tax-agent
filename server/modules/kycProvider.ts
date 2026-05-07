/* ============================================================
 * 模块: 身份核验提供方 (KYC Provider)
 * 职责: 抽象身份核验接口,默认提供基于身份证算法的 Mock 实现。
 *      未来可平滑替换为阿里云、腾讯云、翼支付等真实三/四要素 API。
 * 解耦: 任何调用方仅依赖 KycProvider 接口,不关心具体实现。
 * 依据: GB 11643-1999 公民身份号码标准
 * ============================================================ */

export type KycMode = "two" | "three" | "four";

export interface KycRequest {
  mode: KycMode;
  name: string;
  idCard: string;
  mobile?: string;
  bankCard?: string;
}

export interface KycResult {
  passed: boolean;
  reason: string;
  traceId: string;
}

export interface KycProvider {
  verify(req: KycRequest): Promise<KycResult>;
}

/* ---------- 工具: 身份证号码格式与校验码验证 ---------- */
function validateIdCard(idCard: string): { ok: boolean; reason: string } {
  if (!/^\d{17}[\dXx]$/.test(idCard)) {
    return { ok: false, reason: "身份证号格式错误,需为18位数字(末位可为X)" };
  }
  // 出生日期校验
  const y = parseInt(idCard.substring(6, 10), 10);
  const m = parseInt(idCard.substring(10, 12), 10);
  const d = parseInt(idCard.substring(12, 14), 10);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { ok: false, reason: "身份证号中出生日期非法" };
  }
  // GB 11643 加权和校验
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += parseInt(idCard[i], 10) * weights[i];
  const expect = codes[sum % 11];
  if (expect !== idCard[17].toUpperCase()) {
    return { ok: false, reason: "身份证号校验码不正确" };
  }
  return { ok: true, reason: "OK" };
}

/* ---------- 工具: 手机号格式校验 ---------- */
function validateMobile(mobile: string): boolean {
  return /^1[3-9]\d{9}$/.test(mobile);
}

/* ---------- 工具: 银行卡号 Luhn 校验 ---------- */
function validateBankCard(bankCard: string): boolean {
  if (!/^\d{15,19}$/.test(bankCard)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = bankCard.length - 1; i >= 0; i--) {
    let n = parseInt(bankCard[i], 10);
    if (dbl) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/* ---------- 实现 1: Mock 核验提供方 (默认) ---------- */
export class MockKycProvider implements KycProvider {
  async verify(req: KycRequest): Promise<KycResult> {
    const traceId = "mock-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);

    // 1. 姓名格式
    if (!req.name || req.name.trim().length < 2) {
      return { passed: false, reason: "姓名不能为空且至少2个字符", traceId };
    }
    // 2. 身份证算法校验
    const idChk = validateIdCard(req.idCard);
    if (!idChk.ok) return { passed: false, reason: idChk.reason, traceId };

    // 3. 三要素需手机号
    if (req.mode === "three" || req.mode === "four") {
      if (!req.mobile || !validateMobile(req.mobile)) {
        return { passed: false, reason: "手机号格式错误", traceId };
      }
    }
    // 4. 四要素需银行卡
    if (req.mode === "four") {
      if (!req.bankCard || !validateBankCard(req.bankCard)) {
        return { passed: false, reason: "银行卡号 Luhn 校验失败", traceId };
      }
    }
    return { passed: true, reason: "Mock 核验通过(基础格式与算法均合法)", traceId };
  }
}

/* ---------- 实现 2: 真实第三方核验(占位,生产环境实现) ---------- */
// export class AliyunKycProvider implements KycProvider {
//   async verify(req: KycRequest): Promise<KycResult> {
//     // 1. 调用阿里云市场三/四要素核验API
//     // 2. 解析返回,映射到 KycResult
//     throw new Error("Not implemented");
//   }
// }

/* ---------- 当前默认提供方(单例) ---------- */
export const kycProvider: KycProvider = new MockKycProvider();
