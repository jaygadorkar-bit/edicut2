import { Button } from "@/components/ui/button";
import { Search, Filter, MoreHorizontal } from "lucide-react";
import { getAdminProjects } from "@/lib/api/read";

export default async function MasterProjectBoard() {
  const allProjects = await getAdminProjects();

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-10">
      {/* ─── Header & Filters ───────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Master Request Board</h1>
          <p className="mt-1 text-sm text-muted-foreground font-medium">Global view of all client ingestions and editor assignments.</p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search ID or Client..." className="w-full bg-card border border-border/40 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-destructive" />
          </div>
          <Button variant="outline" className="border-border/40 bg-card rounded-xl text-white">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
        </div>
      </div>

      {/* ─── Data Table ─────────────────────────────────── */}
      <div className="bg-card border border-border/20 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-background/50">
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Project ID</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Client</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Tier</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {allProjects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground font-medium italic">
                    No projects found in the database.
                  </td>
                </tr>
              ) : (
                allProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-background/20 transition-colors">
                    <td className="px-6 py-5 font-bold text-white text-sm whitespace-nowrap">
                      {project.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <p className="font-bold text-white text-sm">{project.clientName || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{project.clientEmail}</p>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${project.packageTier === 'pro' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-background text-muted-foreground border-border/50'}`}>
                        {project.packageTier || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${
                          project.status === 'pending_payment' ? 'bg-yellow-500' : 
                          project.status === 'in_progress' ? 'bg-primary animate-pulse' : 
                          project.status === 'completed' ? 'bg-green-500' : 'bg-zinc-600'
                        }`}></span>
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-tighter">
                          {project.status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 font-medium text-white text-sm whitespace-nowrap">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-5 text-right whitespace-nowrap">
                      <button className="text-muted-foreground hover:text-white p-2">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

