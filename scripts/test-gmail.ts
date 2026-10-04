import { testGmailConnection } from "@edicut/platform-core/lib/gmail";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.cloudflare") });

async function main() {
  console.log("--- Gmail Send-Only Configuration Test ---");

  const result = await testGmailConnection();

  if (result.success) {
    console.log("\nOAuth token refresh succeeded and required Gmail configuration is present.");
    console.log("No Gmail profile data was read and no email was sent.");
    return;
  }

  console.log("\nConnection failed.");
  console.log("Error:", result.error);
  console.log("\nPlease check your CLIENT_ID, CLIENT_SECRET, and REFRESH_TOKEN.");
  process.exitCode = 1;
}

main();
