import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import Tag from './Tag';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 0.5;

const FilterRow = ({
  filters,
  activeFilter,
  onFilterChange,
  advancedFilters,
  activeAdvanced,
  onAdvancedChange,
  style,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;

  const hasAdvanced = advancedFilters && advancedFilters.length > 0;

  const activeCount = useMemo(() => {
    if (!hasAdvanced || !activeAdvanced) return 0;
    return advancedFilters.reduce((count, group) => {
      const defaultKey = group.options[0]?.key;
      const current = activeAdvanced[group.key];
      return count + (current && current !== defaultKey ? 1 : 0);
    }, 0);
  }, [hasAdvanced, advancedFilters, activeAdvanced]);

  const handleReset = () => {
    if (!advancedFilters || !onAdvancedChange) return;
    advancedFilters.forEach((group) => {
      const defaultKey = group.options[0]?.key;
      if (defaultKey) onAdvancedChange(group.key, defaultKey);
    });
  };

  const openModal = useCallback(() => {
    translateY.setValue(0);
    setModalVisible(true);
  }, [translateY]);

  const closeModal = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
      translateY.setValue(0);
    });
  }, [translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging downward
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (
          gestureState.dy > DISMISS_THRESHOLD ||
          gestureState.vy > VELOCITY_THRESHOLD
        ) {
          // Dismiss
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            setModalVisible(false);
            translateY.setValue(0);
          });
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={styles.iconWrapper}
        onPress={hasAdvanced ? openModal : undefined}
        disabled={!hasAdvanced}
        activeOpacity={0.6}
      >
        <Ionicons
          name="options-outline"
          size={18}
          color={activeCount > 0 ? colors.primary : colors.textTertiary}
        />
        {activeCount > 0 && <View style={styles.activeDot} />}
      </TouchableOpacity>

      <View style={styles.pillsWrapper}>
        <LinearGradient
          colors={[colors.background, colors.background + '00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.pillsFade}
          pointerEvents="none"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pills}
        >
          {filters.map((filter) => (
            <Tag
              key={filter.key}
              label={filter.label}
              selected={activeFilter === filter.key}
              onPress={() => onFilterChange(filter.key)}
              variant={activeFilter === filter.key ? 'primary' : 'default'}
            />
          ))}
        </ScrollView>
      </View>

      {/* Advanced Filters Modal */}
      {hasAdvanced && (
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeModal}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={closeModal}
          >
            <Animated.View
              style={[
                styles.modalContent,
                { transform: [{ translateY }] },
              ]}
            >
              {/* Swipeable handle area */}
              <View {...panResponder.panHandlers} style={styles.handleZone}>
                <View style={styles.modalHandle} />
              </View>

              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Filters</Text>
                <View style={styles.modalHeaderRight}>
                  {activeCount > 0 && (
                    <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
                      <Text style={styles.resetText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={closeModal}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Filter groups */}
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {advancedFilters.map((group) => (
                  <View key={group.key} style={styles.filterGroup}>
                    <View style={styles.groupLabelRow}>
                      {group.icon && (
                        <Ionicons name={group.icon} size={16} color={colors.textTertiary} />
                      )}
                      <Text style={styles.groupLabel}>{group.label}</Text>
                    </View>
                    <View style={styles.groupOptions}>
                      {group.options.map((option) => {
                        const isActive = activeAdvanced?.[group.key] === option.key;
                        return (
                          <TouchableOpacity
                            key={option.key}
                            style={[
                              styles.optionChip,
                              isActive && styles.optionChipActive,
                            ]}
                            onPress={() => {
                              onAdvancedChange?.(group.key, option.key);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.optionText,
                                isActive && styles.optionTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <View style={{ height: spacing.xl }} />
              </ScrollView>

              {/* Apply button */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={closeModal}
                  activeOpacity={0.8}
                >
                  <Text style={styles.applyText}>
                    {activeCount > 0 ? `Apply (${activeCount})` : 'Done'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
  },
  iconWrapper: {
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'relative',
  },
  activeDot: {
    position: 'absolute',
    top: 2,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  pillsWrapper: {
    flex: 1,
    position: 'relative',
  },
  pillsFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 16,
    zIndex: 1,
  },
  pills: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: 6,
    paddingRight: spacing.md,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '70%',
    paddingBottom: spacing.md,
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  modalHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resetButton: {
    paddingVertical: spacing.xs,
  },
  resetText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },

  // Filter groups
  modalBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  filterGroup: {
    marginBottom: spacing.lg,
  },
  groupLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  groupLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  groupOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.tagBg,
    borderWidth: 1,
    borderColor: colors.tagBorder,
  },
  optionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.tagText,
  },
  optionTextActive: {
    color: colors.textInverse,
  },

  // Apply button
  modalFooter: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
  },
  applyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  applyText: {
    ...typography.button,
    color: colors.textInverse,
  },
});

export default FilterRow;
