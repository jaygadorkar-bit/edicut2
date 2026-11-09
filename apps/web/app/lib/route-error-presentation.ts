import { isRouteErrorResponse } from "react-router";
import { isDatabaseConnectionError } from "./database-errors";

export type RouteErrorPresentation = {
  label: string;
  title: string;
  message: string;
};

const GENERIC_ERROR_MESSAGE = "Please try again. If the problem continues, return to the home page or sign in again.";

export function getRouteErrorPresentation(error: unknown): RouteErrorPresentation {
  if (isDatabaseConnectionError(error) || (isRouteErrorResponse(error) && error.status === 503)) {
    return { label: "Connection unavailable", title: "We couldn’t connect just now", message: "Your account data is temporarily unavailable. Try again in a moment." };
  }
  if (!isRouteErrorResponse(error)) {
    return {
      label: "EdiCut error",
      title: "We couldn’t load this page",
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  if (error.status === 404) {
    return {
      label: "Error 404",
      title: "Page not found",
      message: "The page may have moved or the address may be incorrect.",
    };
  }

  if (error.status === 403) {
    return {
      label: "Error 403",
      title: "Access denied",
      message: "You may not have permission to open this page. Try signing in with another account.",
    };
  }

  if (error.status >= 500) {
    return {
      label: `Error ${error.status}`,
      title: "We couldn’t load this page",
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  const detail = typeof error.data === "string" ? error.data.trim() : "";
  return {
    label: `Error ${error.status}`,
    title: error.statusText || "Request could not be completed",
    message: detail || GENERIC_ERROR_MESSAGE,
  };
}

export function getRouteErrorDebugDetails(error: unknown) {
  // Driver errors can contain SQL parameters, account IDs, and credentials.
  if (isDatabaseConnectionError(error) || (error instanceof Error && /Failed query:|postgres(?:ql)?:\/\//i.test(error.message))) {
    return "Database request failed. Query details are omitted to protect account information.";
  }
  if (isRouteErrorResponse(error)) {
    let detail = "";
    if (typeof error.data === "string") {
      detail = error.data;
    } else {
      try {
        detail = JSON.stringify(error.data, null, 2);
      } catch {
        detail = String(error.data);
      }
    }
    return `${error.status} ${error.statusText}\n${detail}`;
  }

  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ""}`;
  return String(error);
}

export type SafeRouteErrorDiagnostics = {
  requestReference: string | null;
  route: "dashboard" | "root";
  stage: "session-profile" | "role-feature-access" | "customer-project-list" | "customer-project-summary" | "customer-file-count" | "customer-projects" | "client-balance" | "staff-overview" | "affiliate-overview" | "dashboard-loader" | "root-loader";
  status: number;
  errorType: string;
  databaseCode?: string;
};

/** Read only the server-generated, allowlisted diagnostics safe for a customer page. */
export function getSafeRouteErrorDiagnostics(error: unknown): SafeRouteErrorDiagnostics | null {
  if (!isRouteErrorResponse(error) || !error.data || typeof error.data !== "object") return null;
  const value = (error.data as { diagnostics?: unknown }).diagnostics;
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const stagesByRoute = {
    dashboard: ["session-profile", "role-feature-access", "customer-project-list", "customer-project-summary", "customer-file-count", "customer-projects", "client-balance", "staff-overview", "affiliate-overview", "dashboard-loader"],
    root: ["root-loader"],
  } as const;
  if (candidate.route !== "dashboard" && candidate.route !== "root") return null;
  if (typeof candidate.stage !== "string" || !(stagesByRoute[candidate.route] as readonly string[]).includes(candidate.stage)) return null;
  if (!Number.isInteger(candidate.status) || Number(candidate.status) < 500 || Number(candidate.status) > 599) return null;
  if (typeof candidate.errorType !== "string" || !/^[A-Za-z][A-Za-z0-9_.]{0,79}$/.test(candidate.errorType)) return null;
  const reference = typeof candidate.requestReference === "string" && /^[a-f0-9]{16}(?:-[a-z0-9]{3})?$/i.test(candidate.requestReference)
    ? candidate.requestReference
    : null;
  const databaseCode = typeof candidate.databaseCode === "string" && /^(?:[A-Z0-9]{5}|CONNECT_TIMEOUT|CONNECTION_CLOSED|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(candidate.databaseCode)
    ? candidate.databaseCode
    : undefined;

  return {
    requestReference: reference,
    route: candidate.route,
    stage: candidate.stage as SafeRouteErrorDiagnostics["stage"],
    status: Number(candidate.status),
    errorType: candidate.errorType,
    ...(databaseCode ? { databaseCode } : {}),
  };
}
