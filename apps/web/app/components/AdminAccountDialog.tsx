import { useEffect, useRef, type ReactNode } from "react";

/** Native modal semantics provide focus trapping, Escape and focus restoration. */
export function AdminAccountDialog({ labelledBy, onDismiss, children }: {
  labelledBy: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      queueMicrotask(() => { if (previousFocus?.isConnected) previousFocus.focus(); });
    };
  }, []);
  return (
    <dialog ref={dialogRef} aria-labelledby={labelledBy}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
      onCancel={event => { event.preventDefault(); onDismiss(); }}>
      {children}
    </dialog>
  );
}
