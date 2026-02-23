const up = `
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);

  ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
  ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
    CHECK (source IN ('manual', 'dictation', 'recording', 'linkedin', 'instagram', 'card_exchange', 'phone_import'));
`;

const down = `
  ALTER TABLE contacts DROP COLUMN IF EXISTS phone_number;

  ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
  ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
    CHECK (source IN ('manual', 'dictation', 'recording', 'linkedin', 'instagram', 'card_exchange'));
`;

module.exports = { up, down };
