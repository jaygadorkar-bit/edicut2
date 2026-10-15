import type { LoaderFunctionArgs } from "react-router";
import { ProjectReviewPage } from "../components/ProjectReviewPage";
import { projectReviewLoader } from "../lib/project-review-route.server";
export const meta = () => [
  { title: "Project review | EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];
export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" };
}
export const loader = (args: LoaderFunctionArgs) =>
  projectReviewLoader(args, false);
export default function ProjectReviewRoute() {
  return <ProjectReviewPage />;
}
