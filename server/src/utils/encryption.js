const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCODING = 'hex';

/**
 * Get the encryption key from environment variable
 * Must be 32 bytes (256 bits) for AES-256
 */
const getKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  // If key is shorter than 32 bytes, hash it to get a consistent 32-byte key
  return crypto.createHash('sha256').update(key).digest();
};

/**
 * Encrypt a string value
 * Returns: iv:encrypted:tag in hex format
 */
const encrypt = (text) => {
  if (!text) return null;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const tag = cipher.getAuthTag();

  return `${iv.toString(ENCODING)}:${encrypted}:${tag.toString(ENCODING)}`;
};

/**
 * Decrypt a string value
 * Expects format: iv:encrypted:tag in hex
 */
const decrypt = (encryptedText) => {
  if (!encryptedText) return null;

  const key = getKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], ENCODING);
  const encrypted = parts[1];
  const tag = Buffer.from(parts[2], ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Encrypt a JSON object
 */
const encryptJSON = (obj) => {
  if (!obj) return null;
  return encrypt(JSON.stringify(obj));
};

/**
 * Decrypt to a JSON object
 */
const decryptJSON = (encryptedText) => {
  if (!encryptedText) return null;
  const decrypted = decrypt(encryptedText);
  return JSON.parse(decrypted);
};

module.exports = { encrypt, decrypt, encryptJSON, decryptJSON };
