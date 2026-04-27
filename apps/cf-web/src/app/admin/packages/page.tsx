import PageContainer from "@/components/layout/page-container";
import { getAdminPackages } from "@/lib/api/read";
import { EditPackageDialog } from "./edit-package-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DollarSign, Clock, HardDrive, CheckCircle2 } from "lucide-react";
import type { AdminPackageRecord } from "@edicut/platform-core/lib/admin-queries";

export default async function PackageManagementPage() {
  const allPackages = await getAdminPackages();

  return (
    <PageContainer
      pageTitle="Gig Editor & Pricing"
      pageDescription="Configure your service offerings, pricing tiers, and project constraints."
    >
      <div className="flex flex-col gap-8">
        <div className="flex justify-end">
          <EditPackageDialog isNew={true} />
        </div>

        {/* ─── Packages Grid ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {allPackages.map((pkg) => (
            <div key={pkg.id} className={cn(
              "group relative flex flex-col rounded-[2.5rem] border p-8 transition-all duration-300",
              pkg.isActive 
                ? "bg-card border-border/40 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/5" 
                : "bg-zinc-900/30 border-zinc-800 opacity-60 grayscale"
            )}>
              <div className="flex justify-between items-start mb-6">
                <Badge className={cn(
                  "rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-widest border",
                  pkg.tier === 'pro' ? 'bg-primary/10 text-primary border-primary/20' : 
                  pkg.tier === 'medium' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                  'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                )}>
                  {pkg.tier} Tier
                </Badge>
                <EditPackageDialog pkg={pkg as AdminPackageRecord} />
              </div>

              <h3 className="text-2xl font-black text-white tracking-tight mb-2">{pkg.name}</h3>
              <div className="flex items-baseline gap-1 text-4xl font-black text-white mb-6">
                <span className="text-xl font-bold text-muted-foreground">$</span>
                {pkg.price}
              </div>

              {/* Constraints List */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-background/40 rounded-2xl p-4 border border-border/10">
                  <Clock className="h-4 w-4 text-primary mb-2" />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Delivery</p>
                  <p className="text-sm font-bold text-white">{pkg.deliveryDays} Days</p>
                </div>
                <div className="bg-background/40 rounded-2xl p-4 border border-border/10">
                  <HardDrive className="h-4 w-4 text-primary mb-2" />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Footage</p>
                  <p className="text-sm font-bold text-white">{pkg.maxRawFootageGB} GB</p>
                </div>
              </div>

              {/* Features List */}
              <div className="flex-1 space-y-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Included Features</p>
                {(pkg.features || []).slice(0, 5).map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs font-medium text-zinc-400">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    {feature}
                  </div>
                ))}
                {(pkg.features || []).length > 5 && (
                  <p className="text-[10px] font-bold text-zinc-600 italic px-6">
                    + {(pkg.features || []).length - 5} more features
                  </p>
                )}
              </div>

              {!pkg.isActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Badge variant="outline" className="bg-background text-red-500 border-red-500/20 px-4 py-2 rounded-xl font-black uppercase tracking-widest scale-125 rotate-12">
                    Inactive
                  </Badge>
                </div>
              )}
            </div>
          ))}

          {allPackages.length === 0 && (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-zinc-800 rounded-[3rem]">
               <DollarSign className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
               <h3 className="text-xl font-bold text-zinc-500">No active packages found</h3>
               <p className="text-zinc-600 text-sm mt-2">Create your first service tier to start selling.</p>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

