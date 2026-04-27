"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api/auth";
import { toast } from "sonner";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await requestPasswordReset({ email });
      
      if (result.success) {
        setIsSubmitted(true);
        toast.success(result.message || "Reset link sent!");
      } else {
        toast.error(result.error || "Failed to request reset.");
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-4 border border-primary/20 shadow-[0_0_30px_-5px_rgba(34,211,238,0.3)]">
            <Mail className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-white uppercase italic">LINK TRANSMITTED</h2>
          <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 leading-relaxed">
            If an account exists for <span className="text-white">{email}</span>, 
            a secure reset uplink has been dispatched. Check your terminal.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          className="w-full h-12 bg-zinc-950/20 border-white/5 hover:bg-zinc-900 hover:border-primary/30 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
        >
          <Link href="/login">RETURN TO CONSOLE</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-2">
        <Label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-1">Target Email</Label>
        <Input
          type="email"
          placeholder="AUTEUR@STUDIO.COM"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-12 bg-zinc-950 border-zinc-800 focus-visible:ring-primary/20 focus-visible:border-primary/50 text-xs font-mono rounded-xl transition-all text-white placeholder:text-zinc-500 shadow-sm"
        />
      </div>

      <div className="space-y-4 pt-2">
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
                TRANSMITTING...
              </>
            ) : (
              <>REQUEST UPLINK</>
            )}
          </span>
        </Button>

        <Button
          asChild
          variant="ghost"
          className="w-full h-10 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
        >
          <Link href="/login" className="flex items-center gap-2">
            <ArrowLeft className="h-3 w-3" />
            BACK TO LOGIN
          </Link>
        </Button>
      </div>
    </form>
  );
}
