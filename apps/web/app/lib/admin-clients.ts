export const CLIENT_PAGE_SIZE = 20;
export const CLIENT_DETAIL_PAGE_SIZE = 10;
export const CLIENT_EVENT_PAGE_SIZE = 20;

export type ClientFilters = {
  q: string;
  payment: "all" | "paid" | "unpaid" | "pending" | "no-orders";
  attention: "all" | "needs-manager" | "needs-editor" | "overdue" | "review";
  manager: string;
  sort: "attention" | "recent" | "name";
  page: number;
};
export type AdminClient = {
  id: string;
  name: string | null;
  email: string;
  active: boolean;
  country: string | null;
  phone: string | null;
  createdAt: string;
  managerId: string | null;
  managerName: string | null;
  managerActive: boolean;
  paidOrders: number;
  pendingOrders: number;
  orderCount: number;
  paidProjects: number;
  pendingInvoices: number;
  projectCount: number;
  activeProjects: number;
  reviewProjects: number;
  overdueProjects: number;
  needsEditor: number;
  unresolvedFeedback: number;
  nextDeadline: string | null;
  lastActivity: string;
};
export type ClientDirectorySummary = {
  total: number;
  paid: number;
  unpaid: number;
  pending: number;
  needsManager: number;
  needsEditor: number;
  overdue: number;
  review: number;
};
export type ClientDirectory = {
  clients: AdminClient[];
  summary: ClientDirectorySummary;
  total: number;
  page: number;
  pageCount: number;
};
export type ClientProject = {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  billingStatus: string;
  reviewRevision: number;
  updatedAt: string;
  editors: { id: string; name: string; active: boolean }[];
  unresolvedFeedback: number;
};
export type ClientOrder = {
  id: string;
  planName: string;
  status: string;
  amountCents: number;
  currency: string;
  purchaseType: string;
  createdAt: string;
  paidAt: string | null;
};
export type ClientEvent = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
  entityId: string;
  projectId: string | null;
  versionId?: string | null;
};
export type ClientDetail = {
  client: AdminClient;
  projects: ClientProject[];
  orders: ClientOrder[];
  events: ClientEvent[];
  eventCount: number;
  projectPage: number;
  orderPage: number;
  eventPage: number;
  paidTotals: { currency: string; amountCents: number }[];
};

export function clientMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
