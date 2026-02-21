import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import ContactListScreen from '../screens/ContactListScreen';
import ContactDetailScreen from '../screens/ContactDetailScreen';
import NewContactScreen from '../screens/NewContactScreen';
import EditContactScreen from '../screens/EditContactScreen';
import DictationScreen from '../screens/DictationScreen';
import RecordingScreen from '../screens/RecordingScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CaptureChooserScreen from '../screens/CaptureChooserScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * Tab icon component (using text since we want to avoid native vector icon setup issues)
 */
const TabIcon = ({ label, focused }) => (
  <View style={tabStyles.iconContainer}>
    <Text style={[tabStyles.icon, focused && tabStyles.iconFocused]}>
      {label === 'Contacts' ? '\u{1F4CB}' : label === 'Add' ? '\u{2795}' : '\u{2699}'}
    </Text>
  </View>
);

const tabStyles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
    opacity: 0.5,
  },
  iconFocused: {
    opacity: 1,
  },
});

/**
 * Add Contact Tab — navigates to the capture mode chooser
 */
const AddPlaceholder = () => null;

/**
 * Bottom tab navigator for main app
 */
const MainTabs = ({ navigation }) => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="ContactsTab"
        component={ContactListScreen}
        options={{
          tabBarLabel: 'Contacts',
          tabBarIcon: ({ focused }) => <TabIcon label="Contacts" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="AddTab"
        component={AddPlaceholder}
        options={{
          tabBarLabel: 'Add',
          tabBarIcon: ({ focused }) => <TabIcon label="Add" focused={focused} />,
        }}
        listeners={({ navigation: nav }) => ({
          tabPress: (e) => {
            e.preventDefault();
            nav.navigate('CaptureChooser');
          },
        })}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon label="Settings" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};

/**
 * Main app navigator
 */
const AppNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ fontSize: 36, fontWeight: '800', color: colors.primary }}>ProAnimate</Text>
        <Text style={{ fontSize: 16, color: colors.textTertiary, marginTop: 4 }}>Connect</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="CaptureChooser"
            component={CaptureChooserScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="ContactDetail"
            component={ContactDetailScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="NewContact"
            component={NewContactScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="EditContact"
            component={EditContactScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="Dictation"
            component={DictationScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="Recording"
            component={RecordingScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
