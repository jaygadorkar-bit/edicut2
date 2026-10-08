import type { CSSProperties } from "react";

export function WorkspaceLoadingOverlay() {
  return (
    <div className="neo-workspace-loading" role="status" aria-live="polite" aria-atomic="true">
      <span className="neo-workspace-loading__spinner" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} className="neo-workspace-loading__segment" style={{
            "--segment": index,
            "--segment-opacity": (index + 1) / 12,
            animationDelay: `${(index - 12) * 1000 / 12}ms`,
          } as CSSProperties} />
        ))}
      </span>
      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}
