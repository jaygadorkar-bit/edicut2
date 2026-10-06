import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { validateCreatorProfile } from "../lib/client-intake";
import { requireClientWorkspace } from "../lib/client-workspace-access.server";
import { isMissingClientWorkspaceSchema, loadClientWorkspace, saveCreatorProfile } from "../lib/client-workspace.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { consumeUsageLimit } from "../lib/usage-protection.server";

export const meta: MetaFunction = () => [{ title: "Profile | EdiCut" }, { name: "robots", content: "noindex,nofollow" }];
export function headers() { return { "Cache-Control": "no-store" }; }
export async function loader(args: LoaderFunctionArgs) {
  const { db, userId } = await requireClientWorkspace(args);
  try {
    const workspace = await loadClientWorkspace(db, userId);
    if (!workspace.purchases.length) throw redirect("/dashboard/projects");
  } catch (error) {
    if (error instanceof Response || !isMissingClientWorkspaceSchema(error)) throw error;
  }
  throw redirect("/dashboard/profile#channel-profile");
}
export async function action(args: ActionFunctionArgs) {
  if (!isSameSiteMutation(args.request)) return forbiddenMutation();
  const { db, userId } = await requireClientWorkspace(args);
  const limit = await consumeUsageLimit({ ...args, bindingName: "USER_ACTION_LIMITER", key: `user:${userId}`, localLimit: 60, localPeriodSeconds: 60 });
  if (limit !== "allowed") return { error: "Please wait a minute before trying again." };
  const form = await readMutationForm(args.request, 32 * 1024);
  if (!form || form.get("intent") !== "save-channel") return { error: "Submit a valid creator profile under 32 KB." };
  const values = Object.fromEntries([...form].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const result = validateCreatorProfile(form);
  if (result.errors) return { errors: result.errors, values };
  try {
    if (!await saveCreatorProfile(db, userId, result.value)) return { error: "A confirmed package purchase is required before setting up your creator profile.", values };
    return redirect("/dashboard/profile#channel-profile");
  } catch (error) {
    if (!isMissingClientWorkspaceSchema(error)) throw error;
    return { error: "Creator profile setup is temporarily unavailable. Please try again later.", values };
  }
}
export default function ChannelRoute() { return null; }
