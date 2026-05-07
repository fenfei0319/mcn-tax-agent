/* ============================================================
 * 模块: 身份核验面板 (KYC Panel)
 * 职责: 针对已有达人或新信息,调用二/三/四要素核验接口。
 * ============================================================ */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TalentApi, KycApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldX } from "lucide-react";

export default function KycPanel() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    mode: "three",
    name: "", idCard: "", mobile: "", bankCard: "",
    talentId: undefined as number | undefined,
  });
  const [result, setResult] = useState<any>(null);

  const { data: talents } = useQuery<any[]>({
    queryKey: ["/api/talents"],
    queryFn: () => TalentApi.list(),
  });

  const verifyMut = useMutation({
    mutationFn: (body: any) => KycApi.verify(body),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kyc-logs"] });
      toast({
        title: data.passed ? "核验通过" : "核验未通过",
        description: data.reason,
        variant: data.passed ? "default" : "destructive",
      });
    },
    onError: (e: any) => toast({ title: "核验失败", description: e.message, variant: "destructive" }),
  });

  /** 从已有达人快速填充 */
  const pickTalent = (id: string) => {
    const t = talents?.find(x => String(x.id) === id);
    if (!t) return;
    setForm({
      ...form,
      talentId: t.id,
      name: t.name, idCard: t.idCard,
      mobile: t.mobile ?? "", bankCard: t.bankCard ?? "",
    });
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">身份核验</CardTitle>
          <CardDescription>输入达人三/四要素信息可发起核验</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">从已有达人选择</Label>
            <Select onValueChange={pickTalent}>
              <SelectTrigger data-testid="select-pick-talent"><SelectValue placeholder="— 可选 —" /></SelectTrigger>
              <SelectContent>
                {talents?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name} · {t.idCard.slice(-4)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">核验方式</Label>
            <Select value={form.mode} onValueChange={v => setForm({ ...form, mode: v })}>
              <SelectTrigger data-testid="select-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="two">二要素(姓名+身份证)</SelectItem>
                <SelectItem value="three">三要素(+手机号)</SelectItem>
                <SelectItem value="four">四要素(+银行卡)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">姓名</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-kyc-name" /></div>
            <div className="space-y-1"><Label className="text-xs">身份证</Label><Input value={form.idCard} onChange={e => setForm({ ...form, idCard: e.target.value })} data-testid="input-kyc-idcard" /></div>
            <div className="space-y-1"><Label className="text-xs">手机号</Label><Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} data-testid="input-kyc-mobile" /></div>
            <div className="space-y-1"><Label className="text-xs">银行卡</Label><Input value={form.bankCard} onChange={e => setForm({ ...form, bankCard: e.target.value })} data-testid="input-kyc-bankcard" /></div>
          </div>
          <Button
            className="w-full"
            onClick={() => verifyMut.mutate(form)}
            disabled={verifyMut.isPending || !form.name || !form.idCard}
            data-testid="button-verify"
          >
            {verifyMut.isPending ? "核验中..." : "提交核验"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">核验结果</CardTitle>
          <CardDescription>实时展示最近一次核验的详细输出</CardDescription>
        </CardHeader>
        <CardContent>
          {!result && <div className="text-sm text-muted-foreground py-12 text-center">等待核验提交...</div>}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {result.passed
                  ? <Badge className="bg-emerald-600 hover:bg-emerald-600"><ShieldCheck className="w-3 h-3 mr-1" />通过</Badge>
                  : <Badge variant="destructive"><ShieldX className="w-3 h-3 mr-1" />未通过</Badge>}
                <span className="text-xs text-muted-foreground font-mono">流水号 {result.traceId}</span>
              </div>
              <div className="text-sm bg-muted p-3 rounded">
                <div className="text-xs text-muted-foreground mb-1">返回说明</div>
                <div data-testid="text-kyc-reason">{result.reason}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
