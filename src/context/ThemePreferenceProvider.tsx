import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, Platform, useColorScheme } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark";

type ThemePreferenceValue = {
  themeMode: ThemeMode;
  themeError: string | null;
  isThemeReady: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<boolean>;
};

const THEME_STORAGE_KEY = "myprogress.theme";
const ThemePreferenceContext = createContext<ThemePreferenceValue | undefined>(
  undefined,
);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function ThemePreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const systemScheme = useColorScheme();
  const [themeMode, setCurrentThemeMode] = useState<ThemeMode>(
    systemScheme === "dark" ? "dark" : "light",
  );
  const [themeError, setThemeError] = useState<string | null>(null);
  const [isThemeReady, setIsThemeReady] = useState(false);
  const hasUserSelectedTheme = useRef(false);

  useEffect(() => {
    let active = true;

    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (
          active &&
          !hasUserSelectedTheme.current &&
          isThemeMode(savedTheme)
        ) {
          hasUserSelectedTheme.current = true;
          if (Platform.OS !== "web") Appearance.setColorScheme(savedTheme);
          setCurrentThemeMode(savedTheme);
        }
      } catch {
        if (active) {
          setThemeError("Could not load your appearance preference.");
        }
      } finally {
        if (active) setIsThemeReady(true);
      }
    };

    void loadTheme();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasUserSelectedTheme.current) {
      setCurrentThemeMode(systemScheme === "dark" ? "dark" : "light");
    }
  }, [systemScheme]);

  const setThemeMode = useCallback(async (nextMode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
      hasUserSelectedTheme.current = true;
      if (Platform.OS !== "web") Appearance.setColorScheme(nextMode);
      setCurrentThemeMode(nextMode);
      setThemeError(null);
      return true;
    } catch {
      setThemeError("Could not save your appearance preference.");
      return false;
    }
  }, []);

  const value = useMemo(
    () => ({ themeMode, themeError, isThemeReady, setThemeMode }),
    [themeMode, themeError, isThemeReady, setThemeMode],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error(
      "useThemePreference must be used inside a ThemePreferenceProvider",
    );
  }
  return context;
}
