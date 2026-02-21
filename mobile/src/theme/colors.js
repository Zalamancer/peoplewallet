export const colors = {
  // Primary palette - Sleek, Professional Blue
  primary: '#007AFF', // Classic iOS blue accent
  primaryDark: '#0056B3',
  primaryLight: '#4DACFF',
  primaryBg: '#F0F8FF', // Very subtle blue tint for backgrounds

  // Secondary - Neutral Slate
  secondary: '#334155',
  secondaryLight: '#94A3B8',

  // Accent
  accent: '#10B981', // Emerald
  accentDark: '#059669',
  accentLight: '#6EE7B7',

  // Confidence indicators
  confidenceHigh: '#34C759', // Green
  confidenceMedium: '#FF9500', // Orange
  confidenceLow: '#8E8E93', // Gray

  // Status
  success: '#34C759',
  warning: '#FFCC00',
  error: '#FF3B30',
  info: '#32ADE6',

  // Neutrals - Crisp, High-Contrast
  white: '#FFFFFF',
  background: '#F2F2F7', // Apple system background
  surface: '#FFFFFF',
  border: '#E5E5EA',
  borderLight: '#F2F2F7',
  textPrimary: '#1C1C1E',
  textSecondary: '#3A3A3C',
  textTertiary: '#8E8E93',
  textInverse: '#FFFFFF',
  placeholder: '#C7C7CC',

  // Recording
  recording: '#FF3B30',
  recordingBg: '#FFEEEE',

  // Tags
  tagBg: '#E5E5EA',
  tagText: '#3A3A3C',
  tagBorder: '#E5E5EA',

  // Cards
  cardShadow: 'rgba(0, 0, 0, 0.08)', // Standard dark shadow
};

export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  }
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
  lg: 14,   // Classy slight curve, not a pill
  xl: 18,
  full: 999,
};

export const typography = {
  h1: { fontSize: 30, fontWeight: '700', lineHeight: 38, letterSpacing: 0.5 },
  h2: { fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing: 0.3 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: 0.2 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18, color: colors.textSecondary },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18, textTransform: 'uppercase', letterSpacing: 0.6 },
  button: { fontSize: 16, fontWeight: '600', lineHeight: 22, letterSpacing: 0.4 },
};
