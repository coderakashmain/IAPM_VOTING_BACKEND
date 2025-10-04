const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { success, failure } = require("../utils/response");

const router = express.Router();

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

    // Map elections by ID
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
          post_about : row.post_about,
          candidates: []
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
          brochure_pdf: row.brochure_pdf
        });
      }
    });

    const elections = Object.values(electionsMap);

    success(res, "Elections fetched successfully", elections);
  })
);

module.exports = router;
