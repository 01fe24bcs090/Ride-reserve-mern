const nodemailer = require('nodemailer');

const SMTP_USER = 'ridereserve580031@gmail.com';
const SMTP_PASS = 'YOUR_APP_PASSWORD_HERE'; // Replace with your generated Google App Password

async function testEmail() {
  console.log('⏳ Attempting to send test email to ' + SMTP_USER + ' via Secure Port 465...');

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL for port 465
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Hubballi BOV Transit Test" <${SMTP_USER}>`,
      to: SMTP_USER, 
      subject: '🔑 SMTP Credentials Test Connection',
      text: 'Congratulations! Your Gmail SMTP App Password is working perfectly.',
      html: `
        <div style="font-family: sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px; max-width: 500px; margin: auto;">
          <h2 style="color: #0f172a;">🎉 SMTP Test Successful!</h2>
          <p style="color: #334155;">Your SMTP configuration works perfectly. You can now use these credentials on your production dashboard.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <small style="color: #94a3b8;">Sent via Ride-Reserve Server</small>
        </div>
      `,
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
  }
}

testEmail();
