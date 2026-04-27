"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { resetPassword } from "@/lib/api/auth";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword({ token, password });
      
      if (result.success) {
        setIsSuccess(true);
        toast.success(result.message || "Password reset successful!");
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      } else {
        toast.error(result.error || "Failed to reset password.");
      }
    } catch (error) {
      console.error("Reset password error:", error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-4 border border-primary/20 shadow-[0_0_30px_-5px_rgba(34,211,238,0.3)]">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-white uppercase italic">ACCESS RESTORED</h2>
          <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 leading-relaxed">
            New security sequence established. You are being redirected to the 
            authentication console.
          </p>
        </div>
        <div className="pt-4">
          <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-500">
      <div className="space-y-2">
        <Label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-1">New Sequence</Label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 bg-zinc-950 border-zinc-800 focus-visible:ring-primary/20 focus-visible:border-primary/50 text-xs font-mono rounded-xl transition-all text-white placeholder:text-zinc-500 shadow-sm pr-12"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-lg transition-colors"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-1">Confirm Sequence</Label>
        <Input
          type={showPassword ? "text" : "password"}
          placeholder="********"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="h-12 bg-zinc-950 border-zinc-800 focus-visible:ring-primary/20 focus-visible:border-primary/50 text-xs font-mono rounded-xl transition-all text-white placeholder:text-zinc-500 shadow-sm"
        />
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-14 text-sm font-black italic uppercase tracking-[0.25em] transition-all rounded-2xl bg-white text-black hover:bg-zinc-200 shadow-[0_0_50px_-10px_rgba(34,211,238,0.5)] group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
          <span className="relative flex items-center gap-2">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                UPDATING...
              </>
            ) : (
              <>COMMIT CHANGES</>
            )}
          </span>
        </Button>
      </div>

      <p className="text-center text-[8px] font-black uppercase tracking-[0.2em] text-zinc-700 pt-2">
        Authorization Token: {token.substring(0, 8)}...
      </p>
    </form>
  );
}
