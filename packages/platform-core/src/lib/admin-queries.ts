import { db } from "../db";
import { orders, packages, portfolio, projects, users } from "../db/schema";
import { and, asc, count, desc, eq, ilike, or, sql, sum, type SQL } from "drizzle-orm";

export type AppRole = "customer" | "customer_support" | "affiliate" | "editor" | "project_manager" | "admin";
export type SortDirection = "asc" | "desc";
export type AdminUserSort = "createdAt" | "role";

export type AdminOverviewData = {
  revenue: string;
  totalUsers: number;
  activeProjects: number;
  totalProjects: number;
};

export type AdminPackageRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tier: string;
  price: string;
  features: string[];
  maxRawFootageGB: number | null;
  maxVideoLengthMin: number | null;
  revisions: number | null;
  deliveryDays: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminPortfolioRecord = {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  category: string | null;
  clientName: string | null;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminProjectRecord = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  clientName: string | null;
  clientEmail: string | null;
  packageName: string | null;
  packageTier: string | null;
  editorName: string | null;
};

export type AdminUserRecord = {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
  image: string | null;
  createdAt: string;
};

export type AdminUsersSummary = {
  total: number;
  admins: number;
  managers: number;
  editors: number;
  affiliates: number;
  customers: number;
};

export type AdminUsersPageData = {
  users: AdminUserRecord[];
  summary: AdminUsersSummary;
  totalUsers: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  query: string;
  sort: AdminUserSort;
  direction: SortDirection;
};

export type AdminUsersQuery = {
  page?: number;
  q?: string;
  sort?: AdminUserSort;
  direction?: SortDirection;
};

const PAGE_SIZE = 10;

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function getAdminOverviewData(): Promise<AdminOverviewData> {
  const [userCount, projectCount, activeJobs, revenue] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(projects),
    db.select({ value: count() }).from(projects).where(eq(projects.status, "in_progress")),
    db
      .select({ value: sum(orders.amount) })
      .from(orders)
      .where(eq(orders.status, "confirmed")),
  ]);

  return {
    revenue: revenue[0]?.value ?? "0",
    totalUsers: userCount[0]?.value ?? 0,
    activeProjects: activeJobs[0]?.value ?? 0,
    totalProjects: projectCount[0]?.value ?? 0,
  };
}

export async function getAdminPackagesData(): Promise<AdminPackageRecord[]> {
  const rows = await db.select().from(packages).orderBy(desc(packages.createdAt));

  return rows.map((row) => ({
    ...row,
    features: row.features ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getAdminPortfolioData(): Promise<AdminPortfolioRecord[]> {
  const rows = await db.select().from(portfolio).orderBy(desc(portfolio.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getAdminProjectsData(): Promise<AdminProjectRecord[]> {
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      createdAt: projects.createdAt,
      clientName: users.name,
      clientEmail: users.email,
      packageName: packages.name,
      packageTier: packages.tier,
      editorName: users.name,
    })
    .from(projects)
    .leftJoin(users, eq(projects.customerId, users.id))
    .leftJoin(packages, eq(projects.packageId, packages.id))
    .orderBy(desc(projects.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getAdminUsersPageData(input: AdminUsersQuery): Promise<AdminUsersPageData> {
  const currentPage = Math.max(input.page ?? 1, 1);
  const query = input.q?.trim() || "";
  const sort = input.sort === "role" ? "role" : "createdAt";
  const direction = input.direction === "asc" ? "asc" : "desc";

  const filters: SQL[] = [];
  if (query) {
    filters.push(or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`))!);
  }

  const whereClause = filters.length ? and(...filters) : undefined;
  const orderByClause =
    sort === "role"
      ? [direction === "asc" ? asc(users.role) : desc(users.role), desc(users.createdAt)]
      : [direction === "asc" ? asc(users.createdAt) : desc(users.createdAt), asc(users.role)];

  const [summaryRows, totalResult] = await Promise.all([
    db
      .select({
        role: users.role,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .groupBy(users.role),
    whereClause
      ? db.select({ count: count() }).from(users).where(whereClause)
      : db.select({ count: count() }).from(users),
  ]);

  const totalUsers = totalResult[0]?.count ?? 0;
  const totalPages = Math.max(Math.ceil(totalUsers / PAGE_SIZE), 1);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const rows = await (whereClause
    ? db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          image: users.image,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(whereClause)
    : db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          image: users.image,
          createdAt: users.createdAt,
        })
        .from(users))
    .orderBy(...orderByClause)
    .limit(PAGE_SIZE)
    .offset((safeCurrentPage - 1) * PAGE_SIZE);

  const summary = summaryRows.reduce<AdminUsersSummary>(
    (accumulator, row) => {
      accumulator.total += row.count;

      if (row.role === "admin") accumulator.admins = row.count;
      if (row.role === "project_manager") accumulator.managers = row.count;
      if (row.role === "editor") accumulator.editors = row.count;
      if (row.role === "affiliate") accumulator.affiliates = row.count;
      if (row.role === "customer") accumulator.customers = row.count;

      return accumulator;
    },
    {
      total: 0,
      admins: 0,
      managers: 0,
      editors: 0,
      affiliates: 0,
      customers: 0,
    }
  );

  return {
    users: rows.map((row) => ({
      ...row,
      role: row.role as AppRole,
      createdAt: row.createdAt.toISOString(),
    })),
    summary,
    totalUsers,
    totalPages,
    currentPage: safeCurrentPage,
    pageSize: PAGE_SIZE,
    query,
    sort,
    direction,
  };
}
