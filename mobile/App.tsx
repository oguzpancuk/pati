import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation';
import { palette } from './src/theme';

export default function App() {
  return (
    // SafeAreaProvider, ui/Screen bileşeninin çentik ölçülerini alabilmesi için
    // en dışta duruyor.
    <SafeAreaProvider>
      {/* Krem arka plan açık olduğu için durum çubuğu yazıları koyu. */}
      <StatusBar barStyle="dark-content" backgroundColor={palette.background} />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
