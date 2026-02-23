require('dotenv').config({ override: true });
const { pool } = require('../config/database');
const logger = require('../utils/logger');
const migration001 = require('./001_initial_schema');
const migration002 = require('./002_notifications_and_events');
const migration003 = require('./003_shared_cards');
const migration004 = require('./004_mutual_connections');
const migration005 = require('./005_feed_cache');
const migration006 = require('./006_contact_groups');
const migration007 = require('./007_user_insights');
const migration008 = require('./008_bridge_tables');
const migration009 = require('./009_suggestions_and_card_exchange');
const migration010 = require('./010_event_details');
const migration011 = require('./011_schools_clubs_rsvps_attendances');
const migration012 = require('./012_messaging');
const migration013 = require('./013_user_profiles_and_linking');
const migration014 = require('./014_club_event_aggregator');
const migration015 = require('./015_user_location');
const migration016 = require('./016_post_ocr_text');
const migration017 = require('./017_discord_groupme_social');
const migration018 = require('./018_event_coordinates');
const migration019 = require('./019_message_type_cards');
const migration020 = require('./020_club_notification_prefs');
const migration021 = require('./021_email_verification');
const migration022 = require('./022_contact_phone_numbers');
const migration023 = require('./023_discovery_v2');
const migration024 = require('./024_gif_message_type');

const migrations = [
  { name: '001_initial_schema', ...migration001 },
  { name: '002_notifications_and_events', ...migration002 },
  { name: '003_shared_cards', ...migration003 },
  { name: '004_mutual_connections', ...migration004 },
  { name: '005_feed_cache', ...migration005 },
  { name: '006_contact_groups', ...migration006 },
  { name: '007_user_insights', ...migration007 },
  { name: '008_bridge_tables', ...migration008 },
  { name: '009_suggestions_and_card_exchange', ...migration009 },
  { name: '010_event_details', ...migration010 },
  { name: '011_schools_clubs_rsvps_attendances', ...migration011 },
  { name: '012_messaging', ...migration012 },
  { name: '013_user_profiles_and_linking', ...migration013 },
  { name: '014_club_event_aggregator', ...migration014 },
  { name: '015_user_location', ...migration015 },
  { name: '016_post_ocr_text', ...migration016 },
  { name: '017_discord_groupme_social', ...migration017 },
  { name: '018_event_coordinates', ...migration018 },
  { name: '019_message_type_cards', ...migration019 },
  { name: '020_club_notification_prefs', ...migration020 },
  { name: '021_email_verification', ...migration021 },
  { name: '022_contact_phone_numbers', ...migration022 },
  { name: '023_discovery_v2', ...migration023 },
  { name: '024_gif_message_type', ...migration024 },
];

const createMigrationsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
};

const getExecutedMigrations = async () => {
  const result = await pool.query('SELECT name FROM schema_migrations ORDER BY id');
  return result.rows.map((r) => r.name);
};

const runMigrations = async (direction = 'up') => {
  try {
    await createMigrationsTable();
    const executed = await getExecutedMigrations();

    if (direction === 'up') {
      for (const migration of migrations) {
        if (!executed.includes(migration.name)) {
          logger.info(`Running migration: ${migration.name}`);
          await pool.query(migration.up);
          await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
          logger.info(`Migration ${migration.name} completed successfully`);
        } else {
          logger.info(`Migration ${migration.name} already executed, skipping`);
        }
      }
    } else if (direction === 'down') {
      for (const migration of [...migrations].reverse()) {
        if (executed.includes(migration.name)) {
          logger.info(`Rolling back migration: ${migration.name}`);
          await pool.query(migration.down);
          await pool.query('DELETE FROM schema_migrations WHERE name = $1', [migration.name]);
          logger.info(`Migration ${migration.name} rolled back successfully`);
        }
      }
    }

    logger.info('All migrations completed');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
};

const direction = process.argv[2] || 'up';
runMigrations(direction);
