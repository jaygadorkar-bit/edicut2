import { useId, useRef, useState } from "react";
import { Search, UserPlus, Users, X } from "lucide-react";
import type {
  ReviewEditorOption,
  ReviewTeamMember,
} from "../lib/project-review";
import type { ReviewSubmit } from "./ReviewFeedback";

export function ProjectAssignment({
  title,
  members,
  editors,
  revision,
  canAssign,
  ready,
  onSubmit,
  compact = false,
}: {
  title: string;
  members: ReviewTeamMember[];
  editors: ReviewEditorOption[];
  revision: number;
  canAssign: boolean;
  ready: boolean;
  onSubmit: ReviewSubmit;
  compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const assigned = members.filter(
    (member) => !member.role || member.role === "editor",
  );
  const filtered = editors.filter((editor) =>
    editor.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  function close() {
    if (busy) return;
    dialog.current?.close();
    opener.current?.focus();
  }
  return (
    <section
      className={`project-assignment ${assigned.length ? "" : "project-assignment--empty"} ${compact ? "project-assignment--compact" : ""}`}
      aria-label={`Editor assignment for ${title}`}
    >
      <span className="project-assignment__avatar" aria-hidden="true">
        {assigned[0]?.name.slice(0, 1) || <Users size={19} />}
      </span>
      <div className="project-assignment__summary">
        <span>
          {assigned.length
            ? "Assigned editor"
            : canAssign
              ? "Editor needed"
              : "Editor assignment in progress"}
        </span>
        <strong>
          {assigned.map((member) => member.name).join(", ") ||
            (canAssign
              ? "Assign an editor to get started"
              : "We’re matching this project with an editor")}
        </strong>
      </div>
      {canAssign ? (
        <button
          ref={opener}
          type="button"
          className="review-button"
          disabled={!ready}
          onClick={() => {
            setSelected(assigned[0]?.id || "");
            setQuery("");
            setError("");
            setSuccess("");
            dialog.current?.showModal();
            search.current?.focus();
          }}
        >
          <UserPlus size={16} />
          {assigned.length ? "Change editor" : "Assign editor"}
        </button>
      ) : null}
      {success ? (
        <p className="project-assignment__message" role="status">
          {success}
        </p>
      ) : null}
      <dialog
        ref={dialog}
        className="project-assignment-dialog"
        aria-labelledby={headingId}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selected || busy) return;
            setBusy(true);
            setError("");
            const form = new FormData();
            form.set("intent", "set-editor");
            form.set("userId", selected);
            form.set("expectedRevision", String(revision));
            try {
              const result = await onSubmit(form);
              if (result.error) setError(result.error);
              else {
                setSuccess(result.success || "Editor assigned.");
                dialog.current?.close();
                opener.current?.focus();
              }
            } catch {
              setError(
                "The assignment could not be confirmed. Refresh the project and try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <header>
            <div>
              <p>Project team</p>
              <h2 id={headingId}>
                {assigned.length
                  ? "Change the editor"
                  : "Find the right editor"}
              </h2>
              <span>{title}</span>
            </div>
            <button
              type="button"
              className="review-icon-button"
              aria-label="Close editor assignment"
              disabled={busy}
              onClick={close}
            >
              <X size={19} />
            </button>
          </header>
          <label className="project-assignment-dialog__search">
            <Search size={17} />
            <span className="sr-only">Search active editors</span>
            <input
              ref={search}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search editors…"
              disabled={busy}
            />
          </label>
          <fieldset
            className="project-assignment-dialog__options"
            disabled={busy}
          >
            <legend className="sr-only">Choose an editor</legend>
            {filtered.length ? (
              filtered.map((editor) => (
                <label
                  key={editor.id}
                  className={selected === editor.id ? "is-selected" : ""}
                >
                  <input
                    type="radio"
                    name="assigned-editor"
                    value={editor.id}
                    checked={selected === editor.id}
                    onChange={() => setSelected(editor.id)}
                    required
                  />
                  <span
                    className="project-assignment__avatar"
                    aria-hidden="true"
                  >
                    {editor.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{editor.name}</strong>
                    <small>
                      {editor.activeProjects
                        ? `${editor.activeProjects} active project${editor.activeProjects === 1 ? "" : "s"}`
                        : "Available for a new project"}
                    </small>
                  </span>
                  {assigned.some((member) => member.id === editor.id) ? (
                    <em>Current</em>
                  ) : null}
                </label>
              ))
            ) : (
              <p role="status">
                {editors.length
                  ? "No editors match your search."
                  : "No active editors yet. Ask an administrator to add an editor account in Users."}
              </p>
            )}
          </fieldset>
          <p className="project-assignment-dialog__hint">
            {assigned.length
              ? "The previous editor will lose access to this project. Existing versions and feedback stay saved."
              : "The assigned editor will see this project in their workspace and can upload review cuts."}
          </p>
          {error ? (
            <p className="review-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer>
            <button
              type="button"
              className="review-button"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="review-button review-button--primary"
              disabled={
                busy ||
                !selected ||
                (assigned.length === 1 && assigned[0].id === selected)
              }
            >
              {busy ? "Assigning…" : "Assign editor"}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}
