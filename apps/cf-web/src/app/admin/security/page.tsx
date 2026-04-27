import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Fingerprint,
  KeyRound,
  Zap,
  Activity,
  MailCheck,
} from "lucide-react";
import PageContainer from "@/components/layout/page-container";
import { getSecuritySettings } from "./actions";
import { SecurityToggle } from "./security-toggle";

export default async function SecurityPage() {
  const settings = await getSecuritySettings();

  return (
    <PageContainer
      pageTitle="Security Protocol"
      pageDescription="Configure platform-wide defensive measures and authentication filters."
    >
      <div className="max-w-6xl space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-card border border-border/20 rounded-3xl p-8 relative overflow-hidden group col-span-1 md:col-span-2">
            <div
              className={`absolute top-0 right-0 p-4 opacity-10 transition-transform group-hover:scale-110 ${
                settings.recaptcha_enabled ? "text-primary" : "text-destructive"
              }`}
            >
              <Shield className="h-16 w-16" />
            </div>
            <div className="relative z-10">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block mb-2">
                Defense Status
              </span>
              <div className="flex items-center gap-3">
                {settings.recaptcha_enabled ? (
                  <>
                    <ShieldCheck className="h-6 w-6 text-primary" />
                    <span className="text-xl font-black text-white italic tracking-tight uppercase">
                      Shields Active
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-6 w-6 text-destructive" />
                    <span className="text-xl font-black text-white italic tracking-tight uppercase">
                      Protocol Bypassed
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/20 rounded-3xl p-8 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-3 w-3 text-zinc-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">
                Registry Logs
              </span>
            </div>
            <p className="text-xl font-black text-white italic tracking-tight uppercase">Operational</p>
          </div>

          <div className="bg-card border border-border/20 rounded-3xl p-8 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-3 w-3 text-zinc-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">
                Access Hub
              </span>
            </div>
            <p className="text-xl font-black text-white italic tracking-tight uppercase">Secured</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-card border border-border/20 rounded-[2rem] p-8 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <Fingerprint className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-sm font-black text-white uppercase tracking-widest italic">
                Bot Detection & Entry
              </h2>
            </div>

            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    reCAPTCHA v2 (Invisible)
                  </h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed uppercase opacity-70">
                    Hardware-level verification challenge for all entry points.
                  </p>
                </div>
                <SecurityToggle
                  settingKey="recaptcha_enabled"
                  defaultEnabled={settings.recaptcha_enabled}
                  label="Shield"
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Registration Lock
                  </h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed uppercase opacity-70">
                    Completely disable the creation of new user accounts.
                  </p>
                </div>
                <SecurityToggle
                  settingKey="registration_locked"
                  defaultEnabled={settings.registration_locked}
                  label="Gate"
                  onLabel="Locked"
                  offLabel="Open"
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Email Signup OTP
                  </h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed uppercase opacity-70">
                    Require a one-time verification code sent from Gmail before new accounts are created.
                  </p>
                </div>
                <SecurityToggle
                  settingKey="signup_otp_enabled"
                  defaultEnabled={settings.signup_otp_enabled}
                  label="OTP"
                  onLabel="Required"
                  offLabel="Skipped"
                />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/20 rounded-[2rem] p-8 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-destructive/30 to-transparent" />

            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center border border-destructive/20">
                <Zap className="h-4 w-4 text-destructive" />
              </div>
              <h2 className="text-sm font-black text-white uppercase tracking-widest italic">
                Hostile Intrusion Defense
              </h2>
            </div>

            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Account Lockout
                  </h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed uppercase opacity-70">
                    Lock user nodes after 5 failed authentication attempts.
                  </p>
                </div>
                <SecurityToggle
                  settingKey="account_lockout_enabled"
                  defaultEnabled={settings.account_lockout_enabled}
                  label="Lockout"
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    IP Rate Limiting
                  </h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed uppercase opacity-70">
                    Throttle high-frequency requests from specific IP addresses.
                  </p>
                </div>
                <SecurityToggle
                  settingKey="rate_limiting_enabled"
                  defaultEnabled={settings.rate_limiting_enabled}
                  label="Throttling"
                />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/20 rounded-[2rem] p-8 space-y-8 relative overflow-hidden lg:col-span-2">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-zinc-500/30 to-transparent" />

            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
                <KeyRound className="h-4 w-4 text-zinc-400" />
              </div>
              <h2 className="text-sm font-black text-white uppercase tracking-widest italic">
                Credentials Complexity
              </h2>
            </div>

            <div className="flex items-start justify-between gap-8">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 mb-3">
                  <div className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[8px] font-black text-zinc-400 uppercase tracking-widest">
                    MIN 8 CHARS
                  </div>
                  <div className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[8px] font-black text-zinc-400 uppercase tracking-widest">
                    A-Z
                  </div>
                  <div className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[8px] font-black text-zinc-400 uppercase tracking-widest">
                    0-9
                  </div>
                  <div className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[8px] font-black text-zinc-400 uppercase tracking-widest">
                    @#$
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed uppercase opacity-70 max-w-2xl">
                  Enforce hardware-grade entropy on all new secrets. Existing credentials will remain valid until rotation is requested.
                </p>
              </div>
              <SecurityToggle
                settingKey="strict_password_policy"
                defaultEnabled={settings.strict_password_policy}
                label="Policy"
                onLabel="Strict"
                offLabel="Flexible"
              />
            </div>
          </div>
        </div>

        {(!settings.recaptcha_enabled || settings.registration_locked || !settings.signup_otp_enabled) && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-6 flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-black text-destructive uppercase tracking-widest italic">
                Security Status: Degraded
              </h4>
              <p className="text-xs text-destructive/70 leading-relaxed font-medium">
                One or more primary defense protocols have been manually deactivated. Ensure this state is temporary and intended for maintenance windows only.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-[2rem] border border-border/20 bg-card p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
              <MailCheck className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest italic">Gmail OTP Delivery</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
            Signup OTP emails now use Gmail API credentials from the server environment. Provide
            GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_SENDER_EMAIL, then keep Email Signup OTP enabled to require verification on account creation.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
