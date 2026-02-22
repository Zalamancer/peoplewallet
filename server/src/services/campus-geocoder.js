const { query } = require('../config/database');
const logger = require('../utils/logger');
const axios = require('axios');

/**
 * Campus Geocoder Service
 *
 * Resolves event locations to lat/lng coordinates.
 * Strategy:
 *   1. Exact match on UTD campus building abbreviation/name
 *   2. Fuzzy/substring match
 *   3. If on-campus but no match → UTD campus center
 *   4. Off-campus → Nominatim (free, no API key, 1 req/sec)
 */

// UTD campus center fallback
const UTD_CENTER = { lat: 32.9870, lng: -96.7500 };

// UTD campus buildings → coordinates (from OpenStreetMap, verified Feb 2026)
const CAMPUS_BUILDINGS = {
  // Engineering & Computer Science
  ECSW: { lat: 32.9862, lng: -96.7515, name: 'Engineering & Computer Science West' },
  ECSS: { lat: 32.9862, lng: -96.7504, name: 'Engineering & Computer Science South' },
  ECSN: { lat: 32.9869, lng: -96.7504, name: 'Engineering & Computer Science North' },

  // Sciences
  SCI:  { lat: 32.9887, lng: -96.7503, name: 'Sciences Building' },
  SLC:  { lat: 32.9882, lng: -96.7504, name: 'Science Learning Center' },
  PHY:  { lat: 32.9895, lng: -96.7504, name: 'Physics Building' },
  BE:   { lat: 32.9877, lng: -96.7505, name: 'Berkner Hall' },

  // Founders
  FN:   { lat: 32.9881, lng: -96.7494, name: 'Founders North' },
  FO:   { lat: 32.9877, lng: -96.7491, name: 'Founders Building' },
  FA:   { lat: 32.9877, lng: -96.7499, name: 'Founders West Annex' },

  // Business
  JSOM: { lat: 32.9860, lng: -96.7476, name: 'Jindal School of Management' },
  SOM:  { lat: 32.9860, lng: -96.7476, name: 'School of Management' },

  // Student Life
  SU:   { lat: 32.9867, lng: -96.7489, name: 'Student Union' },
  SUFC: { lat: 32.9868, lng: -96.7494, name: 'Student Union Food Court' },
  SSA:  { lat: 32.9860, lng: -96.7494, name: 'Student Services Addition' },
  SSB:  { lat: 32.9859, lng: -96.7488, name: 'Student Services Building' },
  AB:   { lat: 32.9851, lng: -96.7498, name: 'Activity Center' },
  ACB:  { lat: 32.9846, lng: -96.7496, name: 'Activity Center Bookstore' },
  ATC:  { lat: 32.9851, lng: -96.7498, name: 'Activity Center Theater' },

  // Classroom & Lecture
  CB:   { lat: 32.9897, lng: -96.7493, name: 'Classroom Building' },
  GR:   { lat: 32.9886, lng: -96.7479, name: 'Green Hall' },
  HH:   { lat: 32.9869, lng: -96.7516, name: 'Hoblitzelle Hall' },
  JO:   { lat: 32.9888, lng: -96.7489, name: 'Jonsson Academic Center' },
  TH:   { lat: 32.9884, lng: -96.7487, name: 'University Theatre' },

  // Library & Admin
  MC:   { lat: 32.9869, lng: -96.7476, name: 'McDermott Library' },
  AD:   { lat: 32.9897, lng: -96.7483, name: 'Administration Building' },

  // Arts
  AH:   { lat: 32.9861, lng: -96.7476, name: "O'Donnell Arts & Technology" },
  ATEC: { lat: 32.9861, lng: -96.7476, name: "O'Donnell Arts & Technology" },

  // Recreation
  AC:   { lat: 32.9851, lng: -96.7498, name: 'Activity Center' },
  REC:  { lat: 32.9900, lng: -96.7553, name: 'Recreation Center West' },

  // Research
  RL:   { lat: 32.9923, lng: -96.7503, name: 'Natural Science & Engineering Research Lab' },
  BSB:  { lat: 32.9915, lng: -96.7500, name: 'Bioengineering Science Building' },
  NB:   { lat: 32.9901, lng: -96.7494, name: 'North Office Building' },
  NL:   { lat: 32.9904, lng: -96.7492, name: 'North Lab' },

  // Other
  DGA:  { lat: 32.9860, lng: -96.7465, name: 'Davidson-Gundy Alumni Center' },

  // Residence Halls
  RHS:  { lat: 32.9902, lng: -96.7517, name: 'Sirius Hall' },
  RHC:  { lat: 32.9912, lng: -96.7518, name: 'Capella Hall' },
  RHV:  { lat: 32.9913, lng: -96.7543, name: 'Vega Hall' },
  RHH:  { lat: 32.9902, lng: -96.7529, name: 'Helix Hall' },
  RHA:  { lat: 32.9902, lng: -96.7548, name: 'Andromeda Hall' },
  UV:   { lat: 32.9855, lng: -96.7545, name: 'University Village' },
};

// Additional name aliases for fuzzy matching
const NAME_ALIASES = {
  'engineering west': 'ECSW',
  'engineering south': 'ECSS',
  'engineering north': 'ECSN',
  'engineering': 'ECSW',
  'computer science west': 'ECSW',
  'computer science south': 'ECSS',
  'computer science north': 'ECSN',
  'computer science': 'ECSW',
  'student union': 'SU',
  'food court': 'SUFC',
  'jindal': 'JSOM',
  'management': 'JSOM',
  'school of management': 'JSOM',
  'science building': 'SCI',
  'sciences building': 'SCI',
  'science learning': 'SLC',
  'founders north': 'FN',
  'founders building': 'FO',
  'founders': 'FO',
  'green hall': 'GR',
  'green center': 'GR',
  'hoblitzelle': 'HH',
  'activity center': 'AB',
  'classroom building': 'CB',
  'classroom': 'CB',
  'library': 'MC',
  'mcdermott': 'MC',
  'recreation center': 'REC',
  'rec center': 'REC',
  'recreation': 'REC',
  'jonsson': 'JO',
  'performance hall': 'JO',
  'arts': 'AH',
  'humanities': 'AH',
  "o'donnell": 'AH',
  'atec': 'ATEC',
  'admin': 'AD',
  'administration': 'AD',
  'berkner': 'BE',
  'physics': 'PHY',
  'theatre': 'TH',
  'theater': 'TH',
  'bioengineering': 'BSB',
  'alumni center': 'DGA',
  'davidson': 'DGA',
};

/**
 * Try to match a location string to a campus building.
 * Returns { lat, lng, source } or null.
 */
function matchCampusBuilding(location, locationBuilding) {
  const inputs = [location, locationBuilding].filter(Boolean);

  for (const input of inputs) {
    const upper = input.toUpperCase().trim();

    // 1) Exact abbreviation match (e.g., "ECSW 1.315" → extract "ECSW")
    const abbrevMatch = upper.match(/^([A-Z]{2,5})\b/);
    if (abbrevMatch && CAMPUS_BUILDINGS[abbrevMatch[1]]) {
      const bldg = CAMPUS_BUILDINGS[abbrevMatch[1]];
      return { lat: bldg.lat, lng: bldg.lng, source: 'campus_exact' };
    }

    // 2) Check if abbreviation appears anywhere in the string
    for (const [abbrev, bldg] of Object.entries(CAMPUS_BUILDINGS)) {
      if (upper.includes(abbrev) && abbrev.length >= 2) {
        return { lat: bldg.lat, lng: bldg.lng, source: 'campus_abbrev' };
      }
    }
  }

  // 3) Fuzzy name matching
  for (const input of inputs) {
    const lower = input.toLowerCase().trim();
    for (const [alias, abbrev] of Object.entries(NAME_ALIASES)) {
      if (lower.includes(alias)) {
        const bldg = CAMPUS_BUILDINGS[abbrev];
        if (bldg) {
          return { lat: bldg.lat, lng: bldg.lng, source: 'campus_fuzzy' };
        }
      }
    }
  }

  return null;
}

/**
 * Geocode using Nominatim (free OpenStreetMap geocoder).
 * Rate limited to 1 req/sec by Nominatim's usage policy.
 */
async function geocodeWithNominatim(locationText) {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: locationText,
        format: 'json',
        limit: 1,
      },
      headers: {
        'User-Agent': 'PeopleWallet/1.0',
      },
      timeout: 5000,
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        source: 'nominatim',
      };
    }
  } catch (error) {
    logger.warn('Nominatim geocoding failed:', error.message);
  }
  return null;
}

/**
 * Geocode an event location.
 *
 * @param {string|null} location - Room/address string (e.g., "ECSW 1.315")
 * @param {string|null} locationBuilding - Building name (e.g., "Engineering & Computer Science West")
 * @param {boolean|null} isOnCampus - Whether the event is on campus
 * @returns {{ lat: number, lng: number, source: string } | null}
 */
async function geocodeEventLocation(location, locationBuilding, isOnCampus) {
  // 1) Try campus building match
  const campusResult = matchCampusBuilding(location || '', locationBuilding || '');
  if (campusResult) return campusResult;

  // 2) On-campus but no building match → use campus center
  if (isOnCampus === true) {
    return { lat: UTD_CENTER.lat, lng: UTD_CENTER.lng, source: 'campus_center' };
  }

  // 3) Off-campus with a location string → try Nominatim
  const locationText = [location, locationBuilding].filter(Boolean).join(', ');
  if (locationText.length > 2) {
    return geocodeWithNominatim(locationText);
  }

  return null;
}

/**
 * Batch geocode all events that have a location but no coordinates.
 */
async function geocodeExistingEvents() {
  const result = await query(
    `SELECT id, location, location_building, is_on_campus
     FROM events
     WHERE latitude IS NULL
       AND (location IS NOT NULL OR location_building IS NOT NULL)
     ORDER BY created_at DESC
     LIMIT 500`
  );

  let geocoded = 0;
  let failed = 0;

  for (const event of result.rows) {
    try {
      const coords = await geocodeEventLocation(
        event.location,
        event.location_building,
        event.is_on_campus
      );

      if (coords) {
        await query(
          `UPDATE events SET latitude = $1, longitude = $2, geocode_source = $3 WHERE id = $4`,
          [coords.lat, coords.lng, coords.source, event.id]
        );
        geocoded++;
      } else {
        failed++;
      }

      // Respect Nominatim rate limit (1 req/sec)
      if (coords?.source === 'nominatim') {
        await new Promise((r) => setTimeout(r, 1100));
      }
    } catch (error) {
      logger.error(`Failed to geocode event ${event.id}:`, error.message);
      failed++;
    }
  }

  logger.info(`Geocode backfill: ${geocoded} geocoded, ${failed} failed out of ${result.rows.length}`);
  return { geocoded, failed, total: result.rows.length };
}

module.exports = {
  geocodeEventLocation,
  geocodeExistingEvents,
  matchCampusBuilding,
  UTD_CENTER,
};
