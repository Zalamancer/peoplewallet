const up = `
  -- Conversations table
  CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(10) NOT NULL CHECK (type IN ('direct', 'group')),
    name VARCHAR(255),
    avatar_url TEXT,
    created_by UUID REFERENCES users(id),
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- Conversation participants
  CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(conversation_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id);
  CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants(conversation_id);

  -- Messages table
  CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'contact_card', 'system')),
    metadata JSONB DEFAULT '{}',
    reply_to UUID REFERENCES messages(id),
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

  -- Full-text search index on message content
  CREATE INDEX IF NOT EXISTS idx_messages_content_fts ON messages USING GIN (to_tsvector('english', COALESCE(content, '')));

  -- Post embeds for in-app social feed
  CREATE TABLE IF NOT EXISTS post_embeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    post_url TEXT NOT NULL UNIQUE,
    html_embed TEXT,
    title TEXT,
    description TEXT,
    thumbnail_url TEXT,
    author_name VARCHAR(255),
    author_handle VARCHAR(255),
    media_url TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '72 hours',
    fetch_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (fetch_status IN ('pending', 'success', 'error')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_post_embeds_contact ON post_embeds(contact_id);
  CREATE INDEX IF NOT EXISTS idx_post_embeds_expires ON post_embeds(expires_at);

  -- Add new_message to notification_log type (alter CHECK constraint)
  -- First check if notification_log exists and has the constraint
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_log'
    ) THEN
      -- Drop old constraint if it exists and add new one
      ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
      ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
        CHECK (type IN ('event_reminder', 'rsvp_confirmation', 'event_update', 'club_announcement', 'new_message', 'weekly_digest', 'decay_reminder', 'event_prep'));
    END IF;
  END
  $$;
`;

const down = `
  DROP TABLE IF EXISTS messages CASCADE;
  DROP TABLE IF EXISTS conversation_participants CASCADE;
  DROP TABLE IF EXISTS conversations CASCADE;
  DROP TABLE IF EXISTS post_embeds CASCADE;

  -- Restore old notification_log constraint
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_log'
    ) THEN
      ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
      ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
        CHECK (type IN ('event_reminder', 'rsvp_confirmation', 'event_update', 'club_announcement', 'weekly_digest', 'decay_reminder'));
    END IF;
  END
  $$;
`;

module.exports = { up, down };
