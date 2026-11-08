import { Outlet, useLocation, useRouteLoaderData } from "react-router";
import type { LinksFunction } from "react-router";
import type { loader as rootLoader } from "../root";
import { WorkspaceServices, workspaceManagesChat, workspaceServiceScope } from "../components/WorkspaceServices";
import workspaceStyles from "../styles/workspace.css?url";

export const links: LinksFunction = () => {
  return [{ rel: "stylesheet", href: workspaceStyles }];
};

/** Shared only by workspace routes, so public pages do not download these services. */
export default function WorkspaceLayout() {
  const { pathname } = useLocation();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const scope = workspaceServiceScope(pathname);
  const identity = scope === "admin" ? root?.workspaceAdminIdentity : root?.workspaceUserIdentity;
  if (!scope || !identity) return <Outlet />;
  return (
    <WorkspaceServices key={`${scope}:${identity}`} scope={scope} managedChat={workspaceManagesChat(pathname)}>
      <Outlet />
    </WorkspaceServices>
  );
}
