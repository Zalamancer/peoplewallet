const up = `
  CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);

  ALTER TABLE users ADD COLUMN IF NOT EXISTS school_email VARCHAR(255);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS school_email_verified BOOLEAN DEFAULT FALSE;
`;

const down = `
  DROP TABLE IF EXISTS email_verifications;
  ALTER TABLE users DROP COLUMN IF EXISTS school_email;
  ALTER TABLE users DROP COLUMN IF EXISTS school_email_verified;
`;

module.exports = { up, down };
