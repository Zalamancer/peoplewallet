/**
 * Migration: Mutual connections support
 * Creates a materialized view / table to track cross-user connections
 * based on shared contacts (matched by name, email, or LinkedIn URL).
 *
 * user_connections links two users who both have a contact record
 * referring to the same real-world person.
 */

const up = `
-- Tracks discovered mutual connections between two users through a shared contact identity
CREATE TABLE user_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_a_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  contact_b_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  matched_on VARCHAR(50) NOT NULL CHECK (matched_on IN ('name', 'email', 'linkedin')),
  shared_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure we don't create duplicate connection pairs for the same contact match
CREATE UNIQUE INDEX idx_user_connections_pair ON user_connections(
  LEAST(contact_a_id, contact_b_id),
  GREATEST(contact_a_id, contact_b_id)
);

CREATE INDEX idx_user_connections_user_a ON user_connections(user_a_id);
CREATE INDEX idx_user_connections_user_b ON user_connections(user_b_id);
CREATE INDEX idx_user_connections_contact_a ON user_connections(contact_a_id);
CREATE INDEX idx_user_connections_contact_b ON user_connections(contact_b_id);

-- Add email column to contacts for matching purposes
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email VARCHAR(255);
CREATE INDEX idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;

-- Add linkedin_url to contacts for matching purposes
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
CREATE INDEX idx_contacts_linkedin_url ON contacts(linkedin_url) WHERE linkedin_url IS NOT NULL;
`;

const down = `
ALTER TABLE contacts DROP COLUMN IF EXISTS linkedin_url;
ALTER TABLE contacts DROP COLUMN IF EXISTS email;
DROP TABLE IF EXISTS user_connections;
`;

module.exports = { up, down };
