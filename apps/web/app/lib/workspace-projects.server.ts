import { workspaceProjects } from "@edicut/db/schema";

// Customer workspace pages do not use marketing attribution. Keep their reads
// independent of the optional coupon/affiliate migration and future additions.
export const workspaceProjectColumns = {
  id: workspaceProjects.id,
  ownerId: workspaceProjects.ownerId,
  title: workspaceProjects.title,
  channelName: workspaceProjects.channelName,
  packageSlug: workspaceProjects.packageSlug,
  category: workspaceProjects.category,
  cadence: workspaceProjects.cadence,
  deadline: workspaceProjects.deadline,
  notes: workspaceProjects.notes,
  status: workspaceProjects.status,
  billingName: workspaceProjects.billingName,
  billingEmail: workspaceProjects.billingEmail,
  billingCompany: workspaceProjects.billingCompany,
  billingCountry: workspaceProjects.billingCountry,
  finalAmountCents: workspaceProjects.finalAmountCents,
  invoiceUrl: workspaceProjects.invoiceUrl,
  estimatedAmountCents: workspaceProjects.estimatedAmountCents,
  currency: workspaceProjects.currency,
  billingStatus: workspaceProjects.billingStatus,
  createdAt: workspaceProjects.createdAt,
  updatedAt: workspaceProjects.updatedAt,
};

export type WorkspaceProjectView = Pick<typeof workspaceProjects.$inferSelect, keyof typeof workspaceProjectColumns>;
