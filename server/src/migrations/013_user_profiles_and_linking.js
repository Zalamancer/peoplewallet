const up = `
  -- User professional info (mirrors contact_professional)
  CREATE TABLE IF NOT EXISTS user_professional (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_title VARCHAR(255),
    company VARCHAR(255),
    department VARCHAR(255),
    school VARCHAR(255),
    major VARCHAR(255),
    graduation_year VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
  );

  -- User social links (mirrors contact_social)
  CREATE TABLE IF NOT EXISTS user_social (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('linkedin', 'instagram', 'twitter', 'github', 'website', 'other')),
    handle VARCHAR(255),
    url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, platform)
  );

  -- User appearance (mirrors contact_appearance)
  CREATE TABLE IF NOT EXISTS user_appearance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    height_range VARCHAR(30) CHECK (height_range IN ('short', 'average', 'tall', 'very_tall')),
    hair_color VARCHAR(30) CHECK (hair_color IN ('black', 'brown', 'blonde', 'red', 'gray', 'white', 'other', 'none')),
    glasses BOOLEAN DEFAULT FALSE,
    distinguishing_features TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
  );

  -- Add nickname, pronouns, bio, location, and profile_visibility to users
  ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(100);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) DEFAULT 'public'
    CHECK (profile_visibility IN ('public', 'mutual_only', 'private'));

  -- Add linked_user_id to contacts (links a contact to a registered user)
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS link_confidence VARCHAR(20)
    CHECK (link_confidence IN ('high', 'medium', 'suggested'));
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linked_at TIMESTAMP WITH TIME ZONE;

  -- Index for efficient lookups
  CREATE INDEX IF NOT EXISTS idx_contacts_linked_user_id ON contacts(linked_user_id) WHERE linked_user_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_user_professional_user_id ON user_professional(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_social_user_id ON user_social(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_appearance_user_id ON user_appearance(user_id);

  -- Trigger for user_professional updated_at
  CREATE OR REPLACE FUNCTION update_user_professional_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trigger_update_user_professional_updated_at ON user_professional;
  CREATE TRIGGER trigger_update_user_professional_updated_at
    BEFORE UPDATE ON user_professional
    FOR EACH ROW
    EXECUTE FUNCTION update_user_professional_updated_at();

  -- Trigger for user_appearance updated_at
  CREATE OR REPLACE FUNCTION update_user_appearance_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trigger_update_user_appearance_updated_at ON user_appearance;
  CREATE TRIGGER trigger_update_user_appearance_updated_at
    BEFORE UPDATE ON user_appearance
    FOR EACH ROW
    EXECUTE FUNCTION update_user_appearance_updated_at();
`;

const down = `
  DROP TRIGGER IF EXISTS trigger_update_user_appearance_updated_at ON user_appearance;
  DROP FUNCTION IF EXISTS update_user_appearance_updated_at();
  DROP TRIGGER IF EXISTS trigger_update_user_professional_updated_at ON user_professional;
  DROP FUNCTION IF EXISTS update_user_professional_updated_at();
  DROP INDEX IF EXISTS idx_user_appearance_user_id;
  DROP INDEX IF EXISTS idx_user_social_user_id;
  DROP INDEX IF EXISTS idx_user_professional_user_id;
  DROP INDEX IF EXISTS idx_contacts_linked_user_id;
  ALTER TABLE contacts DROP COLUMN IF EXISTS linked_at;
  ALTER TABLE contacts DROP COLUMN IF EXISTS link_confidence;
  ALTER TABLE contacts DROP COLUMN IF EXISTS linked_user_id;
  ALTER TABLE users DROP COLUMN IF EXISTS profile_visibility;
  ALTER TABLE users DROP COLUMN IF EXISTS location;
  ALTER TABLE users DROP COLUMN IF EXISTS bio;
  ALTER TABLE users DROP COLUMN IF EXISTS pronouns;
  ALTER TABLE users DROP COLUMN IF EXISTS nickname;
  DROP TABLE IF EXISTS user_social;
  DROP TABLE IF EXISTS user_appearance;
  DROP TABLE IF EXISTS user_professional;
`;

module.exports = { up, down };
