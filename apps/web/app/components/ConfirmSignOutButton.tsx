import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouteLoaderData } from "react-router";

type ConfirmSignOutButtonProps = {
  children: ReactNode;
  buttonClassName?: string;
  wrapperClassName?: string;
  label?: string;
};

/** Adds an accessible confirmation step before submitting the shared sign-out action. */
export function ConfirmSignOutButton({
  children,
  buttonClassName,
  wrapperClassName,
  label = "Sign out",
}: ConfirmSignOutButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootData = useRouteLoaderData("root") as { signOutCsrfToken?: string | null } | undefined;
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog) return;

    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    };
  }, [isOpen]);

  return (
    <div className={wrapperClassName}>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName}
        aria-label={label}
        aria-haspopup="dialog"
        aria-controls={`${id}-dialog`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        {children}
      </button>
      <dialog
        ref={dialogRef}
        id={`${id}-dialog`}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/55 backdrop:backdrop-blur-sm"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          event.preventDefault();
          setIsOpen(false);
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) setIsOpen(false);
        }}
      >
        <div className="p-6 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            EdiCut account
          </p>
          <h2 id={`${id}-title`} className="mt-2 text-xl font-bold text-slate-950">
            Sign out?
          </h2>
          <p id={`${id}-description`} className="mt-2 text-sm leading-6 text-slate-600">
            Are you sure you want to sign out of your account?
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </button>
            <form method="post" action="/signout">
              {rootData?.signOutCsrfToken ? <input type="hidden" name="_csrf" value={rootData.signOutCsrfToken} /> : null}
              <button
                type="submit"
                className="inline-flex min-h-11 min-w-[7rem] w-full items-center justify-center whitespace-nowrap rounded-xl bg-red-700 px-4 text-sm font-bold text-white transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 sm:w-auto"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  );
}
