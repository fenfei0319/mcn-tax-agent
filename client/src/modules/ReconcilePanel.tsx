/* ============================================================
 * 模块: 双源比对面板 (Reconcile Panel)
 * 职责: 三步向导
 *   ① 下载模板 + 上传税务 Excel
 *   ② 4 类结果可视化(MATCH / CONFLICT / TAX_ONLY / PLATFORM_ONLY)
 *   ③ 选择性勾选 + 冲突仲裁(税务/平台为准) → 一键并入主档
 * 解耦: 仅依赖 lib/api.ts 提供的 ReconcileApi,不直接调用 fetch。
 * ============================================================ */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ReconcileApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, FileWarning, Database, RefreshCcw, ChevronDown, ChevronRight, Sparkles, ArrowRight, CircleDot } from "lucide-react";
import { maskIdCard, maskMobile, maskBankCard } from "@/lib/format";

/* ---------- 数据类型 ---------- */
interface SourceTalent {
  name: string;
  idCard: string;
  mobile?: string;
  bankCard?: string;
}
interface ReconcileRow {
  status: "MATCH" | "CONFLICT" | "TAX_ONLY" | "PLATFORM_ONLY";
  idCard: string;
  taxRecord?: SourceTalent;
  platformRecord?: SourceTalent;
  conflicts: string[];
}
interface ReconcileResult {
  total: number;
  matched: ReconcileRow[];
  conflicted: ReconcileRow[];
  taxOnly: ReconcileRow[];
  platformOnly: ReconcileRow[];
  summary: { MATCH: number; CONFLICT: number; TAX_ONLY: number; PLATFORM_ONLY: number };
}

/* ---------- 主组件 ---------- */
export default function ReconcilePanel() {
  const { toast } = useToast();
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [subTab, setSubTab] = useState<"MATCH" | "CONFLICT" | "TAX_ONLY" | "PLATFORM_ONLY">("CONFLICT");

  /** 选中的 idCard 集合(用于"批量并入主档") */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 冲突仲裁:idCard -> "tax" | "platform" */
  const [prefer, setPrefer] = useState<Record<string, "tax" | "platform">>({});
  /** 平台源预览面板展开 */
  const [showXhsPreview, setShowXhsPreview] = useState(false);

  /* 拉取小红书平台数据,用于步骤①时给用户预览 */
  const { data: xhsList = [], isLoading: xhsLoading } = useQuery<SourceTalent[]>({
    queryKey: ["/api/xhs/talents"],
    queryFn: () => ReconcileApi.xhsList(),
  });

  /* 上传 mutation */
  const uploadMut = useMutation({
    mutationFn: (file: File) => ReconcileApi.upload(file),
    onSuccess: (data: ReconcileResult) => {
      setResult(data);
      // 默认全选 MATCH / TAX_ONLY / PLATFORM_ONLY,冲突项保持未选,等待人工仲裁
      const next = new Set<string>();
      data.matched.forEach((r) => next.add(r.idCard));
      data.taxOnly.forEach((r) => next.add(r.idCard));
      data.platformOnly.forEach((r) => next.add(r.idCard));
      setSelected(next);
      // 冲突项默认税务为准
      const pref: Record<string, "tax" | "platform"> = {};
      data.conflicted.forEach((r) => (pref[r.idCard] = "tax"));
      setPrefer(pref);
      // 自动跳到冲突 tab(最需要人工干预)
      setSubTab(data.conflicted.length > 0 ? "CONFLICT" : "MATCH");
      toast({
        title: "比对完成",
        description: `匹配 ${data.summary.MATCH} · 冲突 ${data.summary.CONFLICT} · 仅税务 ${data.summary.TAX_ONLY} · 仅平台 ${data.summary.PLATFORM_ONLY}`,
      });
    },
    onError: (e: any) => toast({ title: "上传失败", description: e.message, variant: "destructive" }),
  });

  /* 落库 mutation */
  const commitMut = useMutation({
    mutationFn: (body: any) => ReconcileApi.commit(body),
    onSuccess: (s) => {
      toast({
        title: "并入完成",
        description: `新建 ${s.created} · 更新 ${s.updated} · 跳过 ${s.skipped}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (e: any) => toast({ title: "并入失败", description: e.message, variant: "destructive" }),
  });

  /* ---------- 事件处理 ---------- */
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    uploadMut.mutate(f);
  }

  function toggle(idCard: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(idCard)) n.delete(idCard);
      else n.add(idCard);
      return n;
    });
  }

  function toggleAll(rows: ReconcileRow[], on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      rows.forEach((r) => (on ? n.add(r.idCard) : n.delete(r.idCard)));
      return n;
    });
  }

  /** 一键体验: 直接拉取模板并作为示例上传 */
  async function tryDemo() {
    try {
      const res = await fetch(ReconcileApi.templateUrl());
      const blob = await res.blob();
      const file = new File([blob], "demo_tax_template.xlsx", { type: blob.type });
      setFileName(file.name);
      uploadMut.mutate(file);
    } catch (e: any) {
      toast({ title: "示例加载失败", description: e.message, variant: "destructive" });
    }
  }

  function commit() {
    if (!result) return;
    const all = [...result.matched, ...result.conflicted, ...result.taxOnly, ...result.platformOnly];
    const rows = all
      .filter((r) => selected.has(r.idCard))
      .map((r) => ({
        idCard: r.idCard,
        status: r.status,
        preferSource: r.status === "CONFLICT" ? prefer[r.idCard] ?? "tax" : undefined,
        taxRecord: r.taxRecord,
        platformRecord: r.platformRecord,
      }));
    if (rows.length === 0) {
      toast({ title: "未选中任何记录", variant: "destructive" });
      return;
    }
    commitMut.mutate({ rows, defaultIncomeType: "labor", defaultRelation: "contractor" });
  }

  const totalSelected = selected.size;
  const conflictUnresolved = useMemo(() => {
    if (!result) return 0;
    return result.conflicted.filter((r) => selected.has(r.idCard) && !prefer[r.idCard]).length;
  }, [result, selected, prefer]);

  /* ---------- 计算当前所处阶段 ---------- */
  const stage: 1 | 2 | 3 = result ? (totalSelected > 0 ? 3 : 2) : 1;

  /* ---------- 渲染 ---------- */
  return (
    <div className="space-y-4">
      {/* 顶部: 三步骤流程引导条 */}
      <StepGuide stage={stage} />

      {/* 步骤 ①: 上传 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            步骤一 · 导入个税平台 Excel
          </CardTitle>
          <CardDescription>
            从个税扣缴客户端导出的达人名单作为权威税务身份源,上传后将自动与小红书内部达人库做身份证号比对。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(ReconcileApi.templateUrl(), "_blank")}
              data-testid="button-download-template"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              下载标准模板 (.xlsx)
            </Button>
            <div className="relative">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={onFileChange}
                className="w-72"
                data-testid="input-tax-excel"
                disabled={uploadMut.isPending}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={tryDemo}
              disabled={uploadMut.isPending}
              data-testid="button-try-demo"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              加载示例数据
            </Button>
            {fileName && (
              <span className="text-xs text-muted-foreground">
                <Upload className="w-3 h-3 inline mr-1" />
                {fileName}
              </span>
            )}
            {uploadMut.isPending && (
              <span className="text-xs text-primary flex items-center gap-1">
                <RefreshCcw className="w-3 h-3 animate-spin" />
                解析比对中…
              </span>
            )}
          </div>

          {/* 平台源可展开预览 */}
          <div className="rounded-md border bg-muted/30">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover-elevate"
              onClick={() => setShowXhsPreview((v) => !v)}
              data-testid="button-toggle-xhs-preview"
            >
              {showXhsPreview ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Database className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">
                平台源(小红书达人库)：当前共 <span className="font-semibold text-foreground">{xhsLoading ? "…" : xhsList.length}</span> 名达人
              </span>
              <span className="ml-auto text-muted-foreground">
                {showXhsPreview ? "收起" : "点击展开预览"}
              </span>
            </button>
            {showXhsPreview && (
              <div className="border-t overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>身份证号</TableHead>
                      <TableHead>手机号</TableHead>
                      <TableHead>银行卡号</TableHead>
                      <TableHead>小红书昵称</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {xhsList.map((t: any) => (
                      <TableRow key={t.idCard}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="font-mono text-xs">{maskIdCard(t.idCard)}</TableCell>
                        <TableCell>{maskMobile(t.mobile)}</TableCell>
                        <TableCell className="font-mono text-xs">{maskBankCard(t.bankCard)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.extra?.xhsNickname ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 步骤 ②: 未上传时的空态占位 */}
      {!result && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="w-4 h-4" />
              步骤二 · 比对结果与仲裁
            </CardTitle>
            <CardDescription>完成步骤一后,这里会自动出现 4 类比对结果：完全一致 / 字段冲突 / 仅税务源 / 仅平台源。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="py-8 flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Upload className="w-10 h-10 text-muted-foreground/30" />
              <div>请先在上方上传个税 Excel,或点击 “加载示例数据” 体验完整流程</div>
              <Button variant="outline" size="sm" onClick={tryDemo} disabled={uploadMut.isPending}>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                一键体验示例比对
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 步骤 ②③: 结果与仲裁 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              步骤二 · 比对结果与仲裁
            </CardTitle>
            <CardDescription>
              共 {result.total} 条候选。请在下方分类查看并勾选要并入主档的记录;冲突项需选择以哪一方为准。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 概览 4 卡 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <SummaryTile label="完全一致" n={result.summary.MATCH} tone="ok" />
              <SummaryTile label="字段冲突" n={result.summary.CONFLICT} tone="warn" />
              <SummaryTile label="仅税务源" n={result.summary.TAX_ONLY} tone="info" />
              <SummaryTile label="仅平台源" n={result.summary.PLATFORM_ONLY} tone="info" />
            </div>

            <Tabs value={subTab} onValueChange={(v) => setSubTab(v as any)}>
              <TabsList>
                <TabsTrigger value="MATCH" data-testid="subtab-match">
                  一致 <Badge variant="secondary" className="ml-1.5">{result.summary.MATCH}</Badge>
                </TabsTrigger>
                <TabsTrigger value="CONFLICT" data-testid="subtab-conflict">
                  冲突 <Badge variant="destructive" className="ml-1.5">{result.summary.CONFLICT}</Badge>
                </TabsTrigger>
                <TabsTrigger value="TAX_ONLY" data-testid="subtab-tax-only">
                  仅税务 <Badge variant="outline" className="ml-1.5">{result.summary.TAX_ONLY}</Badge>
                </TabsTrigger>
                <TabsTrigger value="PLATFORM_ONLY" data-testid="subtab-platform-only">
                  仅平台 <Badge variant="outline" className="ml-1.5">{result.summary.PLATFORM_ONLY}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="MATCH" className="mt-3">
                <SimpleTable
                  rows={result.matched}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={(on) => toggleAll(result.matched, on)}
                  emptyText="暂无完全一致的记录"
                  emptyIcon={<CheckCircle2 className="w-8 h-8 text-muted-foreground/40" />}
                />
              </TabsContent>

              <TabsContent value="CONFLICT" className="mt-3">
                <ConflictTable
                  rows={result.conflicted}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={(on) => toggleAll(result.conflicted, on)}
                  prefer={prefer}
                  setPrefer={setPrefer}
                />
              </TabsContent>

              <TabsContent value="TAX_ONLY" className="mt-3">
                <SimpleTable
                  rows={result.taxOnly}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={(on) => toggleAll(result.taxOnly, on)}
                  emptyText="不存在仅税务源记录"
                  emptyIcon={<FileWarning className="w-8 h-8 text-muted-foreground/40" />}
                  source="tax"
                />
              </TabsContent>

              <TabsContent value="PLATFORM_ONLY" className="mt-3">
                <SimpleTable
                  rows={result.platformOnly}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={(on) => toggleAll(result.platformOnly, on)}
                  emptyText="不存在仅平台源记录"
                  emptyIcon={<FileWarning className="w-8 h-8 text-muted-foreground/40" />}
                  source="platform"
                />
              </TabsContent>
            </Tabs>

            {/* 步骤 ③: 提交 */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t">
              <div className="text-xs text-muted-foreground">
                已选 <span className="font-semibold text-foreground">{totalSelected}</span> 条
                {conflictUnresolved > 0 && (
                  <span className="ml-2 text-destructive">· {conflictUnresolved} 条冲突待仲裁</span>
                )}
              </div>
              <Button
                onClick={commit}
                disabled={commitMut.isPending || totalSelected === 0}
                data-testid="button-commit-reconcile"
              >
                {commitMut.isPending ? "并入中…" : `批量并入主档 (${totalSelected})`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------- 子: 顶部三步骤引导条 ---------- */
function StepGuide({ stage }: { stage: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, title: "导入税务 Excel", desc: "上传个税平台导出名单" },
    { n: 2, title: "查看比对结果", desc: "4 类结果分页查阅" },
    { n: 3, title: "仲裁并入库", desc: "冲突人工选源 · 批量并入主档" },
  ];
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        {steps.map((s, i) => {
          const active = stage === s.n;
          const done = stage > s.n;
          const dotClass = done
            ? "bg-emerald-500 text-white border-emerald-500"
            : active
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-muted-foreground border-border";
          const titleClass = done || active ? "text-foreground font-medium" : "text-muted-foreground";
          return (
            <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs flex-shrink-0 ${dotClass}`}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : <span className="font-semibold">{s.n}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-xs leading-tight ${titleClass}`}>{s.title}</div>
                <div className="text-[10px] text-muted-foreground leading-tight truncate">{s.desc}</div>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mx-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 子: 概览方块 ---------- */
function SummaryTile({ label, n, tone }: { label: string; n: number; tone: "ok" | "warn" | "info" }) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900"
      : "border-border bg-muted/30";
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums" data-testid={`tile-${label}`}>{n}</div>
    </div>
  );
}

/* ---------- 子: 通用单源表格 (MATCH / TAX_ONLY / PLATFORM_ONLY) ---------- */
function SimpleTable({
  rows, selected, onToggle, onToggleAll, emptyText, emptyIcon, source,
}: {
  rows: ReconcileRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  emptyText: string;
  emptyIcon?: React.ReactNode;
  source?: "tax" | "platform";
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        {emptyIcon}
        {emptyText}
      </div>
    );
  }
  const allOn = rows.every((r) => selected.has(r.idCard));
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allOn}
                onCheckedChange={(v) => onToggleAll(Boolean(v))}
                data-testid="checkbox-toggle-all"
              />
            </TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>身份证号</TableHead>
            <TableHead>手机号</TableHead>
            <TableHead>银行卡号</TableHead>
            <TableHead>来源</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const rec = r.taxRecord ?? r.platformRecord!;
            const src = source ?? (r.taxRecord ? "tax" : "platform");
            return (
              <TableRow key={r.idCard}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(r.idCard)}
                    onCheckedChange={() => onToggle(r.idCard)}
                    data-testid={`checkbox-row-${r.idCard}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{rec.name}</TableCell>
                <TableCell className="font-mono text-xs">{maskIdCard(rec.idCard)}</TableCell>
                <TableCell>{maskMobile(rec.mobile)}</TableCell>
                <TableCell className="font-mono text-xs">{maskBankCard(rec.bankCard)}</TableCell>
                <TableCell>
                  <Badge variant={src === "tax" ? "default" : "secondary"}>
                    {src === "tax" ? "税务" : "平台"}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------- 子: 冲突表格(双源对照 + 仲裁) ---------- */
function ConflictTable({
  rows, selected, onToggle, onToggleAll, prefer, setPrefer,
}: {
  rows: ReconcileRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  prefer: Record<string, "tax" | "platform">;
  setPrefer: React.Dispatch<React.SetStateAction<Record<string, "tax" | "platform">>>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
        所有交叉记录均一致,无需人工仲裁
      </div>
    );
  }
  const allOn = rows.every((r) => selected.has(r.idCard));
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allOn} onCheckedChange={(v) => onToggleAll(Boolean(v))} />
            </TableHead>
            <TableHead>身份证号</TableHead>
            <TableHead>字段</TableHead>
            <TableHead>税务源</TableHead>
            <TableHead>平台源</TableHead>
            <TableHead className="w-44">以哪方为准</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const t = r.taxRecord!;
            const p = r.platformRecord!;
            const conflictSet = new Set(r.conflicts);
            const cell = (label: string, a?: string, b?: string, masker?: (s?: string) => string) => {
              const m = masker ?? ((s?: string) => s ?? "—");
              const isDiff = conflictSet.has(label);
              return (
                <div className={isDiff ? "text-destructive font-medium" : ""}>
                  <span className="text-[11px] text-muted-foreground mr-1">{label}:</span>
                  <span className={isDiff ? "" : "text-foreground"}>{m(a)}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className={isDiff ? "" : "text-foreground"}>{m(b)}</span>
                </div>
              );
            };
            return (
              <TableRow key={r.idCard} className="align-top">
                <TableCell>
                  <Checkbox
                    checked={selected.has(r.idCard)}
                    onCheckedChange={() => onToggle(r.idCard)}
                    data-testid={`checkbox-conflict-${r.idCard}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{maskIdCard(r.idCard)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.conflicts.map((c) => (
                      <Badge key={c} variant="destructive" className="text-[10px]">
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{c}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs space-y-1">
                  <div className={conflictSet.has("姓名") ? "text-destructive font-medium" : "font-medium"}>
                    {t.name}
                  </div>
                  <div className={conflictSet.has("手机号") ? "text-destructive" : "text-muted-foreground"}>
                    {maskMobile(t.mobile)}
                  </div>
                  <div className={conflictSet.has("银行卡号") ? "text-destructive font-mono" : "text-muted-foreground font-mono"}>
                    {maskBankCard(t.bankCard)}
                  </div>
                </TableCell>
                <TableCell className="text-xs space-y-1">
                  <div className={conflictSet.has("姓名") ? "text-destructive font-medium" : "font-medium"}>
                    {p.name}
                  </div>
                  <div className={conflictSet.has("手机号") ? "text-destructive" : "text-muted-foreground"}>
                    {maskMobile(p.mobile)}
                  </div>
                  <div className={conflictSet.has("银行卡号") ? "text-destructive font-mono" : "text-muted-foreground font-mono"}>
                    {maskBankCard(p.bankCard)}
                  </div>
                </TableCell>
                <TableCell>
                  <RadioGroup
                    value={prefer[r.idCard] ?? "tax"}
                    onValueChange={(v) => setPrefer((s) => ({ ...s, [r.idCard]: v as "tax" | "platform" }))}
                    className="flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="tax" id={`tax-${r.idCard}`} data-testid={`radio-tax-${r.idCard}`} />
                      <Label htmlFor={`tax-${r.idCard}`} className="text-xs cursor-pointer">以税务为准</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="platform" id={`pf-${r.idCard}`} data-testid={`radio-platform-${r.idCard}`} />
                      <Label htmlFor={`pf-${r.idCard}`} className="text-xs cursor-pointer">以平台为准</Label>
                    </div>
                  </RadioGroup>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
