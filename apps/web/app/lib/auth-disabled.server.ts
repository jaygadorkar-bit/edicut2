import { redirect } from "react-router";

export function loader() {
  return null;
}

export function action() {
  return new Response("Sign-in is temporarily unavailable.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function disabledGoogleCallback() {
  return redirect("/signin?disabled=1", { status: 303, headers: { "Cache-Control": "no-store" } });
}
