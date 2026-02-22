const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const QR_MASTER_SECRET = process.env.QR_MASTER_SECRET || crypto.randomBytes(32).toString('hex');

function generateQRPayload(eventId) {
  const windowKey = Math.floor(Date.now() / 30000);
  const secret = crypto.createHash('sha256').update(eventId + QR_MASTER_SECRET + windowKey).digest('hex');
  return jwt.sign({ eventId, window: windowKey }, secret, { expiresIn: 30 });
}

function verifyQRPayload(token, eventId) {
  const currentWindow = Math.floor(Date.now() / 30000);
  // Try current window
  for (const windowKey of [currentWindow, currentWindow - 1]) {
    try {
      const secret = crypto.createHash('sha256').update(eventId + QR_MASTER_SECRET + windowKey).digest('hex');
      return jwt.verify(token, secret);
    } catch (e) {
      continue;
    }
  }
  throw new Error('Invalid or expired QR code');
}

module.exports = { generateQRPayload, verifyQRPayload };
