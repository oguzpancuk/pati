import React from 'react';
import { Linking, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { makeStyles, navigationTheme, screenOptions, tabBarOptions, useTheme } from '../theme';
import { Icon, Logo } from '../components/brand';
import type { IconName } from '../components/brand';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import MapScreen from '../screens/MapScreen';
import AnimalsScreen from '../screens/AnimalsScreen';
import AddAnimalScreen from '../screens/AddAnimalScreen';
import AnimalProfileScreen from '../screens/AnimalProfileScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import FindFriendsScreen from '../screens/FindFriendsScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import UserCommentsScreen from '../screens/UserCommentsScreen';
import { BadgeAwardProvider } from '../context/BadgeAwardContext';
import { useCareAlerts } from '../useCareAlerts';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  // confirmedAnimalId: set when returning from the match review via "that's the one".
  AddAnimal: { confirmedAnimalId?: number } | undefined;
  // matchReview: while viewing a candidate in the add-animal flow; the
  // profile opens in "review" mode with a "go back / that's the one" bar.
  AnimalProfile: { animalId: number; matchReview?: boolean };
  PublicProfile: { userId: number };
  FindFriends: undefined;
  Leaderboard: undefined;
  // Without userId, our own comments are listed.
  UserComments: { userId?: number | 'me'; name?: string } | undefined;
};

export type MainTabParamList = {
  Map: undefined;
  Animals: undefined;
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

const linking: LinkingOptions<MainStackParamList> = {
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
    // A screen opened via a link must always land ON TOP of the tabs:
    // otherwise React Navigation makes that screen the root and the tab bar
    // and back button disappear.
    initialRouteName: 'Tabs',
    screens: {
      Tabs: {
        screens: { Map: 'map', Animals: 'animals', Profile: 'profile' },
      },
      AddAnimal: 'add-animal',
      AnimalProfile: { path: 'animal/:animalId', parse: { animalId: Number } },
      PublicProfile: { path: 'user/:userId', parse: { userId: Number } },
      FindFriends: 'friends',
      Leaderboard: 'leaderboard',
      UserComments: 'comments',
    },
  },
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

const TAB_ICONS: Record<keyof MainTabParamList, IconName> = {
  Map: 'pin',
  Animals: 'paw',
  Profile: 'user',
};

function MainTabs() {
  const theme = useTheme();
  const tabOptions = tabBarOptions(theme);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...tabOptions,
        tabBarIcon: ({ color, size }) => (
          <Icon name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Harita' }} />
      <Tab.Screen name="Animals" component={AnimalsScreen} options={{ title: 'Hayvanlar' }} />
      <Tab.Screen name="Profile" component={UserProfileScreen} options={{ title: 'Profilim' }} />
    </Tab.Navigator>
  );
}

function MainNavigator() {
  const theme = useTheme();
  return (
    <MainStack.Navigator screenOptions={screenOptions(theme)}>
      <MainStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <MainStack.Screen
        name="AddAnimal"
        component={AddAnimalScreen}
        options={{ title: 'Yeni Hayvan Ekle' }}
      />
      <MainStack.Screen
        name="AnimalProfile"
        component={AnimalProfileScreen}
        options={{ title: 'Hayvan Profili' }}
      />
      <MainStack.Screen
        name="PublicProfile"
        component={PublicProfileScreen}
        options={{ title: 'Kullanıcı Profili' }}
      />
      <MainStack.Screen
        name="FindFriends"
        component={FindFriendsScreen}
        options={{ title: 'Arkadaş Bul' }}
      />
      <MainStack.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{ title: 'Sıralama' }}
      />
      <MainStack.Screen
        name="UserComments"
        component={UserCommentsScreen}
        options={{ title: 'Yorumlar' }}
      />
    </MainStack.Navigator>
  );
}

export default function RootNavigator() {
  const styles = useStyles();
  const theme = useTheme();
  const { user, isLoading } = useAuth();
  // Care alerts only run while signed in; the timer stops on sign-out.
  useCareAlerts(!!user);

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
    <NavigationContainer theme={navigationTheme(theme)} linking={user ? linking : undefined}>
      {user ? (
        // The badge celebration popup sits above navigation so it can show
        // from the same place no matter which screen earned it.
        <BadgeAwardProvider>
          <MainNavigator />
        </BadgeAwardProvider>
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
