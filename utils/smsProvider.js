const twilio = require("twilio");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const sendOtpSms = async (phone, otp) => {
  const phoneNo = `+91${phone}`;
  try {
    const message = await client.messages.create({
      body: `Your Bindhash OTP is ${otp}. It will expire in 5 minutes.`,
      from: process.env.TWILIO_PHONE, 
      to: phoneNo,
    });
    console.log("SMS sent:", message.sid);
    return true;
  } catch (err) {
    console.error("Error sending SMS OTP:", err);
    throw new Error("Failed to send OTP via SMS");
  }
};

module.exports = { sendOtpSms };
