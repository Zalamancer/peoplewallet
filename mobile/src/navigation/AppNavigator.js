import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

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
import ShareContactScreen from '../screens/ShareContactScreen';
import QuickAddScreen from '../screens/QuickAddScreen';
import CalendarScreen from '../screens/CalendarScreen';
import EventPrepScreen from '../screens/EventPrepScreen';
import MutualConnectionsScreen from '../screens/MutualConnectionsScreen';
import FeedScreen from '../screens/FeedScreen';
import InsightsScreen from '../screens/InsightsScreen';
import GroupsScreen from '../screens/GroupsScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import AddMembersToGroupScreen from '../screens/AddMembersToGroupScreen';
import CoAttendeeBrowserScreen from '../screens/CoAttendeeBrowserScreen';
import NewEventScreen from '../screens/NewEventScreen';
import ExploreScreen from '../screens/ExploreScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import QRDisplayScreen from '../screens/QRDisplayScreen';
import ClubListScreen from '../screens/ClubListScreen';
import ClubDetailScreen from '../screens/ClubDetailScreen';
import CreateClubScreen from '../screens/CreateClubScreen';
import ConversationsListScreen from '../screens/ConversationsListScreen';
import ChatScreen from '../screens/ChatScreen';
import NewConversationScreen from '../screens/NewConversationScreen';
import GroupChatInfoScreen from '../screens/GroupChatInfoScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import EventFeedScreen from '../screens/EventFeedScreen';
import EventMapScreen from '../screens/EventMapScreen';
import SchoolVerifyScreen from '../screens/SchoolVerifyScreen';
import ImportContactsScreen from '../screens/ImportContactsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon = ({ label, focused }) => {
  const { colors } = useTheme();
  let iconName;
  if (label === 'Contacts') iconName = focused ? 'people' : 'people-outline';
  else if (label === 'For You') iconName = focused ? 'heart' : 'heart-outline';
  else if (label === 'Explore') iconName = focused ? 'compass' : 'compass-outline';
  else if (label === 'Scan') iconName = focused ? 'qr-code' : 'qr-code-outline';
  else if (label === 'Clubs') iconName = focused ? 'people-circle' : 'people-circle-outline';
  else if (label === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
  else iconName = focused ? 'ellipse' : 'ellipse-outline';

  return (
    <View style={tabStyles.iconContainer}>
      <Ionicons name={iconName} size={24} color={focused ? colors.primary : colors.textTertiary} />
    </View>
  );
};

const tabStyles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Bottom tab navigator for main app
 */
const MainTabs = () => {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 4,
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
        name="ForYouTab"
        component={FeedScreen}
        options={{
          tabBarLabel: 'For You',
          tabBarIcon: ({ focused }) => <TabIcon label="For You" focused={focused} />,
        }}
      />

      <Tab.Screen
        name="ExploreTab"
        component={ExploreScreen}
        options={{
          tabBarLabel: 'Explore',
          tabBarIcon: ({ focused }) => <TabIcon label="Explore" focused={focused} />,
        }}
      />

      <Tab.Screen
        name="ScanTab"
        component={QRScannerScreen}
        options={{
          tabBarLabel: 'Scan',
          tabBarIcon: ({ focused }) => <TabIcon label="Scan" focused={focused} />,
        }}
      />

      <Tab.Screen
        name="ClubsTab"
        component={ClubListScreen}
        options={{
          tabBarLabel: 'Clubs',
          tabBarIcon: ({ focused }) => <TabIcon label="Clubs" focused={focused} />,
        }}
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
  const { colors } = useTheme();
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ fontSize: 36, fontWeight: '800', color: colors.primary }}>PeopleWallet</Text>
        <Text style={{ fontSize: 16, color: colors.textTertiary, marginTop: 4 }}></Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="SchoolVerify"
            component={SchoolVerifyScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
        </>
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
          <Stack.Screen
            name="QuickAdd"
            component={QuickAddScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="ShareContact"
            component={ShareContactScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="EventPrep"
            component={EventPrepScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="MutualConnections"
            component={MutualConnectionsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="GroupDetail"
            component={GroupDetailScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="CreateGroup"
            component={CreateGroupScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="AddMembersToGroup"
            component={AddMembersToGroupScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="CoAttendeeBrowser"
            component={CoAttendeeBrowserScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="NewEvent"
            component={NewEventScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="EventDetail"
            component={EventDetailScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="QRDisplay"
            component={QRDisplayScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="ClubDetail"
            component={ClubDetailScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="CreateClub"
            component={CreateClubScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="Groups"
            component={GroupsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Insights"
            component={InsightsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Calendar"
            component={CalendarScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Conversations"
            component={ConversationsListScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="NewConversation"
            component={NewConversationScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="GroupChatInfo"
            component={GroupChatInfoScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="EventFeed"
            component={EventFeedScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="EventMap"
            component={EventMapScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="SchoolVerify"
            component={SchoolVerifyScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen
            name="ImportContacts"
            component={ImportContactsScreen}
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
