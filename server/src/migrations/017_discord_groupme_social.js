/**
 * Add discord and groupme to social platform CHECK constraints
 * on contact_social and user_social tables.
 */

const up = `
-- Drop and recreate CHECK constraint on contact_social.platform
ALTER TABLE contact_social DROP CONSTRAINT IF EXISTS contact_social_platform_check;
ALTER TABLE contact_social ADD CONSTRAINT contact_social_platform_check
  CHECK (platform IN ('linkedin', 'instagram', 'twitter', 'github', 'discord', 'groupme', 'website', 'other'));

-- Drop and recreate CHECK constraint on user_social.platform
ALTER TABLE user_social DROP CONSTRAINT IF EXISTS user_social_platform_check;
ALTER TABLE user_social ADD CONSTRAINT user_social_platform_check
  CHECK (platform IN ('linkedin', 'instagram', 'twitter', 'github', 'discord', 'groupme', 'website', 'other'));
`;

const down = `
-- Revert CHECK constraint on contact_social.platform
ALTER TABLE contact_social DROP CONSTRAINT IF EXISTS contact_social_platform_check;
ALTER TABLE contact_social ADD CONSTRAINT contact_social_platform_check
  CHECK (platform IN ('linkedin', 'instagram', 'twitter', 'github', 'website', 'other'));

-- Revert CHECK constraint on user_social.platform
ALTER TABLE user_social DROP CONSTRAINT IF EXISTS user_social_platform_check;
ALTER TABLE user_social ADD CONSTRAINT user_social_platform_check
  CHECK (platform IN ('linkedin', 'instagram', 'twitter', 'github', 'website', 'other'));
`;

module.exports = { up, down };
