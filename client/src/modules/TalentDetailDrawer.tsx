/* ============================================================
 * 模块: 达人详情抽屉 (Talent Detail Drawer)
 * 职责: 展示一位达人的完整信息 = 主档资料 + 小红书源信息
 *      (身份证正/反面照片、昵称、粉丝数、注册/认证时间、合作类型)
 *      + 当期收入流水 + 核验日志摘要
 * 解耦: 仅依赖 lib/api,不直接发 fetch;输入由父组件传入,关闭通过回调。
 * ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { XhsApi, KycApi } from "@/lib/api";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  IdCard, Sparkles, Users, History, Calendar, Wallet, Image as ImageIcon, ShieldCheck, ShieldX,
} from "lucide-react";
import { fmtMoney, maskIdCard, maskMobile, maskBankCard, incomeTypeLabel, relationLabel, kycLabel } from "@/lib/format";

interface Props {
  talent: any | null;
  onClose: () => void;
}

export default function TalentDetailDrawer({ talent, onClose }: Props) {
  const open = !!talent;

  /* ---------- 拉取小红书源信息(按身份证匹配) ---------- */
  const { data: xhsList = [] } = useQuery<any[]>({
    queryKey: ["/api/xhs/talents"],
    queryFn: () => XhsApi.talents(),
    enabled: open,
  });
  const xhs = talent ? xhsList.find((x: any) => x.idCard === talent.idCard) : null;

  /* ---------- 拉取该达人本期(默认当月)收入流水 ---------- */
  const period = currentPeriod();
  const { data: incomes = [] } = useQuery<any[]>({
    queryKey: ["/api/xhs/incomes", talent?.idCard, period],
    queryFn: () => XhsApi.incomes(period, talent ? [talent.idCard] : []),
    enabled: open && !!talent,
  });

  /* ---------- 拉取核验日志(用于变更历史摘要) ---------- */
  const { data: kycLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/kyc-logs"],
    queryFn: () => KycApi.logs(),
    enabled: open,
  });
  const myLogs = talent ? kycLogs.filter((l: any) => l.talentId === talent.id).slice(0, 5) : [];

  if (!talent) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="drawer-talent-detail">
        <SheetHeader className="space-y-2">
          <SheetTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {talent.name}
            <Badge variant={talent.kycStatus === "verified" ? "default" : talent.kycStatus === "failed" ? "destructive" : "secondary"}>
              {kycLabel[talent.kycStatus]}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            主档 ID #{talent.id} · 身份证 {maskIdCard(talent.idCard)} · 收入类型 {incomeTypeLabel[talent.incomeType]}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* 区块 1: 实名认证身份证照片(注册时上传) */}
          <Section icon={<IdCard className="w-3.5 h-3.5" />} title="实名认证 · 身份证照片">
            <div className="grid grid-cols-2 gap-3">
              <IdCardImage label="身份证正面" url={xhs?.extra?.idCardFrontUrl} />
              <IdCardImage label="身份证反面" url={xhs?.extra?.idCardBackUrl} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <Field label="姓名">{talent.name}</Field>
              <Field label="身份证号" mono>{maskIdCard(talent.idCard)}</Field>
              <Field label="手机号" mono>{maskMobile(talent.mobile)}</Field>
              <Field label="银行卡" mono>{maskBankCard(talent.bankCard)}</Field>
            </div>
          </Section>

          {/* 区块 2: 小红书账号信息 */}
          {xhs && (
            <Section icon={<Sparkles className="w-3.5 h-3.5 text-primary" />} title="小红书账号档案">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field label="账号昵称">{xhs.extra?.xhsNickname ?? "—"}</Field>
                <Field label="粉丝量级">{xhs.extra?.tier ?? "—"}</Field>
                <Field label="粉丝数" mono>{(xhs.extra?.followers ?? 0).toLocaleString("zh-CN")}</Field>
                <Field label="合作类型">{xhs.extra?.contractType ?? "—"}</Field>
                <Field label="注册时间" mono>{xhs.extra?.registeredAt ?? "—"}</Field>
                <Field label="认证时间" mono>{xhs.extra?.verifiedAt ?? "—"}</Field>
                <Field label="平台来源 ID" mono>{xhs.sourceId}</Field>
                <Field label="签约关系">{relationLabel[talent.relation]}</Field>
              </div>
            </Section>
          )}

          {/* 区块 3: 当期(默认本月)小红书结算流水 */}
          <Section icon={<Wallet className="w-3.5 h-3.5" />} title={`小红书结算流水 · ${period}`}>
            {incomes.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center border rounded-md bg-muted/30">
                当期暂无小红书结算流水
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">业务类型</th>
                        <th className="text-left p-2 font-medium">结算单号</th>
                        <th className="text-left p-2 font-medium">结算时间</th>
                        <th className="text-right p-2 font-medium">税前金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomes.map((r: any) => (
                        <tr key={r.recordId} className="border-b last:border-none">
                          <td className="p-2">{r.bizType}</td>
                          <td className="p-2 font-mono text-[11px] text-muted-foreground">{r.recordId}</td>
                          <td className="p-2 font-mono">{r.settledAt}</td>
                          <td className="p-2 text-right tabular-nums font-medium">{fmtMoney(r.grossAmount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/20 font-medium">
                        <td colSpan={3} className="p-2 text-right">合计</td>
                        <td className="p-2 text-right tabular-nums text-primary">
                          {fmtMoney(incomes.reduce((s: number, r: any) => s + r.grossAmount, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </Section>

          {/* 区块 4: 变更/核验历史 */}
          <Section icon={<History className="w-3.5 h-3.5" />} title="近期核验记录">
            {myLogs.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center border rounded-md bg-muted/30">
                暂无核验日志
              </div>
            ) : (
              <div className="space-y-1.5">
                {myLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-2 text-xs px-3 py-2 border rounded-md">
                    {log.passed ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]"><ShieldCheck className="w-2.5 h-2.5 mr-0.5" />通过</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]"><ShieldX className="w-2.5 h-2.5 mr-0.5" />未通过</Badge>
                    )}
                    <span className="text-muted-foreground">{modeLabel(log.mode)}</span>
                    <span className="flex-1 truncate" title={log.reason ?? ""}>{log.reason ?? "—"}</span>
                    <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />{log.createdAt?.slice(0, 16) ?? ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 区块 5: 来源备注 */}
          {talent.note && (
            <Section icon={<History className="w-3.5 h-3.5" />} title="来源备注">
              <div className="text-xs text-muted-foreground px-3 py-2 border rounded-md bg-muted/30">
                {talent.note}
              </div>
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------- 子: 区块容器 ---------- */
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

/* ---------- 子: 字段 ---------- */
function Field({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 border rounded-md bg-card">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-xs" : "text-xs"}>{children}</div>
    </div>
  );
}

/* ---------- 子: 身份证照片占位 ---------- */
function IdCardImage({ label, url }: { label: string; url?: string }) {
  // MOCK:// 协议不真实加载,直接渲染占位
  const isMock = !url || url.startsWith("MOCK://");
  return (
    <div className="border rounded-md overflow-hidden bg-muted/30">
      <div className="aspect-[1.6/1] flex items-center justify-center bg-gradient-to-br from-muted/50 to-muted/30 relative">
        {isMock ? (
          <div className="text-center space-y-1">
            <ImageIcon className="w-7 h-7 text-muted-foreground/40 mx-auto" />
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="text-[10px] text-muted-foreground/60">(Mock 占位 · 生产对接 OSS 链接)</div>
          </div>
        ) : (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img src={url} alt={label} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="text-[10px] text-center py-1 text-muted-foreground border-t bg-card">{label}</div>
    </div>
  );
}

/* ---------- 工具 ---------- */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function modeLabel(m: string): string {
  return m === "two" ? "二要素" : m === "three" ? "三要素" : m === "four" ? "四要素" : m;
}
