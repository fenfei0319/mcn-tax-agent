/* ============================================================
 * 模块: 收入登记面板 (Income Panel)
 * 职责: 登记达人某期收入,并立即展示计算出的税额与推导过程。
 * ============================================================ */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TalentApi, IncomeApi, BatchApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { INCOME_TYPES } from "@shared/schema";
import { fmtMoney, fmtPercent, incomeTypeLabel, maskIdCard } from "@/lib/format";
import { Trash2, Cloud, RefreshCcw, Sparkles, CheckCircle2, ShieldCheck } from "lucide-react";

export default function IncomePanel() {
  const { toast } = useToast();
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [form, setForm] = useState({
    talentId: "" as string,
    period: defaultPeriod,
    amount: "",
    incomeType: "labor",
    note: "",
  });

  const [filterPeriod, setFilterPeriod] = useState<string>("");
  const [showSync, setShowSync] = useState(false);
  const [syncPeriod, setSyncPeriod] = useState(defaultPeriod);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  const { data: talents } = useQuery<any[]>({
    queryKey: ["/api/talents"],
    queryFn: () => TalentApi.list(),
  });

  const { data: incomes } = useQuery<any[]>({
    queryKey: ["/api/incomes", filterPeriod],
    queryFn: () => IncomeApi.list(filterPeriod || undefined),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => IncomeApi.create(body),
    onSuccess: (res) => {
      toast({
        title: "已登记并完成税额计算",
        description: `应纳税额 ${fmtMoney(res.tax.taxAmount)},税后 ${fmtMoney(res.tax.netIncome)}`,
      });
      setForm({ ...form, amount: "", note: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (e: any) => toast({ title: "登记失败", description: e.message, variant: "destructive" }),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => IncomeApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  /* ---------- v1.2: 从小红书一键同步本期收入 ---------- */
  const syncMut = useMutation({
    mutationFn: () => BatchApi.xhsSync({ period: syncPeriod, incomeType: "platform", relation: "contractor" }),
    onSuccess: (data) => {
      setSyncResult(data);
      toast({
        title: "同步完成",
        description: `成功 ${data.summary.passed} 条 · 合计应纳税 ${fmtMoney(data.summary.totalTax)}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (e: any) => toast({ title: "同步失败", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* 顶部自动化条 */}
      <Card>
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <div className="flex items-start gap-2 mr-auto text-xs leading-relaxed">
            <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5" />
            <div>
              <span className="font-medium text-foreground">仅展示已通过双源验证的可靠收入</span>
              <span className="text-muted-foreground ml-1">—— 下表记录皆经「双源验证」或「手工补录」入库。批量场景请使用「批量同步」一次完成。</span>
            </div>
          </div>
          <Dialog open={showSync} onOpenChange={(v) => { setShowSync(v); if (!v) setSyncResult(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-open-xhs-sync">
                <Cloud className="w-3.5 h-3.5 mr-1.5" />
                从小红书同步本期收入
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-primary" />从小红书同步本期收入
                </DialogTitle>
                <DialogDescription>
                  按所属期拉取所有达人的结算流水,默认以“互联网平台劳务”类型计税,同一达人多笔会汇总为一行。成功后记录会出现在下方明细中。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label className="text-xs">同步所属期 *</Label>
                  <Input
                    type="month"
                    value={syncPeriod}
                    onChange={(e) => setSyncPeriod(e.target.value)}
                    data-testid="input-xhs-sync-period"
                  />
                </div>
                {syncResult && (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />同步完成
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <Tile label="达人扫描" v={syncResult.summary.talentsScanned} />
                      <Tile label="流水拉取" v={syncResult.summary.incomesFetched} />
                      <Tile label="入库成功" v={syncResult.summary.passed} tone="ok" />
                      <Tile label="核验失败" v={syncResult.summary.failed} tone={syncResult.summary.failed > 0 ? "warn" : "default"} />
                      <Tile label="应纳税合计" v={fmtMoney(syncResult.summary.totalTax)} tone="info" />
                      <Tile label="税后合计" v={fmtMoney(syncResult.summary.totalNet)} tone="ok" />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowSync(false)} data-testid="button-xhs-sync-close">关闭</Button>
                <Button
                  onClick={() => syncMut.mutate()}
                  disabled={syncMut.isPending || !syncPeriod}
                  data-testid="button-xhs-sync-run"
                >
                  {syncMut.isPending ? (
                    <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />同步中…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5 mr-1.5" />开始同步</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

    <div className="grid md:grid-cols-[360px_1fr] gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">手工补录单笔收入</CardTitle>
          <CardDescription>适用于零散/调整场景,补录后会走一次身份核验并自动计算税额</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">达人 *</Label>
            <Select value={form.talentId} onValueChange={v => {
              const t = talents?.find(x => String(x.id) === v);
              setForm({ ...form, talentId: v, incomeType: t?.incomeType ?? form.incomeType });
            }}>
              <SelectTrigger data-testid="select-income-talent"><SelectValue placeholder="选择达人" /></SelectTrigger>
              <SelectContent>
                {talents?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name} · {maskIdCard(t.idCard)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">所属期 *</Label>
            <Input type="month" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} data-testid="input-period" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">税前收入(元) *</Label>
            <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} data-testid="input-amount" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">所得类型</Label>
            <Select value={form.incomeType} onValueChange={v => setForm({ ...form, incomeType: v })}>
              <SelectTrigger data-testid="select-income-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCOME_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            onClick={() => createMut.mutate({
              talentId: Number(form.talentId),
              period: form.period,
              amount: Number(form.amount),
              incomeType: form.incomeType,
              note: form.note || null,
            })}
            disabled={!form.talentId || !form.amount || createMut.isPending}
            data-testid="button-create-income"
          >
            {createMut.isPending ? "处理中..." : "登记并计算"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <div className="flex-1">
            <CardTitle className="text-base">收入与税额明细</CardTitle>
            <CardDescription>共 {incomes?.length ?? 0} 笔 · 均为已验证可靠收入</CardDescription>
          </div>
          <Input type="month" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="w-40" placeholder="按所属期筛选" data-testid="input-filter-period" />
          <Button variant="outline" size="sm" onClick={() => setFilterPeriod("")}>全部</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">所属期</TableHead>
                <TableHead className="whitespace-nowrap">达人</TableHead>
                <TableHead className="whitespace-nowrap">所得类型</TableHead>
                <TableHead className="text-right whitespace-nowrap">收入额</TableHead>
                <TableHead className="text-right whitespace-nowrap">应纳税所得额</TableHead>
                <TableHead className="text-right whitespace-nowrap">税率</TableHead>
                <TableHead className="text-right whitespace-nowrap">应纳税额</TableHead>
                <TableHead className="text-right whitespace-nowrap">税后</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incomes?.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">暂无记录,请先到「双源验证」或「批量同步」入库</TableCell></TableRow>
              )}
              {incomes?.map((r: any) => (
                <TableRow key={r.id} data-testid={`row-income-${r.id}`}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{r.period}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.talent?.name}</TableCell>
                  <TableCell className="whitespace-nowrap"><Badge variant="outline">{incomeTypeLabel[r.incomeType]}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtMoney(r.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtMoney(r.tax?.taxableIncome)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtPercent(r.tax?.rate)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold text-foreground">{fmtMoney(r.tax?.taxAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtMoney(r.tax?.netIncome)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMut.mutate(r.id)} data-testid={`button-delete-income-${r.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

/* ---------- 子: 结果小方块 ---------- */
function Tile({ label, v, tone }: { label: string; v: any; tone?: "ok" | "warn" | "info" | "default" }) {
  const tc =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-400" :
    tone === "warn" ? "text-amber-700 dark:text-amber-400" :
    tone === "info" ? "text-primary" :
    "text-foreground";
  return (
    <div className="rounded border bg-card px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tc}`}>{v}</div>
    </div>
  );
}
