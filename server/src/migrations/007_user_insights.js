/**
 * Migration: User insights table for caching AI-generated insights (weekly digests, etc.)
 * Supports: Relationship Insights / AI Nudges feature
 */

const up = `
-- Cached AI-generated insights per user (weekly digests, etc.)
CREATE TABLE user_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_type VARCHAR(50) NOT NULL CHECK (insight_type IN ('weekly_digest', 'reconnect', 'growth', 'recap', 'suggestion')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_insights_user_id ON user_insights(user_id);
CREATE INDEX idx_user_insights_type ON user_insights(insight_type);
CREATE INDEX idx_user_insights_created_at ON user_insights(created_at);
CREATE INDEX idx_user_insights_weekly ON user_insights(user_id, insight_type, created_at)
  WHERE insight_type = 'weekly_digest';

-- Add 'weekly_digest' and 'insight' to the notification_log type check if not present
-- (notification_log already allows 'weekly_digest' from the original migration)
`;

const down = `
DROP TABLE IF EXISTS user_insights;
`;

module.exports = { up, down };
