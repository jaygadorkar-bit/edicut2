"use server";

import {
  createPackageMutation,
  type PackageInput,
  updatePackageMutation,
} from "@edicut/platform-core/lib/admin-mutations";

export async function updatePackage(id: string, data: PackageInput) {
  return updatePackageMutation(id, data);
}

export async function createPackage(data: PackageInput) {
  return createPackageMutation(data);
}

