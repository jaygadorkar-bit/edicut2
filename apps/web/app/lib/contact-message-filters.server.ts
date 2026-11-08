import { ne, or, isNull } from "drizzle-orm";
import { contactMessages } from "@edicut/db/schema";

export const VIDEO_EDITOR_PARTNER_APPLICATION_TYPE = "Video editor partner application";

/** Keeps partner applications in Recruiting forms instead of the general contact inbox. */
export function getContactInboxRecordFilter() {
  return or(
    isNull(contactMessages.projectType),
    ne(contactMessages.projectType, VIDEO_EDITOR_PARTNER_APPLICATION_TYPE),
  )!;
}
