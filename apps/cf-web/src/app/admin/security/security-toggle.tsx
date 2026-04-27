"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState, useTransition } from "react";
import { updateSecuritySetting } from "@/lib/api/admin";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface SecurityToggleProps {
  settingKey: string;
  defaultEnabled: boolean;
  label: string;
  onLabel?: string;
  offLabel?: string;
}

export function SecurityToggle({ 
  settingKey, 
  defaultEnabled, 
  label,
  onLabel = "Active",
  offLabel = "Bypassed"
}: SecurityToggleProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    startTransition(async () => {
      const result = await updateSecuritySetting(settingKey, checked);
      if (!result.success) {
        setEnabled(!checked); // revert on failure
        toast.error(result.error || `Failed to update ${label}.`);
      } else {
        toast.success(`${label} ${checked ? "enabled" : "disabled"}.`);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-3 bg-background/40 p-5 rounded-2xl border border-border/40 backdrop-blur-sm min-w-[120px] transition-all hover:border-primary/20">
      <div className="relative">
        <Switch
          id={`toggle-${settingKey}`}
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isPending}
          className="data-[state=checked]:bg-primary"
        />
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-3 w-3 text-primary animate-spin" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <Label htmlFor={`toggle-${settingKey}`} className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
          {label}
        </Label>
        <span className={`text-[8px] font-bold uppercase tracking-widest ${isPending ? 'text-zinc-600' : enabled ? 'text-primary' : 'text-zinc-600'}`}>
          {isPending ? "Updating..." : enabled ? onLabel : offLabel}
        </span>
      </div>
    </div>
  );
}
