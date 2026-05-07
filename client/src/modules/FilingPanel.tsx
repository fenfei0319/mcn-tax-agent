/* ============================================================
 * 模块: 申报导出面板 (Filing Panel)
 * 职责: 按所属期预览申报数据,一键下载税局兼容 CSV。
 * ============================================================ */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilingApi, API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtMoney, fmtPercent, incomeTypeLabel } from "@/lib/format";
import { FileDown } from "lucide-react";

export default function FilingPanel() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const { data: rows, isLoading } = useQuery<any[]>({
    queryKey: ["/api/filing/preview", period],
    queryFn: () => FilingApi.preview(period),
    enabled: !!period,
  });

  const totalIncome = rows?.reduce((s, r) => s + r.income, 0) ?? 0;
  const totalTax = rows?.reduce((s, r) => s + r.taxAmount, 0) ?? 0;

  const handleExport = () => {
    // 部署后 API_BASE 由 __PORT_5000__ 占位符被代理路径替换,本地为空串
    window.open(API_BASE + FilingApi.exportUrl(period), "_blank");
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex-1">
          <CardTitle className="text-base">申报数据导出</CardTitle>
          <CardDescription>输出符合自然人电子税务局批量导入模板的 CSV 文件</CardDescription>
        </div>
        <div>
          <Label className="text-xs block mb-1">所属期</Label>
          <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="w-40" data-testid="input-filing-period" />
        </div>
        <Button onClick={handleExport} disabled={!rows?.length} data-testid="button-export">
          <FileDown className="w-4 h-4 mr-1.5" />导出 CSV
        </Button>
      </CardHeader>
      <CardContent>
        {/* 汇总 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Summary label="申报人次" value={String(rows?.length ?? 0)} />
          <Summary label="收入合计" value={fmtMoney(totalIncome)} />
          <Summary label="税额合计" value={fmtMoney(totalTax)} highlight />
        </div>

        {/* 预览表 */}
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">所属期</TableHead>
              <TableHead className="whitespace-nowrap">姓名</TableHead>
              <TableHead className="whitespace-nowrap">身份证号</TableHead>
              <TableHead className="whitespace-nowrap">所得项目</TableHead>
              <TableHead className="text-right whitespace-nowrap">收入额</TableHead>
              <TableHead className="text-right whitespace-nowrap">减除费用</TableHead>
              <TableHead className="text-right whitespace-nowrap">应纳税所得</TableHead>
              <TableHead className="text-right whitespace-nowrap">税率</TableHead>
              <TableHead className="text-right whitespace-nowrap">应纳税额</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">加载中...</TableCell></TableRow>}
            {!isLoading && rows?.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">该所属期暂无可申报数据</TableCell></TableRow>}
            {rows?.map((r: any, i: number) => (
              <TableRow key={i} data-testid={`row-filing-${i}`}>
                <TableCell className="font-mono text-xs whitespace-nowrap">{r.period}</TableCell>
                <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{r.idCard.slice(0, 6)}********{r.idCard.slice(-4)}</TableCell>
                <TableCell className="whitespace-nowrap">{incomeTypeLabel[r.incomeType]}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtMoney(r.income)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtMoney(r.deduction)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtMoney(r.taxable)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtPercent(r.rate)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold text-foreground">{fmtMoney(r.taxAmount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Summary({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded border p-3 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
