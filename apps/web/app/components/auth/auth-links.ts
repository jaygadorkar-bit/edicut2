export type AuthMode = "signin" | "signup";

export function authHref(_pathname: string, _search: string, mode: AuthMode = "signin", redirectTo = "/dashboard") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("redirectTo", redirectTo);
  return `/signin?${params.toString()}`;
}
