import { auth } from "@edicut/platform-core/auth-edge";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileVideo,
  FolderOpen,
  Plus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardOverview } from "@/lib/api/read";

function formatRelativeTime(date: string | null | undefined) {
  if (!date) {
    return "No recent updates";
  }

  return `${formatDistanceToNow(new Date(date), { addSuffix: true })}`;
}

function formatProjectStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getProjectStatusTone(status: string) {
  if (status === "in_review") {
    return "text-green-400";
  }

  if (status === "revision_requested") {
    return "text-amber-300";
  }

  return "text-white";
}

function formatCurrency(amount: string, currency: string) {
  const value = Number(amount);

  if (Number.isNaN(value)) {
    return `${amount} ${currency}`;
  }

  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function DashboardOverview() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const data = await getDashboardOverview();

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-12">
      <div className="mb-12 flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">
            Overview
          </h1>
          <p className="mt-2 font-medium text-muted-foreground">
            Track your live productions and account activity.
          </p>
        </div>
        <Button
          className="rounded-xl px-6 font-bold shadow-[0_0_20px_-5px_rgba(34,211,238,0.4)]"
          asChild
        >
          <Link href="/dashboard/new">
            <Plus className="mr-2 h-4 w-4" />
            Start Production
          </Link>
        </Button>
      </div>

      <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col justify-between rounded-3xl border border-border/40 bg-card p-8 transition-colors hover:bg-card/80">
          <div className="mb-6 flex justify-between items-start">
            <FolderOpen className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="mb-2 text-4xl font-black text-white">
              {data.activeProjectCount}
            </p>
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Active Projects
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-border/40 bg-card p-8 transition-colors hover:bg-card/80">
          <div className="mb-6 flex justify-between items-start">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <div>
            <p className="mb-2 text-4xl font-black text-white">
              {data.completedProjectCount}
            </p>
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Completed Projects
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-border/40 bg-card p-8 transition-colors hover:bg-card/80">
          <div className="mb-6 flex justify-between items-start">
            {data.latestOrder ? (
              <CircleDollarSign className="h-8 w-8 text-white" />
            ) : (
              <Clock3 className="h-8 w-8 text-white" />
            )}
          </div>
          <div>
            <p className="mb-2 text-2xl font-black text-white">
              {data.latestOrder
                ? formatCurrency(data.latestOrder.amount, data.latestOrder.currency)
                : formatRelativeTime(data.latestProjectUpdateAt)}
            </p>
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              {data.latestOrder ? "Latest Order" : "Last Project Update"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              Active Productions
            </h2>
            <Link
              href="/dashboard/projects"
              className="text-sm font-bold text-primary transition-colors hover:text-white"
            >
              View Kanban
            </Link>
          </div>

          {data.activeProjects.length > 0 ? (
            <div className="space-y-4">
              {data.activeProjects.slice(0, 5).map((project) => (
                <div
                  key={project.id}
                  className="group flex flex-col justify-between rounded-2xl border border-border/20 bg-card p-6 transition-colors hover:border-primary/50 sm:flex-row sm:items-center"
                >
                  <div className="mb-4 flex items-center gap-6 sm:mb-0">
                    <div className="flex items-center justify-center rounded-xl border border-border/50 bg-background p-4">
                      <FileVideo className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="mb-1 text-xl font-bold text-white transition-colors group-hover:text-primary">
                        {project.title}
                      </h3>
                      <p className="text-sm font-medium text-muted-foreground">
                        {project.id.slice(0, 8).toUpperCase()} • Updated{" "}
                        {formatRelativeTime(project.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Status
                      </span>
                      <span
                        className={`text-sm font-bold ${getProjectStatusTone(project.status)}`}
                      >
                        {formatProjectStatus(project.status)}
                      </span>
                    </div>
                    <ChevronRight className="hidden h-5 w-5 text-muted-foreground transition-colors group-hover:text-white sm:block" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border/40 bg-card/40 p-10">
              <h3 className="text-xl font-bold text-white">
                No active productions
              </h3>
              <p className="mt-2 max-w-xl font-medium text-muted-foreground">
                Start a new project and it will appear here once it enters the
                production pipeline.
              </p>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-6 text-2xl font-bold text-white">Studio Feed</h2>
          <div className="sticky top-28 rounded-3xl border border-border/20 bg-card p-8">
            {data.recentActivity.length > 0 ? (
              <div className="relative space-y-8 before:absolute before:inset-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-border/10 before:via-border/40 before:to-transparent before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0">
                {data.recentActivity.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="group relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse"
                  >
                    <div className="h-5 w-5 shrink-0 rounded-full border-2 border-background bg-primary text-slate-500 shadow md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2" />
                    <div className="w-[calc(100%-2.5rem)] rounded-xl border border-border/20 bg-background p-4 md:w-[calc(50%-1.25rem)]">
                      <div className="mb-1 flex items-center justify-between space-x-2">
                        <div className="text-sm font-bold text-white">
                          Event {data.recentActivity.length - index}
                        </div>
                        <time className="text-xs font-medium text-muted-foreground">
                          {formatRelativeTime(activity.time)}
                        </time>
                      </div>
                      <div className="text-sm font-medium text-muted-foreground">
                        {activity.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/30 bg-background p-6">
                <h3 className="text-lg font-bold text-white">
                  No recent activity
                </h3>
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  Project updates and payment events will show up here once your
                  account has live work in motion.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

