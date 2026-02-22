/**
 * UTD campus building coordinates for client-side geocoding.
 * Coordinates sourced from OpenStreetMap (Overpass API).
 *
 * Used by EventMapScreen (markers) and EventDetailScreen (mini-map).
 * "Get Directions" uses Google Maps search queries for accuracy.
 */

export const UTD_CENTER = { latitude: 32.9870, longitude: -96.7500 };

// Real coordinates from OpenStreetMap, verified Feb 2026
const BUILDINGS = {
  // Engineering & Computer Science
  ECSW: { latitude: 32.9862, longitude: -96.7515 }, // West of ECSS, placed from satellite
  ECSS: { latitude: 32.9862, longitude: -96.7504 }, // OSM: 32.9861577, -96.7503629
  ECSN: { latitude: 32.9869, longitude: -96.7504 }, // OSM: 32.9868809, -96.7503598

  // Sciences
  SCI:  { latitude: 32.9887, longitude: -96.7503 }, // OSM: 32.9887021, -96.7503191
  SLC:  { latitude: 32.9882, longitude: -96.7504 }, // OSM: 32.9881862, -96.7504023
  PHY:  { latitude: 32.9895, longitude: -96.7504 }, // OSM: 32.9894525, -96.7503739
  BE:   { latitude: 32.9877, longitude: -96.7505 }, // OSM: 32.9876967, -96.7504623

  // Business
  JSOM: { latitude: 32.9860, longitude: -96.7476 }, // Jindal - south of SSB near Athenaeum
  SOM:  { latitude: 32.9860, longitude: -96.7476 }, // Alias for JSOM

  // Student Life
  SU:   { latitude: 32.9867, longitude: -96.7489 }, // OSM: 32.9866625, -96.7488828
  SUFC: { latitude: 32.9868, longitude: -96.7494 }, // OSM: 32.9867742, -96.7494056
  SSA:  { latitude: 32.9860, longitude: -96.7494 }, // OSM: 32.9860284, -96.749392
  SSB:  { latitude: 32.9859, longitude: -96.7488 }, // OSM: 32.9859023, -96.7488429
  AB:   { latitude: 32.9851, longitude: -96.7498 }, // OSM: 32.9851206, -96.7497766
  ACB:  { latitude: 32.9846, longitude: -96.7496 }, // OSM: 32.9845965, -96.7496389

  // Classroom & Lecture
  CB:   { latitude: 32.9897, longitude: -96.7493 }, // OSM: 32.9897017, -96.7493349
  GR:   { latitude: 32.9886, longitude: -96.7479 }, // OSM: 32.988627, -96.7478579
  HH:   { latitude: 32.9869, longitude: -96.7516 }, // OSM: 32.986945, -96.7516349
  JO:   { latitude: 32.9888, longitude: -96.7489 }, // OSM: 32.9887991, -96.7489322
  TH:   { latitude: 32.9884, longitude: -96.7487 }, // OSM: 32.9884216, -96.7487111

  // Founders
  FN:   { latitude: 32.9881, longitude: -96.7494 }, // OSM: 32.9881263, -96.7493525
  FO:   { latitude: 32.9877, longitude: -96.7491 }, // OSM: 32.9876881, -96.7490532
  FA:   { latitude: 32.9877, longitude: -96.7499 }, // OSM: 32.9876946, -96.7498952

  // Library & Admin
  MC:   { latitude: 32.9869, longitude: -96.7476 }, // OSM: 32.986925, -96.747632
  AD:   { latitude: 32.9897, longitude: -96.7483 }, // OSM: 32.9897304, -96.7483113

  // Arts
  AH:   { latitude: 32.9861, longitude: -96.7476 }, // O'Donnell Arts & Technology
  ATEC: { latitude: 32.9861, longitude: -96.7476 }, // Alias

  // Recreation
  AC:   { latitude: 32.9851, longitude: -96.7498 }, // Same as AB (Activity Center)
  ATC:  { latitude: 32.9851, longitude: -96.7498 }, // Activity Center Theater
  REC:  { latitude: 32.9900, longitude: -96.7553 }, // OSM RCW: 32.990011, -96.7553191

  // Research
  RL:   { latitude: 32.9923, longitude: -96.7503 }, // OSM: 32.992343, -96.7503361
  BSB:  { latitude: 32.9915, longitude: -96.7500 }, // OSM: 32.9915198, -96.7500334
  NB:   { latitude: 32.9901, longitude: -96.7494 }, // OSM: 32.9900786, -96.7493822
  NL:   { latitude: 32.9904, longitude: -96.7492 }, // OSM: 32.9903746, -96.7492145

  // Other
  DGA:  { latitude: 32.9860, longitude: -96.7465 }, // Davidson-Gundy Alumni Center
  PS1:  { latitude: 32.9860, longitude: -96.7455 }, // Parking Structure 1
  PS3:  { latitude: 32.9902, longitude: -96.7503 }, // Parking Structure 3
  PS4:  { latitude: 32.9861, longitude: -96.7530 }, // Parking Structure 4

  // Residence Halls
  RHS:  { latitude: 32.9902, longitude: -96.7517 }, // Sirius Hall
  RHC:  { latitude: 32.9912, longitude: -96.7518 }, // Capella Hall
  RHV:  { latitude: 32.9913, longitude: -96.7543 }, // Vega Hall
  RHH:  { latitude: 32.9902, longitude: -96.7529 }, // Helix Hall
  RHA:  { latitude: 32.9902, longitude: -96.7548 }, // Andromeda Hall
  UV:   { latitude: 32.9855, longitude: -96.7545 }, // University Village (center of phases)
};

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
  'performance hall': 'JO',
  'jonsson': 'JO',
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
 * Resolve an event's text location to map marker coordinates.
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function resolveEventCoordinates(event) {
  // 1) Server already geocoded it
  if (event.latitude != null && event.longitude != null) {
    return {
      latitude: parseFloat(event.latitude),
      longitude: parseFloat(event.longitude),
    };
  }

  const inputs = [event.location, event.location_building].filter(Boolean);

  for (const input of inputs) {
    const upper = input.toUpperCase().trim();

    // 2) Extract leading abbreviation (e.g. "ECSW 1.315" → "ECSW")
    const abbrevMatch = upper.match(/^([A-Z]{2,5})\b/);
    if (abbrevMatch && BUILDINGS[abbrevMatch[1]]) {
      return BUILDINGS[abbrevMatch[1]];
    }

    // 3) Check if any known abbreviation appears in the string
    for (const [abbrev, coords] of Object.entries(BUILDINGS)) {
      if (abbrev.length >= 2 && upper.includes(abbrev)) {
        return coords;
      }
    }
  }

  // 4) Fuzzy name matching
  for (const input of inputs) {
    const lower = input.toLowerCase().trim();
    for (const [alias, abbrev] of Object.entries(NAME_ALIASES)) {
      if (lower.includes(alias)) {
        return BUILDINGS[abbrev] || null;
      }
    }
  }

  // 5) On-campus fallback → campus center
  if (event.is_on_campus === true || event.is_on_campus === 'true') {
    return UTD_CENTER;
  }

  return null;
}

/**
 * Build a Google Maps search URL for directions to an event location.
 * Uses the location text as a search query so Google Maps can resolve
 * room numbers, building names, etc. with its own data.
 *
 * @returns {string} - A maps URL for directions
 */
export function buildDirectionsUrl(event) {
  const parts = [event.location, event.location_building].filter(Boolean);

  // Build a descriptive search query
  let query;
  if (parts.length > 0) {
    query = parts.join(', ') + ', UT Dallas, Richardson TX';
  } else if (event.name) {
    query = event.name + ', UT Dallas, Richardson TX';
  } else {
    query = 'UT Dallas, Richardson TX';
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
