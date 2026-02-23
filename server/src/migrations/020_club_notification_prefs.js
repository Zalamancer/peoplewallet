const up = `
  ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS club_new_events BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS event_reminders BOOLEAN DEFAULT TRUE;

  ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
  ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
    CHECK (type IN (
      'decay_reminder', 'decay_urgent', 'event_prep', 'weekly_digest', 'system',
      'event_reminder', 'rsvp_confirmation', 'event_update', 'club_new_event'
    ));
`;

const down = `
  ALTER TABLE notification_preferences
    DROP COLUMN IF EXISTS club_new_events,
    DROP COLUMN IF EXISTS event_reminders;

  ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
  ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
    CHECK (type IN (
      'decay_reminder', 'decay_urgent', 'event_prep', 'weekly_digest', 'system',
      'event_reminder', 'rsvp_confirmation', 'event_update'
    ));
`;

module.exports = { up, down };
