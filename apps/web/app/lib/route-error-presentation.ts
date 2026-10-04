import { isRouteErrorResponse } from "react-router";

export type RouteErrorPresentation = {
  label: string;
  title: string;
  message: string;
};

const GENERIC_ERROR_MESSAGE = "Please try again. If the problem continues, return to the home page or sign in again.";

export function getRouteErrorPresentation(error: unknown): RouteErrorPresentation {
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
