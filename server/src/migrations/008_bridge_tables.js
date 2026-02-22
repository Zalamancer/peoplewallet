/**
 * Bridge tables for event-contact linking, co-attendance tracking,
 * contact card exchanges, and relationship scoring.
 * Also adds event_id FK columns to contact_context, contact_notes,
 * and contact_groups, plus attendance_visibility to users.
 */

const up = `
-- =============================================
-- 1. event_contacts: links a contact to the event where they were met
-- =============================================
CREATE TABLE event_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id, event_id)
);

CREATE INDEX idx_event_contacts_event_id ON event_contacts(event_id);
CREATE INDEX idx_event_contacts_contact_id ON event_contacts(contact_id);

-- =============================================
-- 2. co_attendances: records when two users attended the same event
-- =============================================
CREATE TABLE co_attendances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_a_id, user_b_id, event_id),
  CHECK(user_a_id < user_b_id)
);

CREATE INDEX idx_co_attendances_user_a_id ON co_attendances(user_a_id);
CREATE INDEX idx_co_attendances_user_b_id ON co_attendances(user_b_id);
CREATE INDEX idx_co_attendances_event_id ON co_attendances(event_id);

-- =============================================
-- 3. contact_card_exchanges: records when two users exchange contact cards
-- =============================================
CREATE TABLE contact_card_exchanges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_card_exchanges_sender_id ON contact_card_exchanges(sender_id);
CREATE INDEX idx_contact_card_exchanges_receiver_id ON contact_card_exchanges(receiver_id);

-- =============================================
-- 4. relationship_scores: tracks relationship strength between user and contact
-- =============================================
CREATE TABLE relationship_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  score FLOAT DEFAULT 50.0,
  peak_score FLOAT DEFAULT 50.0,
  last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_decay TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  signal_history JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, contact_id)
);

CREATE INDEX idx_relationship_scores_user_id ON relationship_scores(user_id);
CREATE INDEX idx_relationship_scores_contact_id ON relationship_scores(contact_id);
CREATE INDEX idx_relationship_scores_score ON relationship_scores(user_id, score DESC);

-- Apply updated_at trigger to relationship_scores
CREATE TRIGGER update_relationship_scores_updated_at BEFORE UPDATE ON relationship_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 5. Add attendance_visibility column to users table
-- =============================================
ALTER TABLE users ADD COLUMN attendance_visibility VARCHAR(20) DEFAULT 'public'
  CHECK (attendance_visibility IN ('public', 'mutual_only', 'private'));

-- =============================================
-- 6. Add event_id column to contact_context table
-- =============================================
ALTER TABLE contact_context ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX idx_contact_context_event_id ON contact_context(event_id);

-- =============================================
-- 7. Add event_id column to contact_notes table
-- =============================================
ALTER TABLE contact_notes ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX idx_contact_notes_event_id ON contact_notes(event_id);

-- =============================================
-- 8. Add event_id column to contact_groups table (for auto-created event groups)
-- =============================================
ALTER TABLE contact_groups ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX idx_contact_groups_event_id ON contact_groups(event_id);
`;

const down = `
-- Drop event_id column from contact_groups
DROP INDEX IF EXISTS idx_contact_groups_event_id;
ALTER TABLE contact_groups DROP COLUMN IF EXISTS event_id;

-- Drop event_id column from contact_notes
DROP INDEX IF EXISTS idx_contact_notes_event_id;
ALTER TABLE contact_notes DROP COLUMN IF EXISTS event_id;

-- Drop event_id column from contact_context
DROP INDEX IF EXISTS idx_contact_context_event_id;
ALTER TABLE contact_context DROP COLUMN IF EXISTS event_id;

-- Drop attendance_visibility column from users
ALTER TABLE users DROP COLUMN IF EXISTS attendance_visibility;

-- Drop relationship_scores table and its trigger
DROP TRIGGER IF EXISTS update_relationship_scores_updated_at ON relationship_scores;
DROP TABLE IF EXISTS relationship_scores;

-- Drop contact_card_exchanges table
DROP TABLE IF EXISTS contact_card_exchanges;

-- Drop co_attendances table
DROP TABLE IF EXISTS co_attendances;

-- Drop event_contacts table
DROP TABLE IF EXISTS event_contacts;
`;

module.exports = { up, down };
