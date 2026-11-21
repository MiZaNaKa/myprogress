import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { AuthProvider } from "@/context/AuthProvider";
import { LanguageProvider } from "@/context/LanguageProvider";
import { TaskCategoryProvider } from "@/context/TaskCategoryProvider";
import {
  ThemePreferenceProvider,
  useThemePreference,
} from "@/context/ThemePreferenceProvider";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <AppNavigation />
    </ThemePreferenceProvider>
  );
}

function AppNavigation() {
  const { themeMode, isThemeReady } = useThemePreference();
  const colors = Colors[themeMode];
  const navigationTheme = themeMode === "dark" ? DarkTheme : DefaultTheme;

  useEffect(() => {
    if (isThemeReady) void SplashScreen.hideAsync();
  }, [isThemeReady]);

  return (
    <ThemeProvider
      value={{
        ...navigationTheme,
        colors: {
          ...navigationTheme.colors,
          background: colors.background,
          card: colors.backgroundElement,
          text: colors.text,
          border: colors.border,
          primary: colors.accent,
        },
      }}
    >
      <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <SafeAreaProvider>
        <LanguageProvider>
          <AuthProvider>
            <TaskCategoryProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </TaskCategoryProvider>
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
