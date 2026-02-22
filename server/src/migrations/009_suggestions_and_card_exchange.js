/**
 * Migration: Suggestion dismissals, user share tokens, and card_exchange source type
 * Supports: "people you might know" dismissals, card exchange token generation
 */

const up = `
-- Suggestion dismissals: stores when a user dismisses a co-attendee suggestion
CREATE TABLE IF NOT EXISTS suggestion_dismissals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggested_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, suggested_user_id)
);

CREATE INDEX IF NOT EXISTS idx_suggestion_dismissals_user_id ON suggestion_dismissals(user_id);

-- Add share_token column to users table for card exchange
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_share_token ON users(share_token) WHERE share_token IS NOT NULL;

-- Update contacts source CHECK constraint to allow 'card_exchange'
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('manual', 'dictation', 'recording', 'linkedin', 'instagram', 'card_exchange'));

-- Update user_connections matched_on CHECK constraint to allow 'card_exchange'
ALTER TABLE user_connections DROP CONSTRAINT IF EXISTS user_connections_matched_on_check;
ALTER TABLE user_connections ADD CONSTRAINT user_connections_matched_on_check
  CHECK (matched_on IN ('name', 'email', 'linkedin', 'card_exchange'));
`;

const down = `
ALTER TABLE user_connections DROP CONSTRAINT IF EXISTS user_connections_matched_on_check;
ALTER TABLE user_connections ADD CONSTRAINT user_connections_matched_on_check
  CHECK (matched_on IN ('name', 'email', 'linkedin'));

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('manual', 'dictation', 'recording', 'linkedin', 'instagram'));

DROP INDEX IF EXISTS idx_users_share_token;
ALTER TABLE users DROP COLUMN IF EXISTS share_token;

DROP TABLE IF EXISTS suggestion_dismissals;
`;

module.exports = { up, down };
