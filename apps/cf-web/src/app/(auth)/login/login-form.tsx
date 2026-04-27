"use client";

import { Tabs, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { Checkbox } from "@radix-ui/react-checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { signIn } from "next-auth/react";
import {
  requestSignupOtp,
  verifyCaptcha,
  verifySignupOtp,
  signUpWithCredentials,
} from "@/lib/api/auth";
import { Loader2, Facebook, Eye, EyeOff, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, useRef } from "react";
import { GoogleReCAPTCHA } from "@/components/auth/recaptcha";
import ReCAPTCHA from "react-google-recaptcha";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type LoginMode = "signin" | "signup";

function isLoginMode(value: string): value is LoginMode {
  return value === "signin" || value === "signup";
}

export function LoginForm({
  recaptchaEnabled = true,
  signupOtpEnabled = true,
}: {
  recaptchaEnabled?: boolean;
  signupOtpEnabled?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("signin");
  const [isValidating, setIsValidating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);

  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const isOtpStep = mode === "signup" && signupOtpEnabled && otpRequested;

  const resetSignupState = () => {
    setOtp("");
    setOtpRequested(false);
  };

  const handleModeChange = (value: string) => {
    if (!isLoginMode(value)) {
      return;
    }

    setMode(value);
    resetSignupState();
  };

  const runCaptchaCheck = async () => {
    const token = recaptchaEnabled ? await recaptchaRef.current?.executeAsync() : "bypass";

    if (recaptchaEnabled && !token) {
      return { success: false as const, error: "Security verification failed." };
    }

    return verifyCaptcha(token ?? null);
  };

  const buildAuthPayload = () => {
    return {
      email,
      password,
      name: mode === "signup" ? name : "",
    };
  };

  const handleGoogleLogin = async () => {
    setIsValidating(true);

    try {
      const verification = await runCaptchaCheck();
      if (!verification.success) {
        toast.error(verification.error || "Security verification failed.");
        return;
      }

      const isMock = process.env.NEXT_PUBLIC_AUTH_MOCK === "true";
      if (isMock) {
        await signIn("credentials", { email: "test@example.com", callbackUrl: "/dashboard" });
      } else {
        await signIn("google", { callbackUrl: "/dashboard" });
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("An error occurred during login.");
    } finally {
      setIsValidating(false);
      recaptchaRef.current?.reset();
    }
  };

  const handleResendOtp = async () => {
    setIsValidating(true);

    try {
      const verification = await runCaptchaCheck();
      if (!verification.success) {
        toast.error(verification.error || "Security verification failed.");
        return;
      }

      const result = await requestSignupOtp(buildAuthPayload());
      if (result.success) {
        setOtp("");
        setOtpRequested(true);
        toast.success(result.message || "A new OTP has been sent.");
      } else {
        toast.error(result.error || "Failed to resend OTP.");
      }
    } catch (error) {
      console.error("OTP resend error:", error);
      toast.error("An error occurred while resending OTP.");
    } finally {
      setIsValidating(false);
      recaptchaRef.current?.reset();
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);

    try {
      const verification = await runCaptchaCheck();
      if (!verification.success) {
        toast.error(verification.error || "Security verification failed.");
        return;
      }

      if (isOtpStep) {
        const result = await verifySignupOtp({
          email,
          password,
          otp,
        });

        if (result.success) {
          toast.success("Account created successfully!");
          // After verification, we also need to sign in
          await signIn("credentials", {
            email,
            password,
            callbackUrl: "/dashboard",
          });
        } else {
          toast.error(result.error || "OTP verification failed.");
        }

        return;
      }

      if (mode === "signup" && signupOtpEnabled) {
        const result = await requestSignupOtp(buildAuthPayload());
        if (result.success) {
          setOtpRequested(true);
          toast.success(result.message || "Verification code sent.");
        } else {
          toast.error(result.error || "Failed to send OTP.");
        }
        return;
      }

      if (mode === "signup") {
        const result = await signUpWithCredentials(buildAuthPayload());
        if (result.success) {
          toast.success("Account created successfully!");
          await signIn("credentials", {
            email,
            password,
            callbackUrl: "/dashboard",
          });
        } else {
          toast.error(result.error || "Authentication failed.");
        }
      } else {
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          toast.error(result.error === "CredentialsSignin" ? "Invalid email or password." : result.error);
        } else {
          toast.success("Logged in successfully!");
          router.push("/dashboard");
        }
      }
    } catch (error) {
      console.error("Submit error:", error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsValidating(false);
      recaptchaRef.current?.reset();
    }
  };

  return (
    <div className="space-y-10">
      <Tabs value={mode} onValueChange={handleModeChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 p-1 bg-zinc-900/50 backdrop-blur-sm rounded-xl border border-white/5">
          <TabsTrigger
            value="signin"
            className="text-[10px] font-black uppercase tracking-widest py-3 rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-primary transition-all cursor-pointer"
          >
            Login
          </TabsTrigger>
          <TabsTrigger
            value="signup"
            className="text-[10px] font-black uppercase tracking-widest py-3 rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-primary transition-all cursor-pointer"
          >
            Signup
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-white uppercase italic">
              {mode === "signin" ? (
                <>
                  ACCESS THE <span className="text-primary not-italic">FORGE</span>
                </>
              ) : (
                <>
                  ESTABLISH <span className="text-primary not-italic">IDENTITY</span>
                </>
              )}
            </h1>
          </div>
          {isOtpStep && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-primary">
              Verification code sent to {email}. Enter the 6-digit OTP to finish signup.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Button
              type="button"
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full h-12 bg-zinc-950/20 border-white/5 hover:bg-zinc-900 hover:border-primary/30 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all group relative overflow-hidden"
              disabled={isValidating}
            >
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors" />
              <span className="relative flex items-center gap-2">
                {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
                Google
              </span>
            </Button>
            <SocialButton icon={<Facebook className="h-4 w-4 text-[#1877F2] fill-[#1877F2]" />} label="Facebook" />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-900" />
            </div>
            <div className="relative flex justify-center text-[9px] font-bold uppercase tracking-widest">
              <span className="bg-background px-4 text-zinc-700">Digital Handshake</span>
            </div>
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-5">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-1">Full Name</Label>
                <Input
                  placeholder="EX: CHRISTOPHER NOLAN"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={mode === "signup"}
                  disabled={isOtpStep}
                  className="h-12 bg-zinc-950 border-zinc-800 focus-visible:ring-primary/20 focus-visible:border-primary/50 text-xs font-mono rounded-xl transition-all text-white placeholder:text-zinc-500 shadow-sm"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-1">Email Address</Label>
              <Input
                type="email"
                placeholder="AUTEUR@STUDIO.COM"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isOtpStep}
                className="h-12 bg-zinc-950 border-zinc-800 focus-visible:ring-primary/20 focus-visible:border-primary/50 text-xs font-mono rounded-xl transition-all text-white placeholder:text-zinc-500 shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center pr-1">
                <Label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 pl-1">Password</Label>
                {mode === "signin" && (
                  <Link href="/forgot-password" title="Recover Access" className="text-[9px] font-bold text-zinc-600 hover:text-primary transition-colors">
                    Forgot Password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isOtpStep}
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
                  <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                </Button>
              </div>
            </div>

            {isOtpStep && (
              <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                  <MailCheck className="h-4 w-4 text-primary" />
                  Email Verification
                </div>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp} containerClassName="justify-center">
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="h-12 w-10 rounded-l-xl border-zinc-800 bg-black text-white" />
                      <InputOTPSlot index={1} className="h-12 w-10 border-zinc-800 bg-black text-white" />
                      <InputOTPSlot index={2} className="h-12 w-10 border-zinc-800 bg-black text-white" />
                      <InputOTPSlot index={3} className="h-12 w-10 border-zinc-800 bg-black text-white" />
                      <InputOTPSlot index={4} className="h-12 w-10 border-zinc-800 bg-black text-white" />
                      <InputOTPSlot index={5} className="h-12 w-10 rounded-r-xl border-zinc-800 bg-black text-white" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <div className="flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.15em]">
                  <button
                    type="button"
                    onClick={() => {
                      setOtp("");
                      setOtpRequested(false);
                    }}
                    className="text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Edit details
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isValidating}
                    className="text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2 pl-1">
              <Checkbox id="stay-synced" className="border-zinc-800 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
              <Label htmlFor="stay-synced" className="text-[10px] font-bold text-zinc-600 cursor-pointer uppercase tracking-widest transition-colors hover:text-zinc-500">
                Stay Synchronized across nodes
              </Label>
            </div>

            {recaptchaEnabled && <GoogleReCAPTCHA ref={recaptchaRef} onChange={() => {}} />}

            <Button
              variant="default"
              className="w-full h-14 text-sm font-black italic uppercase tracking-[0.25em] transition-all rounded-2xl bg-white text-black hover:bg-zinc-200 shadow-[0_0_50px_-10px_rgba(34,211,238,0.5)] group relative overflow-hidden disabled:opacity-50"
              type="submit"
              disabled={isValidating || (isOtpStep && otp.length !== 6)}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              <span className="relative flex items-center gap-2">
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Synchronizing...
                  </>
                ) : isOtpStep ? (
                  <>Verify OTP</>
                ) : mode === "signup" && signupOtpEnabled ? (
                  <>Send OTP</>
                ) : mode === "signup" ? (
                  <>Create Account</>
                ) : (
                  <>Login</>
                )}
              </span>
            </Button>
          </form>
        </div>

        {recaptchaEnabled && (
          <div className="pt-8 border-t border-zinc-900 flex justify-center">
            <div className="flex items-center gap-8 relative">
              <div className="absolute inset-0 bg-primary/5 blur-xl rounded-full" />
              <div className="relative flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
                <span className="h-[1px] w-8 bg-zinc-800" />
                <span className="text-[8px] font-black uppercase tracking-[0.4em] text-zinc-500 whitespace-nowrap">
                  Site Protected by Google ReCaptcha
                </span>
                <span className="h-[1px] w-8 bg-zinc-800" />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex justify-center items-center gap-4 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-700">
            <Link href="/terms" className="hover:text-primary transition-colors">
              Terms of Engagement
            </Link>
            <span className="h-1 w-1 rounded-full bg-zinc-800" />
            <Link href="/privacy" className="hover:text-primary transition-colors">
              Privacy Node
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Button
      variant="outline"
      className="w-full h-12 bg-zinc-950/20 border-white/5 hover:bg-zinc-900 hover:border-primary/30 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all group relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors" />
      <span className="relative flex items-center gap-2">
        {icon}
        {label}
      </span>
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
