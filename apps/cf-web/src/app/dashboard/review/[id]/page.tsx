export const runtime = "edge";

import { Button } from "@/components/ui/button";
import { Play, Volume2, Maximize, MessageSquare, CheckCircle2, Circle, Clock } from "lucide-react";
import Image from "next/image";

export default function ReviewInterface() {
  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden">
      {/* ─── Main Player Area ───────────────────────────── */}
      <div className="flex-1 flex flex-col bg-background/50 border-r border-border/20">
        
        {/* Top Bar */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-border/20">
          <div>
            <h2 className="font-bold text-white tracking-tight">Neon Nights Trailer - Cut V2.mp4</h2>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Pending Review</p>
          </div>
          <div className="flex gap-3">
             <Button variant="outline" className="border-border/40 text-white rounded-xl h-9">Download H264</Button>
             <Button className="rounded-xl h-9 shadow-[0_0_20px_-5px_rgba(34,211,238,0.4)]"><CheckCircle2 className="mr-2 h-4 w-4"/> Approve Cut</Button>
          </div>
        </div>

        {/* Video Player Centered */}
        <div className="flex-1 flex items-center justify-center p-8 relative">
           <div className="w-full max-w-5xl aspect-video bg-card rounded-2xl overflow-hidden relative shadow-2xl border border-border/20">
              <Image src="https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80" alt="Video Frame" fill sizes="(min-width: 1280px) 80vw, 100vw" className="w-full h-full object-cover opacity-90" />
              
              {/* Fake Marker */}
               <div className="absolute top-[40%] left-[60%] -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center cursor-pointer shadow-[0_0_20px_-5px_rgba(34,211,238,1)]">
                 <span className="text-white text-xs font-bold shadow-lg">1</span>
               </div>

              {/* Player Controls */}
              <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 to-transparent pt-16 pb-4 px-6 flex flex-col gap-4">
                 {/* Scrubber */}
                 <div className="w-full h-2 rounded-full bg-border/40 overflow-hidden relative cursor-pointer group">
                   <div className="bg-primary h-full w-[35%] relative">
                   </div>
                   {/* Comment tick */}
                   <div className="absolute top-0 left-[35%] w-1.5 h-full bg-white z-10 rounded-full"></div>
                 </div>
                 
                 {/* Controls */}
                 <div className="flex justify-between items-center text-white">
                   <div className="flex items-center gap-6">
                      <button className="hover:text-primary transition-colors"><Play className="h-6 w-6 fill-current"/></button>
                      <div className="text-sm font-medium tracking-widest">01:24 <span className="text-muted-foreground">/ 03:45</span></div>
                   </div>
                   <div className="flex items-center gap-6">
                      <button className="hover:text-primary transition-colors"><Volume2 className="h-5 w-5"/></button>
                      <button className="hover:text-primary transition-colors"><Maximize className="h-5 w-5"/></button>
                   </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* ─── Comments Sidebar ───────────────────────────── */}
      <div className="w-[400px] bg-card/30 flex flex-col">
        <div className="p-6 border-b border-border/20 flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center"><MessageSquare className="mr-2 h-5 w-5 text-primary"/> Frame Feedback</h3>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest bg-background border border-border/50 px-2 py-1 rounded">3 Open</span>
        </div>

        {/* Input Box */}
        <div className="p-6 border-b border-border/20 bg-card/20">
           <div className="relative">
              <textarea placeholder="Click video to leave a frame-specific comment..." className="w-full bg-background border border-border/40 rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[100px]"></textarea>
              <div className="absolute bottom-3 left-4 text-xs font-bold text-primary flex items-center bg-primary/10 px-2 py-1 rounded">
                 <Clock className="h-3 w-3 mr-1"/> 01:24
              </div>
              <Button size="sm" className="absolute bottom-3 right-3 rounded-lg h-7 font-bold">Post</Button>
           </div>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
           {[
             { time: "01:24", text: "Push in tighter on the product shot here.", author: "Client", resolved: false, num: 1 },
             { time: "02:10", text: "The crossfade is a bit too slow, make it a hard cut to the beat.", author: "Client", resolved: false, num: 2 },
             { time: "00:15", text: "Added the LUT you requested, let me know if it's too warm.", author: "Editor", resolved: true, num: null },
           ].map((comment, i) => (
             <div key={i} className={`p-4 rounded-2xl border ${comment.resolved ? 'bg-background border-border/20 opacity-60' : 'bg-card border-border/40 shadow-xl shadow-black/10'}`}>
                <div className="flex justify-between items-start mb-3">
                   <div className="flex items-center gap-2">
                     {comment.num && (
                       <span className="h-5 w-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-[10px] font-bold text-primary">{comment.num}</span>
                     )}
                     <span className="text-xs font-bold text-white bg-background border border-border/40 px-2 py-0.5 rounded">{comment.time}</span>
                     <span className="text-xs font-bold text-muted-foreground ml-2">{comment.author}</span>
                   </div>
                   {!comment.resolved ? (
                     <button className="text-muted-foreground hover:text-green-400 transition-colors"><Circle className="h-4 w-4"/></button>
                   ) : (
                     <CheckCircle2 className="h-4 w-4 text-green-500"/>
                   )}
                </div>
                <p className={`text-sm ${comment.resolved ? 'text-muted-foreground' : 'text-white'}`}>{comment.text}</p>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
