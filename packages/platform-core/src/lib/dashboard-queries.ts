import { db } from "../db";
import { orders, projects } from "../db/schema";
import { desc, eq } from "drizzle-orm";

const ACTIVE_PROJECT_STATUSES = [
  "pending_payment",
  "payment_review",
  "in_queue",
  "in_progress",
  "in_review",
  "revision_requested",
] as const;

export type DashboardProjectRecord = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type DashboardRecentActivity = {
  id: string;
  time: string;
  text: string;
};

export type DashboardOverviewData = {
  activeProjectCount: number;
  completedProjectCount: number;
  latestProjectUpdateAt: string | null;
  latestOrder: {
    id: string;
    projectId: string;
    amount: string;
    currency: string;
    status: string;
    createdAt: string;
    paidAt: string | null;
  } | null;
  activeProjects: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
  recentActivity: DashboardRecentActivity[];
};

function formatProjectStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function getDashboardOverviewData(userId: string): Promise<DashboardOverviewData> {
  const [projectRows, orderRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        updatedAt: projects.updatedAt,
        completedAt: projects.completedAt,
      })
      .from(projects)
      .where(eq(projects.customerId, userId))
      .orderBy(desc(projects.updatedAt)),
    db
      .select({
        id: orders.id,
        projectId: orders.projectId,
        amount: orders.amount,
        currency: orders.currency,
        status: orders.status,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
      })
      .from(orders)
      .where(eq(orders.customerId, userId))
      .orderBy(desc(orders.createdAt)),
  ]);

  const activeProjects = projectRows.filter((project) =>
    (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(project.status)
  );
  const completedProjects = projectRows.filter((project) => project.status === "completed");
  const ordersByProjectId = new Map(orderRows.map((order) => [order.projectId, order]));

  const recentActivity = projectRows
    .flatMap((project) => {
      const events = [
        {
          id: `${project.id}-status`,
          time: project.updatedAt,
          text: `${project.title} is now ${formatProjectStatus(project.status)}.`,
        },
      ];

      if (project.completedAt) {
        events.push({
          id: `${project.id}-completed`,
          time: project.completedAt,
          text: `${project.title} was completed.`,
        });
      }

      const order = ordersByProjectId.get(project.id);
      if (order) {
        events.push({
          id: `${order.id}-order`,
          time: order.paidAt ?? order.createdAt,
          text:
            order.status === "confirmed"
              ? `Payment confirmed for ${project.title}.`
              : `Order ${order.status} for ${project.title}.`,
        });
      }

      return events;
    })
    .sort((a, b) => b.time.getTime() - a.time.getTime())
    .slice(0, 5)
    .map((activity) => ({
      ...activity,
      time: activity.time.toISOString(),
    }));

  const latestOrder = orderRows[0];

  return {
    activeProjectCount: activeProjects.length,
    completedProjectCount: completedProjects.length,
    latestProjectUpdateAt: projectRows[0]?.updatedAt?.toISOString() ?? null,
    latestOrder: latestOrder
      ? {
          ...latestOrder,
          createdAt: latestOrder.createdAt.toISOString(),
          paidAt: latestOrder.paidAt?.toISOString() ?? null,
        }
      : null,
    activeProjects: activeProjects.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      updatedAt: project.updatedAt.toISOString(),
    })),
    recentActivity,
  };
}

export async function getDashboardProjectsData(userId: string): Promise<DashboardProjectRecord[]> {
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      completedAt: projects.completedAt,
    })
    .from(projects)
    .where(eq(projects.customerId, userId))
    .orderBy(desc(projects.updatedAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }));
}
