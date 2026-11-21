import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useLanguage, type Language } from "@/context/LanguageProvider";
import { useTheme } from "@/hooks/use-theme";

const languageOptions: { code: Language; name: string; englishName: string }[] =
  [
    { code: "my", name: "မြန်မာ", englishName: "Myanmar" },
    { code: "en", name: "English", englishName: "English" },
    { code: "th", name: "ไทย", englishName: "Thai" },
    { code: "ja", name: "日本語", englishName: "Japanese" },
    { code: "zh", name: "中文", englishName: "Chinese" },
    { code: "hi", name: "हिन्दी", englishName: "Hindi (India)" },
    { code: "de", name: "Deutsch", englishName: "German" },
    { code: "fr", name: "Français", englishName: "French" },
  ];

export default function LanguageScreen() {
  const { language, languageError, setLanguage, t } = useLanguage();
  const [isSaving, setIsSaving] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const selectLanguage = async (nextLanguage: Language) => {
    if (isSaving || nextLanguage === language) {
      router.back();
      return;
    }

    setIsSaving(true);
    const saved = await setLanguage(nextLanguage);
    setIsSaving(false);
    if (saved) router.back();
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom + Spacing.four,
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Go back")}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={{
                ios: "chevron.left",
                android: "arrow_back",
                web: "arrow_back",
              }}
              tintColor={theme.text}
              size={20}
            />
          </Pressable>
          <ThemedText type="title" style={styles.title}>
            Language
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Choose your app language
        </ThemedText>
        <View
          style={[
            styles.options,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          {languageOptions.map((option, index) => {
            const selected = language === option.code;
            return (
              <Pressable
                key={option.code}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: isSaving }}
                disabled={isSaving}
                onPress={() => void selectLanguage(option.code)}
                style={({ pressed }) => [
                  styles.option,
                  index < languageOptions.length - 1 && styles.optionDivider,
                  { borderBottomColor: theme.backgroundSelected },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.optionCopy}>
                  <ThemedText
                    type="smallBold"
                    style={styles.optionName}
                    translate={false}
                  >
                    {option.name}
                  </ThemedText>
                  {option.code !== "en" ? (
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      translate={false}
                    >
                      {option.englishName}
                    </ThemedText>
                  ) : null}
                </View>
                {selected ? (
                  <SymbolView
                    name={{
                      ios: "checkmark",
                      android: "check",
                      web: "check",
                    }}
                    tintColor={theme.accent}
                    size={21}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {languageError ? (
          <ThemedText
            type="small"
            style={[styles.error, { color: theme.danger }]}
          >
            {languageError}
          </ThemedText>
        ) : null}
      </ScrollView>
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
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  title: {
    flex: 1,
    fontSize: 28,
    lineHeight: 36,
  },
  headerSpacer: {
    width: 44,
  },
  options: {
    overflow: "hidden",
    borderRadius: 20,
  },
  option: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionCopy: {
    gap: 2,
  },
  optionName: {
    fontSize: 17,
  },
  error: {
    color: "#B42318",
  },
  pressed: {
    opacity: 0.65,
  },
});
