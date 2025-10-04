const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { success, failure } = require("../utils/response");
const validate = require("../middleware/validate");
const { creatmemberSchema, createOtpsend } = require("../schemas/userSchema");
const sendOtpMail = require("../mails/otpMail");
const { sendOtpSms } = require("../utils/smsProvider");
const router = express.Router();

router.post(
  "/memberid",
  validate(creatmemberSchema),
  asyncHandler(async (req, res) => {
    const { memberId, electionId } = req.body;
    const query = `SELECT 
    v.member_primary_mobile,
    v.member_email
FROM Voters v
JOIN ElectionMaster e 
    ON v.election_id = e.election_id
WHERE v.member_id = ? AND v.election_id = ?
  AND e.active = TRUE;
`;
    const [rows] = await req.db.query(query, [memberId, electionId]);

    if (rows.length === 0) {
      return failure(res, "Member Id is incorrect!", 401);
    }

    const member = rows.map((m) => ({
      member_primary_mobile: m.member_primary_mobile.replace(
        /^(\d{3})\d{3}(\d{4})$/,
        "$1xxxx$2"
      ),
      member_email: m.member_email.replace(/^(.{2}).*(@.*)$/, "$1xxxxx$2"),
    }));

    success(res, "Autherized Member!", member);
  })
);

router.post(
  "/otpsend",
  validate(createOtpsend),
  asyncHandler(async (req, res) => {
    const { selectedMethod, memberId, electionId } = req.body;

    if(!selectedMethod === 'phone' || !selectedMethod === 'email'){
      return failure(res, "Incorrect method. Use 'email' or 'phone'.", 400);
    }

    const query = `SELECT v.member_email ,v.member_primary_mobile 
FROM Voters v
JOIN ElectionMaster e 
  ON v.election_id = e.election_id
WHERE v.member_id = ? 
  AND v.election_id = ? 
  AND e.active = TRUE;

`;

    const [rows] = await req.db.query(query, [memberId, electionId]);

    if (rows.length === 0) {
      return failure(res, "Member not found!", 401);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = new Date(Date.now() + 5 * 60 * 1000);

    await req.db.query(
      "UPDATE Voters SET otp=?, otp_expire=? WHERE member_id=? AND election_id=? ",
      [otp, otpExpire, memberId, electionId]
    );

    if (selectedMethod === "email") {
      try {
        await sendOtpMail(rows[0]?.member_email, otp);

        return success(res, "OTP sent successfully via email");
      } catch (err) {
        console.error(err);

        if (err.message.includes("save otp")) {
          return failure(res, "Failed to save OTP in database", 500);
        }

        return failure(res, "Failed to send OTP via email", 500);
      }
    }

    if (selectedMethod === "phone") {

      try {
        await sendOtpSms(rows[0]?.member_primary_mobile, otp);

        return success(res, "OTP sent successfully via phone no.");
      } catch (err) {
        console.error(err);

        if (err.message.includes("save otp")) {
          return failure(res, "Failed to save OTP in database", 500);
        }

        return failure(res, "Failed to send OTP via phone no.", 500);
      }
    }

    
  })
);

// router.post("/otpverify", asyncHandler(async (req,res)=>{

// }))

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const [users] = await req.db.query(
      "SELECT * FROM Voters WHERE member_email = ?",
      [email]
    );
    if (users.length === 0)
      return failure(res, "Invalid email or password ", 401);

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return failure(res, "Invalid email or password ", 401);

    // Access token (short-lived)
    const accessToken = jwt.sign(
      { member_id: user.member_id, email: user.member_email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" } // 15 minutes is best practice
    );

    // Refresh token (long-lived

    const refreshToken = jwt.sign(
      { member_id: user.member_id, email: user.member_email },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" } // 7 days
    );

    // Save refresh token in DB for logout/revocation if needed
    await req.db.query(
      "UPDATE Voters SET refresh_token = ? WHERE member_id = ?",
      [refreshToken, user.member_id]
    );

    // Send as HttpOnly cookies
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    success(
      res,
      "Login successful ",
      { memerId: user.member_id },
      { token: accessToken }
    );
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) return failure(res, "No refresh token provided ", 401);

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return failure(res, "Invalid refresh token ", 403);
    }

    // Check refresh token in DB

    const [users] = await req.db.query(
      "SELECT member_id FROM Voters WHERE member_id = ? AND refresh_token = ?",
      [decoded.member_id, refreshToken]
    );
    if (users.length === 0)
      return failure(res, "Refresh token not valid ", 403);

    // Generate new access token
    const newAccessToken = jwt.sign(
      { member_id: decoded.member_id, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.cookie("access_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    return success(
      res,
      "Access token refreshed ",
      { memberId: decoded.member_id },
      { token: newAccessToken }
    );
  })
);
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) return failure(res, "No refresh token provided ", 401);

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return failure(res, "Invalid refresh token ", 403);
    }

    // Check refresh token in DB

    const [users] = await req.db.query(
      "UPDATE Voters SET refresh_token = NULL WHERE member_id = ?",
      [decoded.member_id]
    );
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    return success(res, "Logout Successfully!");
  })
);

module.exports = router;
