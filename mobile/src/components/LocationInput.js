import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const POPULAR_LOCATIONS = [
  'New York, NY',
  'Los Angeles, CA',
  'Chicago, IL',
  'Houston, TX',
  'Phoenix, AZ',
  'Philadelphia, PA',
  'San Antonio, TX',
  'San Diego, CA',
  'Dallas, TX',
  'Fort Worth, TX',
  'Austin, TX',
  'San Francisco, CA',
  'San Jose, CA',
  'Seattle, WA',
  'Denver, CO',
  'Boston, MA',
  'Nashville, TN',
  'Washington, DC',
  'Miami, FL',
  'Atlanta, GA',
  'Portland, OR',
  'Minneapolis, MN',
  'Charlotte, NC',
  'Raleigh, NC',
  'Salt Lake City, UT',
  'Pittsburgh, PA',
  'Columbus, OH',
  'Indianapolis, IN',
  'Detroit, MI',
  'Tampa, FL',
  'Orlando, FL',
  'St. Louis, MO',
  'Kansas City, MO',
  'Las Vegas, NV',
  'Sacramento, CA',
  'Richmond, VA',
  'Baltimore, MD',
  'Milwaukee, WI',
  'Tucson, AZ',
  'Oklahoma City, OK',
  'London, UK',
  'Toronto, Canada',
  'Vancouver, Canada',
  'Berlin, Germany',
  'Paris, France',
  'Tokyo, Japan',
  'Sydney, Australia',
  'Singapore',
  'Dubai, UAE',
  'Mumbai, India',
  'Bangalore, India',
];

const LocationInput = ({ value, onChangeText, label = 'Location', placeholder = 'e.g. Dallas, TX' }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!value || value.length < 2) return [];
    const lower = value.toLowerCase();
    return POPULAR_LOCATIONS.filter((loc) => loc.toLowerCase().includes(lower)).slice(0, 5);
  }, [value]);

  const handleSelect = (loc) => {
    onChangeText(loc);
    setShowSuggestions(false);
  };

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.container, focused && styles.containerFocused]}>
        <Ionicons name="location-outline" size={18} color={focused ? colors.primary : colors.textTertiary} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            setShowSuggestions(true);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          onFocus={() => {
            setFocused(true);
            setShowSuggestions(true);
          }}
          onBlur={() => {
            setFocused(false);
            // Delay to allow suggestion tap to register
            setTimeout(() => setShowSuggestions(false), 200);
          }}
        />
        {value ? (
          <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.map((loc) => (
            <TouchableOpacity key={loc} style={styles.suggestion} onPress={() => handleSelect(loc)}>
              <Ionicons name="location" size={16} color={colors.primary} />
              <Text style={styles.suggestionText}>{loc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
    zIndex: 10,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: spacing.sm,
  },
  containerFocused: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  dropdown: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  suggestionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
});

export default LocationInput;
