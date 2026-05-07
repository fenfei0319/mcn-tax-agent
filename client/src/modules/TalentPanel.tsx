/* ============================================================
 * 模块: 达人档案面板 (Talent Panel)
 * 职责: 达人列表 / 单条新增 / 删除 / 从小红书一键批量导入。
 * 解耦: 所有数据通过 lib/api 调用,UI 不直接发 fetch。
 * ============================================================ */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TalentApi } from "@/lib/api";
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
import { Trash2, Plus, Search, Cloud, RefreshCcw, CheckCircle2, Sparkles, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { INCOME_TYPES, RELATIONS } from "@shared/schema";
import { maskIdCard, maskMobile, incomeTypeLabel, relationLabel, kycLabel } from "@/lib/format";
import TalentDetailDrawer from "@/modules/TalentDetailDrawer";

export default function TalentPanel() {
  const { toast } = useToast();
  const [keyword, setKeyword] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({
    name: "", idCard: "", mobile: "", bankCard: "",
    incomeType: "labor", relation: "contractor", note: "",
  });
  const [importDefaults, setImportDefaults] = useState({
    defaultIncomeType: "platform",
    defaultRelation: "contractor",
  });
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; total: number } | null>(null);
  const [activeTalent, setActiveTalent] = useState<any | null>(null);

  const { data: list, isLoading } = useQuery<any[]>({
    queryKey: ["/api/talents", keyword],
    queryFn: () => TalentApi.list(keyword),
  });

  /* ---------- 单条新增 ---------- */
  const createMut = useMutation({
    mutationFn: (body: any) => TalentApi.create(body),
    onSuccess: () => {
      toast({ title: "已添加", description: "达人档案创建成功" });
      setForm({ name: "", idCard: "", mobile: "", bankCard: "", incomeType: "labor", relation: "contractor", note: "" });
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (e: any) => toast({ title: "添加失败", description: e.message, variant: "destructive" }),
  });

  /* ---------- 删除 ---------- */
  const removeMut = useMutation({
    mutationFn: (id: number) => TalentApi.remove(id),
    onSuccess: () => {
      toast({ title: "已删除" });
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  /* ---------- 从小红书一键批量导入 ---------- */
  const importMut = useMutation({
    mutationFn: () => TalentApi.importFromXhs(importDefaults),
    onSuccess: (r) => {
      setImportResult(r);
      toast({
        title: "导入完成",
        description: `共 ${r.total} 条 · 新建 ${r.created} · 更新 ${r.updated} · 跳过 ${r.skipped}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (e: any) => toast({ title: "导入失败", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <div className="text-sm font-medium">达人档案</div>
            <Badge variant="secondary" className="text-[11px]">共 {list?.length ?? 0} 位</Badge>
          </div>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="按姓名/身份证搜索"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="pl-8"
              data-testid="input-search"
            />
          </div>
          {/* 一键导入按钮 */}
          <Dialog open={showImport} onOpenChange={(v) => { setShowImport(v); if (!v) setImportResult(null); }}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" data-testid="button-open-import">
                <Cloud className="w-3.5 h-3.5 mr-1.5" />
                从小红书批量导入
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-primary" />
                  从小红书达人库批量导入
                </DialogTitle>
                <DialogDescription>
                  将自动拉取小红书 MCN 后台的全部达人,以身份证号为主键合并入主档。
                  <br />
                  <span className="text-[11px]">已存在的达人只补全空字段,不会覆盖人工修订;新达人按下方默认值入库,可入库后再调整。</span>
                </DialogDescription>
              </DialogHeader>

              {/* 默认值设置 */}
              <div className="grid grid-cols-2 gap-3 py-2">
                <Field label="默认所得类型">
                  <Select
                    value={importDefaults.defaultIncomeType}
                    onValueChange={v => setImportDefaults(d => ({ ...d, defaultIncomeType: v }))}
                  >
                    <SelectTrigger data-testid="select-import-incometype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCOME_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="默认签约关系">
                  <Select
                    value={importDefaults.defaultRelation}
                    onValueChange={v => setImportDefaults(d => ({ ...d, defaultRelation: v }))}
                  >
                    <SelectTrigger data-testid="select-import-relation"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RELATIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* 结果展示 */}
              {importResult && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    导入完成
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <ResultTile label="拉取" n={importResult.total} />
                    <ResultTile label="新建" n={importResult.created} tone="ok" />
                    <ResultTile label="更新" n={importResult.updated} tone="info" />
                    <ResultTile label="跳过" n={importResult.skipped} />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowImport(false)} data-testid="button-import-cancel">
                  关闭
                </Button>
                <Button
                  onClick={() => importMut.mutate()}
                  disabled={importMut.isPending}
                  data-testid="button-import-confirm"
                >
                  {importMut.isPending ? (
                    <><RefreshCcw className="w-3.5 h-3.5 mr-1.5 animate-spin" />拉取中…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5 mr-1.5" />开始拉取</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 单条新增 (改为对话框,简化主界面) */}
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-open-create">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                手动新增
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" />新增达人</DialogTitle>
                <DialogDescription>维护旗下达人基础信息(用于无法从小红书获取的特殊情况)</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Field label="姓名 *">
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-name" placeholder="例:张三" />
                </Field>
                <Field label="身份证号 *">
                  <Input value={form.idCard} onChange={e => setForm(f => ({ ...f, idCard: e.target.value }))} data-testid="input-idcard" placeholder="18位" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="手机号">
                    <Input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} data-testid="input-mobile" />
                  </Field>
                  <Field label="银行卡号">
                    <Input value={form.bankCard} onChange={e => setForm(f => ({ ...f, bankCard: e.target.value }))} data-testid="input-bankcard" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="所得类型">
                    <Select value={form.incomeType} onValueChange={v => setForm(f => ({ ...f, incomeType: v }))}>
                      <SelectTrigger data-testid="select-incometype"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INCOME_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="签约关系">
                    <Select value={form.relation} onValueChange={v => setForm(f => ({ ...f, relation: v }))}>
                      <SelectTrigger data-testid="select-relation"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RELATIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>取消</Button>
                <Button
                  onClick={() => createMut.mutate(form)}
                  disabled={!form.name || !form.idCard || createMut.isPending}
                  data-testid="button-create-talent"
                >
                  {createMut.isPending ? "保存中..." : "保存档案"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* 自动化提示条 */}
      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
        <div className="space-y-0.5">
          <div className="font-medium text-foreground">自动化建档</div>
          <div className="text-muted-foreground leading-relaxed">
            推荐通过"从小红书批量导入"自动同步达人;点击下方任意行可查看身份证照片、账号信息、当期流水。需与税务平台交叉核对请前往
            <span className="font-medium text-foreground"> 双源验证 </span>
            模块。
          </div>
        </div>
      </div>

      {/* 列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">达人列表</CardTitle>
          <CardDescription>共 {list?.length ?? 0} 位 · 身份证、手机、银行卡均做脱敏展示</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>身份证</TableHead>
                <TableHead>手机</TableHead>
                <TableHead>所得类型</TableHead>
                <TableHead>关系</TableHead>
                <TableHead>核验状态</TableHead>
                <TableHead>来源备注</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">加载中...</TableCell></TableRow>
              )}
              {!isLoading && list?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Cloud className="w-10 h-10 text-muted-foreground/30" />
                      <div className="text-sm">暂无达人档案</div>
                      <div className="text-xs">点击右上方 "从小红书批量导入" 一键同步</div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {list?.map((t: any) => (
                <TableRow
                  key={t.id}
                  data-testid={`row-talent-${t.id}`}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setActiveTalent(t)}
                >
                  <TableCell className="font-medium" data-testid={`text-name-${t.id}`}>
                    <span className="flex items-center gap-1">
                      {t.name}
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{maskIdCard(t.idCard)}</TableCell>
                  <TableCell className="font-mono text-xs">{maskMobile(t.mobile)}</TableCell>
                  <TableCell>{incomeTypeLabel[t.incomeType]}</TableCell>
                  <TableCell>{relationLabel[t.relation]}</TableCell>
                  <TableCell>
                    <Badge variant={t.kycStatus === "verified" ? "default" : t.kycStatus === "failed" ? "destructive" : "secondary"}>
                      {kycLabel[t.kycStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={t.note ?? ""}>
                    {t.note ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); removeMut.mutate(t.id); }}
                      data-testid={`button-delete-${t.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 详情抽屉 */}
      <TalentDetailDrawer talent={activeTalent} onClose={() => setActiveTalent(null)} />
    </div>
  );
}

/* ---------- 子: 表单字段 ---------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/* ---------- 子: 导入结果小方块 ---------- */
function ResultTile({ label, n, tone }: { label: string; n: number; tone?: "ok" | "info" }) {
  const tc =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-400" :
    tone === "info" ? "text-primary" :
    "text-foreground";
  return (
    <div className="rounded border bg-card px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tc}`}>{n}</div>
    </div>
  );
}
