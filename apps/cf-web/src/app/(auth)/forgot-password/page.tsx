export const runtime = "edge";

import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-white/5 bg-zinc-950/50 p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Cinematic highlights */}
        <div className="absolute top-0 left-1/4 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="absolute bottom-0 right-1/4 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        
        <div className="space-y-4">
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">
            RECOVER <span className="text-primary not-italic">ACCESS</span>
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 max-w-[280px]">
            Lost synchronization? Re-establish your identity node via secure uplink.
          </p>
        </div>

        <ForgotPasswordForm />
      </div>
    </div>
  );
}
