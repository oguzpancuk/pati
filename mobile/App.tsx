import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation';
import { ThemeProvider, useTheme } from './src/theme';

/**
 * Durum çubuğu ayrı bir bileşen: rengi temaya bağlı, dolayısıyla
 * `ThemeProvider`ın içinde olmak zorunda.
 */
function ThemedStatusBar() {
  const { name, colors } = useTheme();
  return (
    <StatusBar
      barStyle={name === 'dark' ? 'light-content' : 'dark-content'}
      backgroundColor={colors.background}
    />
  );
}

export default function App() {
  return (
    // SafeAreaProvider, ui/Screen bileşeninin çentik ölçülerini alabilmesi için
    // en dışta duruyor.
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
