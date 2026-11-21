/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/context/ThemePreferenceProvider';

export function useTheme() {
  const { themeMode } = useThemePreference();
  return Colors[themeMode];
}
