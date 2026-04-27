"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, ShieldCheck, Settings2, Video, User, Megaphone } from "lucide-react";
import { createUser } from "@/lib/api/admin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

type AppRole = "customer" | "affiliate" | "editor" | "project_manager" | "admin";
type NewUserFormData = {
  name: string;
  email: string;
  role: AppRole;
};

const roles = [
  { id: "customer", label: "Customer", icon: User, description: "Standard client access." },
  { id: "affiliate", label: "Affiliate", icon: Megaphone, description: "Partner access for referrals and promotions." },
  { id: "editor", label: "Editor", icon: Video, description: "Video editing and delivery." },
  { id: "project_manager", label: "Manager", icon: Settings2, description: "Assignment and oversight." },
  { id: "admin", label: "Administrator", icon: ShieldCheck, description: "Full system control." },
] as const satisfies ReadonlyArray<{
  id: AppRole;
  label: string;
  icon: typeof User;
  description: string;
}>;

export function AddUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [formData, setFormData] = useState<NewUserFormData>({
    name: "",
    email: "",
    role: "customer",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    
    const result = await createUser(formData);
    setIsPending(false);

    if (result.success) {
      toast.success("User created successfully.");
      setOpen(false);
      setFormData({ name: "", email: "", role: "customer" });
      router.refresh();
    } else {
      toast.error(result.error || "Failed to create user.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
          <UserPlus className="mr-2 h-4 w-4" /> Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-[500px] p-0 overflow-hidden rounded-3xl">
        <form onSubmit={handleSubmit}>
          <div className="p-8 pb-0">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight text-white">Create New User</DialogTitle>
              <DialogDescription className="text-zinc-500 font-medium">
                Add a new team member or client to the platform.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-6 py-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Full Name</label>
                <input
                  required
                  placeholder="John Doe"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Email Address</label>
                <input
                  required
                  type="email"
                  placeholder="john@example.com"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">System Role</label>
                <div className="grid grid-cols-2 gap-3">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, role: role.id })}
                      className={cn(
                        "flex flex-col items-start p-4 rounded-2xl border text-left transition-all duration-200",
                        formData.role === role.id 
                          ? "bg-primary/10 border-primary text-primary shadow-[0_0_20px_-10px_rgba(34,211,238,0.5)]" 
                          : "bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:bg-zinc-900"
                      )}
                    >
                      <role.icon className={cn("h-5 w-5 mb-2", formData.role === role.id ? "text-primary" : "text-zinc-600")} />
                      <span className="font-bold text-sm block">{role.label}</span>
                      <span className="text-[10px] font-medium opacity-60 leading-tight mt-1">{role.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-8 bg-zinc-900/50 border-t border-zinc-800">
            <DialogFooter>
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setOpen(false)}
                className="rounded-xl font-bold text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending}
                className="rounded-xl font-bold px-8 shadow-xl shadow-primary/20 h-11"
              >
                {isPending ? (
                  <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin mr-2" />
                ) : null}
                Create User Profile
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
