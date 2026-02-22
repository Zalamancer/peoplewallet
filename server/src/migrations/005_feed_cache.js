/**
 * Migration: Add feed_cache table for Contact Activity Feed
 * Caches social activity items from contacts' public profiles
 * to avoid repeated external API/scraping calls.
 */

const up = `
-- Feed cache table
CREATE TABLE feed_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('linkedin', 'instagram', 'twitter', 'github', 'website', 'profile')),
  content_type VARCHAR(30) NOT NULL DEFAULT 'post' CHECK (content_type IN ('post', 'article', 'profile_update', 'job_change', 'summary')),
  content_url TEXT,
  embed_url TEXT,
  title VARCHAR(500),
  summary TEXT,
  image_url TEXT,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_feed_cache_contact_id ON feed_cache(contact_id);
CREATE INDEX idx_feed_cache_fetched_at ON feed_cache(fetched_at DESC);
CREATE INDEX idx_feed_cache_expires_at ON feed_cache(expires_at);
CREATE INDEX idx_feed_cache_platform ON feed_cache(platform);
`;

const down = `
DROP INDEX IF EXISTS idx_feed_cache_platform;
DROP INDEX IF EXISTS idx_feed_cache_expires_at;
DROP INDEX IF EXISTS idx_feed_cache_fetched_at;
DROP INDEX IF EXISTS idx_feed_cache_contact_id;
DROP TABLE IF EXISTS feed_cache;
`;

module.exports = { up, down };
