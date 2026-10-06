import { useEffect, useRef, useState, type ReactNode } from "react";
import { CREATOR_PLATFORM_OPTIONS, OTHER_CREATOR_PLATFORM } from "../lib/client-intake";

export function IntakeField({ name, label, values, errors, hint, children, type = "text", required = true, maxLength = 2000, multiline = false, ...limits }: {
  name: string; label: string; values: Record<string, string>; errors?: Record<string, string>; hint?: string;
  children?: ReactNode; type?: string; required?: boolean; maxLength?: number; multiline?: boolean;
  min?: number | string; max?: number; step?: number;
}) {
  const id = `intake-${name}`;
  const input = { id, name, defaultValue: values[name] ?? "", required, "aria-invalid": Boolean(errors?.[name]), "aria-describedby": `${id}-help`,
    className: "neo-workspace__profile-input w-full min-w-0 rounded-xl px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-slate-500" };
  return <div className="min-w-0"><label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-800">{label}{!required ? <span className="ml-2 text-xs font-normal text-slate-500">Optional</span> : null}</label>
    {children ? <select {...input}>{children}</select> : multiline ? <textarea {...input} rows={4} maxLength={maxLength} /> : <input {...input} type={type} maxLength={maxLength} {...limits} />}
    <p id={`${id}-help`} className={`mt-2 text-xs leading-5 ${errors?.[name] ? "text-red-700" : "text-slate-600"}`}>{errors?.[name] || hint}</p>
  </div>;
}
export function IntakeErrors({ error, errors }: { error?: string; errors?: Record<string, string> }) {
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error || errors) summary.current?.focus(); }, [error, errors]);
  return error || errors ? <div ref={summary} className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert" tabIndex={-1}>
    <p className="font-bold">{error || "Check these details before continuing."}</p>
    {errors ? <ul className="mt-2 list-inside list-disc">{Object.entries(errors).map(([field, message]) => <li key={field}><a className="underline" href={`#intake-${field}`}>{message}</a></li>)}</ul> : null}
  </div> : null;
}

export function CreatorPlatformField({ values, errors, hint }: {
  values: Record<string, string>;
  errors?: Record<string, string>;
  hint?: string;
}) {
  const savedPlatform = values.platform ?? "";
  const savedChoice = values.platformChoice ?? "";
  const initialChoice = savedChoice === OTHER_CREATOR_PLATFORM || CREATOR_PLATFORM_OPTIONS.includes(savedChoice as typeof CREATOR_PLATFORM_OPTIONS[number])
    ? savedChoice
    : CREATOR_PLATFORM_OPTIONS.includes(savedPlatform as typeof CREATOR_PLATFORM_OPTIONS[number])
      ? savedPlatform
      : savedPlatform
        ? OTHER_CREATOR_PLATFORM
        : "";
  const [choice, setChoice] = useState(initialChoice);
  const [customPlatform, setCustomPlatform] = useState(values.customPlatform ?? (initialChoice === OTHER_CREATOR_PLATFORM ? savedPlatform : ""));
  const isCustom = choice === OTHER_CREATOR_PLATFORM;
  const error = errors?.platform;
  const selectId = "intake-platform";
  const customId = "intake-custom-platform";
  const helpId = `${selectId}-help`;
  const inputClassName = "neo-workspace__profile-input h-12 w-full min-w-0 rounded-xl px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-slate-500";

  return <div className="min-w-0">
    <label htmlFor={selectId} className="mb-2 block text-sm font-bold text-slate-800">Primary platform</label>
    <div className="relative">
      <select
        id={selectId}
        name="platformChoice"
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={helpId}
        className="neo-workspace__profile-input neo-workspace__profile-select h-12 w-full min-w-0 rounded-xl py-3 pl-4 pr-11 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
      >
        <option value="" disabled>Choose a platform</option>
        {CREATOR_PLATFORM_OPTIONS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
        <option value={OTHER_CREATOR_PLATFORM}>Other</option>
      </select>
      <span className="material-symbols-outlined neo-workspace__profile-select-icon pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" aria-hidden="true">expand_more</span>
    </div>
    {isCustom ? <div className="mt-3">
      <label htmlFor={customId} className="mb-2 block text-sm font-bold text-slate-800">Platform name</label>
      <input
        id={customId}
        type="text"
        value={customPlatform}
        onChange={(event) => setCustomPlatform(event.target.value)}
        maxLength={80}
        required
        autoComplete="off"
        placeholder="Enter your platform"
        aria-invalid={Boolean(error)}
        aria-describedby={helpId}
        className={inputClassName}
      />
    </div> : null}
    {isCustom ? <input type="hidden" name="customPlatform" value={customPlatform} /> : null}
    <p id={helpId} className={`mt-2 text-xs leading-5 ${error ? "text-red-700" : "text-slate-600"}`}>{error || hint}</p>
  </div>;
}
