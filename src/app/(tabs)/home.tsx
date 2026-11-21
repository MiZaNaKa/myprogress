import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { getLanguageLocale, useLanguage } from "@/context/LanguageProvider";
import { useTheme } from "@/hooks/use-theme";
import {
  getLocalDateKey,
  getProgressDateKey,
  shiftDateKey,
} from "@/lib/progress-date";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type CategoryRow = {
  id: string;
  title: string;
  start_date: string | null;
  duration_days: number;
};

type TaskRow = {
  id: string;
  task_categories_id: string;
  task_name: string;
};

type ProgressRow = {
  task_id: string;
  status: string;
  progress_date: string | null;
};

function getGreeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

export default function HomeTab() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [progressRows, setProgressRows] = useState<ProgressRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const tasksRef = useRef<TaskRow[]>([]);
  tasksRef.current = tasks;
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const theme = useTheme();
  const palette = useMemo(
    () => ({
      blue: theme.accent,
      navy: theme.text,
      green: theme.success,
      paleBlue: theme.accentSoft,
      paleGreen: theme.accentSoft,
      orange: "#F5A33B",
      muted: theme.textSecondary,
      border: theme.border,
      danger: theme.danger,
    }),
    [theme],
  );
  const styles = useMemo(() => createStyles(palette, theme), [palette, theme]);
  const insets = useSafeAreaInsets();
  const userId = user?.id;

  const loadDashboard = useCallback(async () => {
    await Promise.resolve();
    setIsLoading(true);
    setErrorMessage(null);

    if (!isSupabaseConfigured) {
      setErrorMessage("Supabase is not configured.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (!userId) {
      setErrorMessage("Sign in to see your progress.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      const { data: categoryData, error: categoryError } = await supabase
        .from("task_categories")
        .select("id, title, start_date, duration_days")
        .eq("user_id", userId);
      if (categoryError) throw categoryError;
      const loadedCategories = categoryData ?? [];
      setCategories(loadedCategories);

      if (loadedCategories.length === 0) {
        setTasks([]);
        setProgressRows([]);
        return;
      }

      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("id, task_categories_id, task_name")
        .eq("user_id", userId)
        .eq("is_active", true)
        .in(
          "task_categories_id",
          loadedCategories.map((category) => category.id),
        );
      if (taskError) throw taskError;
      const loadedTasks = taskData ?? [];
      setTasks(loadedTasks);

      if (loadedTasks.length === 0) {
        setProgressRows([]);
        return;
      }

      const { data: progressData, error: progressError } = await supabase
        .from("task_progress")
        .select("task_id, status, progress_date")
        .eq("user_id", userId)
        .in(
          "task_id",
          loadedTasks.map((task) => task.id),
        )
        .order("progress_date", { ascending: true });
      if (progressError) throw progressError;
      setProgressRows(progressData ?? []);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    void Promise.resolve().then(loadDashboard);
  }, [loadDashboard, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      const taskIds = tasksRef.current.map((task) => task.id);
      if (!userId || taskIds.length === 0) return;

      let isActive = true;
      const syncProgress = async () => {
        const { data, error } = await supabase
          .from("task_progress")
          .select("task_id, status, progress_date")
          .eq("user_id", userId)
          .in("task_id", taskIds)
          .order("progress_date", { ascending: true });
        if (error) throw error;
        if (isActive) {
          setProgressRows(data ?? []);
          setErrorMessage(null);
        }
      };

      void syncProgress().catch((error: unknown) => {
        if (isActive) setErrorMessage(getErrorMessage(error));
      });

      return () => {
        isActive = false;
      };
    }, [userId]),
  );

  const todayKey = getLocalDateKey(new Date());
  const currentCategoryIds = useMemo(
    () =>
      new Set(
        categories
          .filter((category) => {
            if (!category.start_date || category.duration_days < 1) return true;
            const startDate = category.start_date.slice(0, 10);
            const endDate = shiftDateKey(startDate, category.duration_days - 1);
            return startDate <= todayKey && todayKey <= endDate;
          })
          .map((category) => category.id),
      ),
    [categories, todayKey],
  );
  const currentTasks = useMemo(
    () =>
      tasks.filter((task) => currentCategoryIds.has(task.task_categories_id)),
    [currentCategoryIds, tasks],
  );

  const todayStatuses = useMemo(() => {
    const statuses = new Map<string, boolean>();
    for (const row of progressRows) {
      if (!row.progress_date) continue;
      if (getProgressDateKey(row.progress_date) === todayKey) {
        statuses.set(row.task_id, row.status === "completed");
      }
    }
    return statuses;
  }, [progressRows, todayKey]);

  const completedCount = currentTasks.filter((task) =>
    todayStatuses.get(task.id),
  ).length;
  const completionPercent =
    currentTasks.length === 0
      ? 0
      : Math.round((completedCount / currentTasks.length) * 100);
  const firstName =
    user?.user_metadata?.first_name?.trim() ||
    user?.email?.split("@")[0] ||
    "there";
  const currentDate = new Date();
  const dateLabel = currentDate.toLocaleDateString(
    getLanguageLocale(language),
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    },
  );
  const greeting = getGreeting(currentDate);
  const remainingTasks = currentTasks.filter(
    (task) => !todayStatuses.get(task.id),
  );

  const completedDates = useMemo(
    () =>
      new Set(
        progressRows
          .filter((row) => row.status === "completed" && row.progress_date)
          .map((row) => getProgressDateKey(row.progress_date!)),
      ),
    [progressRows],
  );
  const streakDays = useMemo(() => {
    const today = getLocalDateKey(new Date());
    const yesterday = shiftDateKey(today, -1);
    if (!completedDates.has(today) && !completedDates.has(yesterday)) return 0;
    let count = 0;
    let day = completedDates.has(today) ? today : yesterday;
    while (completedDates.has(day)) {
      count += 1;
      day = shiftDateKey(day, -1);
    }
    return count;
  }, [completedDates]);

  const toggleTask = async (task: TaskRow) => {
    if (!userId || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    const nextStatus = todayStatuses.get(task.id) ? "incomplete" : "completed";
    const todayKey = getLocalDateKey(new Date());
    try {
      const { data: updatedRows, error: updateError } = await supabase
        .from("task_progress")
        .update({ status: nextStatus })
        .eq("task_id", task.id)
        .eq("user_id", userId)
        .eq("progress_date", todayKey)
        .select("task_id");
      if (updateError) throw updateError;
      if (!updatedRows?.length) {
        const { error: insertError } = await supabase
          .from("task_progress")
          .insert({
            task_id: task.id,
            user_id: userId,
            progress_date: todayKey,
            status: nextStatus,
          });
        if (insertError) throw insertError;
      }
      setProgressRows((currentRows) => [
        ...currentRows.filter(
          (row) =>
            row.task_id !== task.id ||
            !row.progress_date ||
            getProgressDateKey(row.progress_date) !== todayKey,
        ),
        {
          task_id: task.id,
          status: nextStatus,
          progress_date: todayKey,
        },
      ]);
    } catch (error) {
      setErrorMessage(
        `${t("Could not update progress:")} ${getErrorMessage(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + 92,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            setIsRefreshing(true);
            setRefreshKey((key) => key + 1);
          }}
          tintColor={theme.accent}
          colors={[theme.accent]}
          progressBackgroundColor={theme.backgroundElement}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Go to Home")}
            onPress={() => router.navigate("/home")}
            style={({ pressed }) => [
              styles.logoButton,
              pressed && styles.pressed,
            ]}
          >
            <Image
              source={require("@/assets/images/progress_logo.png")}
              style={styles.logoImage}
              contentFit="contain"
              accessibilityLabel={t("MyProgress logo")}
            />
          </Pressable>
          <View style={styles.greetingCopy}>
            <ThemedText type="smallBold" style={styles.eyebrow}>
              {dateLabel.toUpperCase()}
            </ThemedText>
            <ThemedText
              type="subtitle"
              style={styles.greeting}
              numberOfLines={2}
              ellipsizeMode="tail"
              accessibilityLabel={`${t(greeting)}, ${firstName}`}
            >
              {greeting},{" "}
              <ThemedText
                type="subtitle"
                style={styles.greetingName}
                translate={false}
              >
                {firstName}
              </ThemedText>
            </ThemedText>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroDecorationLarge} />
          <View style={styles.heroDecorationSmall} />
          <View style={styles.heroContent}>
            <View style={styles.heroCopy}>
              <ThemedText type="smallBold" style={styles.heroKicker}>
                YOUR DAILY JOURNEY
              </ThemedText>
              <ThemedText type="subtitle" style={styles.heroTitle}>
                Make today{"\n"}count.
              </ThemedText>
              <ThemedText type="small" style={styles.heroDescription}>
                Progress is built one small win at a time.
              </ThemedText>
            </View>
            <View style={styles.heroIcon}>
              <SymbolView
                name={{
                  ios: "sparkles",
                  android: "auto_awesome",
                  web: "auto_awesome",
                }}
                tintColor="#FFFFFF"
                size={30}
              />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate("/tasks")}
            style={({ pressed }) => [
              styles.heroButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="smallBold" style={styles.heroButtonText}>
              View my tasks
            </ThemedText>
            <SymbolView
              name={{
                ios: "arrow.right",
                android: "arrow_forward",
                web: "arrow_forward",
              }}
              tintColor="#142B73"
              size={17}
            />
          </Pressable>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Your progress
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Small wins add up to big change.
            </ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Refresh progress")}
            onPress={() => setRefreshKey((key) => key + 1)}
            style={styles.refreshButton}
          >
            <SymbolView
              name={{
                ios: "arrow.clockwise",
                android: "refresh",
                web: "refresh",
              }}
              tintColor={palette.blue}
              size={19}
            />
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color={palette.blue} style={styles.loader} />
        ) : errorMessage ? (
          <View style={styles.errorCard}>
            <ThemedText type="small" style={styles.errorText}>
              {errorMessage}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRefreshKey((key) => key + 1)}
            >
              <ThemedText type="smallBold" style={styles.retryText}>
                Try again
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View
                style={[
                  styles.progressCard,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <View style={styles.progressCardTop}>
                  <View style={styles.progressBadge}>
                    <SymbolView
                      name={{
                        ios: "chart.bar.fill",
                        android: "bar_chart",
                        web: "bar_chart",
                      }}
                      tintColor={palette.blue}
                      size={19}
                    />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    TODAY
                  </ThemedText>
                </View>
                <ThemedText type="subtitle" style={styles.statNumber}>
                  {completionPercent}%
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {completedCount} of {currentTasks.length} tasks done
                </ThemedText>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${completionPercent}%` },
                    ]}
                  />
                </View>
              </View>
              <View
                style={[
                  styles.streakCard,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <View style={styles.streakBadge}>
                  <Image
                    source={require("@/assets/images/streak-flame.svg")}
                    style={styles.flame}
                    accessibilityLabel={t("Streak flame")}
                  />
                </View>
                <ThemedText type="subtitle" style={styles.statNumber}>
                  {streakDays}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  day streak
                </ThemedText>
                <ThemedText type="smallBold" style={styles.keepGoing}>
                  Keep it up!
                </ThemedText>
              </View>
            </View>

            <View style={styles.sectionHeading}>
              <View>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Today’s focus
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {remainingTasks.length > 0
                    ? `${remainingTasks.length} ${t(
                        remainingTasks.length === 1
                          ? "active task"
                          : "active tasks",
                      )}`
                    : currentTasks.length > 0
                      ? "All caught up for today"
                      : tasks.length > 0
                        ? "No current tasks today"
                        : "Start with one small step"}
                </ThemedText>
              </View>
              {remainingTasks.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.navigate("/tasks")}
                  style={styles.textLink}
                >
                  <ThemedText type="smallBold" style={styles.linkText}>
                    See all
                  </ThemedText>
                  <SymbolView
                    name={{
                      ios: "chevron.right",
                      android: "chevron_right",
                      web: "chevron_right",
                    }}
                    tintColor={palette.blue}
                    size={15}
                  />
                </Pressable>
              ) : null}
            </View>

            {tasks.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <View style={styles.emptyIcon}>
                  <SymbolView
                    name={{
                      ios: "checkmark.circle",
                      android: "task_alt",
                      web: "task_alt",
                    }}
                    tintColor={palette.blue}
                    size={28}
                  />
                </View>
                <View style={styles.emptyCopy}>
                  <ThemedText type="smallBold" style={styles.emptyTitle}>
                    Your next chapter starts here
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Create a category and add a few tasks to get started.
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/create-task")}
                  style={styles.createButton}
                >
                  <ThemedText type="smallBold" style={styles.createButtonText}>
                    Create tasks
                  </ThemedText>
                </Pressable>
              </View>
            ) : currentTasks.length === 0 ? (
              <View
                style={[
                  styles.focusCard,
                  styles.focusEmpty,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  No current tasks today
                </ThemedText>
              </View>
            ) : remainingTasks.length === 0 ? (
              <View
                style={[
                  styles.focusCard,
                  styles.focusEmpty,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <SymbolView
                  name={{
                    ios: "checkmark.circle.fill",
                    android: "check_circle",
                    web: "check_circle",
                  }}
                  tintColor={palette.green}
                  size={24}
                />
                <ThemedText type="smallBold" style={styles.emptyTitle}>
                  All caught up for today
                </ThemedText>
              </View>
            ) : (
              <View
                style={[
                  styles.focusCard,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                {remainingTasks.map((task, index) => {
                  const done = todayStatuses.get(task.id) ?? false;
                  const category = categories.find(
                    (item) => item.id === task.task_categories_id,
                  );
                  return (
                    <View
                      key={task.id}
                      style={[
                        styles.focusRow,
                        index < remainingTasks.length - 1 &&
                          styles.focusDivider,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel={`${t(done ? "Mark incomplete" : "Complete")} ${task.task_name}`}
                        accessibilityState={{
                          checked: done,
                          disabled: isSaving,
                        }}
                        disabled={isSaving}
                        onPress={() => void toggleTask(task)}
                        style={[
                          styles.checkButton,
                          done && styles.checkedButton,
                        ]}
                      >
                        {done ? (
                          <SymbolView
                            name={{
                              ios: "checkmark",
                              android: "check",
                              web: "check",
                            }}
                            tintColor="#FFFFFF"
                            size={15}
                          />
                        ) : null}
                      </Pressable>
                      <View style={styles.focusCopy}>
                        <ThemedText
                          type="smallBold"
                          translate={false}
                          style={[
                            styles.focusTaskName,
                            done && styles.doneText,
                          ]}
                          numberOfLines={1}
                        >
                          {task.task_name}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          translate={false}
                          themeColor="textSecondary"
                          numberOfLines={1}
                        >
                          {category?.title ?? t("Task")}
                        </ThemedText>
                      </View>
                      {isSaving && !done ? (
                        <ActivityIndicator size="small" color={palette.blue} />
                      ) : (
                        <SymbolView
                          name={{
                            ios: "arrow.up.right",
                            android: "north_east",
                            web: "north_east",
                          }}
                          tintColor={palette.muted}
                          size={16}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {categories.length > 0 ? (
              <View style={styles.categorySummary}>
                <View style={styles.categorySummaryIcon}>
                  <SymbolView
                    name={{
                      ios: "square.grid.2x2.fill",
                      android: "grid_view",
                      web: "grid_view",
                    }}
                    tintColor={palette.green}
                    size={19}
                  />
                </View>
                <ThemedText type="smallBold" style={styles.categorySummaryText}>
                  {categories.length}{" "}
                  {categories.length === 1 ? "category" : "categories"} keeping
                  you moving
                </ThemedText>
              </View>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(
  palette: {
    blue: string;
    navy: string;
    green: string;
    paleBlue: string;
    paleGreen: string;
    orange: string;
    muted: string;
    border: string;
    danger: string;
  },
  theme: ReturnType<typeof useTheme>,
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    content: {
      alignItems: "center",
      paddingHorizontal: Spacing.three,
    },
    container: {
      width: "100%",
      maxWidth: MaxContentWidth,
      gap: Spacing.three,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.one,
    },
    greetingCopy: {
      flex: 1,
      minWidth: 0,
      marginLeft: Spacing.two,
    },
    eyebrow: {
      color: palette.muted,
      fontSize: 11,
      letterSpacing: 1.1,
    },
    greeting: {
      marginTop: 3,
      color: palette.navy,
      fontSize: 25,
      lineHeight: 32,
    },
    greetingName: {
      color: palette.blue,
      fontSize: 25,
      lineHeight: 32,
    },
    logoButton: {
      width: 56,
      height: 56,
      flexShrink: 0,
    },
    logoImage: {
      width: "100%",
      height: "100%",
    },
    heroCard: {
      overflow: "hidden",
      minHeight: 225,
      justifyContent: "space-between",
      padding: Spacing.three,
      borderRadius: 28,
      backgroundColor:
        theme.background === "#0E1522" ? "#1D4ED8" : palette.blue,
    },
    heroDecorationLarge: {
      position: "absolute",
      width: 220,
      height: 220,
      top: -105,
      right: -56,
      borderRadius: 120,
      backgroundColor: "rgba(255,255,255,0.10)",
    },
    heroDecorationSmall: {
      position: "absolute",
      width: 115,
      height: 115,
      top: 45,
      right: -22,
      borderRadius: 60,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    heroContent: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    heroCopy: {
      maxWidth: "78%",
    },
    heroKicker: {
      color: "#C9DAFF",
      fontSize: 11,
      letterSpacing: 1.3,
    },
    heroTitle: {
      marginTop: Spacing.one,
      color: "#FFFFFF",
      fontSize: 33,
      lineHeight: 38,
    },
    heroDescription: {
      maxWidth: 245,
      marginTop: Spacing.one,
      color: "#E7EEFF",
    },
    heroIcon: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
      backgroundColor: "rgba(255,255,255,0.17)",
    },
    heroButton: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: Spacing.two,
      marginTop: Spacing.three,
      paddingHorizontal: Spacing.three,
      borderRadius: 24,
      backgroundColor: "#FFFFFF",
    },
    heroButtonText: {
      color: "#142B73",
    },
    sectionHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: Spacing.one,
    },
    sectionTitle: {
      color: palette.navy,
      fontSize: 21,
      lineHeight: 27,
    },
    refreshButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 20,
      backgroundColor: palette.paleBlue,
    },
    statsRow: {
      flexDirection: "row",
      gap: Spacing.two,
    },
    progressCard: {
      flex: 1.35,
      minHeight: 155,
      justifyContent: "center",
      padding: Spacing.three,
      borderRadius: 22,
    },
    progressCardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    progressBadge: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: palette.paleBlue,
    },
    statNumber: {
      marginTop: Spacing.two,
      color: palette.navy,
      fontSize: 29,
      lineHeight: 34,
    },
    progressTrack: {
      height: 8,
      overflow: "hidden",
      marginTop: Spacing.two,
      borderRadius: 6,
      backgroundColor: theme.backgroundSelected,
    },
    progressFill: {
      height: "100%",
      borderRadius: 6,
      backgroundColor: palette.green,
    },
    streakCard: {
      flex: 1,
      minHeight: 155,
      alignItems: "center",
      justifyContent: "center",
      padding: Spacing.two,
      borderRadius: 22,
    },
    streakBadge: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: "#FFF2DF",
    },
    flame: {
      width: 20,
      height: 20,
    },
    keepGoing: {
      marginTop: Spacing.one,
      color: palette.orange,
      fontSize: 12,
    },
    textLink: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.one,
    },
    linkText: {
      color: palette.blue,
    },
    emptyCard: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: Spacing.two,
      padding: Spacing.three,
      borderRadius: 22,
    },
    emptyIcon: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: palette.paleBlue,
    },
    emptyCopy: {
      flex: 1,
      minWidth: 175,
      gap: 2,
    },
    emptyTitle: {
      color: palette.navy,
    },
    createButton: {
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Spacing.three,
      borderRadius: 22,
      backgroundColor: palette.blue,
    },
    createButtonText: {
      color: "#FFFFFF",
    },
    focusCard: {
      paddingHorizontal: Spacing.three,
      borderRadius: 22,
    },
    focusEmpty: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    focusRow: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    focusDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
    },
    checkButton: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "#B5C2DE",
      borderRadius: 14,
    },
    checkedButton: {
      borderColor: palette.green,
      backgroundColor: palette.green,
    },
    focusCopy: {
      flex: 1,
      gap: 1,
    },
    focusTaskName: {
      color: palette.navy,
    },
    doneText: {
      color: palette.muted,
      textDecorationLine: "line-through",
    },
    categorySummary: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      paddingHorizontal: Spacing.two,
      paddingVertical: Spacing.one,
    },
    categorySummaryIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: palette.paleGreen,
    },
    categorySummaryText: {
      flex: 1,
      color: palette.navy,
    },
    loader: {
      paddingVertical: Spacing.five,
    },
    errorCard: {
      gap: Spacing.two,
      padding: Spacing.three,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      backgroundColor: theme.backgroundElement,
    },
    errorText: {
      color: palette.danger,
    },
    retryText: {
      color: palette.blue,
    },
    pressed: {
      opacity: 0.78,
    },
  });
}
