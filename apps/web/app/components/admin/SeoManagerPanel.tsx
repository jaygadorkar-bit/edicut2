import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Form, Link } from "react-router";
import { Select } from "../Select";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleAlert,
  ExternalLink,
  FileSearch,
  Gauge,
  Globe2,
  Link2,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";

/** Current metadata defaults provided by the page catalog. */
export type SeoPageDefaults = {
  title: string;
  description: string;
  canonicalUrl: string;
  indexable: boolean;
  focusKeyword?: string;
  socialTitle?: string;
  socialDescription?: string;
  socialImageUrl?: string;
};

/** Explicit metadata overrides; omitted fields inherit the corresponding page default. */
export type SeoPageMetadataOverrides = Partial<SeoPageDefaults>;

/** An editable page plus its catalog defaults and persisted metadata overrides. */
export type SeoPageRecord = {
  id: string;
  path: string;
  label: string;
  defaults: SeoPageDefaults;
  overrides: SeoPageMetadataOverrides;
};

/** A result from the site's SEO health scan. */
export type SeoHealthFinding = {
  id: string;
  severity: "error" | "warning" | "notice";
  title: string;
  detail: string;
  pagePath?: string;
  recommendation?: string;
};

/** A configured server-side redirect. */
export type SeoRedirectRecord = {
  id: string;
  sourcePath: string;
  destinationUrl: string;
  statusCode: 301 | 302 | 307 | 308;
  enabled: boolean;
};

/** A not-found request aggregate, typically sourced from server logs. */
export type SeoNotFoundRecord = {
  path: string;
  occurrences: number;
  lastSeenAt?: string;
  referrer?: string;
};

export type SearchConsoleMetric = { current: number; previous?: number };
export type SearchConsoleListItem = { label: string; clicks?: number; impressions?: number; position?: number };

/** Search Console connection state and data, supplied by the route loader. */
export type SeoSearchConsoleSnapshot = {
  status: "connected" | "not-connected" | "unavailable";
  propertyUrl?: string;
  lastSyncedAt?: string;
  clicks?: SearchConsoleMetric;
  impressions?: SearchConsoleMetric;
  averagePosition?: SearchConsoleMetric;
  queries?: SearchConsoleListItem[];
  pages?: SearchConsoleListItem[];
  unavailableReason?: string;
};

/** A real internal link opportunity calculated from the site's pages/content. */
export type SeoInternalLinkSuggestion = {
  id: string;
  sourcePath: string;
  targetPath: string;
  anchorText: string;
  reason: string;
};

/** Site-wide defaults exposed in the Overview section. */
export type SeoGlobalSettings = {
  titleTemplate: string;
  defaultDescription: string;
  allowIndexing: boolean;
};

/** Route action intent values accepted by this panel's React Router Forms. */
export type SeoManagerActionIntent =
  | "run-audit"
  | "save-global-settings"
  | "save-page-metadata"
  | "delete-page-metadata"
  | "create-redirect"
  | "update-redirect"
  | "delete-redirect";

/** Form fields posted by save-page-metadata. Values arrive as strings in FormData. */
export type SaveSeoPageMetadataPayload = {
  intent: "save-page-metadata";
  pageId: string;
  title: string;
  description: string;
  canonicalUrl: string;
  indexable: "on" | undefined;
  focusKeyword: string;
  socialTitle: string;
  socialDescription: string;
  socialImageUrl: string;
};

/** Form fields posted by create-redirect. Validate statusCode and paths server-side. */
export type CreateSeoRedirectPayload = {
  intent: "create-redirect";
  sourcePath: string;
  destinationUrl: string;
  statusCode: "301" | "302" | "307" | "308";
};

export type SaveSeoGlobalSettingsPayload = {
  intent: "save-global-settings";
  titleTemplate: string;
  defaultDescription: string;
  allowIndexing: "on" | undefined;
};

/** All intent-specific FormData shapes emitted by this component. */
export type SeoManagerActionPayload =
  | { intent: "run-audit" }
  | SaveSeoGlobalSettingsPayload
  | SaveSeoPageMetadataPayload
  | CreateSeoRedirectPayload
  | { intent: "update-redirect"; redirectId: string; enabled: "on" | "off" }
  | { intent: "delete-redirect"; redirectId: string }
  | { intent: "delete-page-metadata"; pageId: string };

export type SeoManagerFeedback = { kind: "success" | "error"; message: string };

export type SeoManagerPanelProps = {
  pages: SeoPageRecord[];
  findings: SeoHealthFinding[];
  redirects: SeoRedirectRecord[];
  notFoundPaths: SeoNotFoundRecord[];
  searchConsole: SeoSearchConsoleSnapshot;
  internalLinkSuggestions: SeoInternalLinkSuggestion[];
  globalSettings?: SeoGlobalSettings;
  lastAuditAt?: string;
  feedback?: SeoManagerFeedback;
  isSubmitting?: boolean;
};

type Section = "overview" | "pages" | "health" | "redirects" | "search-console" | "internal-links";

const sections: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "pages", label: "Pages", icon: FileSearch },
  { id: "health", label: "Health checks", icon: ListChecks },
  { id: "redirects", label: "Redirects / 404s", icon: ArrowUpRight },
  { id: "search-console", label: "Search Console", icon: BarChart3 },
  { id: "internal-links", label: "Internal links", icon: Link2 },
];

const cardClass = "neo-workspace__panel rounded-[20px] p-4 sm:p-5";
const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-[#d9e2eb] bg-white px-3 py-2.5 text-sm text-[#172838] outline-none transition focus-visible:border-[#7161df] focus-visible:ring-2 focus-visible:ring-[#7161df]/20 disabled:cursor-not-allowed disabled:bg-[#f3f6f9]";
const primaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#be1935] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#a9152d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#be1935] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d9e2eb] bg-white px-3.5 py-2 text-sm font-bold text-[#34495d] transition hover:bg-[#f5f7fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7161df] disabled:cursor-not-allowed disabled:opacity-60";
const searchConsoleUrl = "https://search.google.com/search-console?resource_id=sc-domain%3Aedicut.com";

function formatMetric(value: number | undefined) {
  return value === undefined ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
}

function dateLabel(value: string | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeInternalPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

function MetricCard({ label, value, previous, icon: Icon }: {
  label: string;
  value: number | undefined;
  previous?: number;
  icon: LucideIcon;
}) {
  const delta = value !== undefined && previous !== undefined ? value - previous : undefined;
  return (
    <article className="neo-workspace__stat-card rounded-[17px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-workspace__eyebrow">{label}</p>
          <p className="neo-workspace__stat-value mt-2">{formatMetric(value)}</p>
        </div>
        <span className="neo-icon-badge neo-workspace__stat-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" aria-hidden="true"><Icon size={18} /></span>
      </div>
      <p className="neo-workspace__stat-hint mt-3">
        {delta === undefined ? "Latest available data" : <>{delta >= 0 ? <ArrowUpRight className="mr-1 inline" size={13} aria-hidden="true" /> : <ArrowDownRight className="mr-1 inline" size={13} aria-hidden="true" />}{formatMetric(Math.abs(delta))} compared with previous period</>}
      </p>
    </article>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[#d3dde7] bg-[#f8fafc] px-4 py-6 text-center text-sm leading-6 text-[#687583]">{children}</p>;
}

export function SeoManagerPanel({
  pages,
  findings,
  redirects,
  notFoundPaths,
  searchConsole,
  internalLinkSuggestions,
  globalSettings,
  lastAuditAt,
  feedback,
  isSubmitting = false,
}: SeoManagerPanelProps) {
  const [section, setSection] = useState<Section>("overview");
  const [redirectSourcePath, setRedirectSourcePath] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [selectedPageId, setSelectedPageId] = useState(pages[0]?.id ?? "");
  const page = pages.find((item) => item.id === selectedPageId) ?? pages[0];
  const effectivePage = page ? {
    title: page.overrides.title ?? page.defaults.title,
    description: page.overrides.description ?? page.defaults.description,
    canonicalUrl: page.overrides.canonicalUrl ?? page.defaults.canonicalUrl,
    indexable: page.overrides.indexable ?? page.defaults.indexable,
    socialTitle: page.overrides.socialTitle ?? page.overrides.title ?? page.defaults.socialTitle ?? page.defaults.title,
    socialDescription: page.overrides.socialDescription ?? page.overrides.description ?? page.defaults.socialDescription ?? page.defaults.description,
    socialImageUrl: page.overrides.socialImageUrl ?? page.defaults.socialImageUrl,
  } : undefined;
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const notices = findings.filter((item) => item.severity === "notice").length;
  const hasAudit = Boolean(lastAuditAt);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="neo-workspace__eyebrow flex items-center gap-2"><Globe2 size={14} aria-hidden="true" /> SITE VISIBILITY</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#172838] sm:text-3xl">SEO</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#687583]">Manage search appearance, redirects, and internal links. Health checks fetch the live public site at https://edicut.com when you run them.</p>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="run-audit" />
          <button className={primaryButtonClass} disabled={isSubmitting}><RefreshCw size={16} aria-hidden="true" />{isSubmitting ? "Working…" : "Run health check"}</button>
        </Form>
      </header>

      {feedback ? <p role={feedback.kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.message}</p> : null}

      <nav aria-label="SEO sections" className="rounded-2xl border border-[#e2e8ef] bg-white p-1.5 shadow-sm">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="SEO tools">
          {sections.map(({ id, label, icon: Icon }, index) => (
            <button key={id} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={`seo-tab-${id}`} aria-selected={section === id} aria-controls="seo-panel-content" tabIndex={section === id ? 0 : -1}
              onKeyDown={(event) => {
                const current = sections.findIndex((item) => item.id === id);
                const next = event.key === "ArrowRight" ? (current + 1) % sections.length
                  : event.key === "ArrowLeft" ? (current - 1 + sections.length) % sections.length
                    : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : -1;
                if (next >= 0) {
                  event.preventDefault();
                  const target = sections[next];
                  if (target) {
                    setSection(target.id);
                    tabRefs.current[next]?.focus();
                  }
                }
              }}
              onClick={() => setSection(id)} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7161df] sm:flex-none sm:px-3 sm:text-sm ${section === id ? "bg-[#172838] text-white shadow-sm" : "text-[#5f6f7f] hover:bg-[#f1f5f8] hover:text-[#172838]"}`}>
              <Icon size={16} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel" id="seo-panel-content" aria-labelledby={`seo-tab-${section}`} className="min-w-0">
        {section === "overview" ? <section className="space-y-5" aria-label="SEO overview">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Pages managed" value={pages.length} icon={FileSearch} />
            <MetricCard label="Critical issues" value={hasAudit ? errors : undefined} icon={CircleAlert} />
            <MetricCard label="Warnings" value={hasAudit ? warnings : undefined} icon={ShieldCheck} />
            <MetricCard label="Active redirects" value={redirects.filter((redirect) => redirect.enabled).length} icon={ArrowUpRight} />
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
            <section className={cardClass} aria-labelledby="seo-health-summary-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 id="seo-health-summary-title" className="text-lg font-black text-[#172838]">Site health</h2><p className="mt-1 text-sm text-[#687583]">Latest technical scan and outstanding findings.</p></div>
                <span className="rounded-full bg-[#f1f5f8] px-3 py-1 text-xs font-bold text-[#5f6f7f]">{lastAuditAt ? `Scanned ${dateLabel(lastAuditAt)}` : "No scan recorded"}</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[{ label: "Errors", count: errors, style: "bg-red-50 text-red-800" }, { label: "Warnings", count: warnings, style: "bg-amber-50 text-amber-900" }, { label: "Notices", count: notices, style: "bg-blue-50 text-blue-800" }].map((item) => <div key={item.label} className={`rounded-xl px-4 py-3 ${item.style}`}><p className="text-xs font-bold uppercase tracking-wide">{item.label}</p><p className="mt-1 text-2xl font-black">{hasAudit ? item.count : "—"}</p></div>)}
              </div>
              <div className="mt-4">{findings.length ? <ul className="divide-y divide-[#e8edf2]">{findings.slice(0, 4).map((finding) => <li key={finding.id} className="flex flex-wrap items-start justify-between gap-2 py-3"><div className="min-w-0"><p className="text-sm font-bold text-[#24384b]">{finding.title}</p><p className="mt-1 text-xs leading-5 text-[#6b7785]">{finding.pagePath ? `${finding.pagePath} · ` : ""}{finding.detail}</p></div><span className="shrink-0 rounded-full bg-[#f5f7fa] px-2.5 py-1 text-[11px] font-bold capitalize text-[#5f6f7f]">{finding.severity}</span></li>)}</ul> : <EmptyState>No findings are available. Run a health check to scan the site.</EmptyState>}</div>
              {findings.length > 4 ? <button type="button" onClick={() => setSection("health")} className="mt-3 text-sm font-bold text-[#5b4bce] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[#7161df]">View all {findings.length} findings</button> : null}
            </section>
            <section className={cardClass} aria-labelledby="seo-settings-title">
              <div className="flex items-center gap-2"><Settings2 size={18} className="text-[#6557d8]" aria-hidden="true" /><h2 id="seo-settings-title" className="text-lg font-black text-[#172838]">Site-wide defaults</h2></div>
              <p className="mt-1 text-sm leading-6 text-[#687583]">Set fallback search metadata and control whether crawlers may index the site.</p>
              <Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="save-global-settings" />
                <label className="block text-sm font-bold text-[#34495d]">Title template<input className={fieldClass} name="titleTemplate" maxLength={100} aria-describedby="seo-title-template-guidance" defaultValue={globalSettings?.titleTemplate ?? ""} placeholder="%s | EdiCut" disabled={isSubmitting} /><span id="seo-title-template-guidance" className="mt-1 block text-xs font-normal text-[#687583]">Use %s where the page title should appear.</span></label>
                <label className="block text-sm font-bold text-[#34495d]">Default description<textarea className={fieldClass} name="defaultDescription" rows={3} maxLength={320} defaultValue={globalSettings?.defaultDescription ?? ""} placeholder="Used when a page has no custom description." disabled={isSubmitting} /><span className="mt-1 block text-xs font-normal text-[#687583]">Used when a route has no page-specific description.</span></label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#f6f8fa] p-3 text-sm leading-5 text-[#34495d]"><input type="checkbox" name="allowIndexing" defaultChecked={globalSettings?.allowIndexing ?? true} className="mt-0.5 h-4 w-4 accent-[#6557d8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7161df]" disabled={isSubmitting} /><span><strong className="block">Allow search engine indexing</strong><span className="text-xs text-[#687583]">When disabled, the site's no-index rule should be applied.</span></span></label>
                <button className={secondaryButtonClass} disabled={isSubmitting}><Check size={15} aria-hidden="true" />Save defaults</button>
              </Form>
            </section>
          </div>
        </section> : null}

        {section === "pages" ? <section className="space-y-5" aria-label="Page metadata">
          {!page ? <section className={cardClass}><h2 className="text-lg font-black text-[#172838]">Page metadata</h2><div className="mt-4"><EmptyState>No pages are available to edit yet.</EmptyState></div></section> : <>
            <div className={cardClass}>
              <label className="block max-w-xl text-sm font-bold text-[#34495d]" htmlFor="seo-page-select">Choose a page</label>
              <Select id="seo-page-select" className={fieldClass} value={page.id} onChange={(event) => setSelectedPageId(event.currentTarget.value)}>
                {pages.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.path}</option>)}
              </Select>
            </div>
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.75fr)]">
              <section className={cardClass} aria-labelledby="seo-page-editor-title">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="seo-page-editor-title" className="text-lg font-black text-[#172838]">Search metadata</h2><p className="mt-1 text-sm text-[#687583]">Edit what search engines and social platforms receive for this page.</p></div><code className="rounded-lg bg-[#f1f5f8] px-2.5 py-1.5 text-xs text-[#40566a]">{page.path}</code></div>
                <Form key={page.id} method="post" className="mt-5 space-y-4">
                  <input type="hidden" name="intent" value="save-page-metadata" /><input type="hidden" name="pageId" value={page.id} />
                  <label className="block text-sm font-bold text-[#34495d]">SEO title<input className={fieldClass} name="title" defaultValue={page.overrides.title ?? ""} maxLength={70} aria-describedby="seo-title-guidance" disabled={isSubmitting} /><span id="seo-title-guidance" className="mt-1 block text-xs font-normal text-[#687583]">{page.overrides.title?.length ?? 0} of 70 characters · Leave blank to use the page’s current title{page.defaults.title ? `: ${page.defaults.title}` : ""}.</span></label>
                  <label className="block text-sm font-bold text-[#34495d]">Meta description<textarea className={fieldClass} name="description" defaultValue={page.overrides.description ?? ""} rows={3} maxLength={320} aria-describedby="seo-description-guidance" disabled={isSubmitting} /><span id="seo-description-guidance" className="mt-1 block text-xs font-normal text-[#687583]">{page.overrides.description?.length ?? 0} of 320 characters · Leave blank to use the page’s current description{page.defaults.description ? `: ${page.defaults.description}` : ""}.</span></label>
                  <label className="block text-sm font-bold text-[#34495d]">Canonical URL<input className={fieldClass} type="url" name="canonicalUrl" defaultValue={page.overrides.canonicalUrl ?? ""} maxLength={2048} aria-describedby="seo-canonical-guidance" disabled={isSubmitting} /><span id="seo-canonical-guidance" className="mt-1 block text-xs font-normal text-[#687583]">Leave blank to use the page’s current canonical URL{page.defaults.canonicalUrl ? `: ${page.defaults.canonicalUrl}` : ""}.</span></label>
                  <label className="block text-sm font-bold text-[#34495d]">Focus keyword<input className={fieldClass} name="focusKeyword" defaultValue={page.overrides.focusKeyword ?? ""} maxLength={100} aria-describedby="seo-keyword-guidance" disabled={isSubmitting} /><span id="seo-keyword-guidance" className="mt-1 block text-xs font-normal text-[#687583]">Leave blank to use the page’s current value{page.defaults.focusKeyword ? `: ${page.defaults.focusKeyword}` : ""}.</span></label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[#f6f8fa] p-3 text-sm font-bold text-[#34495d]"><input type="checkbox" name="indexable" defaultChecked={effectivePage?.indexable ?? false} className="h-4 w-4 accent-[#6557d8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7161df]" disabled={isSubmitting} />Allow this page to appear in search results</label>
                  <fieldset className="space-y-4 rounded-xl border border-[#e4eaf0] p-4"><legend className="px-1 text-sm font-black text-[#24384b]">Social sharing metadata</legend>
                    <label className="block text-sm font-bold text-[#34495d]">Social title<input className={fieldClass} name="socialTitle" defaultValue={page.overrides.socialTitle ?? ""} maxLength={120} aria-describedby="seo-social-title-guidance" disabled={isSubmitting} /><span id="seo-social-title-guidance" className="mt-1 block text-xs font-normal text-[#687583]">Leave blank to use the page’s current social title.</span></label>
                    <label className="block text-sm font-bold text-[#34495d]">Social description<textarea className={fieldClass} name="socialDescription" defaultValue={page.overrides.socialDescription ?? ""} rows={2} maxLength={320} aria-describedby="seo-social-description-guidance" disabled={isSubmitting} /><span id="seo-social-description-guidance" className="mt-1 block text-xs font-normal text-[#687583]">Leave blank to use the page’s current social description.</span></label>
                    <label className="block text-sm font-bold text-[#34495d]">Social image URL<input className={fieldClass} type="url" name="socialImageUrl" defaultValue={page.overrides.socialImageUrl ?? ""} maxLength={2048} aria-describedby="seo-social-image-guidance" disabled={isSubmitting} /><span id="seo-social-image-guidance" className="mt-1 block text-xs font-normal text-[#687583]">Leave blank to use the page’s current social image.</span></label>
                  </fieldset>
                  <div className="flex flex-wrap gap-2"><button className={primaryButtonClass} disabled={isSubmitting}><Check size={15} aria-hidden="true" />Save page metadata</button></div>
                </Form>
                <Form method="post" className="mt-2"><input type="hidden" name="intent" value="delete-page-metadata" /><input type="hidden" name="pageId" value={page.id} /><button type="submit" className={secondaryButtonClass} disabled={isSubmitting}><Trash2 size={15} aria-hidden="true" />Reset to page defaults</button></Form>
              </section>
              <div className="space-y-5">
                <section className={cardClass} aria-labelledby="seo-search-preview-title"><div className="flex items-center gap-2"><Search size={17} className="text-[#6557d8]" aria-hidden="true" /><h2 id="seo-search-preview-title" className="text-base font-black text-[#172838]">Search preview</h2></div><div className="mt-4 rounded-xl border border-[#e2e8ef] bg-white p-4"><p className="truncate text-xs text-[#51723f]">{effectivePage?.canonicalUrl || `Current page URL · ${page.path}`}</p><p className="mt-1 line-clamp-2 text-lg leading-6 text-[#1a0dab]">{effectivePage?.title || "Uses the page’s current title"}</p><p className="mt-1 line-clamp-3 text-sm leading-5 text-[#4d5156]">{effectivePage?.description || "Uses the page’s current description"}</p></div></section>
                <section className={cardClass} aria-labelledby="seo-social-preview-title"><div className="flex items-center gap-2"><ExternalLink size={17} className="text-[#6557d8]" aria-hidden="true" /><h2 id="seo-social-preview-title" className="text-base font-black text-[#172838]">Social preview</h2></div><div className="mt-4 overflow-hidden rounded-xl border border-[#e2e8ef] bg-white"><div className="flex aspect-[1.91/1] items-center justify-center bg-[#f2f5f8] text-sm text-[#7a8794]">{effectivePage?.socialImageUrl ? <img src={effectivePage.socialImageUrl} alt="Social sharing preview" className="h-full w-full object-cover" /> : "Uses the page’s current social image"}</div><div className="p-3"><p className="text-xs uppercase tracking-wide text-[#718090]">{effectivePage?.canonicalUrl || `Current page URL · ${page.path}`}</p><p className="mt-1 line-clamp-2 text-sm font-bold text-[#24384b]">{effectivePage?.socialTitle || "Uses the page’s current social title"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#687583]">{effectivePage?.socialDescription || "Uses the page’s current social description"}</p></div></div></section>
              </div>
            </div>
          </>}
        </section> : null}

        {section === "health" ? <section className={cardClass} aria-label="SEO health checks"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black text-[#172838]">Health checks</h2><p className="mt-1 text-sm text-[#687583]">Review crawlability and metadata findings from the latest scan.</p></div><span className="rounded-full bg-[#f1f5f8] px-3 py-1 text-xs font-bold text-[#5f6f7f]">{findings.length} findings</span></div><div className="mt-4">{findings.length ? <ul className="divide-y divide-[#e8edf2]">{findings.map((finding) => <li key={finding.id} className="grid gap-2 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start"><span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${finding.severity === "error" ? "bg-red-50 text-red-700" : finding.severity === "warning" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`} aria-hidden="true"><CircleAlert size={17} /></span><div className="min-w-0"><h3 className="text-sm font-black text-[#24384b]">{finding.title}</h3><p className="mt-1 text-sm leading-6 text-[#687583]">{finding.detail}</p>{finding.recommendation ? <p className="mt-2 text-sm leading-6 text-[#34495d]"><strong>Recommended:</strong> {finding.recommendation}</p> : null}</div><span className="text-xs font-bold capitalize text-[#657384]">{finding.pagePath ? `${finding.severity} · ${finding.pagePath}` : finding.severity}</span></li>)}</ul> : <EmptyState>No health findings are available. Run a health check to review pages.</EmptyState>}</div></section> : null}

        {section === "redirects" ? <section className="space-y-5" aria-label="Redirects and not-found requests">
          <section className={cardClass} aria-labelledby="seo-add-redirect-title">
            <h2 id="seo-add-redirect-title" className="text-lg font-black text-[#172838]">Add redirect</h2>
            <p className="mt-1 text-sm text-[#687583]">Forward an old path to its current destination.</p>
            <Form method="post" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(130px,.7fr)_minmax(180px,1fr)_auto_auto] xl:items-end">
              <input type="hidden" name="intent" value="create-redirect" />
              <label className="block text-sm font-bold text-[#34495d]">From path<input className={fieldClass} name="sourcePath" value={redirectSourcePath} onChange={(event) => setRedirectSourcePath(event.currentTarget.value)} required pattern="/.*" placeholder="/old-page" maxLength={2048} disabled={isSubmitting} /></label>
              <label className="block text-sm font-bold text-[#34495d]">To URL<input className={fieldClass} name="destinationUrl" type="url" required placeholder="https://edicut.com/new-page" maxLength={2048} disabled={isSubmitting} /></label>
              <label className="block text-sm font-bold text-[#34495d]">Status<Select className={fieldClass} name="statusCode" defaultValue="301" disabled={isSubmitting}><option value="301">301 · Permanent</option><option value="302">302 · Temporary</option><option value="307">307 · Temporary</option><option value="308">308 · Permanent</option></Select></label>
              <button className={`${primaryButtonClass} mt-1`} disabled={isSubmitting}><Plus size={16} aria-hidden="true" />Add redirect</button>
            </Form>
          </section>
          <section className={cardClass} aria-labelledby="seo-redirect-list-title">
            <h2 id="seo-redirect-list-title" className="text-lg font-black text-[#172838]">Configured redirects</h2>
            <div className="mt-4">{redirects.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-[#e5ebf1] text-xs uppercase tracking-wide text-[#738190]"><tr><th className="px-3 py-3">From</th><th className="px-3 py-3">Destination</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-[#edf1f5]">{redirects.map((redirect) => <tr key={redirect.id}><td className="px-3 py-3 font-mono text-xs text-[#34495d]">{redirect.sourcePath}</td><td className="max-w-xs truncate px-3 py-3 text-[#34495d]">{redirect.destinationUrl}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${redirect.enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{redirect.statusCode} · {redirect.enabled ? "Active" : "Paused"}</span></td><td className="px-3 py-3"><div className="flex items-center gap-2"><Form method="post"><input type="hidden" name="intent" value="update-redirect" /><input type="hidden" name="redirectId" value={redirect.id} /><input type="hidden" name="enabled" value={redirect.enabled ? "off" : "on"} /><button className={secondaryButtonClass} disabled={isSubmitting}>{redirect.enabled ? "Pause" : "Enable"}</button></Form><Form method="post" onSubmit={(event) => { if (!window.confirm(`Delete redirect from ${redirect.sourcePath}?`)) event.preventDefault(); }}><input type="hidden" name="intent" value="delete-redirect" /><input type="hidden" name="redirectId" value={redirect.id} /><button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 px-3 text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-60" aria-label={`Delete redirect ${redirect.sourcePath}`} disabled={isSubmitting}><Trash2 size={16} aria-hidden="true" /></button></Form></div></td></tr>)}</tbody></table></div> : <EmptyState>No redirects have been configured.</EmptyState>}</div>
          </section>
          <section className={cardClass} aria-labelledby="seo-not-found-title">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="seo-not-found-title" className="text-lg font-black text-[#172838]">Not-found requests</h2><p className="mt-1 text-sm text-[#687583]">Review paths visitors or crawlers could not find.</p></div><span className="rounded-full bg-[#f1f5f8] px-3 py-1 text-xs font-bold text-[#5f6f7f]">{notFoundPaths.length} paths</span></div>
            <div className="mt-4">{notFoundPaths.length ? <ul className="divide-y divide-[#e8edf2]">{notFoundPaths.map((entry) => <li key={entry.path} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-all font-mono text-sm font-bold text-[#34495d]">{entry.path}</p><p className="mt-1 text-xs text-[#687583]">{entry.occurrences} requests · last seen {dateLabel(entry.lastSeenAt)}{entry.referrer ? ` · referred by ${entry.referrer}` : ""}</p></div><button type="button" className={secondaryButtonClass} onClick={() => setRedirectSourcePath(entry.path)} aria-label={`Use ${entry.path} as redirect source`}><ArrowUpRight size={15} aria-hidden="true" />Use as source</button></li>)}</ul> : <EmptyState>Request-level 404 tracking is not configured, so this list cannot report not-found requests.</EmptyState>}</div>
          </section>
        </section> : null}

        {section === "search-console" ? <section className="space-y-5" aria-label="Search Console">
          {searchConsole.status === "connected" ? <>
            <section className={`${cardClass} flex flex-wrap items-center justify-between gap-4`}><div><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700" aria-hidden="true"><Check size={18} /></span><h2 className="text-lg font-black text-[#172838]">Google Search Console connected</h2></div><p className="mt-2 text-sm text-[#687583]">{searchConsole.propertyUrl ?? "Property details unavailable"} · Last synced {dateLabel(searchConsole.lastSyncedAt)}</p></div><a href={searchConsoleUrl} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>Open property in Search Console<ExternalLink size={15} aria-hidden="true" /></a></section>
            <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Clicks" value={searchConsole.clicks?.current} previous={searchConsole.clicks?.previous} icon={ArrowUpRight} /><MetricCard label="Impressions" value={searchConsole.impressions?.current} previous={searchConsole.impressions?.previous} icon={BarChart3} /><MetricCard label="Average position" value={searchConsole.averagePosition?.current} previous={searchConsole.averagePosition?.previous} icon={Gauge} /></div>
            <div className="grid gap-5 xl:grid-cols-2">{([{ title: "Top search queries", rows: searchConsole.queries }, { title: "Top pages", rows: searchConsole.pages }] as const).map((group) => <section key={group.title} className={cardClass}><h2 className="text-lg font-black text-[#172838]">{group.title}</h2><div className="mt-4">{group.rows?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm"><thead className="border-b border-[#e5ebf1] text-xs uppercase tracking-wide text-[#738190]"><tr><th className="px-2 py-2">{group.title === "Top pages" ? "Page" : "Query"}</th><th className="px-2 py-2 text-right">Clicks</th><th className="px-2 py-2 text-right">Impressions</th><th className="px-2 py-2 text-right">Position</th></tr></thead><tbody className="divide-y divide-[#edf1f5]">{group.rows.map((item) => <tr key={item.label}><td className="max-w-[230px] truncate px-2 py-3 text-[#34495d]">{item.label}</td><td className="px-2 py-3 text-right">{formatMetric(item.clicks)}</td><td className="px-2 py-3 text-right">{formatMetric(item.impressions)}</td><td className="px-2 py-3 text-right">{formatMetric(item.position)}</td></tr>)}</tbody></table></div> : <EmptyState>No {group.title.toLowerCase()} data is available yet.</EmptyState>}</div></section>)}</div>
          </> : <section className={cardClass}><div className="mx-auto max-w-xl py-5 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eff0ff] text-[#6557d8]" aria-hidden="true">{searchConsole.status === "unavailable" ? <CircleAlert size={22} /> : <BarChart3 size={22} />}</span><h2 className="mt-4 text-xl font-black text-[#172838]">{searchConsole.status === "unavailable" ? "Search Console data unavailable" : "Search Console is not connected"}</h2><p className="mt-2 text-sm leading-6 text-[#687583]">{searchConsole.status === "unavailable" ? searchConsole.unavailableReason ?? "The connection could not be loaded. Open the property in Search Console to review access and data." : "Connect or manage EdiCut’s verified property in Google Search Console. Metrics will appear here after the route receives connected data."}</p><a href={searchConsoleUrl} target="_blank" rel="noopener noreferrer" className={`${searchConsole.status === "not-connected" ? primaryButtonClass : secondaryButtonClass} mt-5`}>Open EdiCut property in Search Console<ExternalLink size={15} aria-hidden="true" /></a></div></section>}
        </section> : null}

        {section === "internal-links" ? <section className={cardClass} aria-label="Internal link suggestions">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black text-[#172838]">Internal link opportunities</h2><p className="mt-1 text-sm text-[#687583]">Review suggestions and edit page content manually. Suggestions do not change published content.</p></div><span className="rounded-full bg-[#f1f5f8] px-3 py-1 text-xs font-bold text-[#5f6f7f]">{internalLinkSuggestions.length} suggestions</span></div>
          <div className="mt-4">{internalLinkSuggestions.length ? <ul className="divide-y divide-[#e8edf2]">{internalLinkSuggestions.map((suggestion) => <li key={suggestion.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-sm"><Link className="font-mono text-xs text-[#5f6f7f] underline underline-offset-4" to={safeInternalPath(suggestion.sourcePath)}>Source: {suggestion.sourcePath}</Link><ArrowUpRight size={14} className="text-[#8996a4]" aria-hidden="true" /><Link className="font-mono text-xs text-[#5f6f7f] underline underline-offset-4" to={safeInternalPath(suggestion.targetPath)}>Target: {suggestion.targetPath}</Link></div><p className="mt-1 text-sm font-bold text-[#24384b]">Suggested anchor: “{suggestion.anchorText}”</p><p className="mt-1 text-xs leading-5 text-[#687583]">{suggestion.reason}</p></div><span className="inline-flex items-center gap-1 text-xs font-bold text-[#5f6f7f]"><Link2 size={14} aria-hidden="true" />Review only</span></li>)}</ul> : <EmptyState>No internal link suggestions are available. Suggestions will appear when the site content analyzer finds relevant page relationships.</EmptyState>}</div>
        </section> : null}
      </div>
    </div>
  );
}
