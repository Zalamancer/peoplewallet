/**
 * Initial database schema for ProAnimate Connect
 * Tables: users, contacts, contact_professional, contact_social,
 *         contact_appearance, contact_context, contact_notes,
 *         contact_tags, transcriptions, audit_log
 */

const up = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  firebase_uid VARCHAR(255) UNIQUE,
  linkedin_id VARCHAR(255) UNIQUE,
  linkedin_access_token TEXT,
  avatar_url TEXT,
  subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'pro_annual', 'student')),
  daily_contact_count INTEGER DEFAULT 0,
  daily_contact_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contacts table (core)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  nickname VARCHAR(100),
  pronouns VARCHAR(50),
  encrypted_blob TEXT, -- Profile-level encryption for sensitive data
  avatar_url TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'dictation', 'recording', 'linkedin', 'instagram')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_full_name ON contacts(user_id, full_name);
CREATE INDEX idx_contacts_created_at ON contacts(user_id, created_at DESC);

-- Contact professional info
CREATE TABLE contact_professional (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID UNIQUE NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  school VARCHAR(255),
  graduation_year VARCHAR(10),
  major VARCHAR(255),
  company VARCHAR(255),
  job_title VARCHAR(255),
  department VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_professional_school ON contact_professional(school);
CREATE INDEX idx_contact_professional_company ON contact_professional(company);

-- Contact social links
CREATE TABLE contact_social (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('linkedin', 'instagram', 'twitter', 'github', 'website', 'other')),
  handle VARCHAR(255),
  url TEXT,
  last_verified TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_social_contact_id ON contact_social(contact_id);
CREATE UNIQUE INDEX idx_contact_social_unique ON contact_social(contact_id, platform);

-- Contact appearance (structured tags only - no free text)
CREATE TABLE contact_appearance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID UNIQUE NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  height_range VARCHAR(30) CHECK (height_range IN ('short', 'average', 'tall', 'very_tall')),
  hair_color VARCHAR(30) CHECK (hair_color IN ('black', 'brown', 'blonde', 'red', 'gray', 'white', 'other', 'none')),
  glasses BOOLEAN DEFAULT FALSE,
  distinguishing_features TEXT[], -- Array of structured tags
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '12 months'), -- Auto-expire after 12 months
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact context (how/where met)
CREATE TABLE contact_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID UNIQUE NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  how_met VARCHAR(255),
  event_name VARCHAR(255),
  met_date DATE,
  location VARCHAR(255),
  mutual_connections TEXT[], -- Array of names/references
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_context_event ON contact_context(event_name);
CREATE INDEX idx_contact_context_date ON contact_context(met_date);

-- Contact notes
CREATE TABLE contact_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'dictation', 'recording', 'ai_generated')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_notes_contact_id ON contact_notes(contact_id);

-- Contact tags (user-defined relationship tags)
CREATE TABLE contact_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_tags_contact_id ON contact_tags(contact_id);
CREATE INDEX idx_contact_tags_name ON contact_tags(tag_name);
CREATE UNIQUE INDEX idx_contact_tags_unique ON contact_tags(contact_id, tag_name);

-- Transcriptions (audio discarded, text retained)
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  extracted_entities JSONB, -- Structured extraction from Claude Haiku 4.5
  confidence_scores JSONB, -- Per-field confidence scores
  extraction_model VARCHAR(50) DEFAULT 'claude-haiku-4-5',
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transcriptions_contact_id ON transcriptions(contact_id);
CREATE INDEX idx_transcriptions_user_id ON transcriptions(user_id);

-- Audit log (GDPR/CCPA compliance)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Function to auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_professional_updated_at BEFORE UPDATE ON contact_professional
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_appearance_updated_at BEFORE UPDATE ON contact_appearance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_context_updated_at BEFORE UPDATE ON contact_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_notes_updated_at BEFORE UPDATE ON contact_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

const down = `
DROP TRIGGER IF EXISTS update_contact_notes_updated_at ON contact_notes;
DROP TRIGGER IF EXISTS update_contact_context_updated_at ON contact_context;
DROP TRIGGER IF EXISTS update_contact_appearance_updated_at ON contact_appearance;
DROP TRIGGER IF EXISTS update_contact_professional_updated_at ON contact_professional;
DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP FUNCTION IF EXISTS update_updated_at_column;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS transcriptions;
DROP TABLE IF EXISTS contact_tags;
DROP TABLE IF EXISTS contact_notes;
DROP TABLE IF EXISTS contact_context;
DROP TABLE IF EXISTS contact_appearance;
DROP TABLE IF EXISTS contact_social;
DROP TABLE IF EXISTS contact_professional;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS "uuid-ossp";
`;

module.exports = { up, down };
