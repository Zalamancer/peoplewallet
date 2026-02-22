/**
 * Migration: Contact Groups
 * Tables: contact_groups, contact_group_members
 * Supports: organizing contacts by event, organization, or custom groups
 */

const up = `
-- Contact groups
CREATE TABLE contact_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#007AFF',
  icon VARCHAR(50) DEFAULT 'people',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_groups_user_id ON contact_groups(user_id);
CREATE UNIQUE INDEX idx_contact_groups_unique_name ON contact_groups(user_id, name);

-- Contact group members (many-to-many)
CREATE TABLE contact_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_group_members_group_id ON contact_group_members(group_id);
CREATE INDEX idx_group_members_contact_id ON contact_group_members(contact_id);
CREATE UNIQUE INDEX idx_group_members_unique ON contact_group_members(group_id, contact_id);

-- Apply updated_at trigger
CREATE TRIGGER update_contact_groups_updated_at BEFORE UPDATE ON contact_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

const down = `
DROP TRIGGER IF EXISTS update_contact_groups_updated_at ON contact_groups;
DROP TABLE IF EXISTS contact_group_members;
DROP TABLE IF EXISTS contact_groups;
`;

module.exports = { up, down };
