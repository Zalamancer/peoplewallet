export const darkColors = {
  // Primary palette - Sleek, Professional Blue (Dark Mode)
  primary: '#0A84FF', // Apple dark mode blue
  primaryDark: '#0056B3',
  primaryLight: '#4DACFF',
  primaryBg: 'rgba(10, 132, 255, 0.15)',

  // Secondary - Neutral Slate
  secondary: '#94A3B8',
  secondaryLight: '#CBD5E1',

  // Accent
  accent: '#30D158',
  accentDark: '#23933E',
  accentLight: '#6EE7B7',

  // Confidence indicators
  confidenceHigh: '#30D158',
  confidenceMedium: '#FF9F0A',
  confidenceLow: '#8E8E93',

  // Status
  success: '#30D158',
  warning: '#FFD60A',
  error: '#FF453A',
  info: '#64D2FF',

  // Neutrals - Crisp, High-Contrast Dark Theme
  white: '#FFFFFF',
  background: '#000000',
  surface: '#1C1C1E',
  border: '#38383A',
  borderLight: '#2C2C2E',
  textPrimary: '#FFFFFF',
  textSecondary: '#EBEBF5',
  textTertiary: '#8E8E93',
  textInverse: '#FFFFFF',
  placeholder: '#636366',

  // Recording
  recording: '#FF453A',
  recordingBg: 'rgba(255, 69, 58, 0.15)',

  // Tags
  tagBg: '#2C2C2E',
  tagText: '#EBEBF5',
  tagBorder: '#38383A',

  // Cards
  cardShadow: 'rgba(0, 0, 0, 0.5)',
};

export const lightColors = {
  // Primary palette - Apple Light Mode Blue
  primary: '#007AFF',
  primaryDark: '#0056B3',
  primaryLight: '#4DACFF',
  primaryBg: 'rgba(0, 122, 255, 0.08)',

  // Secondary
  secondary: '#8E8E93',
  secondaryLight: '#AEAEB2',

  // Accent
  accent: '#34C759',
  accentDark: '#23933E',
  accentLight: '#6EE7B7',

  // Confidence indicators
  confidenceHigh: '#34C759',
  confidenceMedium: '#FF9500',
  confidenceLow: '#8E8E93',

  // Status
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#5AC8FA',

  // Neutrals - Clean, iOS-style Light Theme
  white: '#FFFFFF',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  border: '#C6C6C8',
  borderLight: '#E5E5EA',
  textPrimary: '#000000',
  textSecondary: '#3C3C43',
  textTertiary: '#8E8E93',
  textInverse: '#FFFFFF',
  placeholder: '#C7C7CC',

  // Recording
  recording: '#FF3B30',
  recordingBg: 'rgba(255, 59, 48, 0.08)',

  // Tags
  tagBg: '#E5E5EA',
  tagText: '#3C3C43',
  tagBorder: '#C6C6C8',

  // Cards
  cardShadow: 'rgba(0, 0, 0, 0.08)',
};

export const sepiaColors = {
  // Primary palette - Warm Brown
  primary: '#B66A35',
  primaryDark: '#8C4D22',
  primaryLight: '#D08C5D',
  primaryBg: 'rgba(182, 106, 53, 0.1)',

  // Secondary
  secondary: '#8B7355',
  secondaryLight: '#A89274',

  // Accent
  accent: '#A0522D',
  accentDark: '#75391D',
  accentLight: '#C37A58',

  // Confidence indicators
  confidenceHigh: '#6B8E23',
  confidenceMedium: '#CD853F',
  confidenceLow: '#8B7355',

  // Status
  success: '#6B8E23',
  warning: '#DAA520',
  error: '#CD5C5C',
  info: '#4682B4',

  // Neutrals - Warm Sepia Theme
  white: '#FDF6E3',
  background: '#F4ECD8',
  surface: '#FDF6E3',
  border: '#E2D5BE',
  borderLight: '#E8DFCC',
  textPrimary: '#4B3621',
  textSecondary: '#6B543A',
  textTertiary: '#8B7355',
  textInverse: '#FDF6E3',
  placeholder: '#9C886F',

  // Recording
  recording: '#CD5C5C',
  recordingBg: 'rgba(205, 92, 92, 0.1)',

  // Tags
  tagBg: '#E8DFCC',
  tagText: '#6B543A',
  tagBorder: '#E2D5BE',

  // Cards
  cardShadow: 'rgba(75, 54, 33, 0.08)',
};

// Default export for backward compatibility (used by non-component code)
export const colors = darkColors;

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
  lg: 14,
  xl: 18,
  full: 999,
};

export const typography = {
  h1: { fontSize: 30, fontWeight: '700', lineHeight: 38, letterSpacing: 0.5 },
  h2: { fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing: 0.3 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: 0.2 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18, textTransform: 'uppercase', letterSpacing: 0.6 },
  button: { fontSize: 16, fontWeight: '600', lineHeight: 22, letterSpacing: 0.4 },
};
