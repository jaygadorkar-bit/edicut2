import type { PricingPackage } from "./pricing.server";
import type { PortfolioSection } from "./portfolio.server";

type CloudinaryEnv = {
  cf?: { env?: Record<string, string | undefined> };
  cloudflare?: { env?: Record<string, string | undefined> };
};

type CloudinaryAccount = "image" | "video";

const CLOUDINARY_CACHE_MS = 60_000;

let imageListCache: { expiresAt: number; data: CloudinaryImageResource[] } | null = null;
let imageListPromise: Promise<CloudinaryImageResource[]> | null = null;
let videoListCache: { expiresAt: number; data: CloudinaryVideoResource[] } | null = null;
let videoListPromise: Promise<CloudinaryVideoResource[]> | null = null;
let imageUsageCache: { expiresAt: number; data: CloudinaryUsage } | null = null;
let imageUsagePromise: Promise<CloudinaryUsage> | null = null;
let videoUsageCache: { expiresAt: number; data: CloudinaryUsage } | null = null;
let videoUsagePromise: Promise<CloudinaryUsage> | null = null;

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

export type CloudinaryVideoResource = {
  public_id: string;
  secure_url: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
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
  videoListCache = null;
  videoListPromise = null;
  imageUsageCache = null;
  imageUsagePromise = null;
  videoUsageCache = null;
  videoUsagePromise = null;
}

async function readEnv(context: CloudinaryEnv | undefined, account: CloudinaryAccount) {
  const nodeEnv = globalThis.process?.env as Record<string, string | undefined> | undefined;
  const localEnv = await readLocalEnvFile();
  const prefix = account === "video" ? "CLOUDINARY_VIDEO_" : "CLOUDINARY_";
  const get = (name: "CLOUD_NAME" | "API_KEY" | "API_SECRET") => {
    const key = `${prefix}${name}`;
    return context?.cloudflare?.env?.[key] ?? context?.cf?.env?.[key] ?? nodeEnv?.[key] ?? localEnv[key];
  };

  return {
    cloudName: get("CLOUD_NAME"),
    apiKey: get("API_KEY"),
    apiSecret: get("API_SECRET"),
  };
}

async function requireCloudinaryEnv(context: CloudinaryEnv | undefined, account: CloudinaryAccount = "image") {
  const env = await readEnv(context, account);

  if (!env.cloudName || !env.apiKey || !env.apiSecret) {
    const prefix = account === "video" ? "CLOUDINARY_VIDEO_" : "CLOUDINARY_";
    throw new Error(`${prefix}CLOUD_NAME, ${prefix}API_KEY, and ${prefix}API_SECRET are not configured.`);
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
  account: CloudinaryAccount = "image",
) {
  const env = await requireCloudinaryEnv(context, account);
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
  const env = await requireCloudinaryEnv(context, "image");

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
      {},
      "image",
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

  if (imageUsageCache && imageUsageCache.expiresAt > now) {
    return imageUsageCache.data;
  }

  if (!imageUsagePromise) {
    imageUsagePromise = cloudinaryAdminRequest<CloudinaryUsage>("/usage", context, {}, "image")
      .then((data) => {
        imageUsageCache = { expiresAt: Date.now() + CLOUDINARY_CACHE_MS, data };
        imageUsagePromise = null;
        return data;
      })
      .catch((error) => {
        imageUsagePromise = null;
        throw error;
      });
  }

  return imageUsagePromise;
}

export async function uploadPortfolioVideoToCloudinary(file: File, context?: CloudinaryEnv) {
  const env = await requireCloudinaryEnv(context, "video");

  if (!file.type.startsWith("video/")) {
    throw new Error("Only video files can be uploaded.");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const uploadParams = {
    folder: "edicut/portfolio",
    timestamp,
  };
  const signature = await signUpload(uploadParams, env.apiSecret);
  const formData = new FormData();

  formData.set("file", file);
  formData.set("api_key", env.apiKey);
  formData.set("folder", uploadParams.folder);
  formData.set("timestamp", String(timestamp));
  formData.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudName}/video/upload`, {
    method: "POST",
    body: formData,
  });
  const result = await response.json() as Partial<CloudinaryVideoResource> & { error?: { message?: string } };

  if (!response.ok || !result.secure_url || !result.public_id) {
    throw new Error(result.error?.message || "Cloudinary video upload failed.");
  }

  clearCloudinaryCache();
  return {
    public_id: result.public_id,
    secure_url: result.secure_url,
    bytes: result.bytes || file.size,
    width: result.width,
    height: result.height,
    duration: result.duration,
    format: result.format || file.type.split("/")[1],
  } satisfies CloudinaryVideoResource;
}

export async function listCloudinaryVideos(context?: CloudinaryEnv) {
  const now = Date.now();

  if (videoListCache && videoListCache.expiresAt > now) {
    return videoListCache.data;
  }

  if (!videoListPromise) {
    videoListPromise = cloudinaryAdminRequest<{ resources?: CloudinaryVideoResource[] }>(
      "/resources/video/upload?prefix=edicut/portfolio&max_results=100",
      context,
      {},
      "video",
    )
      .then((result) => {
        const data = result.resources || [];
        videoListCache = { expiresAt: Date.now() + CLOUDINARY_CACHE_MS, data };
        videoListPromise = null;
        return data;
      })
      .catch((error) => {
        videoListPromise = null;
        throw error;
      });
  }

  return videoListPromise;
}

export async function getCloudinaryVideoUsage(context?: CloudinaryEnv) {
  const now = Date.now();

  if (videoUsageCache && videoUsageCache.expiresAt > now) {
    return videoUsageCache.data;
  }

  if (!videoUsagePromise) {
    videoUsagePromise = cloudinaryAdminRequest<CloudinaryUsage>("/usage", context, {}, "video")
      .then((data) => {
        videoUsageCache = { expiresAt: Date.now() + CLOUDINARY_CACHE_MS, data };
        videoUsagePromise = null;
        return data;
      })
      .catch((error) => {
        videoUsagePromise = null;
        throw error;
      });
  }

  return videoUsagePromise;
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
    "image",
  );
  clearCloudinaryCache();
}

export async function deleteCloudinaryVideos(publicIds: string[], context?: CloudinaryEnv) {
  if (!publicIds.length) return;

  const params = new URLSearchParams();
  for (const publicId of publicIds) {
    params.append("public_ids[]", publicId);
  }

  await cloudinaryAdminRequest(
    "/resources/video/upload",
    context,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    },
    "video",
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

export function removeCloudinaryUrlsFromPortfolioSections(sections: PortfolioSection[], deletedUrls: string[]) {
  const deleted = new Set(deletedUrls);

  return sections.map((section) => ({
    ...section,
    videos: section.videos.filter((video) => !deleted.has(video.videoUrl)),
  }));
}
