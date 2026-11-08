export function WorkspaceLoadingOverlay() {
  return (
    <div className="neo-workspace-loading" role="status" aria-live="polite" aria-atomic="true">
      <span className="neo-workspace-loading__progress" aria-hidden="true" />
      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}
