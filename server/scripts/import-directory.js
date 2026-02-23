#!/usr/bin/env node
/**
 * Import Student Organization Directory CSV into the database.
 *
 * Usage:
 *   node scripts/import-directory.js [path-to-csv]
 *
 * Default CSV path: ../Student Organization Directory.csv
 *
 * What it does:
 *   1. Parses the CSV (handles quoted fields with embedded commas/newlines)
 *   2. Maps CSV categories → DB category enum values
 *   3. Extracts Instagram handles from Social Media URLs
 *   4. Inserts into discovered_accounts (ON CONFLICT DO NOTHING)
 *   5. Inserts/updates clubs table (ON CONFLICT updates name + directory flag)
 *   6. Sets in_official_directory=true, discovery_source='official_directory'
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

// ─── CSV Parser (handles quoted fields with embedded commas/newlines) ─────────

function parseCSV(text) {
  const records = [];
  let current = [];
  let field = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === ',') {
        current.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (current.length > 0 || field.length > 0) {
          current.push(field);
          field = '';
          records.push(current);
          current = [];
        }
      } else {
        field += c;
      }
    }
  }
  if (current.length > 0 || field.length > 0) {
    current.push(field);
    records.push(current);
  }
  return records;
}

// ─── Category Mapping ────────────────────────────────────────────────────────

// CSV categories → DB category enum
// DB allows: tech, academic, social, sports, arts, professional, cultural, general, other, greek_life, religious, service
const CATEGORY_MAP = {
  'academic interest': 'academic',
  'academic interests': 'academic',
  'educational/departmental': 'academic',
  'honor society': 'academic',
  'cultural': 'cultural',
  'social': 'social',
  'art and music': 'arts',
  'arts and music': 'arts',
  'art': 'arts',
  'music': 'arts',
  'sports and recreation': 'sports',
  'sports': 'sports',
  'recreation': 'sports',
  'religious': 'religious',
  'spiritual': 'religious',
  'services': 'service',
  'service': 'service',
  'community service': 'service',
  'professional': 'professional',
  'governance': 'professional',
  'political': 'professional',
  'media': 'arts',
  'greek': 'greek_life',
  'fraternity': 'greek_life',
  'sorority': 'greek_life',
  'university department': 'general',
  'special interest': 'other',
};

function mapCategory(csvCategory) {
  if (!csvCategory) return 'general';

  // CSV categories can be comma-separated (e.g. "Cultural, Social")
  const parts = csvCategory.split(',').map((s) => s.trim().toLowerCase());

  // Try to match each part, use the first match
  for (const part of parts) {
    if (CATEGORY_MAP[part]) return CATEGORY_MAP[part];
    // Partial match
    for (const [key, value] of Object.entries(CATEGORY_MAP)) {
      if (part.includes(key) || key.includes(part)) return value;
    }
  }

  return 'general';
}

// ─── Instagram Handle Extraction ─────────────────────────────────────────────

function extractInstagramHandle(socialUrl) {
  if (!socialUrl) return null;
  const match = socialUrl.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (match && match[1]) {
    const handle = match[1].toLowerCase();
    const ignore = ['p', 'explore', 'reels', 'stories', 'accounts', 'directory', 'about', 'tags', 'locations'];
    if (ignore.includes(handle)) return null;
    // Strip query params that might have been captured
    return handle.replace(/[?#].*$/, '');
  }
  return null;
}

// ─── Main Import ─────────────────────────────────────────────────────────────

async function main() {
  const csvPath = process.argv[2] || path.join(__dirname, '..', '..', 'Student Organization Directory.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading CSV: ${csvPath}`);
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  // Strip BOM if present
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const records = parseCSV(cleanText);

  const headers = records[0];
  const data = records.slice(1);
  console.log(`Parsed ${data.length} records`);
  console.log('Headers:', headers.map((h) => h.trim()));

  // Get UTD school ID
  const schoolResult = await pool.query("SELECT id FROM schools WHERE domain = 'utdallas.edu' LIMIT 1");
  if (schoolResult.rows.length === 0) {
    console.error('UTD school not found in database. Run migration 023 first.');
    process.exit(1);
  }
  const schoolId = schoolResult.rows[0].id;
  console.log(`UTD school ID: ${schoolId}`);

  // Stats
  let totalProcessed = 0;
  let clubsInserted = 0;
  let clubsUpdated = 0;
  let discoveredInserted = 0;
  let withInstagram = 0;
  let withoutInstagram = 0;
  let errors = 0;

  for (const row of data) {
    const name = (row[0] || '').trim();
    const category = (row[1] || '').trim();
    const description = (row[2] || '').trim();
    const email = (row[3] || '').trim();
    const memberCount = parseInt(row[4], 10) || 0;
    const status = (row[5] || '').trim();
    const socialMedia = (row[8] || '').trim();

    if (!name) continue;
    totalProcessed++;

    const dbCategory = mapCategory(category);
    const igHandle = extractInstagramHandle(socialMedia);

    try {
      if (igHandle) {
        withInstagram++;

        // Insert into discovered_accounts
        const daResult = await pool.query(
          `INSERT INTO discovered_accounts (handle, url, bio, status, school_id, discovery_source)
           VALUES ($1, $2, $3, 'promoted', $4, 'official_directory')
           ON CONFLICT (handle) DO UPDATE SET
             bio = COALESCE(NULLIF(discovered_accounts.bio, ''), EXCLUDED.bio),
             school_id = COALESCE(discovered_accounts.school_id, EXCLUDED.school_id),
             discovery_source = CASE WHEN discovered_accounts.discovery_source IS NULL THEN 'official_directory' ELSE discovered_accounts.discovery_source END
           RETURNING id, (xmax = 0) AS inserted`,
          [igHandle, `https://www.instagram.com/${igHandle}/`, description.slice(0, 500), schoolId]
        );
        if (daResult.rows[0]?.inserted) discoveredInserted++;

        // Insert/update clubs table
        const clubResult = await pool.query(
          `INSERT INTO clubs (name, description, category, instagram_handle, school_id, in_official_directory, discovery_source)
           VALUES ($1, $2, $3, $4, $5, true, 'official_directory')
           ON CONFLICT (instagram_handle) DO UPDATE SET
             name = EXCLUDED.name,
             description = COALESCE(NULLIF(clubs.description, ''), EXCLUDED.description),
             category = CASE WHEN clubs.category = 'general' OR clubs.category = 'other' THEN EXCLUDED.category ELSE clubs.category END,
             in_official_directory = true,
             school_id = COALESCE(clubs.school_id, EXCLUDED.school_id),
             updated_at = NOW()
           RETURNING (xmax = 0) AS inserted`,
          [name, description.slice(0, 2000), dbCategory, igHandle, schoolId]
        );

        if (clubResult.rows[0]?.inserted) {
          clubsInserted++;
        } else {
          clubsUpdated++;
        }
      } else {
        withoutInstagram++;

        // For clubs without Instagram, still insert into clubs table so we have a record
        // Use a generated handle placeholder based on the name (no UNIQUE conflict since no IG handle)
        await pool.query(
          `INSERT INTO clubs (name, description, category, school_id, in_official_directory, discovery_source)
           VALUES ($1, $2, $3, $4, true, 'official_directory')
           ON CONFLICT DO NOTHING`,
          [name, description.slice(0, 2000), dbCategory, schoolId]
        );
        clubsInserted++;
      }
    } catch (error) {
      console.error(`Error importing "${name}":`, error.message);
      errors++;
    }
  }

  console.log('\n=== Import Summary ===');
  console.log(`Total records processed: ${totalProcessed}`);
  console.log(`With Instagram handle: ${withInstagram}`);
  console.log(`Without Instagram handle: ${withoutInstagram}`);
  console.log(`Clubs inserted: ${clubsInserted}`);
  console.log(`Clubs updated: ${clubsUpdated}`);
  console.log(`Discovered accounts inserted: ${discoveredInserted}`);
  console.log(`Errors: ${errors}`);

  // Show current club count
  const clubCount = await pool.query('SELECT COUNT(*) FROM clubs WHERE school_id = $1', [schoolId]);
  console.log(`\nTotal clubs in DB for UTD: ${clubCount.rows[0].count}`);

  const igCount = await pool.query('SELECT COUNT(*) FROM clubs WHERE school_id = $1 AND instagram_handle IS NOT NULL', [schoolId]);
  console.log(`Clubs with Instagram: ${igCount.rows[0].count}`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
