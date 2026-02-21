const { encrypt, decrypt, encryptJSON, decryptJSON } = require('../src/utils/encryption');

// Set a test encryption key
beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests';
});

describe('Encryption Utils', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const original = 'Hello, World!';
      const encrypted = encrypt(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted).toContain(':');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should return null for null input', () => {
      expect(encrypt(null)).toBeNull();
      expect(decrypt(null)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(encrypt('')).toBeNull();
    });

    it('should handle unicode characters', () => {
      const original = 'Hello, \u4e16\u754c! \ud83c\udf0d';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
      const original = 'Same text';
      const encrypted1 = encrypt(original);
      const encrypted2 = encrypt(original);
      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(original);
      expect(decrypt(encrypted2)).toBe(original);
    });

    it('should throw on invalid encrypted format', () => {
      expect(() => decrypt('not-valid-format')).toThrow('Invalid encrypted text format');
    });

    it('should handle long strings', () => {
      const original = 'A'.repeat(10000);
      const encrypted = encrypt(original);
      expect(decrypt(encrypted)).toBe(original);
    });
  });

  describe('encryptJSON/decryptJSON', () => {
    it('should encrypt and decrypt a JSON object', () => {
      const original = { name: 'John', age: 25, tags: ['friend', 'college'] };
      const encrypted = encryptJSON(original);
      expect(typeof encrypted).toBe('string');
      const decrypted = decryptJSON(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('should return null for null input', () => {
      expect(encryptJSON(null)).toBeNull();
      expect(decryptJSON(null)).toBeNull();
    });

    it('should handle nested objects', () => {
      const original = {
        contact: {
          name: 'Jane',
          professional: { school: 'UTD', major: 'CS' },
          tags: ['networking', 'career-fair'],
        },
      };
      const encrypted = encryptJSON(original);
      expect(decryptJSON(encrypted)).toEqual(original);
    });
  });
});

describe('Encryption Key', () => {
  it('should throw if ENCRYPTION_KEY is not set', () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is required');
    process.env.ENCRYPTION_KEY = originalKey;
  });
});
