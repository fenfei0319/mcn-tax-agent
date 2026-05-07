/* ============================================================
 * 模块: 主页面 (Home)
 * 职责: 统一布局 + Tabs 路由切换六个功能模块。
 *      纯展示层,所有数据通过 lib/api.ts 调用后端 REST。
 * ============================================================ */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2, Users, ShieldCheck, Wallet, Calculator, FileDown, History, GitCompare, Cloud
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DashboardApi } from "@/lib/api";
import { fmtMoney } from "@/lib/format";

import TalentPanel    from "@/modules/TalentPanel";
import VerifyPanel    from "@/modules/VerifyPanel";
import IncomePanel    from "@/modules/IncomePanel";
import CalcPanel      from "@/modules/CalcPanel";
import FilingPanel    from "@/modules/FilingPanel";
import SyncPanel      from "@/modules/SyncPanel";
import LogPanel       from "@/modules/LogPanel";

export default function Home() {
  const [tab, setTab] = useState("dashboard");

  const { data: stats } = useQuery({
    queryKey: ["/api/dashboard"],
    queryFn: () => DashboardApi.overview(),
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部品牌栏 */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight" data-testid="text-app-title">
              达人个税申报 Agent
            </h1>
            <p className="text-xs text-muted-foreground">身份核验 + 个税预扣预缴自动化</p>
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            <span className="hidden md:inline">仅供辅助申报,实际报送以税局结果为准</span>
          </div>
        </div>
      </header>

      {/* 概览数字卡片 */}
      <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="登记达人" value={stats?.talentCount ?? 0} icon={<Users className="w-4 h-4" />} />
        <StatCard label="已核验" value={stats?.verifiedCount ?? 0} icon={<ShieldCheck className="w-4 h-4" />} highlight />
        <StatCard label="累计收入登记笔数" value={stats?.incomeCount ?? 0} icon={<Wallet className="w-4 h-4" />} />
        <StatCard label="应预扣预缴税额合计" value={fmtMoney(stats?.totalTax)} icon={<Calculator className="w-4 h-4" />} />
      </div>

      {/* 主功能区 */}
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="dashboard" data-testid="tab-talent"><Users className="w-3.5 h-3.5 mr-1.5" />达人档案</TabsTrigger>
            <TabsTrigger value="verify"   data-testid="tab-verify"><GitCompare className="w-3.5 h-3.5 mr-1.5" />双源验证</TabsTrigger>
            <TabsTrigger value="income"   data-testid="tab-income"><Wallet className="w-3.5 h-3.5 mr-1.5" />收入登记</TabsTrigger>
            <TabsTrigger value="calc"     data-testid="tab-calc"><Calculator className="w-3.5 h-3.5 mr-1.5" />税额试算</TabsTrigger>
            <TabsTrigger value="sync"     data-testid="tab-sync"><Cloud className="w-3.5 h-3.5 mr-1.5" />批量同步</TabsTrigger>
            <TabsTrigger value="filing"   data-testid="tab-filing"><FileDown className="w-3.5 h-3.5 mr-1.5" />申报导出</TabsTrigger>
            <TabsTrigger value="log"      data-testid="tab-log"><History className="w-3.5 h-3.5 mr-1.5" />核验日志</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4"><TalentPanel /></TabsContent>
          <TabsContent value="verify"    className="mt-4"><VerifyPanel /></TabsContent>
          <TabsContent value="income"    className="mt-4"><IncomePanel /></TabsContent>
          <TabsContent value="calc"      className="mt-4"><CalcPanel /></TabsContent>
          <TabsContent value="sync"      className="mt-4"><SyncPanel /></TabsContent>
          <TabsContent value="filing"    className="mt-4"><FilingPanel /></TabsContent>
          <TabsContent value="log"       className="mt-4"><LogPanel /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, highlight }: { label: string; value: any; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-normal text-muted-foreground flex items-center gap-1.5">
          {icon}{label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold tabular-nums" data-testid={`stat-${label}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
