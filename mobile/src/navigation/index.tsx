import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
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
  AddAnimal: undefined;
  AnimalProfile: { animalId: number };
  PublicProfile: { userId: number };
  FindFriends: undefined;
  Leaderboard: undefined;
  // userId verilmezse kendi yorumlarımız listelenir.
  UserComments: { userId?: number | 'me'; name?: string } | undefined;
};

export type MainTabParamList = {
  Map: undefined;
  Animals: undefined;
  Profile: undefined;
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
  // Bakım uyarıları yalnızca giriş yapılmışken çalışır; çıkışta zamanlayıcı durur.
  useCareAlerts(!!user);

  if (isLoading) {
    // Oturum okunurken boş ekran yerine logo duruyor: uygulama bir anlığına
    // beyaz/boş açılmıyor, açılış görseliyle sürekli bir geçiş oluyor.
    return (
      <View style={styles.splash}>
        <Logo size={96} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme(theme)}>
      {user ? (
        // Rozet kutlama popup'ı navigasyonun üstünde duruyor ki hangi ekranda
        // kazanılırsa kazanılsın aynı yerden gösterilebilsin.
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
