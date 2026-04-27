import { sendMailViaGmail } from '../src/lib/gmail';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from the root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  console.log('--- Gmail API Real Mail Test ---');
  const recipient = process.env.GMAIL_SENDER_EMAIL || 'jaygadorkar@gmail.com';
  
  console.log(`Attempting to send a test email to: ${recipient}`);
  
  try {
    const result = await sendMailViaGmail({
      to: recipient,
      subject: 'Edicut Gmail API Test',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 600px;">
          <h2 style="color: #2563eb;">Gmail API Working!</h2>
          <p>This is a test email from your Edicut application to verify that the Gmail API configuration is fully functional.</p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin-top: 20px;">
            <p style="margin: 0; font-weight: bold;">Configuration Status: <span style="color: #16a34a;">Verified ✅</span></p>
          </div>
          <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Sent at: ${new Date().toLocaleString()}</p>
        </div>
      `
    });

    if (result.success) {
      console.log('\n✅ Email sent successfully!');
      console.log('Please check your inbox (and spam folder) for the "Edicut Gmail API Test" email.');
    }
  } catch (error) {
    console.log('\n❌ Failed to send email!');
    console.log('Error:', error);
  }
}

main();
