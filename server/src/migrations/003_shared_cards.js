/**
 * Migration: Add shareable contact card support
 * Adds share_token and share_enabled columns to contacts table
 * Enables users to generate public share links for their contact cards
 */

const up = `
-- Add sharing columns to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_contacts_share_token ON contacts(share_token) WHERE share_token IS NOT NULL;
`;

const down = `
DROP INDEX IF EXISTS idx_contacts_share_token;
ALTER TABLE contacts DROP COLUMN IF EXISTS share_enabled;
ALTER TABLE contacts DROP COLUMN IF EXISTS share_token;
`;

module.exports = { up, down };
