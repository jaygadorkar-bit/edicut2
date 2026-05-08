import readline from 'readline';
import { URLSearchParams } from 'url';
import * as dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.cloudflare" });

type TokenResponse = {
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

/**
 * This script helps you get a long-lived GMAIL_REFRESH_TOKEN.
 * 
 * Instructions:
 * 1. Go to https://developers.google.com/oauthplayground
 * 2. Click the Gear icon (top right) -> Check "Use your own OAuth2 credentials"
 * 3. Enter your Client ID and Client Secret from Google Cloud Console.
 * 4. Step 1: Select "https://mail.google.com/" and click "Authorize APIs".
 * 5. Sign in and Allow access.
 * 6. Step 2: You will see an "Authorization code". copy it!
 * 7. Run this script: npx tsx scripts/get-gmail-token.ts
 * 8. Paste the code when prompted.
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getToken() {
  console.log('\n--- Gmail Refresh Token Helper ---');
  
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in your environment or .env file.');
    process.exit(1);
  }

  rl.question('Paste your Authorization Code from OAuth Playground: ', async (code) => {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code.trim(),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: 'https://developers.google.com/oauthplayground',
          grant_type: 'authorization_code',
        }).toString(),
      });

      const data = (await response.json()) as TokenResponse;

      if (data.error) {
        console.error('\nError from Google:', data.error_description || data.error);
      } else {
        console.log('\n--- Success! ---');
        console.log('GMAIL_REFRESH_TOKEN=' + data.refresh_token);
        console.log('\nAdd this to your .env file.');
      }
    } catch (error) {
      console.error('\nFailed to fetch token:', error);
    } finally {
      rl.close();
    }
  });
}

getToken();
