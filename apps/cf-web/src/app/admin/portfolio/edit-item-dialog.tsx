"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  PlusCircle, 
  Video, 
  ImageIcon, 
  Tag, 
  User, 
  Check, 
  Loader2,
  Trash2,
  Sparkles,
  Edit
} from "lucide-react";
import { createPortfolioItem, updatePortfolioItem, deletePortfolioItem } from "@/lib/api/admin";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  category: string | null;
  clientName: string | null;
  isFeatured: boolean;
}

type PortfolioFormData = Omit<PortfolioItem, "id">;

export function EditPortfolioItemDialog({ 
  item, 
  isNew = false 
}: { 
  item?: PortfolioItem, 
  isNew?: boolean 
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState<PortfolioFormData>({
    title: item?.title || "",
    description: item?.description || "",
    videoUrl: item?.videoUrl || "",
    thumbnailUrl: item?.thumbnailUrl || "",
    category: item?.category || "Commercial",
    clientName: item?.clientName || "",
    isFeatured: item?.isFeatured ?? false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    
    const action = isNew ? createPortfolioItem(formData) : updatePortfolioItem(item!.id, formData);
    const result = await action;
    
    setIsPending(false);

    if (result.success) {
      toast.success(isNew ? "Masterpiece added." : "Item updated.");
      setOpen(false);
      router.refresh();
      if (isNew) setFormData({ title: "", description: "", videoUrl: "", thumbnailUrl: "", category: "Commercial", clientName: "", isFeatured: false });
    } else {
      toast.error(result.error);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to remove this piece from your portfolio?")) return;
    setIsDeleting(true);
    const result = await deletePortfolioItem(item!.id);
    setIsDeleting(false);
    if (result.success) {
      toast.success("Item removed.");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isNew ? (
          <Button className="rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
            <PlusCircle className="mr-2 h-4 w-4" /> Add to Portfolio
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-xl">
            <Edit className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-[600px] p-0 overflow-hidden rounded-3xl">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-8 pb-8">
            <DialogHeader className="mb-8">
              <DialogTitle className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
                {isNew ? <><Sparkles className="h-6 w-6 text-primary" /> Feature New Work</> : `Editing Piece`}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 font-medium">
                Showcase your best cinematic productions to potential clients.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-6 py-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Project Title</label>
                <input
                  required
                  placeholder="e.g. Neon Nights - Short Film"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Category</label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <select
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors appearance-none"
                      value={formData.category || ""}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    >
                      <option value="Short Film">Short Film</option>
                      <option value="Commercial">Commercial</option>
                      <option value="YouTube">YouTube</option>
                      <option value="Music Video">Music Video</option>
                      <option value="Documentary">Documentary</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Client Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      placeholder="e.g. Nike, Red Bull"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                      value={formData.clientName || ""}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Video URL (Vimeo/YouTube/Direct)</label>
                <div className="relative">
                  <Video className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    required
                    placeholder="https://vimeo.com/..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Thumbnail URL</label>
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    placeholder="https://images.unsplash.com/..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors"
                    value={formData.thumbnailUrl || ""}
                    onChange={(e) => setFormData({ ...formData, thumbnailUrl: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isFeatured: !formData.isFeatured })}
                  className={cn(
                    "h-6 w-11 rounded-full transition-colors relative",
                    formData.isFeatured ? "bg-primary" : "bg-zinc-700"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform",
                    formData.isFeatured ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Feature on Home Page</span>
                  <span className="text-[10px] text-zinc-500 font-medium">This will show up in the Hero showcase section.</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-8 bg-zinc-900/50 border-t border-zinc-800 flex items-center justify-between">
            {!isNew ? (
              <Button 
                type="button" 
                variant="ghost" 
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-xl font-bold text-zinc-600 hover:text-red-500 hover:bg-red-500/10"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            ) : <div />}

            <div className="flex gap-4">
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
                className="rounded-xl font-bold px-8 shadow-xl shadow-primary/20 h-12 min-w-[140px]"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : <Check className="h-4 w-4 mr-2" />}
                {isNew ? "Publish Work" : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
