import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileVideo,
  History,
  MessageSquare,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { FormSelect } from "./FormSelect";
import { ReviewPlayer, type ReviewPlayerHandle } from "./ReviewPlayer";
import { ReviewFeedback, type ReviewSubmit } from "./ReviewFeedback";
import { ReviewUpload } from "./ReviewUpload";
import { ProjectAssignment } from "./ProjectAssignment";
import {
  projectBriefSections,
  projectStatusLabel,
  type FrameAnnotation,
  type ReviewData,
  type ReviewResult,
} from "../lib/project-review";
import { parseWorkspaceShareUrl } from "../lib/workspace";

export function ProjectReviewWorkspace({
  data,
  mediaUrl,
  onAction,
  onVersion,
  backTo = "/dashboard/projects",
}: {
  data: ReviewData & { selectedVersionId: string | null };
  mediaUrl: (versionId: string) => string;
  onAction: ReviewSubmit;
  onVersion: (versionId: string) => void;
  backTo?: string;
}) {
  const {
    project,
    versions,
    comments,
    canUpload,
    canAssign,
    canDecide,
    ready,
    actor,
  } = data;
  const version =
    versions.find((item) => item.id === data.selectedVersionId) ?? versions[0];
  const [tab, setTab] = useState("review"),
    [uploadOpen, setUploadOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null),
    [time, setTime] = useState(0),
    [anchor, setAnchor] = useState<number | null>(null),
    [rangeEnd, setRangeEnd] = useState<number | null>(null),
    [selectedComment, setSelectedComment] = useState<string | null>(null),
    [annotation, setAnnotation] = useState<FrameAnnotation | null>(null);
  const [decision, setDecision] = useState<
      "approved" | "changes_requested" | null
    >(null),
    [decisionNote, setDecisionNote] = useState("");
  const [fileName, setFileName] = useState(""),
    [shareUrl, setShareUrl] = useState("");
  const inFlight = useRef(false),
    player = useRef<ReviewPlayerHandle | null>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    decisionRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const dirty = useRef(false),
    draftSources = useRef({ feedback: false, upload: false, metadata: false }),
    discardDialog = useRef<HTMLDialogElement>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const markDirty = useCallback((value: boolean) => {
    draftSources.current.feedback = value;
    dirty.current = Object.values(draftSources.current).some(Boolean);
  }, []);
  const markUploadDirty = useCallback((value: boolean) => {
    draftSources.current.upload = value;
    dirty.current = Object.values(draftSources.current).some(Boolean);
  }, []);
  useEffect(() => {
    draftSources.current.metadata = Boolean(
      fileName.trim() || shareUrl.trim() || decisionNote.trim(),
    );
    dirty.current = Object.values(draftSources.current).some(Boolean);
  }, [fileName, shareUrl, decisionNote]);
  function switchVersion(id: string) {
    if (busy || id === data.selectedVersionId) return;
    if (dirty.current) setPendingSwitch(id);
    else onVersion(id);
  }
  useEffect(() => {
    if (pendingSwitch) discardDialog.current?.showModal();
  }, [pendingSwitch]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  const openChanges = comments.filter(
    (comment) =>
      !comment.parentId && !comment.resolved && comment.category === "change",
  ).length;
  async function submit(
    form: FormData,
    onProgress?: (percent: number) => void,
  ) {
    if (inFlight.current) return { error: "A change is already being saved." };
    inFlight.current = true;
    setBusy(true);
    setResult(null);
    try {
      const response = await onAction(form, onProgress);
      setResult(response);
      return response;
    } catch {
      const response = {
        error:
          "Your change could not be confirmed. Check your connection and try again; your draft is still here.",
      };
      setResult(response);
      return response;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const date = project.deadline
    ? new Date(`${project.deadline}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "To be confirmed";
  return (
    <div className="project-review project-review--focused">
      <header className="review-project-heading">
        <div className="review-project-title">
      <Link
        to={backTo}
        className="review-back"
        onClick={(event) => {
          if (busy) {
            event.preventDefault();
            return;
          }
          if (
            dirty.current &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            event.button === 0
          ) {
            event.preventDefault();
            setPendingSwitch("back");
          }
        }}
      >
        <ArrowLeft size={16} />
        Projects
      </Link>
          <h1>{project.title}</h1>
            <span className={`review-status review-status--${project.status}`}>
              {projectStatusLabel(project.status)}
            </span>
        </div>
        <div className="review-project-heading__actions">
          {canUpload ? (
            <button
              type="button"
              className="review-button review-button--primary"
              disabled={!ready || busy}
              onClick={() => {
                setUploadOpen(true);
                player.current?.pause();
              }}
            >
              <Upload size={17} />
              Upload version
            </button>
          ) : null}
        </div>
      </header>
      <nav className="review-tabs" aria-label="Project sections">
        {[
          ["review", "Review", MessageSquare],
          ["brief", "Brief", ClipboardList],
          ["history", "Versions & team", History],
        ].map(([key, label, Icon]) => (
          <button
            type="button"
            key={String(key)}
            aria-current={tab === key ? "page" : undefined}
            className={tab === key ? "is-active" : ""}
            onClick={() => {
              player.current?.pause();
              setTab(String(key));
            }}
          >
            <Icon size={17} aria-hidden="true" />
            {String(label)}
            {key === "history" && versions.length ? (
              <span>{versions.length}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {result?.error || result?.success ? (
        <div
          className={`review-notice ${result.error ? "is-error" : "is-success"}`}
          role={result.error ? "alert" : "status"}
        >
          <span>{result.error || result.success}</span>
          <button
            type="button"
            className="review-icon-button"
            onClick={() => setResult(null)}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {!ready ? (
        <div className="review-notice" role="status">
          Video review is being prepared. You can still view the project brief
          and shared file links. Uploads and comments will become available when
          setup is complete.
        </div>
      ) : null}
      {uploadOpen && ready && canUpload ? (
        <ReviewUpload
          storage={data.storage}
          admin={actor.admin}
          onSubmit={submit}
          busy={busy}
          onDraftChange={markUploadDirty}
          onClose={() => {
            if (draftSources.current.upload) setPendingSwitch("close-upload");
            else setUploadOpen(false);
          }}
        />
      ) : null}
      <div hidden={tab !== "review"}>
        {version ? (
          <>
            <div className="review-version-toolbar">
              <div className="review-version-toolbar__select">
                <label id="review-version-label" htmlFor="review-version">
                  Version
                </label>
                <FormSelect
                  id="review-version"
                  name="version"
                  value={version.id}
                  onChange={(value) => {
                    if (busy) return;
                    player.current?.pause();
                    switchVersion(value);
                  }}
                  options={versions.map((item, index) => ({
                    value: item.id,
                    label: `v${versions.length - index} · ${item.title}${item.id === versions[0].id ? " (latest)" : ""}`,
                  }))}
                  className="review-field"
                />
              </div>
              {version.decision !== "pending" ? <span
                className={`review-version-decision review-version-decision--${version.decision}`}
              >
                {version.decision === "approved"
                  ? "Approved"
                  : version.decision === "changes_requested"
                    ? "Changes requested"
                    : "Awaiting feedback"}
              </span> : null}
            </div>
            <div className="review-workbench">
              <div className="review-workbench__video">
                <ReviewPlayer
                  key={version.id}
                  playerRef={player}
                  src={mediaUrl(version.id)}
                  youtubeId={
                    version.provider === "youtube"
                      ? version.youtubeId
                      : undefined
                  }
                  title={version.title}
                  durationMs={version.durationMs}
                  draftAnnotation={annotation}
                  readOnly={version.decision === "approved"}
                  comments={comments}
                  onTime={setTime}
                  onMark={(milliseconds) => {
                    setAnchor(milliseconds);
                    setRangeEnd(null);
                    setAnnotation(null);
                  }}
                  onRange={(start, end) => {
                    setAnchor(start);
                    setRangeEnd(end);
                    setAnnotation(null);
                  }}
                  onSelectComment={setSelectedComment}
                  onAnnotation={setAnnotation}
                  onAddComment={() => {
                    composer.current?.focus({ preventScroll: true });
                    composer.current?.scrollIntoView({ block: "nearest" });
                  }}
                />
              </div>
              <ReviewFeedback
                key={version.id}
                version={version}
                comments={comments}
                actor={actor}
                busy={busy}
                onSubmit={submit}
                onSeek={(milliseconds, mark) =>
                  player.current?.seek(milliseconds, mark)
                }
                time={time}
                anchor={anchor}
                setAnchor={setAnchor}
                rangeEnd={rangeEnd}
                setRangeEnd={setRangeEnd}
                selectedComment={selectedComment}
                annotation={annotation}
                setAnnotation={setAnnotation}
                composerRef={composer}
                onDraftChange={markDirty}
                onPause={() => player.current?.pause()}
              />
              <div className="review-workbench__details">
                {version.note ? (
                  <details className="review-editor-note">
                    <summary>Editor’s note</summary>
                      <p>{version.note}</p>
                  </details>
                ) : null}
                <div className="review-decision">
                  <div>
                    <h2>
                      {version.decision === "approved"
                        ? "This cut is approved"
                        : version.id !== versions[0]?.id
                          ? "You’re viewing an earlier version"
                          : "Review decision"}
                    </h2>
                    {canDecide && openChanges > 0 ? <p>
                      {openChanges} open {openChanges === 1 ? "change" : "changes"} to resolve before approval.
                    </p> : null}
                  </div>
                  {canDecide &&
                  version.id === versions[0]?.id &&
                  version.decision === "pending" ? (
                    <div className="review-decision__buttons">
                      <button
                        type="button"
                        className="review-button"
                        disabled={busy}
                        onClick={() => {
                          setDecision("changes_requested");
                          setTimeout(() => decisionRef.current?.focus(), 0);
                        }}
                      >
                        Request changes
                      </button>
                      <button
                        type="button"
                        className="review-button review-button--approve"
                        disabled={busy || openChanges > 0}
                        onClick={() => {
                          setDecision("approved");
                          setTimeout(() => decisionRef.current?.focus(), 0);
                        }}
                      >
                        <CheckCheck size={17} />
                        Approve version
                      </button>
                    </div>
                  ) : null}
                </div>
                {decision ? (
                  <div
                    ref={decisionRef}
                    tabIndex={-1}
                    className="review-decision-confirm"
                    role="region"
                    aria-label="Confirm review decision"
                  >
                    <h3>
                      {decision === "approved"
                        ? "Approve this version?"
                        : "Send this version back for changes?"}
                    </h3>
                    <p>
                      {decision === "approved"
                        ? "This marks the project delivered and keeps this version’s feedback for reference."
                        : "Your editor will see the open comments and this note. A new cut starts a new review."}
                    </p>
                    <label htmlFor="decision-note">
                      {decision === "approved"
                        ? "Final note (optional)"
                        : "Note for your editor"}
                      <textarea
                        id="decision-note"
                        className="review-field"
                        rows={2}
                        maxLength={4000}
                        value={decisionNote}
                        onChange={(event) =>
                          setDecisionNote(event.target.value)
                        }
                        placeholder={
                          decision === "approved"
                            ? "Thanks, this is ready to go."
                            : "Summarize anything that isn’t covered by the comments."
                        }
                      />
                    </label>
                    <div>
                      <button
                        type="button"
                        className="review-button review-button--quiet"
                        disabled={busy}
                        onClick={() => setDecision(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={`review-button ${decision === "approved" ? "review-button--approve" : "review-button--primary"}`}
                        disabled={
                          busy ||
                          (decision === "changes_requested" &&
                            !openChanges &&
                            !decisionNote.trim())
                        }
                        onClick={async () => {
                          const form = new FormData();
                          Object.entries({
                            intent: "review-decision",
                            versionId: version.id,
                            decision,
                            note: decisionNote,
                            expectedRevision: String(
                              project.reviewRevision ?? 0,
                            ),
                          }).forEach(([key, value]) => form.set(key, value));
                          const response = await submit(form);
                          if (!response.error) {
                            setDecision(null);
                            setDecisionNote("");
                          }
                        }}
                      >
                        {busy
                          ? "Saving…"
                          : decision === "approved"
                            ? "Confirm approval"
                            : "Send changes"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <section className="review-awaiting">
            <div className="review-awaiting__screen">
              <FileVideo size={56} strokeWidth={1.1} />
              <span>First cut coming soon</span>
            </div>
            <div>
              <h2>
                {canUpload
                  ? "Upload the first review cut"
                  : "Your first cut will appear here"}
              </h2>
              <p>
                {canUpload
                  ? "Upload a review export to start a conversation around the actual frames. Each new version keeps its own comments."
                  : "When your editor shares a cut, you’ll be able to play it here, mark the exact moments to change, and keep every review in one place."}
              </p>
              {canUpload ? (
                <button
                  type="button"
                  className="review-button review-button--primary"
                  disabled={!ready}
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload size={17} />
                  Upload first version
                </button>
              ) : (
                <button
                  type="button"
                  className="review-button"
                  onClick={() => setTab("brief")}
                >
                  <ClipboardList size={17} />
                  View your brief
                </button>
              )}
            </div>
          </section>
        )}
      </div>
      {tab === "brief" ? (
        <section className="review-brief">
          <div>
            <h2>The project brief</h2>
            <p>{project.channelName} · Delivery {date}</p>
            <dl className="review-brief__text">
              {projectBriefSections(project.notes).map((section, index) => (
                <div key={index}>
                  <dt>{section.label}</dt>
                  <dd>{section.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <aside>
            <h2>Shared files</h2>
            <p>Source folders, references, and earlier preview links.</p>
            {data.files.length ? (
              <ul>
                {data.files.map((file) => {
                  const safe = parseWorkspaceShareUrl(file.shareUrl);
                  const internal =
                    file.shareUrl.startsWith(
                      `/dashboard/projects/${project.id}?version=`,
                    ) &&
                    /^\/dashboard\/projects\/[0-9a-f-]+\?version=[0-9a-f-]+$/i.test(
                      file.shareUrl,
                    );
                  return safe || internal ? (
                    <li key={file.id}>
                      <a
                        href={safe || file.shareUrl}
                        target={safe ? "_blank" : undefined}
                        rel={safe ? "noopener noreferrer" : undefined}
                      >
                        <FileVideo size={19} />
                        <span>
                          <strong>{file.fileName}</strong>
                          <small>
                            {file.kind === "review"
                              ? "Review cut"
                              : "Source files"}
                          </small>
                        </span>
                        <ExternalLink size={15} />
                      </a>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className="review-brief__empty">
                Shared files will appear here.
              </p>
            )}
            <form
              className="review-source-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData();
                form.set("intent", "add-source");
                form.set("fileName", fileName);
                form.set("shareUrl", shareUrl);
                const response = await submit(form);
                if (!response.error) {
                  setFileName("");
                  setShareUrl("");
                }
              }}
            >
              <h3>Attach a source or reference</h3>
              <label htmlFor="review-source-name">
                File label
                <input
                  id="review-source-name"
                  className="review-field"
                  required
                  maxLength={160}
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                  placeholder="e.g. Brand assets"
                  autoComplete="off"
                />
              </label>
              <label htmlFor="review-source-url">
                HTTPS sharing link
                <input
                  id="review-source-url"
                  className="review-field"
                  type="url"
                  required
                  maxLength={2048}
                  value={shareUrl}
                  onChange={(event) => setShareUrl(event.target.value)}
                  placeholder="https://drive.google.com/…"
                  autoComplete="off"
                />
              </label>
              <p>
                Give your editor access in your storage provider. Never share
                passwords.
              </p>
              <button
                type="submit"
                className="review-button"
                disabled={busy || !ready}
              >
                Attach link
              </button>
            </form>
          </aside>
        </section>
      ) : null}
      {tab === "history" ? (
        <div className="review-history-layout">
          <section className="review-history">
            <h2>Version history</h2>
            <p>Earlier feedback stays attached to its original version.</p>
            {versions.length ? (
              <ol>
                {versions.map((item, index) => (
                  <li key={item.id}>
                    <span className="review-history__number">
                      v{versions.length - index}
                    </span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>
                        {item.authorName} ·{" "}
                        {new Date(item.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "Asia/Dhaka",
                        })}
                      </p>
                      <span
                        className={`review-version-decision review-version-decision--${item.decision}`}
                      >
                        {item.decision === "approved"
                          ? "Approved"
                          : item.decision === "changes_requested"
                            ? "Changes requested"
                            : "Awaiting feedback"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="review-icon-button"
                      aria-label={`Open ${item.title}`}
                      onClick={() => {
                        setTab("review");
                        switchVersion(item.id);
                      }}
                    >
                      <ChevronRight size={19} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="review-feedback__empty">
                <History size={28} />
                <h3>No versions yet</h3>
                <p>The first review export will start your version history.</p>
              </div>
            )}
          </section>
          <section className="review-team">
            <h2>Project team</h2>
            <ProjectAssignment
              title={project.title}
              members={data.members}
              editors={data.editorOptions}
              revision={project.reviewRevision ?? 0}
              canAssign={canAssign}
              ready={ready && !busy}
              onSubmit={submit}
              compact
            />
            <ul>
              <li>
                <span className="review-avatar">
                  {project.channelName.slice(0, 1)}
                </span>
                <div>
                  <strong>{project.channelName}</strong>
                  <span>Client</span>
                </div>
              </li>
              {data.members.map((member) => (
                <li key={member.id}>
                  <span className="review-avatar">
                    {member.name.slice(0, 1)}
                  </span>
                  <div>
                    <strong>{member.name}</strong>
                    <span>
                      {member.role === "project_manager"
                        ? "Project manager"
                        : "Assigned editor"}
                    </span>
                  </div>
                  {actor.admin ? (
                    <button
                      type="button"
                      className="review-icon-button"
                      disabled={busy}
                      aria-label={`Remove ${member.name} from this project`}
                      onClick={() => {
                        const form = new FormData();
                        form.set("intent", "remove-editor");
                        form.set("userId", member.id);
                        void submit(form);
                      }}
                    >
                      <X size={15} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
      <dialog
        ref={discardDialog}
        className="review-discard-dialog"
        onCancel={() => setPendingSwitch(null)}
        aria-labelledby="discard-review-title"
      >
        <h2 id="discard-review-title">Keep your draft?</h2>
        <p>
          Unsent feedback or file details will be discarded if you continue.
        </p>
        <div>
          <button
            type="button"
            className="review-button"
            autoFocus
            onClick={() => {
              discardDialog.current?.close();
              setPendingSwitch(null);
            }}
          >
            Keep writing
          </button>
          <button
            type="button"
            className="review-button review-button--primary"
            onClick={() => {
              dirty.current = false;
              discardDialog.current?.close();
              const next = pendingSwitch;
              setPendingSwitch(null);
              if (next === "close-upload") {
                setUploadOpen(false);
                draftSources.current.upload = false;
                dirty.current =
                  draftSources.current.feedback ||
                  draftSources.current.metadata;
              } else if (next === "back") void navigate(backTo);
              else if (next) onVersion(next);
            }}
          >
            Discard draft & continue
          </button>
        </div>
      </dialog>
    </div>
  );
}
