import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { getLanguageLocale, useLanguage } from "@/context/LanguageProvider";
import { useTheme } from "@/hooks/use-theme";
import {
  getLocalDateKey,
  getProgressDateKey,
  shiftDateKey,
} from "@/lib/progress-date";
import { supabase } from "@/lib/supabase";

type AchievementCategory = {
  id: string;
  title: string;
  start_date: string | null;
  duration_days: number;
};

type AchievementTask = {
  id: string;
  task_name: string;
};

type AchievementProgress = {
  task_id: string;
  status: string;
  progress_date: string | null;
};

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonthKey(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

export default function AchievementDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const categoryId = typeof id === "string" ? id : undefined;
  const { user, loading: isAuthLoading } = useAuth();
  const { language, t } = useLanguage();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [category, setCategory] = useState<AchievementCategory | null>(null);
  const [tasks, setTasks] = useState<AchievementTask[]>([]);
  const [completedDays, setCompletedDays] = useState<Set<string>>(new Set());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAchievement = async () => {
      if (isAuthLoading) return;
      setIsLoading(true);
      setErrorMessage(null);

      try {
        if (!user?.id) throw new Error(t("Sign in to view achievements."));
        if (!categoryId) throw new Error(t("Achievement not found."));

        const { data: categoryData, error: categoryError } = await supabase
          .from("task_categories")
          .select("id, title, start_date, duration_days")
          .eq("id", categoryId)
          .eq("user_id", user.id)
          .single();
        if (categoryError) throw categoryError;
        if (!categoryData.start_date || categoryData.duration_days < 1) {
          throw new Error(t("Achievement not found."));
        }

        const { data: taskData, error: taskError } = await supabase
          .from("tasks")
          .select("id, task_name")
          .eq("user_id", user.id)
          .eq("task_categories_id", categoryId)
          .eq("is_active", true)
          .order("id", { ascending: true });
        if (taskError) throw taskError;
        const loadedTasks = taskData ?? [];
        if (loadedTasks.length === 0) {
          throw new Error(
            t("No task names are available for this achievement."),
          );
        }

        const { data: progressData, error: progressError } = await supabase
          .from("task_progress")
          .select("task_id, status, progress_date")
          .eq("user_id", user.id)
          .in(
            "task_id",
            loadedTasks.map((task) => task.id),
          );
        if (progressError) throw progressError;
        if (!active) return;

        setCategory(categoryData);
        setTasks(loadedTasks);
        setCompletedDays(
          getCompletedDays(loadedTasks, progressData ?? [], categoryData),
        );
        setVisibleMonth(parseDateKey(categoryData.start_date));
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadAchievement();
    return () => {
      active = false;
    };
  }, [categoryId, isAuthLoading, t, user?.id]);

  const startDateKey = category?.start_date?.slice(0, 10) ?? null;
  const endDateKey =
    category && startDateKey
      ? shiftDateKey(startDateKey, category.duration_days - 1)
      : null;
  const monthDays = useMemo(() => {
    const monthStart = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - monthStart.getDay());
    const dayCount = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0,
    ).getDate();
    const totalCells = Math.ceil((monthStart.getDay() + dayCount) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [visibleMonth]);
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Date(2023, 0, index + 1).toLocaleDateString(
          getLanguageLocale(language),
          { weekday: "short" },
        ),
      ),
    [language],
  );
  const visibleMonthLabel = visibleMonth.toLocaleDateString(
    getLanguageLocale(language),
    { month: "long", year: "numeric" },
  );
  const canGoToPreviousMonth =
    startDateKey !== null &&
    getMonthKey(visibleMonth) > getMonthKey(parseDateKey(startDateKey));
  const canGoToNextMonth =
    endDateKey !== null &&
    getMonthKey(visibleMonth) < getMonthKey(parseDateKey(endDateKey));

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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentInner}>
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
            <ThemedText type="subtitle" style={styles.title} translate={false}>
              {category?.title ?? t("Achievement details")}
            </ThemedText>
          </View>

          {isLoading ? (
            <ActivityIndicator color={theme.accent} style={styles.loader} />
          ) : errorMessage ? (
            <View
              style={[
                styles.messageCard,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
            </View>
          ) : category && startDateKey && endDateKey ? (
            <>
              <View
                style={[
                  styles.sectionCard,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="smallBold" style={styles.sectionTitle}>
                  {t("Calendar")}
                </ThemedText>
                <View style={styles.dateRange}>
                  <ThemedText type="small" style={styles.dateRangeText}>
                    {t("Start date")}:{" "}
                    {parseDateKey(startDateKey).toLocaleDateString(
                      getLanguageLocale(language),
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </ThemedText>
                  <ThemedText type="small" style={styles.dateRangeText}>
                    {t("End date")}:{" "}
                    {parseDateKey(endDateKey).toLocaleDateString(
                      getLanguageLocale(language),
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </ThemedText>
                </View>
                <View style={styles.monthNavigation}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("Previous month")}
                    accessibilityState={{ disabled: !canGoToPreviousMonth }}
                    disabled={!canGoToPreviousMonth}
                    onPress={() =>
                      setVisibleMonth(
                        (month) =>
                          new Date(
                            month.getFullYear(),
                            month.getMonth() - 1,
                            1,
                          ),
                      )
                    }
                    style={[
                      styles.navButton,
                      !canGoToPreviousMonth && styles.disabledNavButton,
                    ]}
                  >
                    <SymbolView
                      name={{
                        ios: "chevron.left",
                        android: "chevron_left",
                        web: "chevron_left",
                      }}
                      tintColor={theme.text}
                      size={18}
                    />
                  </Pressable>
                  <ThemedText type="smallBold" style={styles.monthLabel}>
                    {visibleMonthLabel}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("Next month")}
                    accessibilityState={{ disabled: !canGoToNextMonth }}
                    disabled={!canGoToNextMonth}
                    onPress={() =>
                      setVisibleMonth(
                        (month) =>
                          new Date(
                            month.getFullYear(),
                            month.getMonth() + 1,
                            1,
                          ),
                      )
                    }
                    style={[
                      styles.navButton,
                      !canGoToNextMonth && styles.disabledNavButton,
                    ]}
                  >
                    <SymbolView
                      name={{
                        ios: "chevron.right",
                        android: "chevron_right",
                        web: "chevron_right",
                      }}
                      tintColor={theme.text}
                      size={18}
                    />
                  </Pressable>
                </View>

                <View style={styles.weekdayRow}>
                  {weekdayLabels.map((weekday, index) => (
                    <ThemedText
                      key={`${index}-${weekday}`}
                      type="smallBold"
                      style={styles.weekdayLabel}
                    >
                      {weekday}
                    </ThemedText>
                  ))}
                </View>
                <View style={styles.daysGrid}>
                  {Array.from(
                    { length: monthDays.length / 7 },
                    (_, weekIndex) => (
                      <View key={weekIndex} style={styles.weekRow}>
                        {monthDays
                          .slice(weekIndex * 7, weekIndex * 7 + 7)
                          .map((day) => {
                            const key = getLocalDateKey(day);
                            const isInRange =
                              key >= startDateKey && key <= endDateKey;
                            const isCompleted =
                              isInRange && completedDays.has(key);

                            return (
                              <View key={key} style={styles.dayCell}>
                                <View
                                  style={[
                                    styles.dayNumberWrap,
                                    isInRange && styles.scheduledDay,
                                  ]}
                                >
                                  <ThemedText
                                    style={[
                                      styles.dayNumber,
                                      day.getMonth() !==
                                        visibleMonth.getMonth() &&
                                        styles.outsideMonthNumber,
                                      isInRange && styles.completedDayNumber,
                                    ]}
                                  >
                                    {day.getDate()}
                                  </ThemedText>
                                  {isCompleted ? (
                                    <SymbolView
                                      name={{
                                        ios: "checkmark",
                                        android: "check",
                                        web: "check",
                                      }}
                                      tintColor="#FFFFFF"
                                      size={10}
                                    />
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}
                      </View>
                    ),
                  )}
                </View>
              </View>

              <View
                style={[
                  styles.sectionCard,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <ThemedText type="smallBold" style={styles.sectionTitle}>
                  Task names
                </ThemedText>
                <View style={styles.taskList}>
                  {tasks.map((task, index) => (
                    <View
                      key={task.id}
                      style={[
                        styles.taskRow,
                        index < tasks.length - 1 && styles.taskDivider,
                      ]}
                    >
                      <SymbolView
                        name={{
                          ios: "checkmark.circle.fill",
                          android: "check_circle",
                          web: "check_circle",
                        }}
                        tintColor={theme.success}
                        size={20}
                      />
                      <ThemedText style={styles.taskName} translate={false}>
                        {task.task_name}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function getCompletedDays(
  tasks: AchievementTask[],
  progress: AchievementProgress[],
  category: AchievementCategory,
) {
  const completedByTaskAndDate = new Set(
    progress
      .filter((row) => row.status === "completed" && row.progress_date)
      .map((row) => `${row.task_id}:${getProgressDateKey(row.progress_date!)}`),
  );
  const completedDays = new Set<string>();
  const startDate = category.start_date?.slice(0, 10);
  if (!startDate) return completedDays;

  for (let day = 0; day < category.duration_days; day += 1) {
    const date = shiftDateKey(startDate, day);
    if (
      tasks.every((task) => completedByTaskAndDate.has(`${task.id}:${date}`))
    ) {
      completedDays.add(date);
    }
  }

  return completedDays;
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      width: "100%",
      alignItems: "center",
      paddingHorizontal: Spacing.three,
    },
    contentInner: {
      width: "100%",
      maxWidth: MaxContentWidth,
      gap: Spacing.three,
    },
    header: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    backButton: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
    },
    title: {
      flex: 1,
      color: theme.text,
      fontSize: 24,
      lineHeight: 30,
    },
    sectionCard: {
      gap: Spacing.two,
      padding: Spacing.three,
      borderRadius: 18,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 18,
    },
    monthNavigation: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dateRange: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: Spacing.one,
    },
    dateRangeText: {
      color: theme.textSecondary,
      fontWeight: "600",
    },
    navButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
    },
    disabledNavButton: {
      opacity: 0.35,
    },
    monthLabel: {
      color: theme.text,
      fontSize: 17,
      textTransform: "capitalize",
    },
    weekdayRow: {
      flexDirection: "row",
    },
    weekdayLabel: {
      flex: 1,
      color: theme.textSecondary,
      textAlign: "center",
      fontSize: 12,
    },
    daysGrid: {
      gap: Spacing.one,
    },
    weekRow: {
      flexDirection: "row",
    },
    dayCell: {
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    dayNumberWrap: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 19,
    },
    scheduledDay: {
      flexDirection: "row",
      gap: 2,
      borderWidth: 1.5,
      borderColor: "#48AF55",
      backgroundColor: "#48AF55",
    },
    dayNumber: {
      color: theme.text,
      fontSize: 14,
    },
    outsideMonthNumber: {
      color: theme.textSecondary,
      opacity: 0.55,
    },
    completedDayNumber: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    taskList: {
      gap: Spacing.one,
    },
    taskRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    taskDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    taskName: {
      flex: 1,
      color: theme.text,
    },
    loader: {
      paddingVertical: Spacing.four,
    },
    messageCard: {
      padding: Spacing.three,
      borderRadius: 16,
    },
    errorText: {
      color: theme.danger,
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
