/* ============================================================
 * 模块: 税额试算面板 (Calc Panel)
 * 职责: 纯试算工具,不落库。展示完整推导过程。
 * ============================================================ */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalcApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INCOME_TYPES } from "@shared/schema";
import { fmtMoney, fmtPercent } from "@/lib/format";
import { Calculator } from "lucide-react";

export default function CalcPanel() {
  const [form, setForm] = useState({
    incomeType: "labor",
    income: "",
    cumulativeIncome: "",
    monthsWorked: "1",
    alreadyWithheld: "",
  });
  const [result, setResult] = useState<any>(null);

  const calcMut = useMutation({
    mutationFn: (body: any) => CalcApi.trial(body),
    onSuccess: (d) => setResult(d),
  });

  const run = () => {
    calcMut.mutate({
      incomeType: form.incomeType,
      income: Number(form.income),
      cumulativeIncome: form.cumulativeIncome ? Number(form.cumulativeIncome) : undefined,
      monthsWorked: Number(form.monthsWorked),
      alreadyWithheld: form.alreadyWithheld ? Number(form.alreadyWithheld) : undefined,
    });
  };

  const needsCumulative = form.incomeType === "salary" || form.incomeType === "platform";

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Calculator className="w-4 h-4" />税额试算</CardTitle>
          <CardDescription>不落库,快速核对</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">所得类型</Label>
            <Select value={form.incomeType} onValueChange={v => setForm({ ...form, incomeType: v })}>
              <SelectTrigger data-testid="select-calc-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCOME_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">本期税前收入(元)</Label>
            <Input type="number" value={form.income} onChange={e => setForm({ ...form, income: e.target.value })} data-testid="input-calc-income" />
          </div>
          {needsCumulative && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">累计收入(元,本期前)</Label>
                <Input type="number" value={form.cumulativeIncome} onChange={e => setForm({ ...form, cumulativeIncome: e.target.value })} data-testid="input-calc-cum" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">连续任职月份数</Label>
                <Input type="number" value={form.monthsWorked} onChange={e => setForm({ ...form, monthsWorked: e.target.value })} data-testid="input-calc-months" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">累计已预扣税额(元)</Label>
                <Input type="number" value={form.alreadyWithheld} onChange={e => setForm({ ...form, alreadyWithheld: e.target.value })} data-testid="input-calc-already" />
              </div>
            </>
          )}
          <Button className="w-full" onClick={run} disabled={!form.income} data-testid="button-calc">
            计算
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">计算结果</CardTitle>
          <CardDescription>含完整推导过程,便于复核</CardDescription>
        </CardHeader>
        <CardContent>
          {!result && <div className="text-sm text-muted-foreground py-12 text-center">填写左侧参数,点击"计算"</div>}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Stat title="应纳税所得额" value={fmtMoney(result.taxableIncome)} />
                <Stat title="适用税率" value={fmtPercent(result.rate)} />
                <Stat title="速算扣除" value={fmtMoney(result.quickDeduction)} />
                <Stat title="应纳税额" value={fmtMoney(result.taxAmount)} highlight />
                <Stat title="税后金额" value={fmtMoney(result.netIncome)} highlight />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">推导过程</div>
                <ol className="text-sm space-y-1 list-decimal list-inside bg-muted p-3 rounded" data-testid="list-explanation">
                  {result.explanation.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded border p-2 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5 whitespace-nowrap">{value}</div>
    </div>
  );
}
