import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Bell, Settings, Clapperboard } from "lucide-react";
import { UserNav } from "@/components/user-nav";
import { auth } from "@edicut/platform-core/auth-edge";

export async function DashboardHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-20 max-w-[1600px] items-center justify-between px-6">
        <div className="flex items-center gap-12">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
              <Clapperboard className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-white">
              Edi<span className="text-primary">Cut</span>
              <span className="text-primary text-[10px] font-bold uppercase tracking-[0.2em] ml-2 bg-primary/10 px-1.5 py-0.5 rounded align-middle">OS</span>
            </span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="/dashboard" className="text-sm font-bold text-white transition-colors">Overview</Link>
            <Link href="/dashboard/projects" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">Projects</Link>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden items-center gap-4 md:flex border-r border-border/40 pr-6">
            <button className="text-muted-foreground hover:text-white transition-colors relative">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-primary rounded-full border-2 border-background"></span>
            </button>
            <button className="text-muted-foreground hover:text-white transition-colors">
              <Settings className="h-5 w-5" />
            </button>
          </div>
          {session?.user && <UserNav user={session.user} />}
          <Button asChild className="rounded-xl font-bold px-6 shadow-[0_0_20px_-5px_rgba(34,211,238,0.4)] md:ml-4">
            <Link href="/dashboard/new"><Plus className="mr-2 h-4 w-4"/> New Project</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

