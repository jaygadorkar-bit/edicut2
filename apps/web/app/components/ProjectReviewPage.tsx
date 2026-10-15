import { useEffect, useRef } from "react";
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
} from "react-router";
import { AdminPanelShell } from "./AdminPanelShell";
import { WorkspaceShell } from "./WorkspaceShell";
import { ProjectReviewWorkspace } from "./ProjectReviewWorkspace";
import { clientNavigation } from "../lib/client-workspace-navigation";
import type { DashboardFeature } from "../lib/role-feature-access";
import type { ReviewData } from "../lib/project-review";
import { uploadReviewToStorage, sendReviewForm } from "../lib/review-upload-client";
import "../styles/project-review.css";

export function ProjectReviewPage({ admin = false }: { admin?: boolean }) {
  const data = useLoaderData() as ReviewData & {
    selectedVersionId: string | null;
  };
  const navigate = useNavigate(),
    revalidator = useRevalidator();
  const location = useLocation(),
    saving = useRef(false);
  const path = `${admin ? "/site/node-logmin" : "/dashboard"}/projects/${data.project.id}`;
  const api = `/api/project-reviews/${data.project.id}${admin ? "?scope=admin" : ""}`;
  useEffect(() => {
    // Keep the version stable while refreshing feedback, including unsent drafts.
    if (
      data.selectedVersionId &&
      !new URLSearchParams(location.search).has("version")
    )
      void navigate(`${path}?version=${data.selectedVersionId}`, {
        replace: true,
      });
  }, [data.selectedVersionId, location.search, navigate, path]);
  useEffect(() => {
    const refresh = () => {
      if (
        !saving.current &&
        document.visibilityState === "visible" &&
        revalidator.state === "idle"
      )
        void revalidator.revalidate();
    };
    const interval = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [revalidator]);
  const content = (
    <ProjectReviewWorkspace
      key={data.selectedVersionId ?? "empty"}
      data={data}
      backTo={admin ? "/site/node-logmin/projects" : "/dashboard/projects"}
      mediaUrl={(id) =>
        `${api}${admin ? "&" : "?"}media=${encodeURIComponent(id)}`
      }
      onVersion={(id) => {
        void navigate(`${path}?version=${encodeURIComponent(id)}`);
      }}
      onAction={async (form, progress) => {
        saving.current = true;
        try {
          const result =
            form.get("intent") === "upload-version"
              ? await uploadReviewToStorage(api, form, sendReviewForm, progress)
              : await sendReviewForm(api, form, progress);
          if (!result.error) {
            if (result.versionId)
              await navigate(
                `${path}?version=${encodeURIComponent(result.versionId)}`,
              );
            else await revalidator.revalidate();
          }
          return result;
        } finally {
          saving.current = false;
        }
      }}
    />
  );
  if (admin)
    return (
      <AdminPanelShell
        title="Project review"
        activeTab="projects"
        account={{ name: data.actor.name, detail: "Administrator" }}
      >
        {content}
      </AdminPanelShell>
    );
  const features = data.features as DashboardFeature[];
  return (
    <WorkspaceShell
      title="Project review"
      hideHeaderTitle
      navItems={clientNavigation(features)}
      account={{
        name: data.actor.name,
        detail:
          data.actor.role === "project_manager"
            ? "Project manager"
            : data.canUpload
              ? "Editor"
              : "Client",
      }}
      mobileMenu
      navigationFeedback
      profileNavAtBottom
      profileTo={features.includes("settings") ? "/dashboard/profile" : null}
      settingsTo={features.includes("settings") ? "/dashboard/settings" : null}
      notificationsTo={
        features.includes("reviews") ? "/dashboard/reviews" : null
      }
    >
      {content}
    </WorkspaceShell>
  );
}
