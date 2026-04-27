"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Settings2, 
  DollarSign, 
  Clock, 
  HardDrive, 
  Video, 
  Check, 
  X,
  PlusCircle,
  GripVertical
} from "lucide-react";
import { updatePackage, createPackage } from "@/lib/api/admin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface Package {
  id: string;
  name: string;
  description: string | null;
  tier: string;
  price: string;
  features: string[] | null;
  maxRawFootageGB: number | null;
  maxVideoLengthMin: number | null;
  revisions: number | null;
  deliveryDays: number | null;
  isActive: boolean;
}

type PackageFormData = Omit<Package, "id">;

export function EditPackageDialog({ 
  pkg, 
  isNew = false 
}: { 
  pkg?: Package, 
  isNew?: boolean 
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [formData, setFormData] = useState<PackageFormData>({
    name: pkg?.name || "",
    description: pkg?.description || "",
    tier: pkg?.tier || "basic",
    price: pkg?.price || "49.00",
    features: pkg?.features || [],
    maxRawFootageGB: pkg?.maxRawFootageGB || 10,
    maxVideoLengthMin: pkg?.maxVideoLengthMin || 5,
    revisions: pkg?.revisions || 2,
    deliveryDays: pkg?.deliveryDays || 3,
    isActive: pkg?.isActive ?? true,
  });

  const [newFeature, setNewFeature] = useState("");

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setFormData({
      ...formData,
      features: [...(formData.features || []), newFeature.trim()]
    });
    setNewFeature("");
  };

  const removeFeature = (index: number) => {
    const newFeatures = [...(formData.features || [])];
    newFeatures.splice(index, 1);
    setFormData({ ...formData, features: newFeatures });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    
    const action = isNew ? createPackage(formData) : updatePackage(pkg!.id, formData);
    const result = await action;
    
    setIsPending(false);

    if (result.success) {
      toast.success(isNew ? "Package created." : "Package updated.");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isNew ? (
          <Button className="rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
            <PlusCircle className="mr-2 h-4 w-4" /> New Tier
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-xl">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-[700px] p-0 overflow-hidden rounded-3xl">
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
          <div className="p-8 pb-4 overflow-y-auto">
            <DialogHeader className="mb-8">
              <DialogTitle className="text-3xl font-black tracking-tight text-white">
                {isNew ? "Create Service Tier" : `Editing ${pkg?.name}`}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 font-medium">
                Configure pricing, limits, and cinematic features for this package.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
              {/* Left Column: Basic Info */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Package Name</label>
                  <input
                    required
                    placeholder="e.g. Cinematic Masterpiece"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Price (USD)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <input
                        required
                        type="number"
                        step="0.01"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Service Tier</label>
                    <select
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors appearance-none"
                      value={formData.tier}
                      onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                    >
                      <option value="basic">Basic</option>
                      <option value="medium">Medium</option>
                      <option value="pro">Pro</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Delivery (Days)</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <input
                        type="number"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        value={formData.deliveryDays || ""}
                        onChange={(e) => setFormData({ ...formData, deliveryDays: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Revisions</label>
                    <input
                      type="number"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                      value={formData.revisions || ""}
                      onChange={(e) => setFormData({ ...formData, revisions: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Max Footage (GB)</label>
                    <div className="relative">
                      <HardDrive className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <input
                        type="number"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        value={formData.maxRawFootageGB || ""}
                        onChange={(e) => setFormData({ ...formData, maxRawFootageGB: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Max Video Length (Min)</label>
                    <div className="relative">
                      <Video className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <input
                        type="number"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                        value={formData.maxVideoLengthMin || ""}
                        onChange={(e) => setFormData({ ...formData, maxVideoLengthMin: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Features List */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Included Features</label>
                  <div className="flex gap-2">
                    <input
                      placeholder="Add feature..."
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                      value={newFeature}
                      onChange={(e) => setNewFeature(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())}
                    />
                    <Button type="button" onClick={addFeature} className="rounded-xl aspect-square p-0 w-12 h-12">
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    {(formData.features || []).map((feature, i) => (
                      <div key={i} className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3 group">
                        <GripVertical className="h-4 w-4 text-zinc-700" />
                        <span className="flex-1 text-xs font-medium text-zinc-300">{feature}</span>
                        <button 
                          type="button" 
                          onClick={() => removeFeature(i)}
                          className="text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {(formData.features || []).length === 0 && (
                      <div className="text-center py-8 text-zinc-600 italic text-xs border border-dashed border-zinc-800 rounded-2xl">
                        No features added yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-8 bg-zinc-900/50 border-t border-zinc-800">
            <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
               <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={cn(
                    "h-6 w-11 rounded-full transition-colors relative",
                    formData.isActive ? "bg-primary" : "bg-zinc-700"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform",
                    formData.isActive ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Status</span>
              </div>

              <div className="flex gap-4">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setOpen(false)}
                  className="rounded-xl font-bold text-zinc-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isPending}
                  className="rounded-xl font-bold px-8 shadow-xl shadow-primary/20 h-12 min-w-[140px]"
                >
                  {isPending ? (
                    <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin mr-2" />
                  ) : <Check className="h-4 w-4 mr-2" />}
                  {isNew ? "Create Gig" : "Save Changes"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
