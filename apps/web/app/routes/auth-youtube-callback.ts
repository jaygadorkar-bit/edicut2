import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { completeYouTubeConnection } from "../lib/youtube-storage.server";
export function loader(args: LoaderFunctionArgs) {
  return completeYouTubeConnection(
    args.request,
    args.context,
    getDbFromContext(args.context),
  );
}
