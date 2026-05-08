import { testGmailConnection } from "@edicut/platform-core/lib/gmail";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.cloudflare") });

async function main() {
  console.log("--- Gmail Configuration Test ---");
  console.log("Using GMAIL_SENDER_EMAIL:", process.env.GMAIL_SENDER_EMAIL);

  const result = await testGmailConnection();

  if (result.success) {
    console.log("\nConnection successful.");
    console.log("Logged in as:", result.email);
    if (result.match) {
      console.log("Sender email matches configured email.");
    } else {
      console.log("Warning: Logged in email does not match GMAIL_SENDER_EMAIL.");
      console.log("Expected:", process.env.GMAIL_SENDER_EMAIL);
      console.log("Found:", result.email);
    }
    return;
  }

  console.log("\nConnection failed.");
  console.log("Error:", result.error);
  console.log("\nPlease check your CLIENT_ID, CLIENT_SECRET, and REFRESH_TOKEN.");
  process.exitCode = 1;
}

main();
