import Link from "next/link";
import { ShieldAlert, Bell, Settings, UserCircle } from "lucide-react";

export function AdminHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-destructive/30 bg-background/95 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-[1800px] items-center justify-between px-6">
        <div className="flex items-center gap-12">
          <Link href="/admin" className="text-xl font-black tracking-tight text-white hover:text-destructive transition-colors flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" /> EdiCut <span className="text-destructive text-[10px] font-bold uppercase tracking-widest bg-destructive/10 px-2 py-0.5 rounded">Admin OS</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="/admin" className="text-sm font-bold text-white transition-colors">System Overview</Link>
            <Link href="/admin/projects" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">Master Board</Link>
            <Link href="#" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">Users</Link>
            <Link href="#" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">Finance / MRR</Link>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-muted-foreground">
            <button className="hover:text-white transition-colors relative">
              <Bell className="h-5 w-5" />
            </button>
            <button className="hover:text-white transition-colors">
              <Settings className="h-5 w-5" />
            </button>
            <button className="hover:text-white transition-colors border-l border-border/40 pl-4">
              <span className="sr-only">Profile</span>
              <UserCircle className="h-6 w-6 text-destructive" />
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
