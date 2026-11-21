import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/context/LanguageProvider";
import { useTheme } from "@/hooks/use-theme";

const tabIcons = {
  home: { ios: "house.fill", android: "home", web: "home" },
  tasks: {
    ios: "checkmark.square.fill",
    android: "task_alt",
    web: "task_alt",
  },
  calendar: {
    ios: "calendar",
    android: "calendar_month",
    web: "calendar_month",
  },
  more: {
    ios: "person.crop.circle",
    android: "account_circle",
    web: "account_circle",
  },
} as const;

export default function TabLayout() {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          height: 74 + insets.bottom,
          paddingTop: 8,
          paddingBottom: 8 + insets.bottom,
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.border,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("Home"),
          tabBarIcon: ({ color }) => (
            <SymbolView name={tabIcons.home} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t("Tasks"),
          tabBarIcon: ({ color }) => (
            <SymbolView name={tabIcons.tasks} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t("Calendar"),
          tabBarIcon: ({ color }) => (
            <SymbolView name={tabIcons.calendar} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen name="emotions" options={{ href: null }} />
      <Tabs.Screen
        name="more"
        options={{
          title: t("Profile"),
          tabBarIcon: ({ color }) => (
            <SymbolView name={tabIcons.more} tintColor={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
