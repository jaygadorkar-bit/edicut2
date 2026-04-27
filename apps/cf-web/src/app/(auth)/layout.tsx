import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col lg:grid lg:grid-cols-2 overflow-hidden bg-background">
      {/* Left Side: Cinematic Theatre (Testimonial Side) */}
      <div className="relative h-[40vh] lg:h-full w-full overflow-hidden border-b lg:border-b-0 lg:border-r border-white/5">
        <Image
          src="/auth-theatre-bg.png"
          alt="Production Environment"
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="absolute inset-0 h-full w-full object-cover grayscale opacity-60 transition-transform duration-[10s] hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent lg:bg-gradient-to-r" />
        <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" />
        
        {/* Testimonial Content */}
        <div className="absolute inset-0 flex flex-col justify-end lg:justify-center p-10 lg:p-20 space-y-6">
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Auteur Statement</span>
            <blockquote className="max-w-xl">
              <p className="text-3xl lg:text-5xl font-black italic tracking-tighter text-white leading-[1.1]">
                &ldquo;THE ULTIMATE TOOL FOR THE MODERN <span className="text-primary not-italic">CINEMATOGRAPHER</span>.&rdquo;
              </p>
              <footer className="mt-4 text-xs font-bold uppercase tracking-widest text-zinc-500">
                — PRODUCTION NOTE // REFERENCE v1.0
              </footer>
            </blockquote>
          </div>
        </div>

        {/* Brand/Logo overlay */}
        <div className="absolute top-8 left-10 z-20">
          <Link href="/" className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">
            <div className="h-6 w-6 bg-primary rounded-full shadow-[0_0_15px_rgba(34,211,238,0.6)]" />
            EDICUT
          </Link>
        </div>
      </div>

      {/* Right Side: Identity Portal (Form Side) */}
      <div className="relative flex flex-col items-center justify-center p-8 lg:p-20 h-full overflow-y-auto">
        <div className="bg-technical-grid absolute inset-0 opacity-10 pointer-events-none" />
        
        {/* Vertical 'Timeline' indicator */}
        <div className="absolute left-8 lg:left-12 h-screen w-px bg-gradient-to-b from-transparent via-zinc-800 to-transparent pointer-events-none" />
        
        <div className="relative z-10 w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
