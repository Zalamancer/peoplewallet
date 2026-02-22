const up = `
-- 1. Schools table
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add school_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 2. Clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general' CHECK (category IN ('tech','academic','social','sports','arts','professional','cultural','general','other')),
  school_id UUID REFERENCES schools(id),
  logo_url TEXT,
  is_approved BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Club memberships table
CREATE TABLE IF NOT EXISTS club_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member','officer','president')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_club_memberships_user ON club_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_club_memberships_club ON club_memberships(club_id);

-- 3. Alter events table to add club-related columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'networking';
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- 4. RSVPs table
CREATE TABLE IF NOT EXISTS rsvps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('going','maybe','cant_go')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_user ON rsvps(user_id);

-- 5. Attendances table
CREATE TABLE IF NOT EXISTS attendances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  checkin_method VARCHAR(20) DEFAULT 'manual' CHECK (checkin_method IN ('qr_scan','manual')),
  checked_in_by UUID REFERENCES users(id),
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_attendances_event ON attendances(event_id);
CREATE INDEX IF NOT EXISTS idx_attendances_user ON attendances(user_id);
`;

const down = `
-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS attendances;
DROP TABLE IF EXISTS rsvps;

-- Remove club-related columns from events
ALTER TABLE events DROP COLUMN IF EXISTS created_by;
ALTER TABLE events DROP COLUMN IF EXISTS category;
ALTER TABLE events DROP COLUMN IF EXISTS cover_image_url;
ALTER TABLE events DROP COLUMN IF EXISTS capacity;
ALTER TABLE events DROP COLUMN IF EXISTS end_time;
ALTER TABLE events DROP COLUMN IF EXISTS club_id;

-- Drop club memberships and clubs
DROP TABLE IF EXISTS club_memberships;
DROP TABLE IF EXISTS clubs;

-- Remove school_id from users
ALTER TABLE users DROP COLUMN IF EXISTS school_id;

-- Drop schools table
DROP TABLE IF EXISTS schools;
`;

module.exports = { up, down };
