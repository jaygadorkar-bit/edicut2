const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

let runtimeEnv: Record<string, string | undefined> = {};

export function configureGmailRuntimeEnv(env: Record<string, string | undefined>) {
  runtimeEnv = { ...runtimeEnv, ...env };
}

function requireEnv(name: string) {
  const processEnv = typeof process === "undefined" ? {} : process.env;
  const value = runtimeEnv[name] ?? processEnv[name];
  if (!value) {
    throw new Error(`Missing required Gmail configuration: ${name}`);
  }

  return value;
}

async function getGoogleAccessToken() {
  const clientId = requireEnv("GMAIL_CLIENT_ID");
  const clientSecret = requireEnv("GMAIL_CLIENT_SECRET");
  const refreshToken = requireEnv("GMAIL_REFRESH_TOKEN");

  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Gmail access token: ${errorText}`);
  }

  const data = (await response.json()) as { access_token?: string };

  if (!data.access_token) {
    throw new Error("Gmail access token response did not include an access token.");
  }

  return data.access_token;
}

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendMailViaGmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    const senderEmail = requireEnv("GMAIL_SENDER_EMAIL");
    const accessToken = await getGoogleAccessToken();

    const mimeMessage = [
      `From: ${senderEmail}`,
      `To: ${to}`,
      "Content-Type: text/html; charset=UTF-8",
      "MIME-Version: 1.0",
      `Subject: ${subject}`,
      "",
      html,
    ].join("\r\n");

    const response = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: toBase64Url(mimeMessage),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gmail API Send Error:", errorText);
      throw new Error(`Failed to send Gmail message. Status: ${response.status}. Check server logs for details.`);
    }

    return { success: true };
  } catch (error) {
    console.error("Gmail API Utility Error:", error);
    throw error;
  }
}

/**
 * Utility to verify if the Gmail configuration is working.
 * Can be called from an admin action or script.
 */
export async function testGmailConnection() {
  try {
    const accessToken = await getGoogleAccessToken();
    const processEnv = typeof process === "undefined" ? {} : process.env;
    const senderEmail = runtimeEnv.GMAIL_SENDER_EMAIL ?? processEnv.GMAIL_SENDER_EMAIL;
    
    // Check if we can get user info (basic verification)
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

    const profile = (await response.json()) as { emailAddress?: string };
    return { 
      success: true, 
      email: profile.emailAddress,
      configuredSender: senderEmail,
      match: profile.emailAddress === senderEmail
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

