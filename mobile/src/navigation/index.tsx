import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
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

function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Harita' }} />
      <Tab.Screen name="Animals" component={AnimalsScreen} options={{ title: 'Hayvanlar' }} />
      <Tab.Screen name="Profile" component={UserProfileScreen} options={{ title: 'Profilim' }} />
    </Tab.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainStack.Navigator>
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
    </MainStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, isLoading } = useAuth();
  // Bakım uyarıları yalnızca giriş yapılmışken çalışır; çıkışta zamanlayıcı durur.
  useCareAlerts(!!user);

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer>
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
