import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { completeGoogleDriveConnection } from "../lib/google-drive-storage.server";
export function loader(args: LoaderFunctionArgs) {
  return completeGoogleDriveConnection(args.request, args.context, getDbFromContext(args.context));
}
