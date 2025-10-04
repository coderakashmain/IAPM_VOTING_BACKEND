// auth middleware
const jwt = require("jsonwebtoken");
const { failure } = require("../utils/response");

const auth = (req, res, next) => {
  let token = null;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return failure(res, "No token provided. Unauthorized", 401);
  }

  try {
   
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return failure(res, "Invalid or expired token", 401);
  }
};

module.exports = auth;
