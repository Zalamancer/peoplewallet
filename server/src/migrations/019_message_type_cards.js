const up = `
  ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
  ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('text', 'image', 'contact_card', 'event_card', 'club_card', 'post_card', 'system'));
`;

const down = `
  ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
  ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IN ('text', 'image', 'contact_card', 'system'));
`;

module.exports = { up, down };
