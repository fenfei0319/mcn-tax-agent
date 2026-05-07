/* ============================================================
 * 模块: 批量同步面板 (Sync Panel) — v1.2
 * 职责: 一站式从小红书拉取本期收入 → 自动核验 → 自动计税 → 自动入库。
 *      这是 v1.1「批量处理」的升级:用户不再需要粘贴 CSV,
 *      只需选择所属期 + 默认所得类型,即可完成全流程。
 *      原 CSV 粘贴流程作为兜底放在子 Tab「自定义粘贴」。
 * 解耦: 仅依赖 lib/api 的 BatchApi.xhsSync / BatchApi.run / XhsApi.talents,
 *      不直接发 fetch。
 * ============================================================ */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BatchApi, XhsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Cloud, RefreshCcw, Sparkles, ShieldCheck, Calculator, Wallet,
  Database, ArrowRight, FileText, CheckCircle2, AlertTriangle, Users,
} from "lucide-react";
import { fmtMoney, fmtCount, maskIdCard } from "@/lib/format";
import { INCOME_TYPES, RELATIONS } from "@shared/schema";

/* ---------- 经典 CSV 样例 ---------- */
const CSV_TEMPLATE = `张三,110101199003071234,13800138000,6228480000000000017,labor,contractor,2026-05,8000
李四,310115198506042019,13900139000,,labor,contractor,2026-05,25000
王五,440301199211058837,13700137000,6228480000000000017,platform,contractor,2026-05,15000`;

export default function SyncPanel() {
  const [tab, setTab] = useState<"xhs" | "csv">("xhs");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "xhs" | "csv")}>
        <TabsList>
          <TabsTrigger value="xhs" data-testid="subtab-xhs-sync">
            <Cloud className="w-3.5 h-3.5 mr-1.5" />
            从小红书一键同步
            <Badge variant="secondary" className="ml-1.5 text-[10px]">推荐</Badge>
          </TabsTrigger>
          <TabsTrigger value="csv" data-testid="subtab-csv">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            自定义粘贴(CSV)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="xhs" className="mt-4">
          <XhsSyncFlow />
        </TabsContent>

        <TabsContent value="csv" className="mt-4">
          <CsvBatchFlow />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
 * 子组件: 从小红书一键同步流程
 * ============================================================ */
function XhsSyncFlow() {
  const { toast } = useToast();
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  /* ---------- 表单状态 ---------- */
  const [period, setPeriod] = useState(defaultPeriod);
  const [incomeType, setIncomeType] = useState<string>("platform");
  const [relation, setRelation] = useState<string>("contractor");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(true);
  const [response, setResponse] = useState<any | null>(null);

  /* ---------- 拉取小红书全部达人(用于多选) ---------- */
  const { data: xhsTalents = [] } = useQuery<any[]>({
    queryKey: ["/api/xhs/talents"],
    queryFn: () => XhsApi.talents(),
  });

  /* ---------- 预览本期流水(只读统计) ---------- */
  const { data: incomes = [] } = useQuery<any[]>({
    queryKey: ["/api/xhs/incomes", period],
    queryFn: () => XhsApi.incomes(period),
    enabled: !!period,
  });

  const previewStats = useMemo(() => {
    const ids = new Set(incomes.map((r: any) => r.idCard));
    const total = incomes.reduce((s: number, r: any) => s + r.grossAmount, 0);
    return { incomeRowCount: incomes.length, talentsWithIncome: ids.size, totalGross: total };
  }, [incomes]);

  /* ---------- 同步 mutation ---------- */
  const syncMut = useMutation({
    mutationFn: () => BatchApi.xhsSync({
      period,
      idCards: allSelected ? undefined : Array.from(selected),
      incomeType,
      relation,
    }),
    onSuccess: (data) => {
      setResponse(data);
      toast({
        title: "同步完成",
        description: `成功 ${data.summary.passed} · 失败 ${data.summary.failed} · 应纳税额合计 ${fmtMoney(data.summary.totalTax)}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kyc-logs"] });
    },
    onError: (e: any) => toast({ title: "同步失败", description: e.message, variant: "destructive" }),
  });

  /* ---------- 选择达人 ---------- */
  const toggleId = (idCard: string) => {
    setAllSelected(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idCard)) next.delete(idCard);
      else next.add(idCard);
      return next;
    });
  };
  const toggleAll = () => {
    setAllSelected(true);
    setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      {/* 流程图 */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <Step n={1} icon={<Cloud className="w-3.5 h-3.5" />} title="拉取流水" desc="小红书结算" />
            <Arrow />
            <Step n={2} icon={<ShieldCheck className="w-3.5 h-3.5" />} title="自动核验" desc="二/三/四要素" />
            <Arrow />
            <Step n={3} icon={<Calculator className="w-3.5 h-3.5" />} title="自动计税" desc="按所得类型" />
            <Arrow />
            <Step n={4} icon={<Database className="w-3.5 h-3.5" />} title="入库登记" desc="可申报导出" />
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-[360px_1fr] gap-4">
        {/* 左:配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">同步配置</CardTitle>
            <CardDescription>选择所属期与默认参数</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">所属期 *</Label>
              <Input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                data-testid="input-sync-period"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">默认所得类型</Label>
              <Select value={incomeType} onValueChange={setIncomeType}>
                <SelectTrigger data-testid="select-sync-incometype"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCOME_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">默认签约关系</Label>
              <Select value={relation} onValueChange={setRelation}>
                <SelectTrigger data-testid="select-sync-relation"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 范围 */}
            <div className="space-y-1">
              <Label className="text-xs">同步范围</Label>
              <div className="border rounded-md p-2 max-h-56 overflow-y-auto bg-muted/20">
                <label className="flex items-center gap-2 px-1 py-1.5 cursor-pointer text-xs font-medium border-b mb-1">
                  <Checkbox checked={allSelected} onCheckedChange={() => toggleAll()} data-testid="checkbox-sync-all" />
                  <Users className="w-3 h-3" />
                  全部达人(共 {xhsTalents.length} 位)
                </label>
                {xhsTalents.map((t: any) => (
                  <label
                    key={t.idCard}
                    className="flex items-center gap-2 px-1 py-1 cursor-pointer text-xs hover:bg-card rounded"
                  >
                    <Checkbox
                      checked={!allSelected && selected.has(t.idCard)}
                      onCheckedChange={() => toggleId(t.idCard)}
                      data-testid={`checkbox-sync-${t.idCard}`}
                    />
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{t.idCard.slice(-4)}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending || !period || (!allSelected && selected.size === 0)}
              data-testid="button-sync-run"
            >
              {syncMut.isPending ? (
                <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />同步中…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" />开始一键同步</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 右:预览 / 结果 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">本期预览 · {period}</CardTitle>
            <CardDescription>开始同步前先确认范围,执行后此处展示同步结果</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 预览 6 卡 */}
            <div className="grid grid-cols-3 gap-2">
              <Stat label="本期流水笔数" value={previewStats.incomeRowCount} icon={<Wallet className="w-3 h-3" />} />
              <Stat label="覆盖达人" value={previewStats.talentsWithIncome} icon={<Users className="w-3 h-3" />} />
              <Stat label="税前合计" value={fmtMoney(previewStats.totalGross)} icon={<Cloud className="w-3 h-3" />} />
            </div>

            {response && (
              <>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                  <Stat label="已扫描达人" value={response.summary.talentsScanned} tone="info" />
                  <Stat label="核验通过" value={response.summary.passed} tone="ok" />
                  <Stat label="核验失败" value={response.summary.failed} tone={response.summary.failed > 0 ? "warn" : "default"} />
                  <Stat label="构建税务行数" value={response.summary.rowsBuilt} tone="info" />
                  <Stat label="应纳税额合计" value={fmtMoney(response.summary.totalTax)} tone="info" />
                  <Stat label="税后合计" value={fmtMoney(response.summary.totalNet)} tone="ok" />
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>姓名</TableHead>
                        <TableHead>身份证</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>说明</TableHead>
                        <TableHead className="text-right">应纳税额</TableHead>
                        <TableHead className="text-right">税后</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {response.results.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">本期无符合条件的达人收入</TableCell></TableRow>
                      )}
                      {response.results.map((r: any) => (
                        <TableRow key={r.index} data-testid={`row-sync-${r.index}`}>
                          <TableCell className="font-mono text-xs">{r.index}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="font-mono text-xs">{maskIdCard(r.idCard)}</TableCell>
                          <TableCell>
                            {r.passed
                              ? <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-0.5" />通过</Badge>
                              : <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-0.5" />失败</Badge>}
                          </TableCell>
                          <TableCell className="text-xs max-w-[240px] truncate" title={r.reason}>{r.reason}</TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">{r.taxAmount !== undefined ? fmtMoney(r.taxAmount) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">{r.netIncome !== undefined ? fmtMoney(r.netIncome) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {!response && (
              <div className="text-xs text-muted-foreground py-6 text-center border rounded-md bg-muted/20">
                选择左侧配置,点击「开始一键同步」即可。<span className="text-foreground">仅身份核验通过的记录才会入库</span>,同步成功的数据会出现在「申报导出」中。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
 * 子组件: 经典 CSV 粘贴流程(保留作为兜底)
 * ============================================================ */
function CsvBatchFlow() {
  const { toast } = useToast();
  const [text, setText] = useState(CSV_TEMPLATE);
  const [results, setResults] = useState<any[]>([]);

  const runMut = useMutation({
    mutationFn: (rows: any[]) => BatchApi.run(rows),
    onSuccess: (data) => {
      setResults(data);
      const ok = data.filter((d: any) => d.passed).length;
      toast({ title: "批量处理完成", description: `成功 ${ok} / 失败 ${data.length - ok}` });
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (e: any) => toast({ title: "提交失败", description: e.message, variant: "destructive" }),
  });

  const parseAndRun = () => {
    try {
      const rows = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((line, idx) => {
          const cols = line.split(",").map((c) => c.trim());
          if (cols.length < 8) throw new Error(`第 ${idx + 1} 行列数不足,应为 8 列`);
          return {
            name: cols[0],
            idCard: cols[1],
            mobile: cols[2] || undefined,
            bankCard: cols[3] || undefined,
            incomeType: cols[4],
            relation: cols[5] || "contractor",
            period: cols[6],
            amount: Number(cols[7]),
          };
        });
      runMut.mutate(rows);
    } catch (e: any) {
      toast({ title: "解析失败", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">自定义粘贴(兜底)</CardTitle>
          <CardDescription>
            用于无法从小红书获取流水的特殊场景。每行一条,逗号分隔:
            <span className="font-mono text-xs ml-1">姓名,身份证,手机,银行卡,所得类型,签约关系,所属期,收入</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="font-mono text-xs min-h-[180px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="input-csv-text"
          />
          <div className="flex gap-2">
            <Button onClick={parseAndRun} disabled={runMut.isPending} data-testid="button-csv-run">
              {runMut.isPending ? "处理中..." : "一键执行"}
            </Button>
            <Button variant="outline" onClick={() => setText(CSV_TEMPLATE)}>重置样例</Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">处理结果</CardTitle>
            <CardDescription>成功 {results.filter((r) => r.passed).length} / 共 {results.length} 条</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>身份证</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead className="text-right">应纳税额</TableHead>
                  <TableHead className="text-right">税后</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.index} data-testid={`row-csv-${r.index}`}>
                    <TableCell className="font-mono text-xs">{r.index}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="font-mono text-xs">{maskIdCard(r.idCard)}</TableCell>
                    <TableCell>
                      {r.passed
                        ? <Badge className="bg-emerald-600 hover:bg-emerald-600">成功</Badge>
                        : <Badge variant="destructive">失败</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{r.reason}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">{r.taxAmount !== undefined ? fmtMoney(r.taxAmount) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{r.netIncome !== undefined ? fmtMoney(r.netIncome) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ============================================================
 * 子: 流程步骤 / 箭头 / 统计卡
 * ============================================================ */
function Step({ n, icon, title, desc }: { n: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
        {n}
      </div>
      <div className="min-w-0">
        <div className="font-medium flex items-center gap-1">{icon}{title}</div>
        <div className="text-[10px] text-muted-foreground truncate">{desc}</div>
      </div>
    </div>
  );
}
function Arrow() {
  return <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />;
}
function Stat({ label, value, icon, tone }: { label: string; value: any; icon?: React.ReactNode; tone?: "ok" | "warn" | "info" | "default" }) {
  const tc =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-400" :
    tone === "warn" ? "text-amber-700 dark:text-amber-400" :
    tone === "info" ? "text-primary" :
    "text-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tc}`}>{value}</div>
    </div>
  );
}
