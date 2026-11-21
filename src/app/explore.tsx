import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { useLanguage } from "@/context/LanguageProvider";
import { useTaskCategories } from "@/context/TaskCategoryProvider";
import { useTheme } from "@/hooks/use-theme";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type CategoryRow = {
  id: string;
  title: string;
  number_of_tasks: number;
};

export default function ExploreScreen() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isRefreshingCategories, setIsRefreshingCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { categories: recentlyCreatedCategories } = useTaskCategories();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  useEffect(() => {
    let isActive = true;

    const loadCategories = async () => {
      setIsLoadingCategories(true);
      setCategoriesError(null);

      if (!isSupabaseConfigured) {
        if (isActive) {
          setCategoriesError("Supabase is not configured.");
          setIsLoadingCategories(false);
          setIsRefreshingCategories(false);
        }
        return;
      }

      if (!userId) {
        if (isActive) {
          setCategoriesError("Sign in to view your task categories.");
          setIsLoadingCategories(false);
          setIsRefreshingCategories(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("task_categories")
        .select("id, title, number_of_tasks")
        .eq("user_id", userId);

      if (!isActive) return;

      if (error) {
        setCategoriesError(error.message);
      } else {
        setCategories(data ?? []);
      }
      setIsLoadingCategories(false);
      setIsRefreshingCategories(false);
    };

    void loadCategories();

    return () => {
      isActive = false;
    };
  }, [userId, recentlyCreatedCategories.length, refreshKey]);

  const handleRetryCategories = () => {
    setCategoriesError(null);
    setIsLoadingCategories(true);
    setRefreshKey((key) => key + 1);
  };

  const handleRefreshCategories = () => {
    setIsRefreshingCategories(true);
    handleRetryCategories();
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch (error) {
      Alert.alert(
        t("Logout failed"),
        error instanceof Error ? error.message : t("Please try again."),
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.contentContainer,
        {
          paddingTop: insets.top + Spacing.four,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshingCategories}
          onRefresh={handleRefreshCategories}
          tintColor={theme.accent}
          colors={[theme.accent]}
          progressBackgroundColor={theme.backgroundElement}
        />
      }
    >
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <View>
            <ThemedText type="smallBold" style={styles.eyebrow}>
              MY PROGRESS
            </ThemedText>
            <ThemedText type="title" style={styles.pageTitle}>
              Task categories
            </ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isSigningOut}
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.pressed,
              isSigningOut && styles.disabled,
            ]}
          >
            <ThemedText type="smallBold" themeColor="textSecondary">
              {isSigningOut ? "Signing out..." : "Log out"}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.categoriesSection}>
          <View style={styles.categoriesHeading}>
            <ThemedText type="subtitle">Your categories</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {categories.length}
            </ThemedText>
          </View>
          {isLoadingCategories ? (
            <ActivityIndicator color={theme.text} />
          ) : categoriesError ? (
            <View style={styles.errorSection}>
              <ThemedText type="small" themeColor="textSecondary">
                {categoriesError}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={handleRetryCategories}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <ThemedText type="smallBold" style={styles.retryText}>
                  Try again
                </ThemedText>
              </Pressable>
            </View>
          ) : categories.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No task categories yet.
            </ThemedText>
          ) : (
            categories.map((category) => (
              <View
                key={category.id}
                style={[
                  styles.categoryRow,
                  { borderColor: theme.backgroundSelected },
                ]}
              >
                <View style={styles.categoryHeading}>
                  <ThemedText type="smallBold" translate={false}>
                    {category.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {category.number_of_tasks} tasks
                  </ThemedText>
                </View>
              </View>
            ))
          )}
        </View>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    alignItems: "center",
    paddingHorizontal: Spacing.four,
  },
  container: {
    width: "100%",
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  eyebrow: {
    color: "#18755B",
    fontSize: 11,
    letterSpacing: 1,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  signOutButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
  },
  categoriesSection: {
    gap: Spacing.three,
  },
  categoriesHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryRow: {
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    gap: Spacing.two,
  },
  categoryHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  errorSection: {
    gap: Spacing.two,
  },
  retryText: {
    color: "#18755B",
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.65,
  },
});
