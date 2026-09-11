import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFocusedRouteNameFromRoute,
  NavigationContainer,
  useFocusEffect,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import {
  fonts,
  hitSlop,
  makeStyles,
  navigationTheme,
  screenOptions,
  tabBarOptions,
  useTheme,
} from '../theme';
import { Icon, Logo } from '../components/brand';
import type { IconName } from '../components/brand';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import MapScreen from '../screens/MapScreen';
import AnimalsScreen from '../screens/AnimalsScreen';
import AddAnimalScreen from '../screens/AddAnimalScreen';
import AnimalProfileScreen from '../screens/AnimalProfileScreen';
import AnimalPhotoViewerScreen from '../screens/AnimalPhotoViewerScreen';
import CarePhotoScreen from '../screens/CarePhotoScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import type { AnimalPhoto } from '../api/animals';
import UserProfileScreen from '../screens/UserProfileScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import FindFriendsScreen from '../screens/FindFriendsScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import UserCommentsScreen from '../screens/UserCommentsScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import MessagesScreen from '../screens/MessagesScreen';
import NewConversationScreen from '../screens/NewConversationScreen';
import ConversationScreen from '../screens/ConversationScreen';
import GroupSettingsScreen from '../screens/GroupSettingsScreen';
import { BadgeAwardProvider } from '../context/BadgeAwardContext';
import {
  fetchUnreadMessageCount,
  subscribeUnreadMessageCount,
  UNREAD_POLL_INTERVAL_MS,
} from '../api/messages';
import { useCareAlerts } from '../useCareAlerts';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

/**
 * The ROOT stack holds the tabs and nothing but modals. Anything pushed here
 * covers the tab bar, which is why only the three "do a thing and come back"
 * flows live here (owner, 2026-09-11: the bar must never disappear, and these
 * three should open as popups). Everywhere you can *go* is a tab stack screen.
 */
export type RootStackParamList = {
  Tabs: undefined;
  // confirmedAnimalId: set when returning from the match review via "that's the one".
  // confirmedMatchHit: whether the confirm may report a sighting (the
  // server's matchHit for that candidate); without it the profile opens.
  AddAnimal: { confirmedAnimalId?: number; confirmedMatchHit?: boolean } | undefined;
  // The swipeable full-screen viewer over the profile's photos (P6 item 7).
  AnimalPhotos: { animalId: number; photos: AnimalPhoto[]; index?: number };
  // "Bakım ver": the two-photo step that makes the user a carer (P6 item 8).
  CarePhotos: { animalId: number; species: 'cat' | 'dog'; name?: string | null };
  NewConversation: undefined;
};

/**
 * Every tab's stack carries the same set of destinations on top of its own
 * home screen. Registering them per tab is the whole point: a screen pushed
 * inside a tab keeps the tab bar, and back pops within that tab — which is
 * also what DESIGN §8 asks for.
 */
export type TabStackParamList = {
  MapHome: undefined;
  AnimalsHome: undefined;
  MessagesHome: undefined;
  ProfileHome: undefined;
  // matchReview: while viewing a candidate in the add-animal flow; the
  // profile opens in "review" mode with a "go back / that's the one" bar.
  // matchHit: the server logged a hit for the candidate, so "that's the
  // one" reports a sighting and makes the user a carer; otherwise the bar
  // opens the profile. photoChecked: whether a model looked at the photo
  // (the hint differs when it could not).
  AnimalProfile: {
    animalId: number;
    matchReview?: boolean;
    matchHit?: boolean;
    photoChecked?: boolean;
  };
  // The inbox behind the bell on the profile tab.
  Notifications: undefined;
  PublicProfile: { userId: number };
  FindFriends: undefined;
  Leaderboard: undefined;
  // Without userId, our own comments are listed.
  UserComments: { userId?: number | 'me'; name?: string } | undefined;
  // title: shown in the header until the conversation itself loads.
  Conversation: { conversationId: number; title?: string };
  GroupSettings: { conversationId: number };
};

export type MainTabParamList = {
  Map: undefined;
  Animals: undefined;
  Messages: undefined;
  Profile: undefined;
};

/**
 * `pati://` deep links. Two jobs: (1) future share links — "pati://animal/12"
 * opens an animal's profile; (2) jumping straight to screens in development
 * (`xcrun simctl openurl booted pati://add-animal`), so screenshots don't
 * require manual navigation every time. The scheme is registered in
 * Info.plist (CFBundleURLTypes) on iOS and AndroidManifest on Android.
 * Without a session no screen matches; the link is silently ignored.
 */
const DEV_INITIAL_URL_KEY = 'devInitialUrl';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['pati://'],
  // Development only: `xcrun simctl openurl` on iOS asks "open with pati?"
  // every time and can't be confirmed from the command line. Instead, a
  // one-shot URL is written into the simulator's AsyncStorage file and the
  // app is restarted (see docs/NOTES.md, "pati:// deep links"). The key is
  // deleted as soon as it's read so later launches start normally.
  async getInitialURL() {
    if (__DEV__) {
      const pending = await AsyncStorage.getItem(DEV_INITIAL_URL_KEY);
      if (pending) {
        await AsyncStorage.removeItem(DEV_INITIAL_URL_KEY);
        return pending;
      }
    }
    return Linking.getInitialURL();
  },
  config: {
    initialRouteName: 'Tabs',
    screens: {
      // A destination is registered in EVERY tab's stack so it can be pushed
      // from wherever the reader is; a link has to pick one, so each path
      // names the tab it belongs to. Opening pati://animal/12 therefore lands
      // in the animals tab with the tab bar on screen.
      Tabs: {
        screens: {
          Map: { screens: { MapHome: 'map' } },
          Animals: {
            screens: {
              AnimalsHome: 'animals',
              // ?matchReview=1 / ?report=1
              AnimalProfile: { path: 'animal/:animalId', parse: { animalId: Number } },
            },
          },
          Messages: {
            screens: {
              MessagesHome: 'messages',
              Conversation: {
                path: 'conversation/:conversationId',
                parse: { conversationId: Number },
              },
              GroupSettings: {
                path: 'conversation/:conversationId/settings',
                parse: { conversationId: Number },
              },
            },
          },
          Profile: {
            screens: {
              ProfileHome: 'profile',
              Notifications: 'notifications',
              PublicProfile: { path: 'user/:userId', parse: { userId: Number } },
              FindFriends: 'friends',
              Leaderboard: 'leaderboard',
              UserComments: 'comments',
            },
          },
        },
      },
      // The modals, which are root screens on purpose.
      AddAnimal: 'add-animal',
      CarePhotos: { path: 'animal/:animalId/care', parse: { animalId: Number } }, // ?species=cat
      NewConversation: 'messages/new',
    },
  },
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const TabStack = createNativeStackNavigator<TabStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

/**
 * The destinations every tab can push. They are listed per tab rather than on
 * the root stack because a root screen covers the tab bar, and the owner's
 * rule is that the bar never disappears (2026-09-11). React Navigation
 * resolves `navigate('AnimalProfile')` in the nearest navigator, so the call
 * sites did not change: you simply stay in the tab you were in.
 */
function sharedScreens() {
  return [
    <TabStack.Screen
      key="AnimalProfile"
      name="AnimalProfile"
      component={AnimalProfileScreen}
      // The screen renames itself "kedi profili" / "köpek profili" once
      // the species is known.
      options={{ title: 'hayvan profili' }}
    />,
    <TabStack.Screen
      key="Notifications"
      name="Notifications"
      component={NotificationsScreen}
      options={{ title: 'bildirimler' }}
    />,
    <TabStack.Screen
      key="PublicProfile"
      name="PublicProfile"
      component={PublicProfileScreen}
      options={{ title: 'profil' }}
    />,
    <TabStack.Screen
      key="FindFriends"
      name="FindFriends"
      component={FindFriendsScreen}
      options={{ title: 'arkadaş bul' }}
    />,
    <TabStack.Screen
      key="Leaderboard"
      name="Leaderboard"
      component={LeaderboardScreen}
      options={{ title: 'sıralama' }}
    />,
    <TabStack.Screen
      key="UserComments"
      name="UserComments"
      component={UserCommentsScreen}
      options={{ title: 'yorumlar' }}
    />,
    <TabStack.Screen
      key="Conversation"
      name="Conversation"
      component={ConversationScreen}
      options={({ route }) => ({ title: route.params.title ?? 'sohbet' })}
    />,
    <TabStack.Screen
      key="GroupSettings"
      name="GroupSettings"
      component={GroupSettingsScreen}
      options={{ title: 'grup ayarları' }}
    />,
  ];
}

/** One tab: its own screen, headerless as before, plus the shared set. */
function tabStack(name: keyof TabStackParamList, component: React.ComponentType<any>) {
  return function TabStackNavigator() {
    const theme = useTheme();
    return (
      <TabStack.Navigator screenOptions={screenOptions(theme)}>
        <TabStack.Screen name={name} component={component} options={{ headerShown: false }} />
        {sharedScreens()}
      </TabStack.Navigator>
    );
  };
}

const MapTab = tabStack('MapHome', MapScreen);
const AnimalsTab = tabStack('AnimalsHome', AnimalsScreen);
const MessagesTab = tabStack('MessagesHome', MessagesScreen);
const ProfileTab = tabStack('ProfileHome', UserProfileScreen);

const TAB_ICONS: Record<keyof MainTabParamList, IconName> = {
  Map: 'pin',
  Animals: 'paw',
  Messages: 'chat',
  Profile: 'user',
};

/** Each tab's own screen — the only place its light is on. */
const TAB_HOME: Record<keyof MainTabParamList, keyof TabStackParamList> = {
  Map: 'MapHome',
  Animals: 'AnimalsHome',
  Messages: 'MessagesHome',
  Profile: 'ProfileHome',
};

function MainTabs() {
  const theme = useTheme();
  const tabOptions = tabBarOptions(theme);
  // The unread total on the messages tab (owner, 2026-09-11 demo note 10),
  // polled the way the profile bell is: once a minute while the tabs are in
  // front. A pushed screen (a conversation) blurs the tabs, so the timer
  // stops there — which is exactly when the number changes.
  const [unreadMessages, setUnreadMessages] = useState(0);
  // So the badge follows the read rather than polling against it: every
  // mark-read answers with the caller's new total, computed by the server in
  // the same request that stamped last_read_at. Not focus-gated — the reads
  // that matter happen while the tabs are behind a conversation.
  useEffect(() => subscribeUnreadMessageCount(setUnreadMessages), []);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      async function poll() {
        try {
          const count = await fetchUnreadMessageCount();
          if (alive) setUnreadMessages(count);
        } catch {
          // A background count; the badge keeps its last number.
        }
      }
      poll();
      const timer = setInterval(poll, UNREAD_POLL_INTERVAL_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [])
  );
  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        // The light marks where you ARE, not which stack you came through
        // (owner, 2026-09-12). Now that a pushed screen keeps the bar, a lit
        // tab over an animal profile claimed you were on your own profile.
        // It goes out the moment the tab shows anything but its own screen;
        // `getFocusedRouteNameFromRoute` is undefined until the stack moves,
        // which is exactly the at-home case.
        const focused = getFocusedRouteNameFromRoute(route);
        const atHome = focused === undefined || focused === TAB_HOME[route.name];
        return {
          ...tabOptions,
          // The count is not a highlight and stays either way.
          tabBarActiveTintColor: atHome ? theme.colors.brand : theme.colors.textSubtle,
          tabBarIcon: ({ color, size }) => (
            <Icon name={TAB_ICONS[route.name]} size={size} color={color} />
          ),
        };
      }}
    >
      <Tab.Screen name="Map" component={MapTab} options={{ title: 'harita' }} />
      <Tab.Screen name="Animals" component={AnimalsTab} options={{ title: 'hayvanlar' }} />
      <Tab.Screen
        name="Messages"
        component={MessagesTab}
        options={{
          title: 'mesajlar',
          // Brand orange, like every other count in the app — not the
          // navigation theme's red `notification` colour.
          tabBarBadge: unreadMessages > 0 ? badgeLabel(unreadMessages) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.brand,
            color: theme.colors.textOnBrand,
            fontFamily: fonts.semibold,
            // The badge is an 18 pt pill whose own lineHeight centres the
            // text in it; keep that number when shrinking the digits, or
            // "99+" rides the top edge.
            fontSize: 11,
            lineHeight: 17,
          },
        }}
      />
      <Tab.Screen name="Profile" component={ProfileTab} options={{ title: 'profilim' }} />
    </Tab.Navigator>
  );
}

/** Counts above 99 read "99+", like the inbox rows and the profile bell. */
function badgeLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

/**
 * The way out of a modal. iOS gives it a swipe-down, which is invisible to
 * anyone who does not already know it, and a modal has no back arrow of its
 * own because it is the bottom of its stack.
 */
function ModalCloseButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel="Kapat"
    >
      <Icon name="close" size={22} color={colors.text} />
    </Pressable>
  );
}

/** Header options shared by the three modal flows. */
function modalOptions(title: string) {
  return ({ navigation }: { navigation: { goBack: () => void } }) => ({
    title,
    presentation: 'modal' as const,
    headerLeft: () => <ModalCloseButton onPress={() => navigation.goBack()} />,
  });
}

function MainNavigator() {
  const theme = useTheme();
  return (
    <RootStack.Navigator screenOptions={screenOptions(theme)}>
      <RootStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      {/* Modals, not destinations (owner, 2026-09-11): each is one task you
          finish and come back from, so it rises over the app as a sheet
          rather than becoming a place. `modal` brings iOS's swipe-down, and
          the header keeps an explicit close for everyone who does not know
          that gesture. These are also the only screens allowed to cover the
          tab bar — everywhere you can GO lives in a tab stack. */}
      <RootStack.Screen
        name="AddAnimal"
        component={AddAnimalScreen}
        options={modalOptions('yeni hayvan')}
      />
      <RootStack.Screen
        name="CarePhotos"
        component={CarePhotoScreen}
        options={modalOptions('bakım ver')}
      />
      <RootStack.Screen
        name="NewConversation"
        component={NewConversationScreen}
        options={modalOptions('yeni sohbet')}
      />
      <RootStack.Screen
        name="AnimalPhotos"
        component={AnimalPhotoViewerScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
      />
    </RootStack.Navigator>
  );
}

export default function RootNavigator() {
  const styles = useStyles();
  const theme = useTheme();
  const { user, isLoading } = useAuth();
  // An unverified e-mail gets the code screen and nothing else: the server
  // would refuse every other request anyway (ADR-0004).
  const pending = !!user?.email_verification_pending;
  const signedIn = !!user && !pending;
  // Care alerts only run while signed in; the timer stops on sign-out.
  useCareAlerts(signedIn);

  if (isLoading) {
    // While the session loads, the logo stands in for a blank screen: the
    // app never flashes white/empty, the launch image transitions smoothly.
    return (
      <View style={styles.splash}>
        <Logo size={96} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme(theme)} linking={signedIn ? linking : undefined}>
      {signedIn ? (
        // The badge celebration popup sits above navigation so it can show
        // from the same place no matter which screen earned it.
        <BadgeAwardProvider>
          <MainNavigator />
        </BadgeAwardProvider>
      ) : pending ? (
        <VerifyEmailScreen />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.background,
  },
}));
