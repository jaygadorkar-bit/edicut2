import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ADMIN_BASE_PATH } from "../lib/admin-paths";
import { shouldUseWorkspaceLoader } from "../lib/site-motion";
import { WorkspaceChatUnreadProvider } from "../lib/use-chat-unread-counts";
import { WorkspaceNotificationsProvider } from "./WorkspaceNotifications";

const NavigationContext = createContext<[boolean, Dispatch<SetStateAction<boolean>>] | null>(null);

export function workspaceServiceScope(pathname: string): "client" | "admin" | null {
  if (!shouldUseWorkspaceLoader(pathname)) return null;
  return pathname === ADMIN_BASE_PATH || pathname.startsWith(`${ADMIN_BASE_PATH}/`) ? "admin" : "client";
}

export function workspaceManagesChat(pathname: string) {
  return ["/dashboard/chat", "/dashboard/tickets", `${ADMIN_BASE_PATH}/chat`, `${ADMIN_BASE_PATH}/tickets`].includes(pathname.replace(/\/+$/, ""));
}

/** Mounted above the route outlet; page changes retain services and sidebar state. */
export function WorkspaceServices({ scope, managedChat, children }: {
  scope: "client" | "admin";
  managedChat: boolean;
  children: ReactNode;
}) {
  const navigationState = useState(false);
  return (
    <NavigationContext.Provider value={navigationState}>
      <WorkspaceChatUnreadProvider scope={scope} managed={managedChat}>
        <WorkspaceNotificationsProvider scope={scope}>{children}</WorkspaceNotificationsProvider>
      </WorkspaceChatUnreadProvider>
    </NavigationContext.Provider>
  );
}

export function useWorkspaceNavigationState() {
  const shared = useContext(NavigationContext);
  const local = useState(false);
  return shared ?? local;
}
