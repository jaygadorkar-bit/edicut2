import PageContainer from "@/components/layout/page-container";
import { getAdminPortfolio } from "@/lib/api/read";
import { EditPortfolioItemDialog } from "./edit-item-dialog";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Video, User, Star, Sparkles } from "lucide-react";
import Image from "next/image";
import type { AdminPortfolioRecord } from "@edicut/platform-core/lib/admin-queries";

export default async function PortfolioManagementPage() {
  const allItems = await getAdminPortfolio();

  return (
    <PageContainer
      pageTitle="Portfolio Management"
      pageDescription="Curate your public showcase of cinematic masterpieces."
    >
      <div className="flex flex-col gap-8">
        <div className="flex justify-end">
          <EditPortfolioItemDialog isNew={true} />
        </div>

        {/* ─── Portfolio Grid ────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {allItems.map((item) => (
            <div key={item.id} className="group relative bg-card border border-border/20 rounded-[2.5rem] overflow-hidden transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/5">
              
              {/* Thumbnail Preview */}
              <div className="relative aspect-video overflow-hidden">
                {item.thumbnailUrl ? (
                  <Image 
                    src={item.thumbnailUrl} 
                    alt={item.title} 
                    fill 
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                    <Video className="h-12 w-12 text-zinc-800" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                   <div className="h-16 w-16 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center border border-primary/30">
                      <PlayCircle className="h-8 w-8 text-white" />
                   </div>
                </div>
                
                {item.isFeatured && (
                  <div className="absolute top-4 left-4">
                    <Badge className="bg-primary text-primary-foreground font-black px-3 py-1 rounded-full text-[10px] uppercase tracking-widest flex items-center gap-1.5 shadow-xl shadow-primary/20">
                      <Star className="h-3 w-3 fill-current" /> Featured
                    </Badge>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-8">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest border-zinc-800 text-zinc-500 mb-2">
                      {item.category || "General"}
                    </Badge>
                    <h3 className="text-xl font-black text-white tracking-tight">{item.title}</h3>
                  </div>
                  <EditPortfolioItemDialog item={item as AdminPortfolioRecord} />
                </div>

                <div className="space-y-3 mt-6">
                  <div className="flex items-center gap-3 text-xs font-medium text-zinc-500">
                    <User className="h-4 w-4 text-zinc-700" />
                    <span className="text-zinc-400">Client:</span> {item.clientName || "Direct Production"}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium text-zinc-500">
                    <Video className="h-4 w-4 text-zinc-700" />
                    <span className="truncate max-w-[200px]">{item.videoUrl}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {allItems.length === 0 && (
            <div className="col-span-full py-32 text-center border-2 border-dashed border-zinc-800 rounded-[3rem]">
               <Sparkles className="h-12 w-12 text-zinc-800 mx-auto mb-4" />
               <h3 className="text-xl font-bold text-zinc-500">Your portfolio is currently empty</h3>
               <p className="text-zinc-600 text-sm mt-2 max-w-sm mx-auto">Start showcasing your masterpieces to build trust with new clients.</p>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

