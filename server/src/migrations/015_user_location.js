const up = `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
`;

const down = `
  ALTER TABLE users DROP COLUMN IF EXISTS location;
`;

module.exports = { up, down };
