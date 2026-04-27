import { auth } from "@edicut/platform-core/auth-edge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Clock3, FileVideo, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardProjects } from "@/lib/api/read";

const BOARD_COLUMNS = [
  {
    title: "Setup & Ingestion",
    statuses: ["pending_payment", "payment_review"],
  },
  {
    title: "In Production",
    statuses: ["in_queue", "in_progress", "revision_requested"],
  },
  {
    title: "Review & Delivery",
    statuses: ["in_review", "completed", "cancelled"],
  },
] as const;

function formatRelativeTime(date: string | null | undefined) {
  if (!date) {
    return "No updates yet";
  }

  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

function formatProjectStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusBadgeClass(status: string) {
  if (status === "completed") {
    return "bg-green-500/10 text-green-400 border-green-500/20";
  }

  if (status === "in_review") {
    return "bg-primary/10 text-primary border-primary/20";
  }

  if (status === "cancelled") {
    return "bg-red-500/10 text-red-400 border-red-500/20";
  }

  if (status === "revision_requested") {
    return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  }

  return "bg-background text-muted-foreground border-border/50";
}

export default async function ProjectsKanban() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const projectRows = await getDashboardProjects();

  const columns = BOARD_COLUMNS.map((column) => ({
    ...column,
    cases: projectRows.filter((project) =>
      (column.statuses as readonly string[]).includes(project.status)
    ),
  }));

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] max-w-[1600px] flex-col px-6 py-12">
      <div className="mb-8 flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Production Board
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Track every project in your pipeline with live status data.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-border/40 bg-card px-4 py-3">
            <span className="text-sm font-bold text-muted-foreground">
              {projectRows.length} total project{projectRows.length === 1 ? "" : "s"}
            </span>
          </div>
          <Button
            className="rounded-xl px-6 font-bold shadow-[0_0_20px_-5px_rgba(34,211,238,0.4)]"
            asChild
          >
            <Link href="/dashboard/new">
              <Plus className="mr-2 h-4 w-4" />
              New
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-x-auto pb-6 scrollbar-hide">
        {columns.map((column) => (
          <div
            key={column.title}
            className="flex w-[400px] shrink-0 flex-col rounded-3xl border border-border/20 bg-card/20 p-4"
          >
            <div className="mb-6 flex items-center justify-between px-2">
              <h2 className="text-lg font-bold uppercase tracking-widest text-white">
                {column.title}
              </h2>
              <span className="rounded-full border border-border/50 bg-card px-3 py-1 text-xs font-bold text-muted-foreground">
                {column.cases.length}
              </span>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-hide">
              {column.cases.length > 0 ? (
                column.cases.map((project) => (
                  <div
                    key={project.id}
                    className="group rounded-2xl border border-border/40 bg-card p-6 shadow-lg shadow-black/20 transition-colors hover:border-primary/50"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <span
                        className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${getStatusBadgeClass(project.status)}`}
                      >
                        {formatProjectStatus(project.status)}
                      </span>
                      <FileVideo className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-white">
                      {project.title}
                    </h3>
                    <p className="mb-6 text-sm font-medium text-muted-foreground">
                      {project.id.slice(0, 8).toUpperCase()} • Created{" "}
                      {formatRelativeTime(project.createdAt)}
                    </p>

                    <div className="flex items-center justify-between border-t border-border/20 pt-4">
                      <div className="text-xs font-bold text-muted-foreground">
                        Last updated
                      </div>
                      <div className="flex items-center text-xs font-bold text-muted-foreground">
                        <Clock3 className="mr-1.5 h-4 w-4" />
                        {formatRelativeTime(project.updatedAt)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/30 bg-background/70 p-6">
                  <h3 className="text-base font-bold text-white">
                    No projects here
                  </h3>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">
                    Projects in this stage will appear automatically when their
                    status changes.
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

