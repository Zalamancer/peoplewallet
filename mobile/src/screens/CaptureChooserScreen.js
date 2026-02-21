import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme/colors';
import CaptureModeSelector from '../components/CaptureModeSelector';
import { Ionicons } from '@expo/vector-icons';

/**
 * Full-screen capture mode chooser
 * User can pick: Manual, AI Dictation, Live Recording, or LinkedIn
 */
const CaptureChooserScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <CaptureModeSelector navigation={navigation} onClose={() => { }} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeButton: {
    padding: spacing.sm,
  },
});

export default CaptureChooserScreen;
