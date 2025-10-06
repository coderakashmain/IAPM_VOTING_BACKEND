// auth middleware
const jwt = require("jsonwebtoken");
const { failure } = require("../utils/response");
 
const authtoken = (req, res, next) => {
  let token = null;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

   else if (req.cookies?.access_token) {
    token = req.cookies.access_token;
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

const verifyauth = (req, res, next) => {
  const verifyToken = req.cookies.verify_token;


  if (!verifyToken) {
    return failure(res, "Session Expired!", 401);
  }

  try {
   
    const decoded = jwt.verify(verifyToken, process.env.JWT_VERIFY_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return failure(res, "Invalid or expired token", 401);
  }
};

module.exports = {authtoken,verifyauth};
