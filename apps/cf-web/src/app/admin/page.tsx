import { Activity, Users, DollarSign, HardDrive } from "lucide-react";
import PageContainer from "@/components/layout/page-container";
import { getAdminOverview } from "@/lib/api/read";
import Link from "next/link";

export default async function AdminOverview() {
  const overview = await getAdminOverview();

  const metrics = [
    { label: "Total Revenue", value: overview.revenue ? `$${overview.revenue}` : "$0", icon: DollarSign },
    { label: "Total Users", value: overview.totalUsers.toString(), icon: Users },
    { label: "Active Projects", value: overview.activeProjects.toString(), icon: Activity },
    { label: "Total Projects", value: overview.totalProjects.toString(), icon: HardDrive },
  ];

  return (
    <PageContainer
      pageTitle="System Overview"
      pageDescription="Platform vitals and high-level revenue metrics."
    >
      {/* ─── Metrics Grid ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        {metrics.map((metric, i) => (
          <div key={i} className="bg-card border border-border/20 rounded-2xl p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{metric.label}</span>
              <metric.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-black text-white">{metric.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Main Content ───────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-8">
        
        {/* Recent Activity */}
        <div className="bg-card border border-border/20 rounded-3xl p-8">
          <h2 className="text-lg font-bold text-white mb-6">Admin Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            <Link href="/admin/projects" className="p-6 rounded-2xl border border-border/40 bg-background/40 hover:bg-muted/50 transition-colors cursor-pointer group">
              <h3 className="font-bold text-white mb-2 group-hover:text-primary transition-colors uppercase text-[11px] tracking-wider">Manage Projects</h3>
              <p className="text-[10px] text-muted-foreground uppercase opacity-70">View and assign editors to incoming requests.</p>
            </Link>
             <Link href="/admin/security" className="p-6 rounded-2xl border border-border/40 bg-background/40 hover:bg-muted/50 transition-colors cursor-pointer group">
              <h3 className="font-bold text-white mb-2 group-hover:text-primary transition-colors uppercase text-[11px] tracking-wider">Security Protocol</h3>
              <p className="text-[10px] text-muted-foreground uppercase opacity-70">Enable or disable bot detection and shields.</p>
            </Link>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-card border border-border/20 rounded-3xl p-8">
          <h2 className="text-lg font-bold text-white mb-6">System Status</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-background/40">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <span className="text-sm font-bold text-white">Database Cluster</span>
              </div>
              <span className="text-xs font-medium text-zinc-500">Operational</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-background/40">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <span className="text-sm font-bold text-white">Object Storage (MinIO)</span>
              </div>
              <span className="text-xs font-medium text-zinc-500">Operational</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-background/40">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <span className="text-sm font-bold text-white">Redis Cache</span>
              </div>
              <span className="text-xs font-medium text-zinc-500">Operational</span>
            </div>
          </div>
        </div>

      </div>
    </PageContainer>
  );
}

