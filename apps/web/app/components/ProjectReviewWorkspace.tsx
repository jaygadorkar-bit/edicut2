import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
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
  validateReviewComment,
  type FrameAnnotation,
  type ReviewComment,
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
  const { project, versions, comments, canUpload, canAssign, ready, actor } =
    data;
  const version =
    versions.find((item) => item.id === data.selectedVersionId) ?? versions[0];
  const [tab, setTab] = useState("review"),
    [uploadOpen, setUploadOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null),
    [anchor, setAnchor] = useState<number | null>(null),
    [rangeEnd, setRangeEnd] = useState<number | null>(null),
    [selectedComment, setSelectedComment] = useState<string | null>(null),
    [annotation, setAnnotation] = useState<FrameAnnotation | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [localComments, setLocalComments] = useState<ReviewComment[]>([]);
  const playbackTime = useRef(0);
  const updateTime = useCallback((value: number) => {
    playbackTime.current = value;
  }, []);
  const getTime = useCallback(
    () => player.current?.currentTime() ?? playbackTime.current,
    [],
  );
  const visibleComments = useMemo(() => {
    const saved = new Set(comments.map((comment) => comment.id));
    return [
      ...comments,
      ...localComments.filter((local) => !saved.has(local.id)),
    ];
  }, [comments, localComments]);
  useEffect(() => {
    const saved = new Set(comments.map((comment) => comment.id));
    setLocalComments((current) => {
      const next = current.filter((local) => !saved.has(local.id));
      return next.length === current.length ? current : next;
    });
  }, [comments]);
  const [selectedCommentKey, setSelectedCommentKey] = useState(0);
  const [fileName, setFileName] = useState(""),
    [shareUrl, setShareUrl] = useState("");
  const inFlight = useRef(false),
    player = useRef<ReviewPlayerHandle | null>(null),
    composer = useRef<HTMLTextAreaElement>(null);
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
    draftSources.current.metadata = Boolean(fileName.trim() || shareUrl.trim());
    dirty.current = Object.values(draftSources.current).some(Boolean);
  }, [fileName, shareUrl]);
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
  async function submit(
    form: FormData,
    onProgress?: (percent: number) => void,
  ) {
    if (inFlight.current) return { error: "A change is already being saved." };
    inFlight.current = true;
    setBusy(true);
    setResult(null);
    const id = String(form.get("commentId") ?? "");
    const parsed =
      version && form.get("intent") === "add-comment" && !form.has("voice")
        ? validateReviewComment(form, version.durationMs).value
        : undefined;
    if (parsed && id) {
      const parentId = String(form.get("parentId") ?? "") || null;
      const now = new Date().toISOString();
      setLocalComments((current) => [
        ...current.filter((comment) => comment.id !== id),
        {
          id,
          versionId: version.id,
          parentId,
          actorKey: actor.key,
          authorName: actor.name,
          authorRole: actor.role,
          body: parsed.body,
          timestampMs: parentId ? null : parsed.timestampMs,
          endMs: parentId ? null : parsed.endMs,
          annotation: parentId ? null : parsed.annotation,
          category: parsed.category as ReviewComment["category"],
          priority: parsed.priority as ReviewComment["priority"],
          resolved: false,
          createdAt: now,
          updatedAt: now,
          pending: true,
        },
      ]);
    }
    function settleComment(failed: boolean) {
      if (!parsed) return;
      setLocalComments((current) =>
        failed
          ? current.filter((comment) => comment.id !== id)
          : current.map((comment) =>
              comment.id === id ? { ...comment, pending: false } : comment,
            ),
      );
    }
    try {
      const response = await onAction(form, onProgress);
      settleComment(Boolean(response.error));
      setResult(response);
      return response;
    } catch {
      settleComment(true);
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
  useEffect(() => {
    if (!result?.success) return;
    const timeout = window.setTimeout(() => setResult(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [result]);
  const date = project.deadline
    ? new Date(`${project.deadline}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "To be confirmed";
  const versionSelector = version ? (
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
      {version.decision !== "pending" ? (
        <span
          className={`review-version-decision review-version-decision--${version.decision}`}
        >
          {version.decision === "approved"
            ? "Approved"
            : version.decision === "changes_requested"
              ? "Changes requested"
              : "Awaiting feedback"}
        </span>
      ) : null}
    </div>
  ) : null;
  return (
    <div className="project-review project-review--focused project-review--proofing">
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
      {result?.error ? (
        <div className="review-notice is-error" role="alert">
          <span>{result.error}</span>
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
      {result?.success ? (
        <div
          className="review-toast review-toast--success"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{result.success}</span>
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
                  mediaBytes={version.bytes}
                  draftAnnotation={annotation}
                  readOnly={version.decision === "approved"}
                  comments={visibleComments}
                  draftBody={draftBody}
                  draftTime={anchor}
                  setDraftBody={setDraftBody}
                  onPost={() => composer.current?.form?.requestSubmit()}
                  busy={busy}
                  onTime={updateTime}
                  onMark={(milliseconds) => {
                    setAnchor(milliseconds);
                    setRangeEnd(null);
                    setAnnotation(null);
                  }}
                  onSelectComment={(id) => {
                    setSelectedComment(id);
                    setSelectedCommentKey((key) => key + 1);
                  }}
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
                versionSelector={versionSelector}
                comments={visibleComments}
                actorKey={actor.key}
                busy={busy}
                onSubmit={submit}
                onSeek={(milliseconds, mark) =>
                  player.current?.seek(milliseconds, mark)
                }
                getTime={getTime}
                anchor={anchor}
                setAnchor={setAnchor}
                rangeEnd={rangeEnd}
                setRangeEnd={setRangeEnd}
                selectedComment={selectedComment}
                selectedCommentKey={selectedCommentKey}
                annotation={annotation}
                setAnnotation={setAnnotation}
                composerRef={composer}
                onDraftChange={markDirty}
                onPause={() => player.current?.pause()}
                draftBody={draftBody}
                setDraftBody={setDraftBody}
                voiceUrl={(commentId) =>
                  `${mediaUrl(version.id).replace(/([?&])media=[^&]*/, "$1voice=" + encodeURIComponent(commentId))}`
                }
                voiceAvailable={Boolean(
                  data.storage?.connected &&
                    data.storage.provider === "google_drive",
                )}
                active={tab === "review"}
              />
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
            <p>
              {project.channelName} · Delivery {date}
            </p>
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
