const up = `
-- Add detail columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS has_free_food BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dress_code VARCHAR(50) CHECK (dress_code IN ('casual', 'business_casual', 'business_formal', 'smart_casual', 'other'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS prerequisites TEXT;
`;

const down = `
ALTER TABLE events DROP COLUMN IF EXISTS has_free_food;
ALTER TABLE events DROP COLUMN IF EXISTS dress_code;
ALTER TABLE events DROP COLUMN IF EXISTS prerequisites;
`;

module.exports = { up, down };
