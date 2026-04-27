import { auth } from "@edicut/platform-core/auth-edge";
import { PublicHeaderClient } from "./public-header-client";

export async function PublicHeader() {
  const session = await auth();

  return <PublicHeaderClient session={session} />;
}

