import nodemailer from 'nodemailer';

/**
 * Sends a premium-styled HTML email containing a 6-digit OTP code to verify a user's email.
 * Falls back to dynamic Ethereal test inbox generation and prints details to the server console.
 * 
 * @param toEmail The recipient's email address
 * @param otp The 6-digit verification code
 */
export async function sendOtpEmail(toEmail: string, otp: string): Promise<void> {
  // Always log the OTP to the console first for maximum reliability in dev environment
  console.log('\n' + '='.repeat(60));
  console.log(`🔑 SECURITY VERIFICATION REQUESTED`);
  console.log(`📧 Recipient: ${toEmail}`);
  console.log(`🔢 OTP Code:  \x1b[1m\x1b[33m${otp}\x1b[0m`);
  console.log('='.repeat(60) + '\n');

  try {
    let transporter: nodemailer.Transporter;

    // Trim all SMTP variables to prevent timeout/auth issues from copy-paste trailing spaces
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();
    const smtpPortStr = process.env.SMTP_PORT?.trim() || '587';
    const smtpPort = parseInt(smtpPortStr);

    if (smtpHost && smtpUser && smtpPass) {
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPortStr === '465',
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    } else {
      // Create Ethereal test account dynamically for dynamic mail preview
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Hubballi BOV Transit - Verify Email</title>
        <style>
          body {
            font-family: 'Plus Jakarta Sans', 'Inter', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: #f8fafc;
          }
          .container {
            max-width: 520px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(15, 23, 42, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #0f172a, #1e293b);
            padding: 36px 40px;
            text-align: center;
          }
          .header h1 {
            color: #ffffff;
            font-size: 1.5rem;
            font-weight: 800;
            margin: 0 0 4px 0;
          }
          .header p {
            color: rgba(255,255,255,0.7);
            font-size: 0.85rem;
            margin: 0;
          }
          .body {
            padding: 36px 40px;
            text-align: center;
          }
          .otp-box {
            background: #f1f5f9;
            border: 2px solid #e2e8f0;
            border-radius: 16px;
            padding: 24px;
            margin: 24px 0;
          }
          .otp-code {
            font-size: 3rem;
            font-weight: 900;
            letter-spacing: 14px;
            color: #ff7700;
          }
          .footer {
            padding: 20px 40px;
            background: #f8fafc;
            text-align: center;
            font-size: 0.78rem;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
          }
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
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p style="color: #64748b; font-size: 0.88rem; line-height: 1.6;">
              This code expires in <strong>10 minutes</strong>. If you didn't request this, please ignore this email.
            </p>
          </div>
          <div class="footer">
            Hubballi BOV Transit · SSS Hubballi Junction · Do not reply to this email.
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Hubballi BOV Transit" <noreply@hubballi-bov.app>',
      to: toEmail,
      subject: `Your verification code: ${otp}`,
      html: htmlContent,
      text: `Your Hubballi BOV Transit verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
    });

    // Log Ethereal preview URL if using test account
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('📬 Email preview URL:', previewUrl);
    }
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    // Do NOT re-throw — OTP is still printed to console above
  }
}