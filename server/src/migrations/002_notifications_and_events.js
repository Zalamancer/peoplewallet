/**
 * Migration: Push notification tokens, notification preferences, and events tables
 * Supports: push notifications, contact decay reminders, pre-event prep nudges
 */

const up = `
-- Push notification tokens (Expo Push Tokens)
CREATE TABLE user_push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_token TEXT UNIQUE NOT NULL,
  platform VARCHAR(10) DEFAULT 'ios' CHECK (platform IN ('ios', 'android')),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_push_tokens_user_id ON user_push_tokens(user_id);
CREATE INDEX idx_push_tokens_active ON user_push_tokens(active) WHERE active = TRUE;

-- Notification preferences per user
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decay_reminders BOOLEAN DEFAULT TRUE,
  decay_interval_days INTEGER DEFAULT 45,
  event_prep_reminders BOOLEAN DEFAULT TRUE,
  event_prep_hours_before INTEGER DEFAULT 24,
  weekly_digest BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification log (track what was sent to avoid duplicates)
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('decay_reminder', 'event_prep', 'weekly_digest', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX idx_notification_log_type ON notification_log(type);
CREATE INDEX idx_notification_log_created_at ON notification_log(created_at);

-- Events table for pre-event prep nudges
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  event_date TIMESTAMP WITH TIME ZONE NOT NULL,
  location VARCHAR(255),
  event_type VARCHAR(50) DEFAULT 'networking' CHECK (event_type IN ('networking', 'career_fair', 'conference', 'meetup', 'social', 'other')),
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_reminder ON events(reminder_sent, event_date) WHERE reminder_sent = FALSE;

-- Add last_interaction_at to contacts for decay tracking
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX idx_contacts_last_interaction ON contacts(user_id, last_interaction_at);

-- Apply updated_at triggers to new tables
CREATE TRIGGER update_push_tokens_updated_at BEFORE UPDATE ON user_push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_prefs_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

const down = `
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
DROP TRIGGER IF EXISTS update_notification_prefs_updated_at ON notification_preferences;
DROP TRIGGER IF EXISTS update_push_tokens_updated_at ON user_push_tokens;
ALTER TABLE contacts DROP COLUMN IF EXISTS last_interaction_at;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS notification_log;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS user_push_tokens;
`;

module.exports = { up, down };
