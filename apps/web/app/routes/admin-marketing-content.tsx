import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { ArrowDownToLine, Check, Copy, FileImage, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { Select } from "../components/Select";
import { getDbFromContext } from "../lib/db.server";
import { toPublicAdminUser } from "../lib/admin-public";
import { requireAdminUser } from "../lib/session.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import {
  deleteCloudinaryImages,
  listCloudinaryMarketingImages,
  updateCloudinaryMarketingImage,
  uploadMarketingImageToCloudinary,
  type CloudinaryImageResource,
} from "../lib/cloudinary.server";
import { MARKETING_ASSET_CATEGORIES, type MarketingAssetCategory } from "../lib/marketing-assets";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import "../styles/admin-marketing-content.css";

const MAX_UPLOAD_COUNT = 8;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_BYTES = 40 * 1024 * 1024;
const MAX_FORM_BYTES = MAX_BATCH_BYTES + 1024 * 1024;
const MARKETING_FOLDER_PREFIX = "edicut/marketing/";

const categoryLabels: Record<MarketingAssetCategory, string> = {
  logo: "Logo",
  banner: "Banner",
  post: "Social post",
  "story-reel": "Story / Reel",
  thumbnail: "Video thumbnail",
  other: "Other",
};

const knownAssetTitles: Record<string, string> = {
  g8tmlbnscbltk5gnodc8: "Homepage banner — Video editing for your next YouTube upload",
  tsakxlef2ivr6sre6ebb: "YouTube channel cover — Your next YouTube upload",
  zfnib0dppganawstsfzz: "Profile picture — EdiCut logo",
  atbk4ecsa3kvkfaawaet: "Facebook post — More creating, less managing",
  ublrmjfc3f7ktecxhvwx: "Instagram post — Your story, well told",
  vgyro6qnxutpsumn6srx: "TikTok Reel cover — Raw footage, ready to share",
  i1rdaxkdoigbfsoydxpc: "YouTube thumbnail — Make every frame count",
  jb0yx5gmkbqi2cyflqyz: "Profile picture — Black background",
  pmpdh6kyl9cegzsmypux: "Profile picture — Red Cut, white clapper",
  sz6cjh5itkiahpouffji: "Profile picture — Black Cut, white clapper",
};

export const meta: MetaFunction = () => [
  { title: "Marketing content | EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const admin = await requireAdminUser(request, db, context, new URL(request.url).pathname);
  try {
    const assets = await listCloudinaryMarketingImages(context);
    return { admin: toPublicAdminUser(admin), assets, error: "" };
  } catch (error) {
    console.error("Marketing content library load failed:", error);
    return { admin: toPublicAdminUser(admin), assets: [] as CloudinaryImageResource[], error: "The marketing library could not be loaded. Check the media connection and refresh." };
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  const db = getDbFromContext(context);
  await requireAdminUser(request, db, context, new URL(request.url).pathname);
  const form = await readMutationForm(request, MAX_FORM_BYTES);
  if (!form) return { error: "The request was too large or could not be read. Choose fewer or smaller files and retry." };

  const intent = String(form.get("intent") || "");
  if (intent === "upload-marketing-assets") {
    const category = String(form.get("category") || "") as MarketingAssetCategory;
    if (!MARKETING_ASSET_CATEGORIES.includes(category)) return { error: "Choose an asset type before uploading." };

    const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return { error: "Choose at least one image to upload." };
    if (files.length > MAX_UPLOAD_COUNT) return { error: `Upload up to ${MAX_UPLOAD_COUNT} images at a time.` };
    if (files.some((file) => file.size > MAX_FILE_BYTES) || files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
      return { error: "Each image must be 10 MB or smaller, with at most 40 MB total per upload." };
    }

    const results = await Promise.allSettled(files.map((file) => uploadMarketingImageToCloudinary(file, category, context)));
    const uploaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (results.some((result) => result.status === "rejected")) {
      try {
        if (uploaded.length) await deleteCloudinaryImages(uploaded.map((asset) => asset.public_id), context);
        return { error: "Some images could not be uploaded. Successful uploads were removed; check the file types and try again." };
      } catch (error) {
        console.error("Marketing image rollback failed:", error);
        return { error: "Some images could not be uploaded, and cleanup was incomplete. Check the marketing library for unused uploads." };
      }
    }
    return { success: `Uploaded ${uploaded.length} ${categoryLabels[category].toLowerCase()} asset${uploaded.length === 1 ? "" : "s"}.` };
  }

  if (intent === "update-marketing-asset") {
    const publicId = String(form.get("publicId") || "");
    const title = String(form.get("title") || "").trim();
    const category = String(form.get("category") || "") as MarketingAssetCategory;
    if (!publicId.startsWith(MARKETING_FOLDER_PREFIX)) return { error: "Select an image from the marketing library.", intent };
    if (!title || title.length > 120 || /[\u0000-\u001F\u007F]/.test(title)) {
      return { error: "Enter a title between 1 and 120 characters.", intent, errorPublicId: publicId };
    }
    if (!MARKETING_ASSET_CATEGORIES.includes(category)) return { error: "Choose an asset type from the list.", intent, errorPublicId: publicId };

    try {
      const available = await listCloudinaryMarketingImages(context);
      if (!available.some((asset) => asset.public_id === publicId && asset.public_id.startsWith(MARKETING_FOLDER_PREFIX))) {
        return { error: "This image is no longer in the marketing library. Refresh and try again.", intent, errorPublicId: publicId };
      }
      await updateCloudinaryMarketingImage(publicId, title, category, context);
      return { success: "Marketing asset details saved.", updatedPublicId: publicId, intent };
    } catch (error) {
      console.error("Marketing asset update failed:", error);
      return { error: "The marketing asset details could not be saved. Refresh and try again.", intent, errorPublicId: publicId };
    }
  }

  if (intent === "delete-marketing-assets") {
    const publicIds = Array.from(new Set(form.getAll("publicIds").map(String).filter(Boolean)));
    if (!publicIds.length) return { error: "Select at least one asset to delete." };
    if (publicIds.length > 100) return { error: "Delete up to 100 assets at a time." };

    try {
      const available = await listCloudinaryMarketingImages(context);
      const selected = publicIds.map((publicId) => available.find((asset) => asset.public_id === publicId));
      if (selected.some((asset) => !asset || !asset.public_id.startsWith(MARKETING_FOLDER_PREFIX))) {
        return { error: "Some selected assets are no longer in this library. Refresh and select them again." };
      }
      await deleteCloudinaryImages(publicIds, context);
      return { success: `Deleted ${publicIds.length} asset${publicIds.length === 1 ? "" : "s"}.` };
    } catch (error) {
      console.error("Marketing asset delete failed:", error);
      return { error: "The selected assets could not be deleted. Refresh and try again." };
    }
  }

  return { error: "Unknown marketing library action." };
}

export default function AdminMarketingContentPage() {
  const { admin, assets, error: loaderError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [lightboxAsset, setLightboxAsset] = useState<CloudinaryImageResource | null>(null);
  const [editAsset, setEditAsset] = useState<CloudinaryImageResource | null>(null);
  const lightboxDialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);
  const busy = navigation.state !== "idle";

  useEffect(() => {
    const dialog = lightboxDialogRef.current;
    if (lightboxAsset && dialog && !dialog.open) dialog.showModal();
  }, [lightboxAsset]);

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (editAsset && dialog && !dialog.open) {
      dialog.showModal();
      editTitleRef.current?.focus();
    }
  }, [editAsset]);

  useEffect(() => {
    if (actionData && "updatedPublicId" in actionData) {
      if (editDialogRef.current?.open) editDialogRef.current.close();
      setEditAsset(null);
    }
  }, [actionData]);

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const category = assetCategory(asset);
      const title = titleForAsset(asset).toLowerCase();
      return (categoryFilter === "all" || category === categoryFilter)
        && (!query || title.includes(query) || asset.public_id.toLowerCase().includes(query));
    });
  }, [assets, categoryFilter, search]);

  function toggleAsset(publicId: string) {
    setSelectedIds((previous) => previous.includes(publicId) ? previous.filter((id) => id !== publicId) : [...previous, publicId]);
  }

  function toggleVisibleAssets() {
    const visibleIds = filteredAssets.map((asset) => asset.public_id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((previous) => allVisibleSelected
      ? previous.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...previous, ...visibleIds])));
  }

  async function copyAssetUrl(asset: CloudinaryImageResource) {
    try {
      await navigator.clipboard.writeText(asset.secure_url);
      setCopiedId(asset.public_id);
      setCopyError(false);
      window.setTimeout(() => setCopiedId((current) => current === asset.public_id ? "" : current), 1800);
    } catch {
      setCopyError(true);
      setCopiedId("");
    }
  }

  function closeLightbox() {
    if (lightboxDialogRef.current?.open) lightboxDialogRef.current.close();
    else setLightboxAsset(null);
  }

  return (
    <AdminPanelShell title="Marketing content" activeTab="marketing-content" account={{ name: admin.name || admin.email, detail: admin.email }}>
      <main className="marketing-content-page">
        <header className="marketing-content-heading">
          <h1>Marketing content</h1>
          <div className="marketing-content-count" aria-label={`${assets.length} assets in the library, ${filteredAssets.length} shown, ${selectedIds.length} selected`}>
            <FileImage size={19} aria-hidden="true" />
            <span><strong>{assets.length}</strong> {assets.length === 1 ? "asset" : "assets"} · {filteredAssets.length} shown · {selectedIds.length} selected</span>
          </div>
        </header>

        {loaderError ? <p className="marketing-content-notice marketing-content-notice--error" role="alert">{loaderError}</p> : null}
        {actionData && "error" in actionData ? <p className="marketing-content-notice marketing-content-notice--error" role="alert">{actionData.error}</p> : null}
        {actionData && "success" in actionData ? <p className="marketing-content-notice marketing-content-notice--success" role="status">{actionData.success}</p> : null}
        {copyError ? <p className="marketing-content-notice marketing-content-notice--error" role="alert">Could not copy the link. Open the asset and copy the address from your browser.</p> : null}

        <div className="marketing-content-toolbar" role="group" aria-label="Marketing content controls">
          <Form method="post" encType="multipart/form-data" className="marketing-upload-form">
            <input type="hidden" name="intent" value="upload-marketing-assets" />
            <label className="marketing-control marketing-control--upload-type">
              <span className="sr-only">Asset type for new images</span>
              <Select name="category" defaultValue="post" required aria-label="Asset type for new images">
                {MARKETING_ASSET_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
              </Select>
            </label>
            <label className="marketing-control marketing-control--file" title={`JPG, PNG, WebP, AVIF, or GIF · up to ${MAX_FILE_BYTES / 1024 / 1024} MB each · ${MAX_UPLOAD_COUNT} images and ${MAX_BATCH_BYTES / 1024 / 1024} MB per batch`}>
              <span className="sr-only" id="marketing-upload-help">JPG, PNG, WebP, AVIF, or GIF. Up to {MAX_FILE_BYTES / 1024 / 1024} MB each, {MAX_UPLOAD_COUNT} images and {MAX_BATCH_BYTES / 1024 / 1024} MB per batch.</span>
              <input name="files" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple required aria-label="Choose images to upload" aria-describedby="marketing-upload-help" />
            </label>
            <button type="submit" className="marketing-primary-button" disabled={busy} aria-label={busy && navigation.formData?.get("intent") === "upload-marketing-assets" ? "Uploading assets" : "Upload assets"}>
              <Upload size={16} aria-hidden="true" />{busy && navigation.formData?.get("intent") === "upload-marketing-assets" ? "Uploading" : "Upload"}
            </button>
          </Form>
          <div className="marketing-library__filters">
            <label className="marketing-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search assets</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search" />
            </label>
            <Select id="marketing-category-filter" aria-label="Filter by asset type" value={categoryFilter} onChange={(event) => setCategoryFilter(event.currentTarget.value)}>
              <option value="all">All types</option>
              {MARKETING_ASSET_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
            </Select>
          </div>
          {assets.length ? (
            <Form method="post" className="marketing-library__bulk-form" onSubmit={(event) => {
              if (!window.confirm(`Permanently delete ${selectedIds.length} marketing asset${selectedIds.length === 1 ? "" : "s"}?`)) event.preventDefault();
              else setSelectedIds([]);
            }}>
              <input type="hidden" name="intent" value="delete-marketing-assets" />
              {selectedIds.map((id) => <input key={id} type="hidden" name="publicIds" value={id} />)}
              <button type="button" className="marketing-text-button" onClick={toggleVisibleAssets} disabled={!filteredAssets.length} aria-label={filteredAssets.length && filteredAssets.every((asset) => selectedIds.includes(asset.public_id)) ? "Clear visible selection" : "Select all visible assets"}>
                {filteredAssets.length && filteredAssets.every((asset) => selectedIds.includes(asset.public_id)) ? "Clear" : "Select"}
              </button>
              <button type="submit" className="marketing-delete-button" disabled={!selectedIds.length || busy} aria-label="Delete selected assets">
                <Trash2 size={15} aria-hidden="true" />Delete
              </button>
            </Form>
          ) : null}
        </div>

        <section className="marketing-library" aria-labelledby="marketing-library-title">
          <h2 id="marketing-library-title" className="sr-only">Asset library</h2>
          {assets.length ? (
            filteredAssets.length ? (
                <div className="marketing-asset-grid">
                  {filteredAssets.map((asset) => {
                    const category = assetCategory(asset);
                    const title = titleForAsset(asset);
                    return (
                      <article className="marketing-asset-card" key={asset.public_id}>
                        <div className="marketing-asset-card__preview">
                          <button
                            type="button"
                            className="marketing-asset-card__open"
                            onClick={() => setLightboxAsset(asset)}
                            aria-label={`Open image preview: ${title}`}
                            aria-haspopup="dialog"
                          >
                            <img src={optimizeCloudinaryUrl(asset.secure_url)} alt="" loading="lazy" decoding="async" width={asset.width || undefined} height={asset.height || undefined} />
                          </button>
                          <span className="marketing-asset-card__type" aria-hidden="true">{categoryLabels[category]}</span>
                          <label className="marketing-asset-card__select">
                            <input type="checkbox" checked={selectedIds.includes(asset.public_id)} onChange={() => toggleAsset(asset.public_id)} aria-label={`Select ${title}`} />
                          </label>
                        </div>
                        <div className="marketing-asset-card__body">
                          <h3 title={title}>{title}</h3>
                          <p>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "Image"} <span aria-hidden="true">·</span> {formatBytes(asset.bytes)}</p>
                          <div className="marketing-asset-card__actions">
                            <button type="button" onClick={() => setEditAsset(asset)} className="marketing-edit-button" aria-label={`Edit details for ${title}`} title={`Edit details for ${title}`}>
                              <Pencil size={14} aria-hidden="true" /><span className="marketing-action-label">Edit</span>
                            </button>
                            <button type="button" onClick={() => void copyAssetUrl(asset)} className="marketing-copy-button" aria-label={copiedId === asset.public_id ? "Link copied" : `Copy link for ${title}`} title={copiedId === asset.public_id ? "Link copied" : `Copy link for ${title}`}>
                              {copiedId === asset.public_id ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                              <span className="marketing-action-label">{copiedId === asset.public_id ? "Copied" : "Copy link"}</span>
                            </button>
                            <a href={attachmentUrl(asset.secure_url)} target="_blank" rel="noreferrer" className="marketing-download-link" aria-label={`Download ${title}`} title={`Download ${title}`}>
                              <ArrowDownToLine size={15} aria-hidden="true" /><span className="marketing-action-label">Download</span>
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="marketing-library__empty"><Search size={24} aria-hidden="true" /><h3>No assets match those filters</h3><p>Clear the search or choose another asset type.</p></div>
              )
          ) : (
            <div className="marketing-library__empty"><FileImage size={25} aria-hidden="true" /><h3>Your library is ready</h3><p>Upload a logo, banner, or post to see its preview here.</p></div>
          )}
        </section>
        {editAsset ? (
          <dialog
            ref={editDialogRef}
            className="marketing-edit-dialog"
            aria-labelledby="marketing-edit-title"
            onClose={() => setEditAsset(null)}
            onClick={(event) => {
              if (event.target === event.currentTarget) event.currentTarget.close();
            }}
          >
            <div className="marketing-edit-dialog__surface">
              <header className="marketing-edit-dialog__header">
                <div>
                  <p className="marketing-content-eyebrow">Marketing content</p>
                  <h2 id="marketing-edit-title">Edit asset details</h2>
                  <p>Update the title and asset type. The image link will stay the same.</p>
                </div>
                <button type="button" className="marketing-lightbox__close" onClick={() => editDialogRef.current?.close()} aria-label="Close asset editor">
                  <X size={21} aria-hidden="true" />
                </button>
              </header>
              <Form method="post" key={editAsset.public_id} className="marketing-edit-form">
                <input type="hidden" name="intent" value="update-marketing-asset" />
                <input type="hidden" name="publicId" value={editAsset.public_id} />
                {actionData && "error" in actionData && "errorPublicId" in actionData && actionData.errorPublicId === editAsset.public_id
                  ? <p className="marketing-content-notice marketing-content-notice--error" role="alert">{actionData.error}</p>
                  : null}
                <label className="marketing-upload-field" htmlFor="marketing-edit-title-input">
                  <span>Title</span>
                  <input
                    ref={editTitleRef}
                    id="marketing-edit-title-input"
                    name="title"
                    type="text"
                    defaultValue={titleForAsset(editAsset)}
                    maxLength={120}
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="marketing-upload-field" htmlFor="marketing-edit-category">
                  <span>Asset type</span>
                  <Select id="marketing-edit-category" name="category" defaultValue={assetCategory(editAsset)} required>
                    {MARKETING_ASSET_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
                  </Select>
                </label>
                <footer className="marketing-edit-form__actions">
                  <button type="button" className="marketing-text-button" onClick={() => editDialogRef.current?.close()} disabled={busy}>Cancel</button>
                  <button type="submit" className="marketing-primary-button" disabled={busy}>
                    <Check size={16} aria-hidden="true" />{busy && navigation.formData?.get("intent") === "update-marketing-asset" ? "Saving…" : "Save changes"}
                  </button>
                </footer>
              </Form>
            </div>
          </dialog>
        ) : null}
        {lightboxAsset ? (
          <dialog
            ref={lightboxDialogRef}
            className="marketing-lightbox"
            aria-labelledby="marketing-lightbox-title"
            aria-describedby="marketing-lightbox-details"
            onClose={() => setLightboxAsset(null)}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeLightbox();
            }}
          >
            <div className="marketing-lightbox__surface">
              <header className="marketing-lightbox__header">
                <div>
                  <p className="marketing-lightbox__category">{categoryLabels[assetCategory(lightboxAsset)]}</p>
                  <h2 id="marketing-lightbox-title">{titleForAsset(lightboxAsset)}</h2>
                  <p id="marketing-lightbox-details">
                    {lightboxAsset.width && lightboxAsset.height ? `${lightboxAsset.width} × ${lightboxAsset.height}` : "Image"}
                    <span aria-hidden="true"> · </span>{formatBytes(lightboxAsset.bytes)}
                  </p>
                </div>
                <button type="button" className="marketing-lightbox__close" onClick={closeLightbox} aria-label="Close image preview">
                  <X size={21} aria-hidden="true" />
                </button>
              </header>
              <div className="marketing-lightbox__image-stage">
                <img src={lightboxAsset.secure_url} alt={titleForAsset(lightboxAsset)} />
              </div>
              <footer className="marketing-lightbox__footer">
                <span className="marketing-lightbox__copy-status" aria-live="polite">
                  {copyError ? "Could not copy the image link." : copiedId === lightboxAsset.public_id ? "Image link copied." : ""}
                </span>
                <button type="button" onClick={() => void copyAssetUrl(lightboxAsset)} className="marketing-copy-button marketing-lightbox__action">
                  {copiedId === lightboxAsset.public_id ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  {copiedId === lightboxAsset.public_id ? "Copied" : "Copy link"}
                </button>
                <a href={attachmentUrl(lightboxAsset.secure_url)} target="_blank" rel="noreferrer" className="marketing-download-link marketing-lightbox__action">
                  <ArrowDownToLine size={16} aria-hidden="true" />Download original
                </a>
              </footer>
            </div>
          </dialog>
        ) : null}
      </main>
    </AdminPanelShell>
  );
}

function titleForAsset(asset: CloudinaryImageResource) {
  const savedTitleValue: unknown = asset.context?.custom?.marketing_title;
  const savedTitle = typeof savedTitleValue === "string" ? savedTitleValue.trim() : "";
  if (savedTitle) return savedTitle;

  const assetId = asset.public_id.split("/").at(-1) || asset.public_id;
  const knownTitle = knownAssetTitles[assetId];
  if (knownTitle) return knownTitle;

  const readableName = (asset.original_filename || assetId).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return readableName || `${categoryLabels[categoryFromPublicId(asset.public_id)]} asset`;
}

function assetCategory(asset: CloudinaryImageResource): MarketingAssetCategory {
  const savedCategory: unknown = asset.context?.custom?.marketing_category;
  if (MARKETING_ASSET_CATEGORIES.includes(savedCategory as MarketingAssetCategory)) return savedCategory as MarketingAssetCategory;
  return categoryFromPublicId(asset.public_id);
}

function categoryFromPublicId(publicId: string): MarketingAssetCategory {
  const category = publicId.split("/")[2];
  return MARKETING_ASSET_CATEGORIES.includes(category as MarketingAssetCategory) ? category as MarketingAssetCategory : "other";
}

function attachmentUrl(url: string) {
  return url.replace("/upload/", "/upload/fl_attachment/");
}

function formatBytes(bytes: number) {
  if (!bytes) return "Size unavailable";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
