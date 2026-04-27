import { testGmailConnection } from '../src/lib/gmail';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from the root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  console.log('--- Gmail Configuration Test ---');
  console.log('Using GMAIL_SENDER_EMAIL:', process.env.GMAIL_SENDER_EMAIL);
  
  const result = await testGmailConnection();
  
  if (result.success) {
    console.log('\n✅ Connection Successful!');
    console.log('Logged in as:', result.email);
    if (result.match) {
      console.log('Sender email matches configured email.');
    } else {
      console.log('⚠️ Warning: Logged in email does not match GMAIL_SENDER_EMAIL.');
      console.log('Expected:', process.env.GMAIL_SENDER_EMAIL);
      console.log('Found:', result.email);
    }
  } else {
    console.log('\n❌ Connection Failed!');
    console.log('Error:', result.error);
    console.log('\nPlease check your CLIENT_ID, CLIENT_SECRET, and REFRESH_TOKEN.');
  }
}

main();
