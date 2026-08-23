import type { PricingPackage } from "./pricing.server";

type CloudinaryEnv = {
  cf?: { env?: Record<string, string | undefined> };
  cloudflare?: { env?: Record<string, string | undefined> };
};

const CLOUDINARY_CACHE_MS = 60_000;

let imageListCache: { expiresAt: number; data: CloudinaryImageResource[] } | null = null;
let imageListPromise: Promise<CloudinaryImageResource[]> | null = null;
let usageCache: { expiresAt: number; data: CloudinaryUsage } | null = null;
let usagePromise: Promise<CloudinaryUsage> | null = null;

async function readLocalEnvFile() {
  if (!globalThis.process?.cwd) {
    return {};
  }

  try {
    const [{ readFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    let root = globalThis.process.cwd();
    const values: Record<string, string> = {};
    const roots = [root];

    for (let index = 0; index < 3; index += 1) {
      const parent = path.dirname(root);
      if (parent === root) break;
      roots.push(parent);
      root = parent;
    }

    for (const currentRoot of roots) {
      for (const fileName of [".env.local", ".env"]) {
        try {
          const contents = await readFile(path.join(currentRoot, fileName), "utf8");

          for (const line of contents.split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (!match || values[match[1]]) continue;
            values[match[1]] = match[2].replace(/^["']|["']$/g, "");
          }
        } catch {
          // Missing local env files are fine; deployed environments should use runtime env.
        }
      }
    }

    return values;
  } catch {
    return {};
  }
}

export type CloudinaryImageResource = {
  public_id: string;
  secure_url: string;
  bytes: number;
  width?: number;
  height?: number;
  format?: string;
  created_at?: string;
};

export type CloudinaryUsage = {
  credits?: {
    usage?: number;
    limit?: number;
    used_percent?: number;
  };
  storage?: {
    usage?: number;
    limit?: number;
    used_percent?: number;
  };
  bandwidth?: {
    usage?: number;
    limit?: number;
    used_percent?: number;
  };
  transformations?: {
    usage?: number;
    limit?: number;
    used_percent?: number;
  };
};

function clearCloudinaryCache() {
  imageListCache = null;
  imageListPromise = null;
  usageCache = null;
  usagePromise = null;
}

async function readEnv(context?: CloudinaryEnv) {
  const nodeEnv = globalThis.process?.env as Record<string, string | undefined> | undefined;
  const localEnv = await readLocalEnvFile();

  return {
    cloudName:
      context?.cloudflare?.env?.CLOUDINARY_CLOUD_NAME ??
      context?.cf?.env?.CLOUDINARY_CLOUD_NAME ??
      nodeEnv?.CLOUDINARY_CLOUD_NAME ??
      localEnv.CLOUDINARY_CLOUD_NAME,
    apiKey:
      context?.cloudflare?.env?.CLOUDINARY_API_KEY ??
      context?.cf?.env?.CLOUDINARY_API_KEY ??
      nodeEnv?.CLOUDINARY_API_KEY ??
      localEnv.CLOUDINARY_API_KEY,
    apiSecret:
      context?.cloudflare?.env?.CLOUDINARY_API_SECRET ??
      context?.cf?.env?.CLOUDINARY_API_SECRET ??
      nodeEnv?.CLOUDINARY_API_SECRET ??
      localEnv.CLOUDINARY_API_SECRET,
  };
}

async function requireCloudinaryEnv(context?: CloudinaryEnv) {
  const env = await readEnv(context);

  if (!env.cloudName || !env.apiKey || !env.apiSecret) {
    throw new Error("Cloudinary environment variables are not configured.");
  }

  return env;
}

function authHeader(apiKey: string, apiSecret: string) {
  return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
}

async function cloudinaryAdminRequest<T>(
  path: string,
  context?: CloudinaryEnv,
  init: RequestInit = {},
) {
  const env = await requireCloudinaryEnv(context);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudName}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(env.apiKey, env.apiSecret),
      ...(init.headers || {}),
    },
  });
  const result = await response.json() as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(result.error?.message || "Cloudinary Admin API request failed.");
  }

  return result;
}

async function sha1Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signUpload(params: Record<string, string | number>, apiSecret: string) {
  const signatureBase = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return sha1Hex(`${signatureBase}${apiSecret}`);
}

export async function uploadPackageImageToCloudinary(file: File, context?: CloudinaryEnv) {
  const env = await requireCloudinaryEnv(context);

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const uploadParams = {
    folder: "edicut/packages",
    timestamp,
  };
  const signature = await signUpload(uploadParams, env.apiSecret);
  const formData = new FormData();

  formData.set("file", file);
  formData.set("api_key", env.apiKey);
  formData.set("folder", uploadParams.folder);
  formData.set("timestamp", String(timestamp));
  formData.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });

  const result = await response.json() as { secure_url?: string; error?: { message?: string } };

  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || "Cloudinary upload failed.");
  }

  clearCloudinaryCache();
  return result.secure_url;
}

export async function listCloudinaryImages(context?: CloudinaryEnv) {
  const now = Date.now();

  if (imageListCache && imageListCache.expiresAt > now) {
    return imageListCache.data;
  }

  if (!imageListPromise) {
    imageListPromise = cloudinaryAdminRequest<{ resources?: CloudinaryImageResource[] }>(
      "/resources/image/upload?prefix=edicut/&max_results=100",
      context,
    )
      .then((result) => {
        const data = result.resources || [];
        imageListCache = { expiresAt: Date.now() + CLOUDINARY_CACHE_MS, data };
        imageListPromise = null;
        return data;
      })
      .catch((error) => {
        imageListPromise = null;
        throw error;
      });
  }

  return imageListPromise;
}

export async function getCloudinaryUsage(context?: CloudinaryEnv) {
  const now = Date.now();

  if (usageCache && usageCache.expiresAt > now) {
    return usageCache.data;
  }

  if (!usagePromise) {
    usagePromise = cloudinaryAdminRequest<CloudinaryUsage>("/usage", context)
      .then((data) => {
        usageCache = { expiresAt: Date.now() + CLOUDINARY_CACHE_MS, data };
        usagePromise = null;
        return data;
      })
      .catch((error) => {
        usagePromise = null;
        throw error;
      });
  }

  return usagePromise;
}

export async function deleteCloudinaryImages(publicIds: string[], context?: CloudinaryEnv) {
  if (!publicIds.length) {
    return;
  }

  const params = new URLSearchParams();
  for (const publicId of publicIds) {
    params.append("public_ids[]", publicId);
  }

  await cloudinaryAdminRequest(
    "/resources/image/upload",
    context,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    },
  );
  clearCloudinaryCache();
}

export function removeCloudinaryUrlsFromPackages(packages: PricingPackage[], deletedUrls: string[]) {
  const deleted = new Set(deletedUrls);

  return packages.map((pkg) => ({
    ...pkg,
    galleryImages: pkg.galleryImages.filter((imageUrl) => !deleted.has(imageUrl)),
  }));
}
