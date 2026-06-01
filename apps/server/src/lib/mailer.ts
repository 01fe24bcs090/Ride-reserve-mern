import nodemailer from 'nodemailer';
import dns from 'dns';
import { google } from 'googleapis';

// Force Node.js DNS resolver to prefer IPv4 over IPv6 globally
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

/**
 * Sends a premium-styled HTML email containing a 6-digit OTP code to verify a user's email.
 * Uses Gmail REST API in production to bypass Render SMTP blocks, or Ethereal for local dev.
 */
export async function sendOtpEmail(toEmail: string, otp: string): Promise<void> {
  // Always log the OTP to the console first for maximum reliability in dev environment
  console.log('\n' + '='.repeat(60));
  console.log(`🔑 SECURITY VERIFICATION REQUESTED`);
  console.log(`📧 Recipient: ${toEmail}`);
  console.log(`🔢 OTP Code:  \x1b[1m\x1b[33m${otp}\x1b[0m`);
  console.log('='.repeat(60) + '\n');

  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Hubballi BOV Transit - Verify Email</title>
        <style>
          body { font-family: 'Plus Jakarta Sans', 'Inter', Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #f8fafc; }
          .container { max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(15, 23, 42, 0.1); }
          .header { background: linear-gradient(135deg, #0f172a, #1e293b); padding: 36px 40px; text-align: center; }
          .header h1 { color: #ffffff; font-size: 1.5rem; font-weight: 800; margin: 0 0 4px 0; }
          .header p { color: rgba(255,255,255,0.7); font-size: 0.85rem; margin: 0; }
          .body { padding: 36px 40px; text-align: center; }
          .otp-box { background: #f1f5f9; border: 2px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 24px 0; }
          .otp-code { font-size: 3rem; font-weight: 900; letter-spacing: 14px; color: #ff7700; }
          .footer { padding: 20px 40px; background: #f8fafc; text-align: center; font-size: 0.78rem; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚌 Hubballi BOV Transit</h1>
            <p>SSS Hubballi Junction — Email Verification</p>
          </div>
          <div class="body">
            <p style="color: #334155; font-size: 1rem; margin: 0 0 8px 0;">Your 6-digit verification code is:</p>
            <div class="otp-box"><div class="otp-code">${otp}</div></div>
            <p style="color: #64748b; font-size: 0.88rem; line-height: 1.6;">This code expires in <strong>10 minutes</strong>. If you didn't request this, please ignore this email.</p>
          </div>
          <div class="footer">Hubballi BOV Transit · SSS Hubballi Junction · Do not reply to this email.</div>
        </div>
      </body>
      </html>
    `;

    const subject = `Your verification code: ${otp}`;
    const textContent = `Your Hubballi BOV Transit verification code is: ${otp}\n\nThis code expires in 10 minutes.`;
    const fromName = '"Hubballi BOV Transit"';
    const fromEmail = process.env.GMAIL_USER?.trim() || 'noreply@hubballi-bov.app';

    // 1. PRODUCTION: Use Gmail REST API (Bypasses Render SMTP Block)
    if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
      const oAuth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID.trim(),
        process.env.GMAIL_CLIENT_SECRET.trim(),
        'https://developers.google.com/oauthplayground'
      );
      
      oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN.trim() });
      const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `From: ${fromName} <${fromEmail}>`,
        `To: ${toEmail}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${utf8Subject}`,
        '',
        htmlContent,
      ];
      
      const message = messageParts.join('\n');
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage },
      });
      return; // Exit after successful HTTP send
    }

    // 2. DEVELOPMENT: Fallback to local Nodemailer Ethereal testing
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    const info = await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
      text: textContent,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('📬 Email preview URL:', previewUrl);
    }

  } catch (error) {
    console.error('❌ Failed to send email:', error);
  }
}