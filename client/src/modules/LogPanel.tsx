/* ============================================================
 * 模块: 核验日志面板 (Log Panel) — v1.3 升级
 * 职责:
 *  - 只读展示核验历史,供合规留痕与稽查追溯。
 *  - 新增筛选:所属期 / 所得类型 / 签约关系 / 达人姓名 / 通过状态 / 来源。
 *  - 直接展示当时的「收入金额」「应纳税额」与「来源」便于复核。
 * 解耦: 仅依赖 lib/api.ts 与 lib/format.ts,UI 替换不影响数据来源。
 * ============================================================ */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KycApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INCOME_TYPES, RELATIONS } from "@shared/schema";
import { fmtMoney, fmtCount, incomeTypeLabel, relationLabel } from "@/lib/format";
import { Filter, X } from "lucide-react";

const MODE_LABEL: Record<string, string> = { two: "二要素", three: "三要素", four: "四要素" };
const SOURCE_LABEL: Record<string, string> = {
  single: "单条核验",
  batch: "批量同步(CSV)",
  "xhs-sync": "批量同步(小红书)",
};
const ALL = "__all__";

export default function LogPanel() {
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/kyc-logs"],
    queryFn: () => KycApi.logs(),
    refetchInterval: 5000,
  });

  /* ---------- 筛选状态 ---------- */
  const [keyword, setKeyword] = useState("");           // 姓名 / 流水号 模糊匹配
  const [period, setPeriod] = useState("");             // YYYY-MM
  const [incomeType, setIncomeType] = useState(ALL);
  const [relation, setRelation] = useState(ALL);
  const [status, setStatus] = useState(ALL);            // pass / fail
  const [source, setSource] = useState(ALL);

  const filtered = useMemo(() => {
    if (!logs) return [];
    const kw = keyword.trim().toLowerCase();
    return logs.filter((l) => {
      if (kw && !((l.talentName ?? "").toLowerCase().includes(kw)
                || (l.traceId ?? "").toLowerCase().includes(kw))) return false;
      if (period && l.period !== period) return false;
      if (incomeType !== ALL && l.incomeType !== incomeType) return false;
      if (relation !== ALL && l.relation !== relation) return false;
      if (status === "pass" && !l.passed) return false;
      if (status === "fail" && l.passed) return false;
      if (source !== ALL && l.source !== source) return false;
      return true;
    });
  }, [logs, keyword, period, incomeType, relation, status, source]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const pass = filtered.filter((l) => l.passed).length;
    const totalAmount = filtered.reduce((s, l) => s + (l.amount ?? 0), 0);
    const totalTax = filtered.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
    return { total, pass, fail: total - pass, totalAmount, totalTax };
  }, [filtered]);

  const resetFilters = () => {
    setKeyword(""); setPeriod(""); setIncomeType(ALL);
    setRelation(ALL); setStatus(ALL); setSource(ALL);
  };

  const hasFilter =
    !!keyword || !!period ||
    incomeType !== ALL || relation !== ALL || status !== ALL || source !== ALL;

  return (
    <div className="space-y-4">
      {/* ---------- 筛选条 ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            筛选条件
            {hasFilter && (
              <Button size="sm" variant="ghost" className="h-6 ml-auto text-xs" onClick={resetFilters} data-testid="button-reset-filter">
                <X className="w-3 h-3 mr-1" />清除筛选
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">达人/流水号</Label>
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="姓名或流水号" className="h-8" data-testid="input-log-keyword" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">所属期</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-8" data-testid="input-log-period" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">所得类型</Label>
              <Select value={incomeType} onValueChange={setIncomeType}>
                <SelectTrigger className="h-8" data-testid="select-log-incometype"><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部</SelectItem>
                  {INCOME_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">签约关系</Label>
              <Select value={relation} onValueChange={setRelation}>
                <SelectTrigger className="h-8" data-testid="select-log-relation"><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部</SelectItem>
                  {RELATIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">通过状态</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8" data-testid="select-log-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部</SelectItem>
                  <SelectItem value="pass">通过</SelectItem>
                  <SelectItem value="fail">未通过</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">来源</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="h-8" data-testid="select-log-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部</SelectItem>
                  <SelectItem value="single">单条核验</SelectItem>
                  <SelectItem value="batch">批量同步(CSV)</SelectItem>
                  <SelectItem value="xhs-sync">批量同步(小红书)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 日志主体 ---------- */}
      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0 pb-3">
          <div className="flex-1">
            <CardTitle className="text-base">核验日志</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              共 <span className="tabular-nums font-semibold text-foreground">{fmtCount(stats.total)}</span> 条
              · 通过 <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{fmtCount(stats.pass)}</span>
              · 未通过 <span className="tabular-nums text-destructive">{fmtCount(stats.fail)}</span>
              · 涉及收入 <span className="tabular-nums">{fmtMoney(stats.totalAmount)}</span>
              · 涉及税额 <span className="tabular-nums">{fmtMoney(stats.totalTax)}</span>
            </p>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">时间</TableHead>
                <TableHead className="whitespace-nowrap">达人</TableHead>
                <TableHead className="whitespace-nowrap">所属期</TableHead>
                <TableHead className="whitespace-nowrap">所得类型</TableHead>
                <TableHead className="whitespace-nowrap">签约关系</TableHead>
                <TableHead className="whitespace-nowrap">核验方式</TableHead>
                <TableHead className="whitespace-nowrap">来源</TableHead>
                <TableHead className="whitespace-nowrap">结果</TableHead>
                <TableHead className="text-right whitespace-nowrap">收入金额</TableHead>
                <TableHead className="text-right whitespace-nowrap">应纳税额</TableHead>
                <TableHead className="whitespace-nowrap">说明 / 流水号</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={11} className="py-6 text-center text-muted-foreground">加载中...</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={11} className="py-6 text-center text-muted-foreground">
                  {hasFilter ? "无符合筛选条件的日志,请调整筛选项" : "暂无日志"}
                </TableCell></TableRow>
              )}
              {filtered.map((l) => (
                <TableRow key={l.id} data-testid={`row-log-${l.id}`}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{l.talentName ?? (l.talentId ? `#${l.talentId}` : "—")}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{l.period ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {l.incomeType ? <Badge variant="outline" className="font-normal">{incomeTypeLabel[l.incomeType] ?? l.incomeType}</Badge> : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {l.relation ? (relationLabel[l.relation] ?? l.relation) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{MODE_LABEL[l.mode] ?? l.mode}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {SOURCE_LABEL[l.source ?? ""] ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {l.passed
                      ? <Badge className="bg-emerald-600 hover:bg-emerald-600">通过</Badge>
                      : <Badge variant="destructive">未通过</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {l.amount != null ? fmtMoney(l.amount) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">
                    {l.taxAmount != null ? fmtMoney(l.taxAmount) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="max-w-[280px] truncate" title={l.reason}>{l.reason}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{l.traceId}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
