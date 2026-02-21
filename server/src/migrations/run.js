require('dotenv').config();
const { pool } = require('../config/database');
const logger = require('../utils/logger');
const migration001 = require('./001_initial_schema');

const migrations = [
  { name: '001_initial_schema', ...migration001 },
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
