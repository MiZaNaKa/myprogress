import { Image } from "expo-image";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
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
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { getLanguageLocale, useLanguage } from "@/context/LanguageProvider";
import { useThemePreference } from "@/context/ThemePreferenceProvider";
import { useTheme } from "@/hooks/use-theme";
import { getProgressDateKey } from "@/lib/progress-date";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Category = {
  id: string;
  title: string;
  start_date: string | null;
  duration_days: number;
};

type Task = {
  id: string;
  task_categories_id: string;
};

type Progress = {
  task_id: string;
  status: string;
  progress_date: string | null;
};

type CalendarMode = "month" | "week";
type CategoryFilter = "ongoing" | "incomplete" | "achievement";

const categoryColors = ["#DCEFFC", "#F8E4EB", "#E6F3E9", "#FFF1DB"];
const categoryBorders = ["#78BDF8", "#EFD3DE", "#D7E8DA", "#F1E3CE"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const categoryFilters: { value: CategoryFilter; label: string }[] = [
  { value: "ongoing", label: "Ongoing Task" },
  { value: "incomplete", label: "Incomplete Task" },
  { value: "achievement", label: "Achievement" },
];

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateKey(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDate(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null) return String(error);
  const fields = error as Record<string, unknown>;
  return (
    [fields.message, fields.details, fields.hint]
      .filter((value): value is string => typeof value === "string")
      .join("\n") || "Please try again."
  );
}

function getUserFacingErrorMessage(error: unknown) {
  const message = getErrorMessage(error);
  return /network|fetch|time\s*out|timed\s*out|connection/i.test(message)
    ? "Network connection issue. Check your internet and try again."
    : message;
}

export default function CalendarTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>("ongoing");
  const [mode, setMode] = useState<CalendarMode>("month");
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const { user, loading: isAuthLoading } = useAuth();
  const { language, t } = useLanguage();
  const { themeMode } = useThemePreference();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(
    () => createStyles(theme, themeMode),
    [theme, themeMode],
  );
  const userId = user?.id;

  useEffect(() => {
    let active = true;

    const loadCalendar = async () => {
      if (isAuthLoading) {
        setIsRefreshing(false);
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      try {
        if (!isSupabaseConfigured) {
          throw new Error("Supabase is not configured.");
        }
        if (!userId) {
          throw new Error("Sign in to view your calendar.");
        }

        const { data: categoryData, error: categoryError } = await supabase
          .from("task_categories")
          .select("id, title, start_date, duration_days")
          .eq("user_id", userId)
          .order("start_date", { ascending: true });
        if (categoryError) throw categoryError;

        const loadedCategories = categoryData ?? [];
        if (!active) return;
        setCategories(loadedCategories);

        if (loadedCategories.length === 0) {
          setTasks([]);
          setProgress([]);
          return;
        }

        const categoryIds = loadedCategories.map((category) => category.id);
        const { data: taskData, error: taskError } = await supabase
          .from("tasks")
          .select("id, task_categories_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .in("task_categories_id", categoryIds);
        if (taskError) throw taskError;

        const loadedTasks = taskData ?? [];
        if (!active) return;
        setTasks(loadedTasks);

        if (loadedTasks.length === 0) {
          setProgress([]);
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
        if (active) setProgress(progressData ?? []);
      } catch (error) {
        if (active) setErrorMessage(getUserFacingErrorMessage(error));
      } finally {
        if (active) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void loadCalendar();
    return () => {
      active = false;
    };
  }, [isAuthLoading, retryKey, userId]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRetryKey((current) => current + 1);
  };

  const todayKey = dateKey(new Date());
  const categoryFilterById = useMemo(() => {
    const completedTaskDates = new Set(
      progress
        .filter((row) => row.status === "completed" && row.progress_date)
        .map(
          (row) => `${row.task_id}:${getProgressDateKey(row.progress_date!)}`,
        ),
    );
    const tasksByCategory = new Map<string, Task[]>();
    for (const task of tasks) {
      const categoryTasks = tasksByCategory.get(task.task_categories_id) ?? [];
      categoryTasks.push(task);
      tasksByCategory.set(task.task_categories_id, categoryTasks);
    }

    const filtersByCategory = new Map<string, CategoryFilter>();
    for (const item of categories) {
      if (!item.start_date || item.duration_days < 1) {
        filtersByCategory.set(item.id, "ongoing");
        continue;
      }

      const startDate = item.start_date.slice(0, 10);
      const endDate = dateKey(
        shiftDate(parseDateKey(startDate), item.duration_days - 1),
      );
      if (startDate > todayKey) continue;
      if (endDate >= todayKey) {
        filtersByCategory.set(item.id, "ongoing");
        continue;
      }

      const categoryTasks = tasksByCategory.get(item.id) ?? [];
      if (categoryTasks.length === 0) continue;

      let allTaskDaysComplete = true;
      for (const task of categoryTasks) {
        for (let day = 0; day < item.duration_days; day += 1) {
          const taskDate = `${task.id}:${dateKey(
            shiftDate(parseDateKey(startDate), day),
          )}`;
          if (!completedTaskDates.has(taskDate)) {
            allTaskDaysComplete = false;
            break;
          }
        }
        if (!allTaskDaysComplete) break;
      }

      filtersByCategory.set(
        item.id,
        allTaskDaysComplete ? "achievement" : "incomplete",
      );
    }

    return filtersByCategory;
  }, [categories, progress, tasks, todayKey]);
  const filteredCategories = useMemo(
    () =>
      categories.filter(
        (item) => categoryFilterById.get(item.id) === categoryFilter,
      ),
    [categories, categoryFilter, categoryFilterById],
  );
  useEffect(() => {
    const nextCategory =
      filteredCategories.find((item) => item.id === selectedCategoryId) ??
      filteredCategories[0] ??
      null;
    if (nextCategory?.id !== selectedCategoryId) {
      setSelectedCategoryId(nextCategory?.id ?? null);
      if (nextCategory?.start_date) {
        const startDate = parseDateKey(nextCategory.start_date);
        setViewDate(startDate);
        setSelectedDate(dateKey(startDate));
      }
    }
  }, [filteredCategories, selectedCategoryId]);

  const category = filteredCategories.find(
    (item) => item.id === selectedCategoryId,
  );
  const categoryTasks = tasks.filter(
    (task) => task.task_categories_id === selectedCategoryId,
  );
  const selectedStartDateKey = category?.start_date?.slice(0, 10) ?? null;
  const selectedStartDate = selectedStartDateKey
    ? parseDateKey(selectedStartDateKey)
    : null;
  const categoryEndDate =
    selectedStartDateKey && category && category.duration_days >= 1
      ? shiftDate(
          parseDateKey(selectedStartDateKey),
          category.duration_days - 1,
        )
      : null;
  const categoryEndDateKey = categoryEndDate ? dateKey(categoryEndDate) : null;
  const daysRemaining =
    categoryEndDate && categoryEndDate >= parseDateKey(todayKey)
      ? Math.floor(
          (categoryEndDate.getTime() - parseDateKey(todayKey).getTime()) /
            (24 * 60 * 60 * 1000),
        ) + 1
      : 0;

  const progressByDate = useMemo(() => {
    const taskIds = new Set(
      tasks
        .filter((task) => task.task_categories_id === selectedCategoryId)
        .map((task) => task.id),
    );
    const rowsByDate = new Map<string, Map<string, string>>();
    for (const row of progress) {
      if (!row.progress_date || !taskIds.has(row.task_id)) continue;
      const key = getProgressDateKey(row.progress_date);
      const taskStatuses = rowsByDate.get(key) ?? new Map<string, string>();
      taskStatuses.set(row.task_id, row.status);
      rowsByDate.set(key, taskStatuses);
    }
    return rowsByDate;
  }, [progress, selectedCategoryId, tasks]);

  const calendarDays = useMemo(() => {
    if (mode === "week") {
      const weekStart = shiftDate(viewDate, -viewDate.getDay());
      return Array.from({ length: 7 }, (_, index) =>
        shiftDate(weekStart, index),
      );
    }

    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const gridStart = shiftDate(monthStart, -monthStart.getDay());
    const dayCount = new Date(
      viewDate.getFullYear(),
      viewDate.getMonth() + 1,
      0,
    ).getDate();
    const totalCells = Math.ceil((monthStart.getDay() + dayCount) / 7) * 7;
    return Array.from({ length: totalCells }, (_, index) =>
      shiftDate(gridStart, index),
    );
  }, [mode, viewDate]);

  const changePeriod = (direction: -1 | 1) => {
    setViewDate((current) => {
      if (mode === "week") return shiftDate(current, direction * 7);
      return new Date(current.getFullYear(), current.getMonth() + direction, 1);
    });
  };

  const periodLabel =
    mode === "month"
      ? viewDate.toLocaleDateString(getLanguageLocale(language), {
          month: "long",
          year: "numeric",
        })
      : (() => {
          const start = shiftDate(viewDate, -viewDate.getDay());
          const end = shiftDate(start, 6);
          const first = start.toLocaleDateString(getLanguageLocale(language), {
            month: "short",
            day: "numeric",
          });
          const last = end.toLocaleDateString(getLanguageLocale(language), {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return `${first} – ${last}`;
        })();

  const renderCalendarDay = (day: Date) => {
    const key = dateKey(day);
    const isCurrentMonth = day.getMonth() === viewDate.getMonth();
    const isToday = key === todayKey;
    const isSelected = key === selectedDate;
    const isScheduled =
      selectedStartDateKey !== null &&
      categoryEndDateKey !== null &&
      key >= selectedStartDateKey &&
      key <= categoryEndDateKey;
    const statuses = progressByDate.get(key);
    const isComplete =
      isScheduled &&
      categoryTasks.length > 0 &&
      categoryTasks.every((task) => statuses?.get(task.id) === "completed");
    const isMissed = isScheduled && key < todayKey && !isComplete;
    const isFuture = isScheduled && key > todayKey;

    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={`${day.toLocaleDateString(
          getLanguageLocale(language),
          {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          },
        )}${isComplete ? `, ${t("completed")}` : ""}${isMissed ? `, ${t("missed")}` : ""}`}
        accessibilityState={{ selected: isSelected }}
        onPress={() => setSelectedDate(key)}
        style={styles.dayCell}
      >
        <View
          style={[
            styles.dayNumberWrap,
            isScheduled && styles.scheduledNumberWrap,
            isToday && !isScheduled && styles.todayNumberWrap,
            isSelected && !isToday && !isScheduled && styles.selectedNumberWrap,
            isMissed && styles.missedNumberWrap,
            isComplete && styles.completeNumberWrap,
          ]}
        >
          <ThemedText
            style={[
              styles.dayNumber,
              !isCurrentMonth && styles.outsideMonthNumber,
              ((isToday && !isScheduled) || isMissed || isComplete) &&
                styles.emphasizedDayNumber,
            ]}
          >
            {day.getDate()}
          </ThemedText>
          {isMissed ? (
            <SymbolView
              name={{
                ios: "xmark",
                android: "close",
                web: "close",
              }}
              tintColor="#ffffff"
              size={13}
            />
          ) : isComplete ? (
            <SymbolView
              name={{
                ios: "checkmark",
                android: "check",
                web: "check",
              }}
              tintColor="#ffffff"
              size={14}
            />
          ) : null}
        </View>
        {isScheduled && !isMissed && !isComplete ? (
          <View
            style={[
              styles.dayDot,
              isFuture && styles.futureDot,
              isToday && styles.todayDot,
            ]}
          />
        ) : null}
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: insets.bottom + Spacing.four,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor={theme.backgroundElement}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentInner}>
          <View style={styles.titleRow}>
            <View style={styles.brandHeading}>
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
              <View>
                <ThemedText type="subtitle" style={styles.pageTitle}>
                  Calendar
                </ThemedText>
                <ThemedText style={styles.pageSubtitle}>
                  Goal Tracker
                </ThemedText>
              </View>
            </View>
            {category ? (
              <View style={styles.daysBadge}>
                <ThemedText style={styles.daysBadgeText}>
                  ◷ {daysRemaining} Days
                </ThemedText>
              </View>
            ) : null}
          </View>

          <View style={styles.categorySection}>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
              Filter Tasks
            </ThemedText>
            <View style={styles.categoryFilterBar}>
              {categoryFilters.map((filter) => {
                const isSelected = categoryFilter === filter.value;
                return (
                  <Pressable
                    key={filter.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setCategoryFilter(filter.value)}
                    style={[
                      styles.categoryFilterButton,
                      isSelected && styles.selectedCategoryFilterButton,
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={[
                        styles.categoryFilterLabel,
                        isSelected && styles.selectedCategoryFilterLabel,
                      ]}
                    >
                      {filter.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
              Select Category
            </ThemedText>
            {isLoading ? (
              <ActivityIndicator color={theme.accent} style={styles.loader} />
            ) : errorMessage ? (
              <View style={styles.messageCard}>
                <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRetryKey((current) => current + 1)}
                  style={styles.retryButton}
                >
                  <ThemedText style={styles.retryText}>Try again</ThemedText>
                </Pressable>
              </View>
            ) : filteredCategories.length === 0 ? (
              <View style={styles.messageCard}>
                <ThemedText style={styles.emptyText}>
                  {categoryFilter === "ongoing"
                    ? "No ongoing task categories."
                    : categoryFilter === "incomplete"
                      ? "No incomplete task categories."
                      : "No completed achievements yet."}
                </ThemedText>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryChoices}
              >
                {filteredCategories.map((item, index) => {
                  const isSelected = item.id === selectedCategoryId;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        setSelectedCategoryId(item.id);
                        if (item.start_date) {
                          const startDate = parseDateKey(item.start_date);
                          setViewDate(startDate);
                          setSelectedDate(dateKey(startDate));
                        }
                      }}
                      style={[
                        styles.categoryChoice,
                        {
                          backgroundColor:
                            themeMode === "dark"
                              ? theme.backgroundSelected
                              : categoryColors[index % categoryColors.length],
                          borderColor: isSelected
                            ? theme.accent
                            : themeMode === "dark"
                              ? theme.border
                              : categoryBorders[index % categoryBorders.length],
                        },
                        isSelected && styles.selectedCategoryChoice,
                      ]}
                    >
                      <ThemedText
                        numberOfLines={1}
                        style={[
                          styles.categoryChoiceLabel,
                          { color: theme.text },
                        ]}
                        translate={false}
                      >
                        {item.title}
                      </ThemedText>
                      {isSelected ? (
                        <View style={styles.categoryCheck}>
                          <SymbolView
                            name={{
                              ios: "checkmark",
                              android: "check",
                              web: "check",
                            }}
                            tintColor="#ffffff"
                            size={11}
                          />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View style={styles.calendarSection}>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
              Duration &amp; Progress
            </ThemedText>
            <View
              style={[
                styles.calendarCard,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              {category && selectedStartDate && categoryEndDate ? (
                <View style={styles.dateRange}>
                  <ThemedText type="small" style={styles.dateRangeText}>
                    {t("Start")}:{" "}
                    {selectedStartDate.toLocaleDateString(
                      getLanguageLocale(language),
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </ThemedText>
                  <ThemedText type="small" style={styles.dateRangeText}>
                    {t("End")}:{" "}
                    {categoryEndDate.toLocaleDateString(
                      getLanguageLocale(language),
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </ThemedText>
                </View>
              ) : null}
              <View style={styles.modeToggle}>
                {(["month", "week"] as const).map((nextMode) => {
                  const selected = mode === nextMode;
                  return (
                    <Pressable
                      key={nextMode}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setMode(nextMode)}
                      style={[
                        styles.modeButton,
                        selected && styles.selectedModeButton,
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.modeLabel,
                          selected && styles.selectedModeLabel,
                        ]}
                      >
                        {nextMode === "month" ? "Monthly View" : "Weekly View"}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.monthNavigation}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Previous calendar period")}
                  onPress={() => changePeriod(-1)}
                  hitSlop={12}
                  style={styles.navButton}
                >
                  <SymbolView
                    name={{
                      ios: "chevron.left",
                      android: "chevron_left",
                      web: "chevron_left",
                    }}
                    tintColor={theme.text}
                    size={17}
                  />
                </Pressable>
                <ThemedText type="smallBold" style={styles.monthLabel}>
                  {periodLabel}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("Next calendar period")}
                  onPress={() => changePeriod(1)}
                  hitSlop={12}
                  style={styles.navButton}
                >
                  <SymbolView
                    name={{
                      ios: "chevron.right",
                      android: "chevron_right",
                      web: "chevron_right",
                    }}
                    tintColor={theme.text}
                    size={17}
                  />
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {weekdays.map((weekday) => (
                  <ThemedText key={weekday} style={styles.weekdayLabel}>
                    {weekday}
                  </ThemedText>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {calendarDays.map(renderCalendarDay)}
              </View>
              {category && categoryTasks.length === 0 ? (
                <ThemedText style={styles.emptyCalendarText}>
                  This category has no active tasks to track.
                </ThemedText>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function createStyles(
  theme: ReturnType<typeof useTheme>,
  themeMode: "light" | "dark",
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      width: "100%",
      alignItems: "center",
      paddingHorizontal: Spacing.four,
    },
    contentInner: {
      width: "100%",
      maxWidth: MaxContentWidth,
      gap: Spacing.four,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 54,
    },
    brandHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    logoButton: {
      width: 44,
      height: 44,
      flexShrink: 0,
    },
    logoImage: {
      width: "100%",
      height: "100%",
    },
    pageTitle: {
      color: theme.text,
      fontSize: 24,
      lineHeight: 29,
    },
    pageSubtitle: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    daysBadge: {
      minWidth: 112,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Spacing.three,
      borderRadius: 24,
      backgroundColor: theme.accentSoft,
    },
    daysBadgeText: {
      color: theme.danger,
      fontSize: 14,
      fontWeight: "700",
    },
    pressed: {
      opacity: 0.78,
    },
    categorySection: {
      gap: Spacing.two,
    },
    categoryFilterBar: {
      flexDirection: "row",
      gap: Spacing.one,
      padding: Spacing.one,
      borderRadius: 14,
      backgroundColor: theme.backgroundSelected,
    },
    categoryFilterButton: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Spacing.one,
      borderRadius: 10,
    },
    selectedCategoryFilterButton: {
      backgroundColor: theme.accent,
    },
    categoryFilterLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      textAlign: "center",
    },
    selectedCategoryFilterLabel: {
      color: "#FFFFFF",
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 18,
    },
    categoryChoices: {
      gap: Spacing.two,
      paddingRight: Spacing.two,
    },
    categoryChoice: {
      width: 158,
      height: 84,
      justifyContent: "flex-end",
      padding: Spacing.two,
      borderWidth: 1,
      borderRadius: 15,
    },
    selectedCategoryChoice: {
      borderWidth: 2,
    },
    categoryChoiceLabel: {
      maxWidth: "100%",
      color: theme.text,
      fontSize: 14,
      fontWeight: "700",
    },
    categoryCheck: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: "#48AF55",
    },
    calendarSection: {
      flex: 1,
      gap: Spacing.two,
    },
    calendarCard: {
      minHeight: 500,
      flexGrow: 1,
      padding: Spacing.three,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 17,
      backgroundColor: theme.backgroundElement,
    },
    dateRange: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: Spacing.two,
      paddingBottom: Spacing.two,
    },
    dateRangeText: {
      color: theme.textSecondary,
      fontWeight: "600",
    },
    modeToggle: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      padding: 4,
      borderRadius: 14,
      backgroundColor: theme.background,
    },
    modeButton: {
      flex: 1,
      minHeight: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
    },
    selectedModeButton: {
      backgroundColor: theme.backgroundElement,
    },
    modeLabel: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: "700",
    },
    selectedModeLabel: {
      color: theme.text,
    },
    monthNavigation: {
      minHeight: 57,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.two,
    },
    monthLabel: {
      color: theme.text,
      fontSize: 18,
    },
    navButton: {
      width: 34,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
    },
    weekdayRow: {
      flexDirection: "row",
      marginBottom: Spacing.one,
    },
    weekdayLabel: {
      width: `${100 / 7}%`,
      color: theme.textSecondary,
      textAlign: "center",
      fontSize: 13,
      fontWeight: "700",
    },
    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    dayCell: {
      width: `${100 / 7}%`,
      minHeight: 72,
      alignItems: "center",
      paddingTop: Spacing.one,
    },
    dayNumberWrap: {
      width: 40,
      height: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      borderRadius: 20,
    },
    scheduledNumberWrap: {
      borderWidth: 2,
      borderColor: themeMode === "dark" ? "#FFFFFF" : "#000000",
    },
    todayNumberWrap: {
      backgroundColor: theme.accent,
    },
    selectedNumberWrap: {
      backgroundColor: theme.accentSoft,
    },
    missedNumberWrap: {
      backgroundColor: "#EB3939",
    },
    completeNumberWrap: {
      backgroundColor: "#48AF55",
    },
    dayNumber: {
      color: theme.text,
      fontSize: 14,
    },
    outsideMonthNumber: {
      color: theme.textSecondary,
    },
    emphasizedDayNumber: {
      color: "#ffffff",
      fontWeight: "700",
    },
    dayDot: {
      width: 4,
      height: 4,
      marginTop: 2,
      borderRadius: 2,
      backgroundColor: "#9E9E9E",
    },
    futureDot: {
      backgroundColor: "#A5A5A5",
    },
    todayDot: {
      backgroundColor: theme.accent,
    },
    loader: {
      paddingVertical: Spacing.three,
    },
    messageCard: {
      gap: Spacing.two,
      padding: Spacing.three,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      backgroundColor: theme.backgroundElement,
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    errorText: {
      color: theme.danger,
      fontSize: 14,
    },
    retryButton: {
      alignSelf: "flex-start",
      paddingVertical: Spacing.one,
    },
    retryText: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: "700",
    },
    emptyCalendarText: {
      marginTop: Spacing.two,
      color: theme.textSecondary,
      textAlign: "center",
      fontSize: 13,
    },
  });
}
