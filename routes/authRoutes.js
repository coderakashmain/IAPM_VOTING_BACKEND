const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { success, failure } = require("../utils/response");
const validate = require("../middleware/validate");
const { creatmemberSchema, createOtpsend ,createverifyOtp} = require("../schemas/userSchema");
const sendOtpMail = require("../mails/otpMail");
const { sendOtpSms } = require("../utils/smsProvider");
const router = express.Router();
const { authtoken, verifyauth } = require("../middleware/auth");
const { generateOtp, verifyOtp } = require("../middleware/hashingHandler");

router.post(
  "/memberid",
  validate(creatmemberSchema),
  asyncHandler(async (req, res) => {
    const { memberId, electionId, post_id } = req.body;

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
      const [rows] = await req.db.query(
        "select voter_id from Voters where member_id = ?",
        [memberId]
      );
      if (rows.length > 0) {
        return failure(res, "You are not eligible to vote this post.", 401);
      }
      return failure(res, "Member Id is incorrect!", 401);
    }

    const user = rows[0];

    const intialtoken = jwt.sign(
      {
        member_id: memberId,
        electionId: electionId,
        post_id: user.post_id,
        post_id,
      },
      process.env.JWT_VERIFY_SECRET,
      { expiresIn: "10m" }
    );

    res.cookie("verify_token", intialtoken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 10 * 60 * 1000,
    });

    const member = rows.map((m) => ({
      member_primary_mobile: m.member_primary_mobile.replace(
        /^(\d{3})\d{3}(\d{4})$/,
        "$1xxxx$2"
      ),
      member_email: m.member_email.replace(/^(.{2}).*(@.*)$/, "$1xxxxx$2"),
    }));

    success(res, "Autherized Member!", member, { token: intialtoken });
  })
);

router.post(
  "/otpsend/:token",
  validate(createOtpsend),
  verifyauth,
  asyncHandler(async (req, res) => {
    const { selectedMethod } = req.body;
    const { token } = req.params;

    if (!token) {
      return failure(res, "token is required!", 401);
    }
    const { member_id, electionId } = req.user;

    const query = `SELECT v.member_email ,v.member_primary_mobile 
FROM Voters v
JOIN ElectionMaster e 
  ON v.election_id = e.election_id
WHERE v.member_id = ? 
  AND v.election_id = ? 
  AND e.active = TRUE;

`;

    const [rows] = await req.db.query(query, [member_id, electionId]);

    if (rows.length === 0) {
      return failure(res, "Member not found!", 401);
    }

    const { otp, hash, salt } = generateOtp();
    const otpExpire = new Date(Date.now() + 5 * 60 * 1000);

    await req.db.query(
      "UPDATE Voters SET otp=?, otp_expire=? , salt = ? WHERE member_id=? AND election_id=? ",
      [hash, otpExpire, salt, member_id, electionId]
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
  "/otpverify/:token",
  verifyauth,
  validate(createverifyOtp),
  asyncHandler(async (req, res) => {
    const { OTP } = req.body;
    const { member_id, electionId, post_id } = req.user;
    const { token } = req.params;

    if (!token) {
      return failure(res, "token is required!", 401);
    }

    const query = `
SELECT u.voter_id,u.otp, u.otp_expire, u.salt,c.candidate_id
FROM Voters AS u
JOIN ElectionMaster AS v
  ON v.election_id = u.election_id
JOIN Posts as p 
ON p.election_id = v.election_id
 JOIN candidates as c
 ON c.post_id = p.post_id
WHERE u.member_id = ? 
  AND u.election_id = ? 
  AND v.active = TRUE
`;
    const [users] = await req.db.query(query, [member_id, electionId]);
    if (users.length === 0) return failure(res, "Member is not found ", 404);

    

    const combined = {
      voter_id: users[0].voter_id,
      otp: users[0].otp,
      otp_expire: users[0].otp_expire,
      salt: users[0].salt,
      candidate_ids: users.map((r) => r.candidate_id),
    };

    const isMatch = verifyOtp(OTP, combined.otp, combined.salt);
    if (!isMatch) return failure(res, "Invalid OTP", 401);

    const currenttime = new Date();
    const otpexpire = new Date(combined.otp_expire);
    if (currenttime > otpexpire) {
      await req.db.query(
        "UPDATE Voters SET otp=null, otp_expire=null , salt = null WHERE voter_id=?  ",
        [combined.voter_id]
      );
      return failure(res, "otp expired!", 402);
    }

    // Access token (short-lived)
    const accessToken = jwt.sign(
      {
        voter_id: combined.voter_id,
        member_id: member_id,
        election_id: electionId,
        post_id,
        candidate_ids : combined.candidate_ids
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" } // 15 minutes is best practice
    );

    // Refresh token (long-lived

    const refreshToken = jwt.sign(
      {
        voter_id: combined.voter_id,
        member_id: member_id,
        election_id: electionId,
        post_id,
          candidate_ids : combined.candidate_ids
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" } // 7 days
    );

    await req.db.query(
      "UPDATE Voters SET refresh_token = ? WHERE voter_id = ?",
      [refreshToken, combined.voter_id]
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

    res.clearCookie("verify_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    success(res, "Login successful ", {}, { token: accessToken });
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

    await req.db.query(
      "UPDATE Voters SET refresh_token = NULL WHERE member_id = ?",
      [decoded.member_id]
    );
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    res.clearCookie("verify_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    return success(res, "Logout Successfully!");
  })
);
router.get(
  "/checkloginstate",
  asyncHandler(async (req, res) => {
    const verify_token = req.cookies.verify_token;
    if (!verify_token) return failure(res, "unAuthorized.", 401);

    return success(res, "Authorized!");
  })
);

module.exports = router;
