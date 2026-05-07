/* ============================================================
 * 模块: 双源验证面板 (Verify Panel) — v1.2
 * 职责: 把"身份核验(单条四要素)"与"双源比对(税务×平台)"合并为
 *      统一入口"双源验证",通过子 Tab 切换两种粒度:
 *        ① 单条核验 — 四要素 / 三要素 / 二要素 实时核验
 *        ② 批量比对 — 上传税务 Excel × 小红书,差异修正后并入主档
 * 解耦: 直接复用现有 KycPanel / ReconcilePanel 两个独立模块,
 *      本组件仅做组合,不引入新业务逻辑。
 * ============================================================ */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, GitCompare, Sparkles } from "lucide-react";
import KycPanel from "@/modules/KycPanel";
import ReconcilePanel from "@/modules/ReconcilePanel";

export default function VerifyPanel() {
  const [sub, setSub] = useState<"kyc" | "reconcile">("kyc");

  return (
    <div className="space-y-4">
      {/* 顶部说明栏 */}
      <Card>
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs leading-relaxed">
            <div className="font-medium text-foreground mb-0.5">双源验证</div>
            <span className="text-muted-foreground">
              融合「单条四要素核验」与「税务 × 平台双源比对」于同一入口。日常对个别达人快速核验请用左侧「单条核验」;
              月度税务申报前与税局返回的实名档进行交叉勾稽请用「批量比对」。
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 子 Tabs */}
      <Tabs value={sub} onValueChange={(v) => setSub(v as "kyc" | "reconcile")}>
        <TabsList>
          <TabsTrigger value="kyc" data-testid="subtab-kyc">
            <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            单条核验
          </TabsTrigger>
          <TabsTrigger value="reconcile" data-testid="subtab-reconcile">
            <GitCompare className="w-3.5 h-3.5 mr-1.5" />
            批量比对(税务 × 小红书)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kyc" className="mt-4">
          <KycPanel />
        </TabsContent>

        <TabsContent value="reconcile" className="mt-4">
          <ReconcilePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
