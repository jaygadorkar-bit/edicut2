import Link from "next/link";
import PageContainer from "@/components/layout/page-container";
import { getAdminUsers } from "@/lib/api/read";
import { UserTable } from "./user-table";
import { AddUserDialog } from "./add-user-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type AppRole = "customer" | "affiliate" | "editor" | "project_manager" | "admin";

type ResolvedSearchParams = {
  page?: string;
  q?: string;
  sort?: string;
  direction?: string;
};

const PAGE_SIZE = 10;

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, -1, totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, -1, currentPage - 1, currentPage, currentPage + 1, -1, totalPages];
}

function getPaginationHref(params: URLSearchParams, page: number) {
  const nextParams = new URLSearchParams(params.toString());
  nextParams.set("page", String(page));
  return `/admin/users?${nextParams.toString()}`;
}

export default async function UserManagementPage({
  searchParams,
}: {
  searchParams: Promise<ResolvedSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const currentPage = Math.max(Number(resolvedSearchParams.page || "1") || 1, 1);
  const query = resolvedSearchParams.q?.trim() || "";
  const sort = resolvedSearchParams.sort === "role" ? "role" : "createdAt";
  const direction = resolvedSearchParams.direction === "asc" ? "asc" : "desc";

  const data = await getAdminUsers({
    page: currentPage,
    q: query,
    sort,
    direction,
  });

  const { summary, totalUsers, totalPages } = data;
  const safeCurrentPage = data.currentPage;
  const pagedUsers = data.users;

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (sort !== "createdAt") params.set("sort", sort);
  if (direction !== "desc") params.set("direction", direction);

  const pageNumbers = getPageNumbers(safeCurrentPage, totalPages);

  return (
    <PageContainer
      pageTitle="User Management"
      pageDescription="Manage platform accounts, assign responsibilities, and control administrative access."
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-3xl border border-border/20 bg-card p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Total Users
            </p>
            <p className="mt-2 text-3xl font-black tracking-tight text-white">{summary.total}</p>
          </div>
          <div className="rounded-3xl border border-border/20 bg-card p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Admins
            </p>
            <p className="mt-2 text-3xl font-black tracking-tight text-red-400">{summary.admins}</p>
          </div>
          <div className="rounded-3xl border border-border/20 bg-card p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Managers
            </p>
            <p className="mt-2 text-3xl font-black tracking-tight text-primary">{summary.managers}</p>
          </div>
          <div className="rounded-3xl border border-border/20 bg-card p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Editors
            </p>
            <p className="mt-2 text-3xl font-black tracking-tight text-blue-400">{summary.editors}</p>
          </div>
          <div className="rounded-3xl border border-border/20 bg-card p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Affiliates
            </p>
            <p className="mt-2 text-3xl font-black tracking-tight text-amber-400">
              {summary.affiliates}
            </p>
          </div>
          <div className="rounded-3xl border border-border/20 bg-card p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Customers
            </p>
            <p className="mt-2 text-3xl font-black tracking-tight text-zinc-300">
              {summary.customers}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-3xl border border-border/20 bg-card p-5 lg:flex-row lg:items-end lg:justify-between">
          <form className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Search
              </label>
              <input
                name="q"
                defaultValue={query}
                placeholder="Find by name or email"
                className="h-11 w-full rounded-xl border border-border/40 bg-background px-4 text-sm text-white outline-none transition-all focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Sort By
              </label>
              <select
                name="sort"
                defaultValue={sort}
                className="h-11 w-full rounded-xl border border-border/40 bg-background px-4 text-sm text-white outline-none transition-all focus:border-primary"
              >
                <option value="createdAt">Created Date</option>
                <option value="role">Role</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Direction
              </label>
              <select
                name="direction"
                defaultValue={direction}
                className="h-11 w-full rounded-xl border border-border/40 bg-background px-4 text-sm text-white outline-none transition-all focus:border-primary"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
            <input type="hidden" name="page" value="1" />
            <div className="md:col-span-3 flex gap-3">
              <button
                type="submit"
                className="h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-transform hover:scale-[1.01]"
              >
                Apply Filters
              </button>
              <Link
                href="/admin/users"
                className="inline-flex h-11 items-center rounded-xl border border-border/40 px-5 text-sm font-bold text-zinc-300 transition-colors hover:bg-background hover:text-white"
              >
                Reset
              </Link>
            </div>
          </form>

          <div className="flex items-center justify-between gap-4 lg:min-w-[280px] lg:justify-end">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Page {safeCurrentPage} of {totalPages}
            </p>
            <AddUserDialog />
          </div>
        </div>

        <UserTable users={pagedUsers as Array<{
          id: string;
          name: string | null;
          email: string;
          role: AppRole;
          image: string | null;
          createdAt: string;
        }>} />

        <div className="flex flex-col items-center gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            Showing {totalUsers === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1}-
            {(safeCurrentPage - 1) * PAGE_SIZE + pagedUsers.length} of {totalUsers} users
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href={
                    safeCurrentPage > 1
                      ? getPaginationHref(params, safeCurrentPage - 1)
                      : "#"
                  }
                  className={safeCurrentPage <= 1 ? "pointer-events-none opacity-40" : ""}
                />
              </PaginationItem>
              {pageNumbers.map((pageNumber, index) => (
                <PaginationItem key={`${pageNumber}-${index}`}>
                  {pageNumber === -1 ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href={getPaginationHref(params, pageNumber)}
                      isActive={pageNumber === safeCurrentPage}
                    >
                      {pageNumber}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href={
                    safeCurrentPage < totalPages
                      ? getPaginationHref(params, safeCurrentPage + 1)
                      : "#"
                  }
                  className={safeCurrentPage >= totalPages ? "pointer-events-none opacity-40" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </PageContainer>
  );
}

