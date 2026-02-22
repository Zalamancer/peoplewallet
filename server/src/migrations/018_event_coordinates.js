const up = `
  ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
  ALTER TABLE events ADD COLUMN IF NOT EXISTS geocode_source VARCHAR(30);

  CREATE INDEX IF NOT EXISTS idx_events_coordinates
    ON events (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
`;

const down = `
  DROP INDEX IF EXISTS idx_events_coordinates;
  ALTER TABLE events DROP COLUMN IF EXISTS geocode_source;
  ALTER TABLE events DROP COLUMN IF EXISTS longitude;
  ALTER TABLE events DROP COLUMN IF EXISTS latitude;
`;

module.exports = { up, down };
