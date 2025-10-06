const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { success, failure } = require("../utils/response");
const { authtoken } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { creatVotechoose } = require("../schemas/userSchema");
const router = express.Router();
const {
  encryptVote,
  hashVote,
  decryptVote,
} = require("../middleware/hashingHandler");
const db = require("../config/db");

router.get(
  "/getallvote",
  asyncHandler(async (req, res) => {
    const query = `
      SELECT 
          e.election_id,
          e.organization_name,
          e.election_start,
          e.election_end,
          e.active,
          p.post_id,
          p.post,
          p.post_name,
          p.post_about,
          c.candidate_id,
          c.member_id,
          c.candidate_name,
          c.profile_pic as candidate_pic,
          c.candidate_email,
          c.about_candidate,
          c.brochure_pdf
      FROM ElectionMaster e
      JOIN Posts p ON e.election_id = p.election_id
      LEFT JOIN Candidates c ON p.post_id = c.post_id
      WHERE e.active = TRUE
    `;

    const [results] = await req.db.query(query);

    if (results.length === 0) {
      return failure(res, "No active election found.", 404);
    }

    const electionsMap = {};

    results.forEach((row) => {
      if (!electionsMap[row.election_id]) {
        electionsMap[row.election_id] = {
          election_id: row.election_id,
          organization_name: row.organization_name,
          election_start: row.election_start,
          election_end: row.election_end,
          active: row.active,
          post_id: row.post_id,
          post: row.post,
          post_name: row.post_name,
          post_about: row.post_about,
          candidates: [],
        };
      }

      // Add candidates
      if (row.candidate_id) {
        electionsMap[row.election_id].candidates.push({
          candidate_id: row.candidate_id,
          member_id: row.member_id,
          candidate_name: row.candidate_name,
          candidate_pic: row.candidate_pic,
          candidate_email: row.candidate_email,
          about_candidate: row.about_candidate,
          brochure_pdf: row.brochure_pdf,
        });
      }
    });

    const elections = Object.values(electionsMap);

    success(res, "Elections fetched successfully", elections);
  })
);

router.post(
  "/fetch/postdetails",
  authtoken,
  asyncHandler(async (req, res) => {
    const { post_id } = req.body;

    const user = req.user;

    const query = `
      SELECT 
          e.election_id,
          e.organization_name,
          e.election_start,
          e.election_end,
          e.active,
          p.post_id,
          p.post,
          p.post_name,
          p.post_about,
          c.candidate_id,
          c.member_id,
          c.candidate_name,
          c.profile_pic as candidate_pic,
          c.candidate_email,
          c.about_candidate,
          c.brochure_pdf,
          v.has_voted,
          f.encrypted_choice
      FROM ElectionMaster e
      JOIN Posts p ON p.election_id = e.election_id
      JOIN Candidates c ON c.post_id = p.post_id
      JOIN Voters v ON v.election_id = e.election_id
      LEFT  JOIN Votes f on f.voter_id = v.voter_id
      WHERE e.election_id = ?  AND v.election_id = ? AND v.member_id = ? AND  p.post_id = ? AND e.active = TRUE 
    `;

    const [results] = await req.db.query(query, [
      user.election_id,
      user.election_id,
      user.member_id,
      post_id,
    ]);

    if (results.length === 0) {
      return failure(res, "No  election found.", 404);
    }

    let vote_to = null;
    if (results[0].encrypted_choice) {
      vote_to = decryptVote(results[0].encrypted_choice);
    }

    const electionsMap = {};

    results.forEach((row) => {
      if (!electionsMap[row.election_id]) {
        electionsMap[row.election_id] = {
          election_id: row.election_id,
          organization_name: row.organization_name,
          election_start: row.election_start,
          election_end: row.election_end,
          active: row.active,
          post_id: row.post_id,
          post: row.post,
          post_name: row.post_name,
          post_about: row.post_about,
          has_voted: row.has_voted,
          vote_to: vote_to ? Number(vote_to) : vote_to,
          candidates: [],
        };
      }

      // Add candidates
      if (row.candidate_id) {
        electionsMap[row.election_id].candidates.push({
          candidate_id: row.candidate_id,
          member_id: row.member_id,
          candidate_name: row.candidate_name,
          candidate_pic: row.candidate_pic,
          candidate_email: row.candidate_email,
          about_candidate: row.about_candidate,
          brochure_pdf: row.brochure_pdf,
        });
      }
    });

    const elections = Object.values(electionsMap);

    return success(res, "Elections fetched successfully", elections);
  })
);

router.post(
  "/choosecandidate",
  validate(creatVotechoose),
  authtoken,
  asyncHandler(async (req, res) => {
    const ip = (
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      req.ip
    )
      .toString()
      .split(",")[0]
      .trim();
    const userAgent = req.get("User-Agent") || "";

    const user = req.user;
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `SELECT c.vote_id
  FROM voters v
  LEFT JOIN votes c ON v.voter_id = c.voter_id
  WHERE v.voter_id = ? AND (c.vote_id IS NOT NULL OR v.has_voted = TRUE)`,
        [user.voter_id]
      );
   

      if (result.length > 0) {
        return failure(res, "Already voted.", 401);
      }

      const candidate_id = Number(req.body.candidate_id);
      const candidate_ids = req.user.candidate_ids.map(Number);

      if (candidate_ids.length === 0) {
        return failure(res, "Candidate list is empty or invalid", 400);
      }

      const isValidCandidate = candidate_ids.includes(candidate_id);

      if (!isValidCandidate) {
        return failure(res, "Invalid candidate selection", 403);
      }

      const encryptedVote = encryptVote(candidate_id);
      const { hash, salt } = hashVote(candidate_id);

      await connection.query(
        `INSERT INTO votes (voter_id, election_id,post_id, encrypted_choice, vote_hash, salt) VALUES (?, ?, ?, ?, ?, ? )`,
        [
          user.voter_id,
          user.election_id,
          user.post_id,
          encryptedVote,
          hash,
          salt,
        ]
      );

      await connection.query(
        ` UPDATE voters set has_voted = TRUE where member_id = ? `,
        [user.member_id]
      );

      await connection.query(
        `INSERT INTO voteaudit (voter_id,election_id,post_id,ip_address,user_agent) VALUES (?,?,?,?,?)`,
        [user.voter_id, user.election_id, user.post_id, ip, userAgent]
      );

      await connection.commit();
      return success(res, "Vote securely recorded");
    } catch (err) {
      await connection.rollback();
      console.error("Error storing vote:", err);
      return failure(res, "Failed to record vote", 500);
    } finally {
      if (connection) connection.release();
    }
  })
);

module.exports = router;
