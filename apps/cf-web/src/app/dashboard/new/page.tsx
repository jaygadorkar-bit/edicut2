export const runtime = "edge";

import { Button } from "@/components/ui/button";
import { Check, UploadCloud, Film, MonitorPlay, ChevronRight } from "lucide-react";

export default function NewProjectWizard() {
  const steps = [
    { num: 1, title: "Project Brief", icon: Film, status: "complete" },
    { num: 2, title: "Upload Footage", icon: UploadCloud, status: "current" },
    { num: 3, title: "Creative Direction", icon: MonitorPlay, status: "upcoming" },
    { num: 4, title: "Review & Checkout", icon: Check, status: "upcoming" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      {/* ─── Header ─────────────────────────────────────── */}
      <h1 className="text-4xl font-black text-white tracking-tight text-center mb-12">Start Production</h1>

      {/* ─── Stepper ────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-16 relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-border/50 -z-10 translate-y-[-50%]"></div>
        <div className="absolute top-1/2 left-0 w-1/3 h-0.5 bg-primary -z-10 translate-y-[-50%]"></div>
        
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <div className={`h-12 w-12 rounded-full flex items-center justify-center border-4 border-[#0A0A0A] ${step.status === 'complete' ? 'bg-primary text-primary-foreground' : step.status === 'current' ? 'bg-card border-primary text-primary' : 'bg-card text-muted-foreground'}`}>
              <step.icon className="h-5 w-5" />
            </div>
            <span className={`text-xs font-bold uppercase tracking-widest ${step.status === 'upcoming' ? 'text-muted-foreground' : 'text-white'}`}>{step.title}</span>
          </div>
        ))}
      </div>

      {/* ─── Step Content: Upload ─────────────────────── */}
      <div className="bg-card border border-border/30 rounded-[2rem] p-10 shadow-2xl shadow-primary/5">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white tracking-tight">Secure Ingestion Server</h2>
          <p className="mt-2 text-muted-foreground font-medium">Upload up to 100GB of raw material directly to our edge network.</p>
        </div>

        <div className="border-2 border-dashed border-primary/30 rounded-3xl p-16 flex flex-col items-center justify-center bg-background/50 hover:bg-primary/5 hover:border-primary transition-colors cursor-pointer group">
          <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <UploadCloud className="h-10 w-10 text-primary" />
          </div>
          <p className="text-lg font-bold text-white mb-2">Drag & Drop Footage</p>
          <p className="text-sm font-medium text-muted-foreground mb-6">or click to browse local files on your machine.</p>
          <div className="flex gap-4">
             <span className="bg-card border border-border/50 text-xs font-bold uppercase tracking-widest text-muted-foreground px-4 py-2 rounded-lg">.MP4</span>
             <span className="bg-card border border-border/50 text-xs font-bold uppercase tracking-widest text-muted-foreground px-4 py-2 rounded-lg">.MOV</span>
             <span className="bg-card border border-border/50 text-xs font-bold uppercase tracking-widest text-muted-foreground px-4 py-2 rounded-lg">.BRAW</span>
          </div>
        </div>

        <div className="mt-10 bg-background rounded-2xl p-6 border border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="h-12 w-12 bg-card rounded-xl flex items-center justify-center border border-border/50">
                  <Film className="h-5 w-5 text-muted-foreground" />
               </div>
               <div>
                 <p className="font-bold text-white text-sm">A_Cam_Roll01.braw</p>
                 <p className="text-xs font-medium text-muted-foreground">Uploading... 42% (2.1GB / 5.0GB)</p>
               </div>
            </div>
            <div className="w-32 bg-card rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-full w-[42%]"></div>
            </div>
        </div>
      </div>

      {/* ─── Wizard Navigation ────────────────────────── */}
      <div className="mt-12 flex justify-between items-center px-4">
        <Button variant="ghost" className="text-muted-foreground hover:text-white font-bold h-12 rounded-xl">Back to Brief</Button>
        <Button className="rounded-xl h-12 px-8 font-bold shadow-[0_0_20px_-5px_rgba(34,211,238,0.4)] transition-transform hover:scale-105">
          Continue to Direction <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
