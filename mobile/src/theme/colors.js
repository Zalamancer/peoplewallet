export const colors = {
  // Primary palette
  primary: '#4F46E5', // Indigo
  primaryDark: '#3730A3',
  primaryLight: '#818CF8',
  primaryBg: '#EEF2FF',

  // Accent
  accent: '#10B981', // Emerald
  accentDark: '#059669',
  accentLight: '#6EE7B7',

  // Confidence indicators
  confidenceHigh: '#22C55E', // Green - auto-populate
  confidenceMedium: '#F59E0B', // Yellow/Amber - suggest
  confidenceLow: '#94A3B8', // Slate - blank/missing

  // Status
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Neutrals
  white: '#FFFFFF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textInverse: '#FFFFFF',
  placeholder: '#CBD5E1',

  // Recording
  recording: '#EF4444',
  recordingBg: '#FEF2F2',

  // Tags
  tagBg: '#F1F5F9',
  tagText: '#475569',
  tagBorder: '#E2E8F0',

  // Cards
  cardShadow: 'rgba(15, 23, 42, 0.08)',
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  button: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
};
