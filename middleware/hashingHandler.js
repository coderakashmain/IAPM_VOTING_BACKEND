const crypto = require("crypto");

function generateOtp() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); 
  const salt = crypto.randomBytes(16).toString("hex");

 const hash = crypto.createHash("sha256").update(salt + otp).digest("hex");
  return { otp, hash ,salt};
}

function verifyOtp(inputOtp, storedHash, storedSalt) {
  const hash = crypto.createHash("sha256").update(storedSalt + inputOtp).digest("hex");
  return hash === storedHash;
}


//vote encryption

const algorithm = "aes-256-cbc";
const secretKey =  crypto.createHash("sha256").update(process.env.VOTE_SECRET_KEY).digest();


function encryptVote(candidateId) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  let encrypted = cipher.update(candidateId.toString(), "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}


function decryptVote(encryptedVote) {
  const [ivHex, encryptedHex] = encryptedVote.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}


function hashVote(candidateId, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.createHash("sha256").update(salt + candidateId).digest("hex");
  return { hash, salt };
}

module.exports = {
  generateOtp,
  verifyOtp,
  encryptVote,
  decryptVote,
  hashVote,
};