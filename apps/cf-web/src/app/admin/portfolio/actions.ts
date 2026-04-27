"use server";

import {
  createPortfolioItemMutation,
  deletePortfolioItemMutation,
  type PortfolioInput,
  updatePortfolioItemMutation,
} from "@edicut/platform-core/lib/admin-mutations";

export async function createPortfolioItem(data: PortfolioInput) {
  return createPortfolioItemMutation(data);
}

export async function updatePortfolioItem(id: string, data: PortfolioInput) {
  return updatePortfolioItemMutation(id, data);
}

export async function deletePortfolioItem(id: string) {
  return deletePortfolioItemMutation(id);
}

