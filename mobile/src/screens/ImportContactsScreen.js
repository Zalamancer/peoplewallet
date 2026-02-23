import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { contactsAPI } from '../services/api';
import Input from '../components/Input';
import Button from '../components/Button';
import { Ionicons } from '@expo/vector-icons';

const ImportContactsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [permissionStatus, setPermissionStatus] = useState(null); // null | 'granted' | 'denied'
  const [phoneContacts, setPhoneContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({}); // { contactId: selectedPhoneIndex }
  const [allSelected, setAllSelected] = useState(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const requestPermission = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setPermissionStatus(status);
      if (status === 'granted') {
        loadContacts();
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.warn('Contacts permission error:', error);
      setPermissionStatus('denied');
      setLoading(false);
    }
  };

  const loadContacts = async () => {
    try {
      setLoading(true);
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Company,
          Contacts.Fields.JobTitle,
          Contacts.Fields.Note,
        ],
        sort: Contacts.SortTypes.FirstName,
      });

      // Filter to contacts that have at least a name
      const valid = data.filter((c) => c.name && c.name.trim());
      setPhoneContacts(valid);
    } catch (error) {
      console.warn('Failed to load contacts:', error);
      Alert.alert('Error', 'Failed to load phone contacts.');
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return phoneContacts;
    const q = search.toLowerCase();
    return phoneContacts.filter((c) => c.name?.toLowerCase().includes(q));
  }, [phoneContacts, search]);

  const toggleSelect = useCallback((contactId, phoneNumbers) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[contactId] !== undefined) {
        delete next[contactId];
      } else {
        // Auto-select first phone number (index 0) if available
        next[contactId] = phoneNumbers?.length > 0 ? 0 : -1;
      }
      return next;
    });
  }, []);

  const selectPhoneNumber = useCallback((contactId, phoneIndex) => {
    setSelected((prev) => ({ ...prev, [contactId]: phoneIndex }));
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelected({});
      setAllSelected(false);
    } else {
      const newSelected = {};
      filteredContacts.forEach((c) => {
        newSelected[c.id] = c.phoneNumbers?.length > 0 ? 0 : -1;
      });
      setSelected(newSelected);
      setAllSelected(true);
    }
  }, [allSelected, filteredContacts]);

  const selectedCount = Object.keys(selected).length;

  const handleImport = async () => {
    if (selectedCount === 0) return;

    setImporting(true);
    try {
      const contactsToImport = [];

      for (const [contactId, phoneIndex] of Object.entries(selected)) {
        const phoneContact = phoneContacts.find((c) => c.id === contactId);
        if (!phoneContact) continue;

        const phoneNumber =
          phoneIndex >= 0 && phoneContact.phoneNumbers?.[phoneIndex]
            ? phoneContact.phoneNumbers[phoneIndex].number
            : null;

        const email =
          phoneContact.emails?.length > 0
            ? phoneContact.emails[0].email
            : null;

        contactsToImport.push({
          full_name: phoneContact.name,
          phone_number: phoneNumber,
          email,
          company: phoneContact.company || null,
          job_title: phoneContact.jobTitle || null,
          notes: phoneContact.note || null,
        });
      }

      console.log('Bulk import payload:', JSON.stringify(contactsToImport, null, 2));
      const response = await contactsAPI.bulkImport(contactsToImport);
      console.log('Bulk import response:', JSON.stringify(response.data));
      const { imported, skipped, debug } = response.data;

      const msg = `${imported} contact${imported !== 1 ? 's' : ''} imported${skipped > 0 ? `, ${skipped} skipped` : ''}${debug ? `\n\nReason: ${debug}` : ''}`;
      Alert.alert(
        'Import Complete',
        msg,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      const msg =
        error.response?.data?.error || error.message || 'Failed to import contacts';
      Alert.alert('Import Failed', msg);
    } finally {
      setImporting(false);
    }
  };

  const renderContact = useCallback(
    ({ item }) => {
      const isSelected = selected[item.id] !== undefined;
      const phoneNumbers = item.phoneNumbers || [];
      const selectedPhoneIdx = selected[item.id];
      const subtitle = [item.jobTitle, item.company].filter(Boolean).join(' at ');

      return (
        <TouchableOpacity
          style={[styles.contactRow, isSelected && styles.contactRowSelected]}
          onPress={() => toggleSelect(item.id, phoneNumbers)}
          activeOpacity={0.7}
        >
          <View style={styles.contactMain}>
            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
              {isSelected && (
                <Ionicons name="checkmark" size={16} color={colors.textInverse} />
              )}
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName} numberOfLines={1}>
                {item.name}
              </Text>
              {subtitle ? (
                <Text style={styles.contactSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
              {phoneNumbers.length > 0 && !isSelected && (
                <Text style={styles.contactPhone} numberOfLines={1}>
                  {phoneNumbers[0].number}
                </Text>
              )}
            </View>
          </View>

          {/* Phone number picker when selected */}
          {isSelected && phoneNumbers.length > 1 && (
            <View style={styles.phoneList}>
              {phoneNumbers.map((phone, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.phoneOption,
                    selectedPhoneIdx === idx && styles.phoneOptionSelected,
                  ]}
                  onPress={() => selectPhoneNumber(item.id, idx)}
                >
                  <View
                    style={[
                      styles.radioOuter,
                      selectedPhoneIdx === idx && styles.radioOuterActive,
                    ]}
                  >
                    {selectedPhoneIdx === idx && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.phoneOptionInfo}>
                    <Text style={styles.phoneLabel}>
                      {phone.label || 'Phone'}
                    </Text>
                    <Text style={styles.phoneNumber}>{phone.number}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {isSelected && phoneNumbers.length === 1 && (
            <View style={styles.phoneList}>
              <View style={styles.selectedPhoneDisplay}>
                <Ionicons name="call-outline" size={14} color={colors.primary} />
                <Text style={styles.selectedPhoneText}>
                  {phoneNumbers[0].number}
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [selected, colors, styles, toggleSelect, selectPhoneNumber]
  );

  // Permission denied view
  if (permissionStatus === 'denied') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Import Contacts</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.permissionTitle}>Contacts Access Required</Text>
          <Text style={styles.permissionDesc}>
            To import contacts from your phone, please grant access in your device settings.
          </Text>
          <Button
            title="Open Settings"
            onPress={() => Linking.openSettings()}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Import Contacts</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : (
        <>
          {/* Search & select all */}
          <View style={styles.toolbar}>
            <View style={styles.searchWrapper}>
              <Input
                value={search}
                onChangeText={setSearch}
                placeholder="Search contacts..."
                style={{ marginBottom: 0 }}
              />
            </View>
            <TouchableOpacity style={styles.selectAllButton} onPress={toggleSelectAll}>
              <Text style={styles.selectAllText}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contact count */}
          <View style={styles.countBar}>
            <Text style={styles.countText}>
              {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
            </Text>
            {selectedCount > 0 && (
              <Text style={styles.selectedCountText}>
                {selectedCount} selected
              </Text>
            )}
          </View>

          {/* Contact list */}
          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.id}
            renderItem={renderContact}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={30}
            maxToRenderPerBatch={20}
          />

          {/* Import button */}
          <View style={styles.footer}>
            <Button
              title={
                importing
                  ? 'Importing...'
                  : `Import${selectedCount > 0 ? ` (${selectedCount})` : ''} Contact${selectedCount !== 1 ? 's' : ''}`
              }
              onPress={handleImport}
              disabled={selectedCount === 0 || importing}
              loading={importing}
              fullWidth
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    backButton: {
      padding: spacing.sm,
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: spacing.sm,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    permissionTitle: {
      ...typography.h2,
      color: colors.textPrimary,
      marginTop: spacing.lg,
      textAlign: 'center',
    },
    permissionDesc: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
      lineHeight: 22,
    },
    loadingText: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.md,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    searchWrapper: {
      flex: 1,
    },
    selectAllButton: {
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.md,
    },
    selectAllText: {
      ...typography.bodySmall,
      color: colors.primary,
      fontWeight: '600',
    },
    countBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    countText: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    selectedCountText: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: '600',
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl,
    },
    contactRow: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    contactRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryBg,
    },
    contactMain: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    contactInfo: {
      flex: 1,
    },
    contactName: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    contactSubtitle: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    contactPhone: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: 2,
    },
    phoneList: {
      marginTop: spacing.sm,
      marginLeft: 40, // Align with contact name (checkbox width + margin)
    },
    phoneOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      gap: spacing.sm,
    },
    phoneOptionSelected: {},
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterActive: {
      borderColor: colors.primary,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    phoneOptionInfo: {
      flex: 1,
    },
    phoneLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'capitalize',
    },
    phoneNumber: {
      ...typography.bodySmall,
      color: colors.textPrimary,
    },
    selectedPhoneDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    selectedPhoneText: {
      ...typography.bodySmall,
      color: colors.primary,
      fontWeight: '500',
    },
    footer: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderTopWidth: 0.5,
      borderTopColor: colors.borderLight,
    },
  });

export default ImportContactsScreen;
