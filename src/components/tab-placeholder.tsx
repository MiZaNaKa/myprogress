import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";

type TabPlaceholderProps = {
  title: string;
  description: string;
};

export function TabPlaceholder({ title, description }: TabPlaceholderProps) {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + Spacing.four }]}>
        <ThemedText type="smallBold" style={styles.brand}>
          MY PROGRESS
        </ThemedText>
        <ThemedText type="title" style={styles.title}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate("/tasks")}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
          ]}
        >
          <ThemedText type="smallBold" style={styles.buttonText}>
            View my tasks
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  brand: {
    color: "#2168F5",
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  button: {
    minHeight: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.two,
    borderRadius: 16,
    backgroundColor: "#2168F5",
  },
  buttonText: {
    color: "#ffffff",
  },
  pressed: {
    opacity: 0.8,
  },
});
