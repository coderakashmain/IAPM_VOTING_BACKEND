// mails/otpmail.js
const transporter = require('../schemas/mailProvider')
const {success , failure} = require("../utils/response")

async function sendOtpMail(email, otp) {
  if (!email || !otp) throw new Error("Email and OTP are required");

  const mailOptions = {
    to: email,
    from: process.env.EMAIL_USER,
    subject: "OTP For Verifying Member Id.",
    html: `
      <html>
  <body>
    <div style="background-color: #f9f9f9; padding: 20px; font-family: Arial, sans-serif;">
      <div style="background-color: #ffffff; padding: 25px; border-radius: 8px; box-shadow: 0 3px 12px rgba(0,0,0,0.1); max-width: 600px; margin: auto;">
        
        <!-- Header -->
        <h2 style="color: #2c3e50; text-align: center;">Login Verification</h2>
        
        <!-- Body -->
        <p style="color: #444; font-size: 15px;">
          You are trying to log in to your account on our <strong>Voting Platform</strong>.  
          Please use the following OTP to complete your login:
        </p>
        
        <!-- OTP Highlight -->
        <div style="text-align: center; margin: 20px 0;">
          <h2 style="color: #007bff; letter-spacing: 3px; font-size: 24px; background: #f1f6ff; display: inline-block; padding: 12px 24px; border-radius: 6px; font-weight: bold;">
            ${otp}
          </h2>
        </div>
        
        <!-- Footer -->
        <p style="color: #555; font-size: 14px;">
          This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone for security reasons.
        </p>
        
        <p style="color: #555; font-size: 14px;">
          If you did not attempt to log in, please ignore this email or contact support immediately.
        </p>
        
        <p style="color: #555; font-size: 14px; margin-top: 20px;">
          Best regards,  
          <br><strong>The Voting Platform Team</strong>
        </p>
      </div>
    </div>
  </body>
</html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  
  } catch (err) {
    failure(res,"Error sending OTP email");
    console.error("Error sending OTP email:", err);
    throw new Error("Failed to send OTP via email");
  }
}

module.exports = sendOtpMail;
