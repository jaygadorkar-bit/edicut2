export type WorkspaceDataRequirements = {
  projects: boolean;
  projectNames: boolean;
  files: boolean;
  reviews: boolean;
};

/** Load only the customer workspace records rendered by the selected section. */
export function getWorkspaceDataRequirements(section: string): WorkspaceDataRequirements {
  return {
    projects: section === "projects" || section === "billing",
    projectNames: section === "reviews" || section === "uploads",
    files: section === "uploads",
    reviews: section === "reviews",
  };
}
