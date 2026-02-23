const up = `
-- ============================================================
-- 023: Discovery V2
-- Multi-source club discovery: schema updates for multi-school
-- support, new discovery sources, and nullable created_by.
-- ============================================================

-- 1. Add new columns to schools table
ALTER TABLE schools ADD COLUMN IF NOT EXISTS abbreviation TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS instagram_handle TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS alt_names TEXT[];
ALTER TABLE schools ADD COLUMN IF NOT EXISTS discovery_last_run TIMESTAMPTZ;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS discovery_status TEXT;

-- 2. Add new columns to discovered_accounts
ALTER TABLE discovered_accounts ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
ALTER TABLE discovered_accounts ADD COLUMN IF NOT EXISTS discovery_source TEXT;

-- 3. Make clubs.created_by nullable (currently NOT NULL, blocks discovery inserts)
ALTER TABLE clubs ALTER COLUMN created_by DROP NOT NULL;

-- 4. Drop and re-add discovery_source CHECK constraint to include new sources
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_discovery_source_check;
ALTER TABLE clubs ADD CONSTRAINT clubs_discovery_source_check
  CHECK (discovery_source IN ('google_dork', 'official_directory', 'user_submitted', 'self_registered', 'instagram_search', 'following_crawl'));

-- 5. Add category values: greek_life, religious, service
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_category_check;
ALTER TABLE clubs ADD CONSTRAINT clubs_category_check
  CHECK (category IN ('tech','academic','social','sports','arts','professional','cultural','general','other','greek_life','religious','service'));

-- 6. Update existing UTD school row
UPDATE schools SET
  name = 'UT Dallas',
  abbreviation = 'UTD',
  full_name = 'The University of Texas at Dallas',
  instagram_handle = 'utdallas',
  alt_names = ARRAY['utdallas', 'UT Dallas', 'UTDallas']
WHERE domain = 'utdallas.edu';

-- 7. Set school_id on existing clubs that don't have one
UPDATE clubs SET school_id = (SELECT id FROM schools WHERE domain = 'utdallas.edu' LIMIT 1)
WHERE school_id IS NULL;

-- 8. Set school_id on existing discovered_accounts
UPDATE discovered_accounts SET school_id = (SELECT id FROM schools WHERE domain = 'utdallas.edu' LIMIT 1)
WHERE school_id IS NULL;
`;

const down = `
-- Remove school_id from discovered_accounts and clubs updates
-- (can't easily undo UPDATE, but we can drop added columns)

ALTER TABLE discovered_accounts DROP COLUMN IF EXISTS discovery_source;
ALTER TABLE discovered_accounts DROP COLUMN IF EXISTS school_id;

-- Restore original discovery_source constraint
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_discovery_source_check;
ALTER TABLE clubs ADD CONSTRAINT clubs_discovery_source_check
  CHECK (discovery_source IN ('google_dork', 'official_directory', 'user_submitted', 'self_registered'));

-- Restore original category constraint
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_category_check;
ALTER TABLE clubs ADD CONSTRAINT clubs_category_check
  CHECK (category IN ('tech','academic','social','sports','arts','professional','cultural','general','other'));

-- Note: NOT reverting created_by to NOT NULL as it could fail with existing data

ALTER TABLE schools DROP COLUMN IF EXISTS discovery_status;
ALTER TABLE schools DROP COLUMN IF EXISTS discovery_last_run;
ALTER TABLE schools DROP COLUMN IF EXISTS alt_names;
ALTER TABLE schools DROP COLUMN IF EXISTS instagram_handle;
ALTER TABLE schools DROP COLUMN IF EXISTS full_name;
ALTER TABLE schools DROP COLUMN IF EXISTS abbreviation;
`;

module.exports = { up, down };
