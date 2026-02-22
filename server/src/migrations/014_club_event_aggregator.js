const up = `
-- ============================================================
-- 014: Club Event Aggregator
-- Adds Instagram discovery, AI post analysis, and event
-- extraction pipeline tables and columns.
-- ============================================================

-- 1. ALTER clubs table - Add aggregator/discovery columns
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS instagram_handle TEXT UNIQUE;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS follower_count INTEGER;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS ranking_score FLOAT DEFAULT 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_registered BOOLEAN DEFAULT false;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS registered_user_id UUID REFERENCES users(id);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS discovery_source TEXT
  CHECK (discovery_source IN ('google_dork', 'official_directory', 'user_submitted', 'self_registered'));
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS llm_confidence FLOAT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS in_official_directory BOOLEAN DEFAULT false;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS media_count INTEGER DEFAULT 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS last_post_at TIMESTAMPTZ;

-- 2. Discovered accounts table
CREATE TABLE IF NOT EXISTS discovered_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  handle TEXT NOT NULL UNIQUE,
  url TEXT,
  bio TEXT,
  llm_classification JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'promoted')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Posts table (Instagram posts linked to clubs)
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  instagram_post_id TEXT NOT NULL UNIQUE,
  post_url TEXT,
  image_urls TEXT[],
  caption TEXT,
  posted_at TIMESTAMPTZ,
  likes_count INTEGER,
  comments_count INTEGER,
  raw_data JSONB,
  ai_analysis_status TEXT DEFAULT 'pending' CHECK (ai_analysis_status IN ('pending', 'analyzed', 'not_event')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_club_id ON posts(club_id);
CREATE INDEX IF NOT EXISTS idx_posts_ai_analysis_status ON posts(ai_analysis_status);

-- 4. ALTER events table - Add AI-extracted fields
ALTER TABLE events ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES posts(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS time_start TIME;
ALTER TABLE events ADD COLUMN IF NOT EXISTS time_end TIME;
ALTER TABLE events ADD COLUMN IF NOT EXISTS location_building TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_on_campus BOOLEAN;
ALTER TABLE events ADD COLUMN IF NOT EXISTS food_available BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS food_details TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dress_code_details TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_required BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_link TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS open_to_all BOOLEAN DEFAULT true;
ALTER TABLE events ADD COLUMN IF NOT EXISTS perks TEXT[];
ALTER TABLE events ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE events ADD COLUMN IF NOT EXISTS contact_info TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurring BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurring_pattern TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_confidence FLOAT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS feed_score FLOAT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS raw_ai_response JSONB;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active', 'cancelled', 'completed'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
  CHECK (source IN ('manual', 'instagram_ai'));

-- 5. User club follows table
CREATE TABLE IF NOT EXISTS user_club_follows (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, club_id)
);

-- 6. User event interactions table
CREATE TABLE IF NOT EXISTS user_event_interactions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  interaction_type TEXT CHECK (interaction_type IN ('saved', 'interested', 'going', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id, interaction_type)
);
`;

const down = `
-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS user_event_interactions;
DROP TABLE IF EXISTS user_club_follows;

-- Remove AI-extracted columns from events
ALTER TABLE events DROP COLUMN IF EXISTS source;
ALTER TABLE events DROP COLUMN IF EXISTS status;
ALTER TABLE events DROP COLUMN IF EXISTS raw_ai_response;
ALTER TABLE events DROP COLUMN IF EXISTS feed_score;
ALTER TABLE events DROP COLUMN IF EXISTS ai_confidence;
ALTER TABLE events DROP COLUMN IF EXISTS recurring_pattern;
ALTER TABLE events DROP COLUMN IF EXISTS recurring;
ALTER TABLE events DROP COLUMN IF EXISTS contact_info;
ALTER TABLE events DROP COLUMN IF EXISTS tags;
ALTER TABLE events DROP COLUMN IF EXISTS perks;
ALTER TABLE events DROP COLUMN IF EXISTS open_to_all;
ALTER TABLE events DROP COLUMN IF EXISTS rsvp_link;
ALTER TABLE events DROP COLUMN IF EXISTS rsvp_required;
ALTER TABLE events DROP COLUMN IF EXISTS cost;
ALTER TABLE events DROP COLUMN IF EXISTS is_free;
ALTER TABLE events DROP COLUMN IF EXISTS dress_code_details;
ALTER TABLE events DROP COLUMN IF EXISTS food_details;
ALTER TABLE events DROP COLUMN IF EXISTS food_available;
ALTER TABLE events DROP COLUMN IF EXISTS is_on_campus;
ALTER TABLE events DROP COLUMN IF EXISTS location_building;
ALTER TABLE events DROP COLUMN IF EXISTS time_end;
ALTER TABLE events DROP COLUMN IF EXISTS time_start;
ALTER TABLE events DROP COLUMN IF EXISTS event_name;
ALTER TABLE events DROP COLUMN IF EXISTS post_id;

-- Drop posts table (must come after events.post_id is removed)
DROP TABLE IF EXISTS posts;

-- Drop discovered accounts table
DROP TABLE IF EXISTS discovered_accounts;

-- Remove aggregator/discovery columns from clubs
ALTER TABLE clubs DROP COLUMN IF EXISTS last_post_at;
ALTER TABLE clubs DROP COLUMN IF EXISTS media_count;
ALTER TABLE clubs DROP COLUMN IF EXISTS following_count;
ALTER TABLE clubs DROP COLUMN IF EXISTS in_official_directory;
ALTER TABLE clubs DROP COLUMN IF EXISTS llm_confidence;
ALTER TABLE clubs DROP COLUMN IF EXISTS discovery_source;
ALTER TABLE clubs DROP COLUMN IF EXISTS registered_user_id;
ALTER TABLE clubs DROP COLUMN IF EXISTS is_registered;
ALTER TABLE clubs DROP COLUMN IF EXISTS ranking_score;
ALTER TABLE clubs DROP COLUMN IF EXISTS follower_count;
ALTER TABLE clubs DROP COLUMN IF EXISTS profile_image_url;
ALTER TABLE clubs DROP COLUMN IF EXISTS bio;
ALTER TABLE clubs DROP COLUMN IF EXISTS instagram_handle;
`;

module.exports = { up, down };
